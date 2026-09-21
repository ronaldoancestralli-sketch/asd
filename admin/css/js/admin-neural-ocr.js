
const RUNTIME_URL =
  './vendor/paddleocr-browser.bundle.mjs';
const ORT_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';

const DETECTION_MODEL_URL = new URL(
  '../../assets/ocr/ppocr-v5-mobile-det.onnx',
  import.meta.url
).href;
const RECOGNITION_MODEL_URL = new URL(
  '../../assets/ocr/latin-ppocr-v5-mobile-rec.onnx',
  import.meta.url
).href;
const RECOGNITION_DICTIONARY_URL = new URL(
  '../../assets/ocr/latin-ppocr-v5-dict.txt',
  import.meta.url
).href;

const ENGINE_ID = 'paddleocr-js-ppocrv5-latin-browser';
const ENGINE_LABEL = 'PaddleOCR.js PP-OCRv5 Latin (browser)';
const EXPECTED_RECOGNITION_CLASSES = 504;
const CTC_BLANK_CLASSES = 1;
const EXPECTED_DICTIONARY_SIZE =
  EXPECTED_RECOGNITION_CLASSES - CTC_BLANK_CLASSES;

let runtimePromise = null;
let modelPromise = null;
let servicePromise = null;
let pagehideBound = false;

function average(values) {
  const valid = values.filter(value => Number.isFinite(value));
  if (!valid.length) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function normalizeScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return numeric > 1
    ? Math.max(0, Math.min(100, numeric))
    : Math.max(0, Math.min(100, numeric * 100));
}

async function fetchArrayBuffer(url, label) {
  const response = await fetch(url, {
    cache: 'force-cache',
    credentials: 'same-origin'
  });
  if (!response.ok) {
    throw new Error(label + ' não pôde ser carregado: HTTP ' + response.status);
  }
  return response.arrayBuffer();
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    cache: 'force-cache',
    credentials: 'same-origin'
  });
  if (!response.ok) {
    throw new Error(label + ' não pôde ser carregado: HTTP ' + response.status);
  }
  return response.text();
}

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = import(RUNTIME_URL).then(module => {
      if (!module?.PaddleOcrService || !module?.ort) {
        throw new Error(
          'Bundle browser do PaddleOCR está incompleto.'
        );
      }
      return module;
    }).catch(error => {
      runtimePromise = null;
      throw error;
    });
  }
  return runtimePromise;
}

export function buildRecognitionDictionary(dictionaryText = '') {
  const characters = String(dictionaryText)
    .replace(/\r/g, '')
    .trimEnd()
    .split('\n')
    .filter(character => character.length > 0);

  if (!characters.length) {
    throw new Error('Dicionário Latin PP-OCRv5 veio vazio.');
  }

  // PP-OCRv5 Latin foi treinado com use_space_char=true.
  // O arquivo possui 502 símbolos; o espaço é o 503º caractere.
  // O decoder CTC adiciona o blank separadamente, totalizando 504 classes.
  if (!characters.includes(' ')) {
    characters.push(' ');
  }

  if (characters.length !== EXPECTED_DICTIONARY_SIZE) {
    throw new Error(
      'Dicionário Latin incompatível: ' +
      characters.length +
      ' caracteres; esperado ' +
      EXPECTED_DICTIONARY_SIZE +
      ' para ' +
      EXPECTED_RECOGNITION_CLASSES +
      ' classes CTC.'
    );
  }

  return characters;
}

async function loadModels() {
  if (!modelPromise) {
    modelPromise = Promise.all([
      fetchArrayBuffer(DETECTION_MODEL_URL, 'Detector PP-OCRv5'),
      fetchArrayBuffer(RECOGNITION_MODEL_URL, 'Reconhecedor Latin PP-OCRv5'),
      fetchText(RECOGNITION_DICTIONARY_URL, 'Dicionário Latin PP-OCRv5')
    ]).then(([detectionModel, recognitionModel, dictionaryText]) => {
      const charactersDictionary =
        buildRecognitionDictionary(dictionaryText);

      return {
        detectionModel,
        recognitionModel,
        charactersDictionary
      };
    }).catch(error => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

async function createService() {
  if (typeof WebAssembly === 'undefined') {
    throw new Error('WebAssembly não está disponível neste navegador.');
  }

  const [{ PaddleOcrService, ort }, models] = await Promise.all([
    loadRuntime(),
    loadModels()
  ]);

  if (ort?.env?.wasm) {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = ORT_WASM_PATH;
  }

  const service = await PaddleOcrService.createInstance({
    ort,
    modelPreset: 'PP-OCRv5_mobile',
    detection: {
      modelBuffer: models.detectionModel
    },
    recognition: {
      modelBuffer: models.recognitionModel,
      charactersDictionary: models.charactersDictionary
    }
  });

  if (!pagehideBound) {
    pagehideBound = true;
    window.addEventListener('pagehide', () => {
      try {
        service?.destroy?.();
      } catch {
        // A página já está sendo encerrada.
      }
      servicePromise = null;
      runtimePromise = null;
      modelPromise = null;
    }, { once: true });
  }

  return service;
}

async function getService() {
  if (!servicePromise) {
    servicePromise = createService().catch(error => {
      servicePromise = null;
      throw error;
    });
  }
  return servicePromise;
}

function canvasToImageInput(canvas) {
  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true
  });
  if (!context) {
    throw new Error('Não foi possível acessar os pixels para o OCR neural.');
  }

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8Array(image.data)
  };
}

async function recognizeAttempt(service, attempt, fileName, onProgress) {
  const recognizedItems = [];

  const results = await service.recognize(
    canvasToImageInput(attempt.canvas),
    {
      detection: {
        textPixelThreshold: 0.28,
        boxScoreThreshold: 0.45,
        unclipRatio: 1.45,
        limitType: 'max',
        maxSideLimit: 2048
      },
      ordering: {
        sortByReadingOrder: true,
        sameLineThresholdRatio: 0.15
      },
      onProgress(event) {
        if (
          event?.type === 'rec' &&
          event?.stage === 'item' &&
          event?.result?.text
        ) {
          recognizedItems.push({
            text: String(event.result.text).trim(),
            confidence: normalizeScore(
              event.result.confidence ??
              event.result.score
            ),
            box: event.box || null
          });
        }

        if (event?.type === 'det' && event?.stage === 'postprocess') {
          onProgress?.(
            attempt.method +
              ' · ' +
              Number(event.detectedCount || 0) +
              ' bloco(s) detectado(s)'
          );
        }
      }
    }
  );

  const processed = service.processRecognition(results);
  const text = String(
    processed?.text ||
    recognizedItems.map(item => item.text).join('\n')
  ).trim();

  return {
    name: fileName,
    text,
    confidence: average(
      recognizedItems
        .map(item => item.confidence)
        .filter(value => value > 0)
    ),
    method: attempt.method,
    region: attempt.region,
    engine: ENGINE_ID,
    neural: true,
    boxes: recognizedItems
  };
}

export async function recognizePaddleAttempts({
  attempts = [],
  fileName = 'imagem',
  onProgress = null
} = {}) {
  if (!Array.isArray(attempts) || !attempts.length) {
    return {
      engine: {
        id: ENGINE_ID,
        label: ENGINE_LABEL,
        neural: true,
        fallback: false
      },
      readings: []
    };
  }

  onProgress?.('Inicializando PaddleOCR.js local no navegador...');
  const service = await getService();
  const readings = [];

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    onProgress?.(
      'OCR neural · ' +
      (index + 1) +
      '/' +
      attempts.length +
      ' · ' +
      attempt.method
    );

    const reading = await recognizeAttempt(
      service,
      attempt,
      fileName,
      onProgress
    );

    if (reading.text) readings.push(reading);
  }

  if (!readings.length) {
    throw new Error('O PaddleOCR.js neural não encontrou texto utilizável.');
  }

  return {
    engine: {
      id: ENGINE_ID,
      label: ENGINE_LABEL,
      neural: true,
      fallback: false,
      sdk: 'paddleocr@1.2.0',
      runtime: 'onnxruntime-web@1.22.0',
      detectionModel: 'PP-OCRv5_mobile_det',
      recognitionModel: 'Latin PP-OCRv5 mobile',
      backend: 'wasm',
      source: 'self-hosted-browser-bundle'
    },
    readings
  };
}

export const NEURAL_OCR_ENGINE = Object.freeze({
  id: ENGINE_ID,
  label: ENGINE_LABEL,
  runtimeUrl: RUNTIME_URL,
  wasmPath: ORT_WASM_PATH,
  detectionModelUrl: DETECTION_MODEL_URL,
  recognitionModelUrl: RECOGNITION_MODEL_URL,
  dictionaryUrl: RECOGNITION_DICTIONARY_URL,
  language: 'pt',
  ocrVersion: 'PP-OCRv5',
  detectionModel: 'PP-OCRv5_mobile_det',
  recognitionModel: 'latin_PP-OCRv5_mobile_rec',
  recognitionClasses: EXPECTED_RECOGNITION_CLASSES,
  dictionarySize: EXPECTED_DICTIONARY_SIZE,
  useSpaceCharacter: true
});
