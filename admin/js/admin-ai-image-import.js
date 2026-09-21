import { supabase } from '../../js/supabase.js?v=20260823-security-supabase-pin-1';
import { parseLocalOcr } from './admin-local-ocr-parser.js?v=20260916-ocr-continuation-1&bornal=20260917-ocr-grouping-1&eq=20260907-effects-1';
import { recognizePaddleAttempts } from './admin-neural-ocr.js?v=20260828-paddle-browser-v3';
import { createGameCaptureEvidence } from './equipment-capture-evidence.js?v=20260916-automatic-recognition-1';

const MAX_IMAGES = 13;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function bytesLabel(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Não foi possível ler ${file.name}.`));
    };
    image.src = url;
  });
}


const TESSERACT_URL =
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const OCR_MAX_DIMENSION = 2500;
let tesseractLoader = null;

function ensureTesseract() {
  if (
    window.Tesseract &&
    typeof window.Tesseract.createWorker === 'function'
  ) {
    return Promise.resolve(window.Tesseract);
  }

  if (tesseractLoader) return tesseractLoader;

  tesseractLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-echoarena-tesseract="5.1.1"]'
    );

    const finish = () => {
      if (
        window.Tesseract &&
        typeof window.Tesseract.createWorker === 'function'
      ) {
        resolve(window.Tesseract);
      } else {
        reject(new Error('O leitor OCR local não pôde ser iniciado.'));
      }
    };

    if (existing) {
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener(
        'error',
        () => reject(new Error('Não foi possível carregar o motor OCR gratuito.')),
        { once: true }
      );
      if (window.Tesseract) finish();
      return;
    }

    const script = document.createElement('script');
    script.src = TESSERACT_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.echoarenaTesseract = '5.1.1';
    script.addEventListener('load', finish, { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error('Não foi possível carregar o motor OCR gratuito.')),
      { once: true }
    );
    document.head.appendChild(script);
  });

  return tesseractLoader;
}

async function fileToCanvas(file) {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error(file.name + ': use PNG, JPG ou WEBP.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(
      file.name + ': arquivo maior que ' + bytesLabel(MAX_SOURCE_BYTES) + '.'
    );
  }

  const image = await loadImage(file);
  const ratio = Math.min(
    1,
    OCR_MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight)
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('O navegador não conseguiu preparar a imagem.');

  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function cloneCanvas(source) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Não foi possível preparar o OCR.');
  context.drawImage(source, 0, 0);
  return canvas;
}

function improveCanvas(source, grayscale = false) {
  const canvas = cloneCanvas(source);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    let red = data[index];
    let green = data[index + 1];
    let blue = data[index + 2];

    if (grayscale) {
      const gray = red * 0.299 + green * 0.587 + blue * 0.114;
      red = gray;
      green = gray;
      blue = gray;
    }

    data[index] = Math.max(0, Math.min(255, (red - 128) * 1.28 + 145));
    data[index + 1] = Math.max(0, Math.min(255, (green - 128) * 1.28 + 145));
    data[index + 2] = Math.max(0, Math.min(255, (blue - 128) * 1.28 + 145));
    data[index + 3] = 255;
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

function scaleCanvas(source, factor = 1.8) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.width * factor));
  canvas.height = Math.max(1, Math.round(source.height * factor));

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Não foi possível ampliar a região para OCR.');

  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function prepareDarkUiText(source) {
  const canvas = scaleCanvas(source, source.width < 760 ? 2 : 1.55);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;

  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

    const whiteText =
      luminance >= 162 &&
      Math.min(red, green, blue) >= 118;

    const yellowText =
      red >= 150 &&
      green >= 120 &&
      red + green >= blue * 2.05 &&
      luminance >= 128;

    const brightCyanText =
      blue >= 145 &&
      green >= 135 &&
      luminance >= 135 &&
      Math.abs(green - blue) < 90;

    const isText = whiteText || yellowText || brightCyanText;
    const value = isText ? 0 : 255;

    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }

  context.putImageData(image, 0, 0);
  return canvas;
}

function cropCanvas(source, x, y, width, height) {
  const sx = Math.max(0, Math.floor(source.width * x));
  const sy = Math.max(0, Math.floor(source.height * y));
  const sw = Math.max(
    1,
    Math.min(source.width - sx, Math.floor(source.width * width))
  );
  const sh = Math.max(
    1,
    Math.min(source.height - sy, Math.floor(source.height * height))
  );

  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;

  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Não foi possível recortar a região para OCR.');

  context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return canvas;
}

function heroRegionCanvas(base, x, y, width, height, mode = 'binary') {
  const region = cropCanvas(base, x, y, width, height);
  if (mode === 'binary') return prepareDarkUiText(region);
  return improveCanvas(scaleCanvas(region, region.width < 760 ? 1.8 : 1.4), false);
}

async function recognizeCanvas(worker, canvas, psm, method, region = 'full') {
  await worker.setParameters({
    tessedit_pageseg_mode: String(psm),
    preserve_interword_spaces: '1',
    user_defined_dpi: '300',
    tessedit_char_whitelist:
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ' +
      'ÀÁÂÃÉÊÍÓÔÕÚÇ' +
      'abcdefghijklmnopqrstuvwxyz' +
      'àáâãéêíóôõúç' +
      '0123456789+-%.,/() xX|:°'
  });

  const response = await worker.recognize(canvas);
  return {
    text: String(response && response.data && response.data.text || '').trim(),
    confidence: Number(response && response.data && response.data.confidence) || 0,
    method,
    region
  };
}

async function buildOcrAttempts(file, entityType, options = {}) {
  const base = await fileToCanvas(file);
  const contrast = improveCanvas(base, false);
  const grayscale = improveCanvas(base, true);
  const attempts = [];

  const add = (canvas, psm, method, region = 'full') => {
    attempts.push({ canvas, psm, method, region });
  };

  if (entityType === 'hero' && base.width > base.height * 1.35) {
    add(
      heroRegionCanvas(base, 0.705, 0.085, 0.205, 0.225),
      6,
      'identidade do herói',
      'hero-identity'
    );
    add(
      heroRegionCanvas(base, 0.700, 0.235, 0.265, 0.315),
      11,
      'resumo do herói',
      'hero-summary'
    );
    add(
      heroRegionCanvas(base, 0.742, 0.365, 0.082, 0.085, 'contrast'),
      7,
      'valor de poder',
      'hero-power'
    );
    add(
      heroRegionCanvas(base, 0.710, 0.475, 0.080, 0.070, 'contrast'),
      7,
      'valor de vida',
      'hero-health'
    );
    add(
      heroRegionCanvas(base, 0.795, 0.475, 0.075, 0.070, 'contrast'),
      7,
      'valor de dano',
      'hero-damage'
    );
    add(
      heroRegionCanvas(base, 0.855, 0.475, 0.095, 0.070, 'contrast'),
      7,
      'valor de armadura',
      'hero-armor'
    );
    add(
      heroRegionCanvas(base, 0.700, 0.175, 0.265, 0.505),
      6,
      'parâmetros do herói',
      'hero-parameters'
    );
    add(
      heroRegionCanvas(base, 0.700, 0.610, 0.255, 0.205),
      6,
      'facção do herói',
      'hero-faction'
    );
    add(
      heroRegionCanvas(base, 0.070, 0.165, 0.215, 0.515),
      6,
      'resumo da arma',
      'weapon-summary'
    );
    add(
      heroRegionCanvas(base, 0.065, 0.175, 0.325, 0.745),
      6,
      'detalhes da arma',
      'weapon-details'
    );
  } else if (entityType === 'equipment') {
    const aspectRatio = base.width / Math.max(1, base.height);
    const looksLikeGameScreen = aspectRatio >= 0.7 && aspectRatio <= 2.4;

    if (looksLikeGameScreen) {
      if (options.isLast || options.totalFiles === 1) {
        add(
          heroRegionCanvas(base, 0.415, 0.095, 0.57, 0.205, 'contrast'),
          6,
          'identidade do equipamento',
          'equipment-identity'
        );
      }

      add(
        heroRegionCanvas(base, 0.385, 0.265, 0.605, 0.675, 'contrast'),
        6,
        'efeitos por categoria',
        'equipment-effects'
      );
    }

    // As leituras amplas continuam como fallback para prints recortados ou
    // layouts diferentes do painel padrão do jogo.
    add(contrast, 4, 'painel completo', 'full');
    add(grayscale, 11, 'texto esparso', 'full');
  } else {
    add(contrast, 4, 'blocos', 'full');
    add(grayscale, 11, 'texto esparso', 'full');
  }

  return attempts;
}

async function recognizeTesseractAttempts(
  worker,
  attempts,
  file,
  entityType,
  onStep
) {
  const partial = [];

  for (let index = 0; index < attempts.length; index += 1) {
    if (onStep) onStep(index + 1, attempts.length, attempts[index].method);
    const read = await recognizeCanvas(
      worker,
      attempts[index].canvas,
      attempts[index].psm,
      attempts[index].method,
      attempts[index].region
    );
    if (read.text) {
      partial.push({
        ...read,
        engine: 'tesseract-5.1.1',
        neural: false
      });
    }
  }

  if (entityType === 'hero') {
    return partial.map(read => ({
      name: file.name,
      text: read.text,
      confidence: read.confidence,
      method: read.method,
      region: read.region,
      engine: read.engine,
      neural: false
    }));
  }

  // Preserve the crop boundary: concatenating different OCR attempts can
  // attach a continuation to a different effect or rarity in the same image.
  return partial.map(read => ({
    name: file.name,
    text: read.text,
    confidence: read.confidence,
    method: read.method,
    region: read.region,
    engine: read.engine,
    neural: false
  }));
}

async function runPaddleOcr(files, entityType, onProgress) {
  const readings = [];
  let engine = null;

  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex];
    const attempts = await buildOcrAttempts(file, entityType, {
      fileIndex,
      totalFiles: files.length,
      isFirst: fileIndex === 0,
      isLast: fileIndex === files.length - 1
    });

    const result = await recognizePaddleAttempts({
      attempts,
      fileName: file.name,
      onProgress: message => {
        if (!onProgress) return;
        onProgress(
          'Imagem ' +
          (fileIndex + 1) +
          '/' +
          files.length +
          ' · ' +
          message
        );
      }
    });

    engine = engine || result.engine;
    readings.push(...result.readings.map(reading => ({
      ...reading,
      sourceIndex: fileIndex
    })));
  }

  if (!readings.length) {
    throw new Error('O PaddleOCR neural não produziu leituras utilizáveis.');
  }

  return {
    engine: engine || {
      id: 'paddleocr-ppocrv5-latin',
      label: 'PaddleOCR PP-OCRv5 Neural',
      neural: true,
      fallback: false
    },
    readings
  };
}

async function runTesseractOcr(files, entityType, onProgress) {
  const Tesseract = await ensureTesseract();
  let worker = null;

  try {
    onProgress?.('Ativando Tesseract 5.1.1 como fallback...');
    worker = await Tesseract.createWorker('por');

    const readings = [];

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const file = files[fileIndex];
      const attempts = await buildOcrAttempts(file, entityType, {
        fileIndex,
        totalFiles: files.length,
        isFirst: fileIndex === 0,
        isLast: fileIndex === files.length - 1
      });

      const fileReadings = await recognizeTesseractAttempts(
        worker,
        attempts,
        file,
        entityType,
        (step, total, method) => {
          onProgress?.(
            'Fallback Tesseract · imagem ' +
            (fileIndex + 1) +
            '/' +
            files.length +
            ' · ' +
            method +
            ' (' +
            step +
            '/' +
            total +
            ')'
          );
        }
      );

      readings.push(...fileReadings.map(reading => ({
        ...reading,
        sourceIndex: fileIndex
      })));
    }

    return {
      engine: {
        id: 'tesseract-5.1.1',
        label: 'Tesseract 5.1.1 (fallback)',
        neural: false,
        fallback: true
      },
      readings
    };
  } finally {
    try {
      if (worker) await worker.terminate();
    } catch {
      // O worker pode já ter encerrado durante a navegação.
    }
  }
}

async function runLocalOcr(files, entityType, onProgress) {
  try {
    onProgress?.('Preparando OCR neural local...');
    return await runPaddleOcr(files, entityType, onProgress);
  } catch (neuralError) {
    console.warn(
      '[echoarena-neural-ocr] PaddleOCR indisponível; usando fallback Tesseract.',
      neuralError
    );

    onProgress?.(
      'O OCR neural não pôde ser iniciado neste dispositivo. ' +
      'Usando Tesseract como fallback seguro...'
    );

    const fallback = await runTesseractOcr(
      files,
      entityType,
      onProgress
    );

    fallback.engine.reason =
      neuralError?.message ||
      'Falha não especificada ao inicializar PaddleOCR.';

    return fallback;
  }
}

async function loadContext(entityType) {
  if (entityType === 'equipment') {
    const [rarities, slots, sets] = await Promise.all([
      supabase.from('equipment_rarities').select('id,name,slug,rank').order('rank'),
      supabase.from('equipment_slots').select('id,name,slug,display_order').order('display_order'),
      supabase.from('equipment_sets').select('id,name,slug').order('name')
    ]);
    for (const result of [rarities, slots, sets]) {
      if (result.error) throw result.error;
    }
    return {
      rarities: rarities.data || [],
      slots: slots.data || [],
      sets: sets.data || []
    };
  }

  const [classes, rarities, stats] = await Promise.all([
    supabase.from('hero_classes').select('id,name,slug').order('name'),
    supabase.from('hero_rarities').select('id,name,slug,rank').order('rank'),
    supabase.from('stat_definitions').select('key,name,category,unit').eq('enabled', true).order('display_order')
  ]);
  for (const result of [classes, rarities, stats]) {
    if (result.error) throw result.error;
  }
  return {
    classes: classes.data || [],
    rarities: rarities.data || [],
    stats: stats.data || []
  };
}

function currentIdentity(entityType) {
  const params = new URLSearchParams(location.search);
  return {
    id: params.get('id') || null,
    name: document.getElementById('name')?.value?.trim() || null,
    slug: document.getElementById('slug')?.value?.trim() || null,
    entityType
  };
}

function ensureUi(entityType) {
  const id = `admin-ai-image-import-${entityType}`;
  let backdrop = document.getElementById(id);
  if (backdrop) return backdrop;

  if (!document.getElementById('admin-ai-image-import-style')) {
    const style = document.createElement('style');
    style.id = 'admin-ai-image-import-style';
    style.textContent = `
      .admin-ai-import-backdrop{position:fixed;inset:0;z-index:23000;display:none;place-items:start center;padding:18px;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;background:rgba(1,6,16,.92);backdrop-filter:blur(10px);color:#eef2ff}
      .admin-ai-import-backdrop.is-open{display:grid}.admin-ai-import-modal{width:min(900px,100%);max-height:calc(100dvh - 36px);overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;touch-action:pan-y;border:1px solid #31435f;border-radius:22px;background:#071426;box-shadow:0 35px 110px #000b}
      .admin-ai-import-head,.admin-ai-import-body,.admin-ai-import-foot{padding:22px 25px}.admin-ai-import-head{display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid #263650}.admin-ai-import-head h2{margin:0 0 5px;font-size:25px}.admin-ai-import-head p,.admin-ai-import-muted{margin:0;color:#9eacc2;font-size:12px;line-height:1.55}
      .admin-ai-import-close,.admin-ai-import-btn{border:1px solid #344762;border-radius:11px;background:#101d30;color:#fff;padding:11px 15px;font-weight:800;cursor:pointer}.admin-ai-import-btn.primary{border:0;background:linear-gradient(135deg,#8b5cf6,#6d28d9)}.admin-ai-import-btn:disabled{opacity:.45;cursor:not-allowed}
      .admin-ai-drop{display:grid;place-items:center;min-height:170px;padding:22px;border:1.5px dashed #536987;border-radius:16px;background:#0a182b;text-align:center;cursor:pointer}.admin-ai-drop.is-drag{border-color:#a78bfa;background:#131b36}.admin-ai-drop strong{font-size:17px}.admin-ai-drop input{display:none}
      .admin-ai-file-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:12px}.admin-ai-file{padding:10px;border:1px solid #2d3e59;border-radius:12px;background:#0a1628}.admin-ai-file img{display:block;width:100%;height:100px;object-fit:cover;border-radius:8px;background:#020817}.admin-ai-file strong{display:block;margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}.admin-ai-file small{color:#8fa0b8}
      .admin-ai-progress{display:none;margin-top:14px;padding:13px;border:1px solid #33445f;border-radius:12px;background:#0a1628;color:#bdc8d8}.admin-ai-progress.is-visible{display:block}.admin-ai-progress.ok{border-color:#26734c;color:#8ce8b6}.admin-ai-progress.error{border-color:#8c3947;color:#ffadb8}.admin-ai-import-result{margin-top:14px;scroll-margin-top:12px}.admin-ai-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px}.admin-ai-summary>div{padding:13px;border:1px solid #2b3b56;border-radius:11px;background:#091527}.admin-ai-summary strong{display:block;font-size:20px}.admin-ai-summary .admin-ai-engine-name{font-size:11px;line-height:1.35;word-break:break-word}.admin-ai-summary small{color:#96a6bc;text-transform:uppercase;font-size:9px}.admin-ai-warning{margin-top:8px;padding:11px;border:1px solid #72571c;border-radius:10px;background:#211a08;color:#ffd976;font-size:11px}.admin-ai-warning.critical{border-color:#c24152;background:#2a0d16;color:#ffc0c8;font-weight:800}.admin-ai-recognized{margin-top:12px;padding:13px;border:1px solid #2b3b56;border-radius:12px;background:#07101f}.admin-ai-recognized h3{margin:0 0 10px;font-size:14px}.admin-ai-recognized-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.admin-ai-recognized-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;padding:9px 10px;border:1px solid #233550;border-radius:9px;background:#0a1728}.admin-ai-recognized-row span{color:#9eacc2;font-size:10px}.admin-ai-recognized-row strong{font-size:11px;text-align:right;word-break:break-word}.admin-ai-recognized-row.is-wide{grid-column:1/-1}.admin-ai-recognized-row.is-wide strong{text-align:left}.admin-ai-json{margin-top:12px}.admin-ai-json summary{cursor:pointer;color:#aebbd0;font-size:11px}.admin-ai-json pre{max-height:270px;overflow:auto;padding:12px;border:1px solid #2b3b56;border-radius:10px;background:#030a14;color:#c5d2e5;font-size:10px;white-space:pre-wrap;word-break:break-word}
      .admin-ai-import-foot{position:sticky;bottom:0;display:flex;justify-content:flex-end;gap:9px;flex-wrap:wrap;border-top:1px solid #263650;background:#071426}.admin-ai-launch{display:inline-flex;align-items:center;gap:7px}.admin-ai-badge{display:inline-grid;place-items:center;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#6d28d9;color:#fff;font-size:9px;font-weight:900}
      @media(max-width:650px){.admin-ai-import-backdrop{padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom));place-items:start center}.admin-ai-import-modal{max-height:calc(100dvh - 16px);min-height:0;overflow-y:auto}.admin-ai-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-ai-recognized-grid{grid-template-columns:1fr}.admin-ai-import-foot{padding-bottom:max(17px,env(safe-area-inset-bottom))}.admin-ai-import-foot .admin-ai-import-btn{flex:1}.admin-ai-import-head,.admin-ai-import-body,.admin-ai-import-foot{padding-left:17px;padding-right:17px}}
    `;
    document.head.appendChild(style);
  }

  backdrop = document.createElement('div');
  backdrop.id = id;
  backdrop.className = 'admin-ai-import-backdrop';
  backdrop.innerHTML = `
    <section class="admin-ai-import-modal" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <header class="admin-ai-import-head">
        <div><h2 id="${id}-title">Ler imagens automaticamente</h2><p>OCR neural gratuito no navegador com PaddleOCR. Tesseract é usado apenas como fallback. Nenhum print é enviado para uma API de IA e nada é salvo sem sua revisão.</p></div>
        <button type="button" class="admin-ai-import-close" data-ai-close>✕</button>
      </header>
      <div class="admin-ai-import-body">
        <label class="admin-ai-drop" data-ai-drop>
          <input type="file" accept="image/png,image/jpeg,image/webp" multiple data-ai-files>
          <span><strong>Arraste os prints aqui</strong><br><span class="admin-ai-import-muted">PNG, JPG ou WEBP · PaddleOCR neural local · até ${MAX_IMAGES} imagens</span></span>
        </label>
        <div class="admin-ai-file-grid" data-ai-file-grid></div>
        <div class="admin-ai-progress" data-ai-progress></div>
        <div class="admin-ai-import-result" data-ai-result></div>
      </div>
      <footer class="admin-ai-import-foot">
        <button type="button" class="admin-ai-import-btn" data-ai-clear>Limpar</button>
        <button type="button" class="admin-ai-import-btn primary" data-ai-analyze disabled>Analisar imagens</button>
        <button type="button" class="admin-ai-import-btn primary" data-ai-apply hidden>Aplicar no editor</button>
      </footer>
    </section>`;
  document.body.appendChild(backdrop);
  return backdrop;
}

const HERO_REVIEW_FIELDS = [
  ['hero.name', 'Herói'],
  ['hero.class', 'Classe'],
  ['meta.detectedClassLabel', 'Classe lida (sem mapeamento)'],
  ['meta.rarity', 'Raridade'],
  ['meta.faction', 'Facção'],
  ['status.power', 'Poder'],
  ['status.health', 'Vida'],
  ['status.damage', 'Dano'],
  ['status.armor', 'Armadura'],
  ['status.visionRange', 'Alcance de visão'],
  ['status.movementNoiseRadius', 'Raio de barulho'],
  ['status.maxMovementSpeed', 'Velocidade máxima'],
  ['status.aimedMovementSpeed', 'Velocidade ao mirar'],
  ['status.penetrationResistance', 'Resistência à perfuração'],
  ['status.armorValue', 'Valor de armadura'],
  ['status.armorResistance', 'Resistência de armadura'],
  ['weaponSummary.name', 'Arma'],
  ['weaponSummary.firepower', 'Poder de fogo'],
  ['weaponSummary.armorBreak', 'Quebra de armadura'],
  ['weaponSummary.fireRate', 'Cadência'],
  ['weaponSummary.magazineCapacity', 'Capacidade de munição'],
  ['weaponSummary.effectiveRange', 'Alcance efetivo'],
  ['weaponSummary.aimingStability', 'Estabilidade de mira'],
  ['weaponDetails.damagePerShot', 'Dano por tiro'],
  ['weaponDetails.healthDamageMultiplier', 'Modificador dano à vida'],
  ['weaponDetails.armorPenetration', 'Perfuração de armadura'],
  ['weaponDetails.penetrationPower', 'Poder de perfuração'],
  ['weaponDetails.armorDroneMultiplier', 'Modificador armadura/drones'],
  ['weaponDetails.shotsPerSecond', 'Tiros por segundo'],
  ['weaponDetails.reloadTime', 'Tempo de recarga'],
  ['weaponDetails.magazineSize', 'Tamanho do pente'],
  ['weaponDetails.hipFireRange', 'Alcance sem mira'],
  ['weaponDetails.aimedRange', 'Alcance ao mirar'],
  ['weaponDetails.dispersion', 'Dispersão'],
  ['weaponDetails.movingDispersion', 'Dispersão em movimento'],
  ['weaponDetails.aimedDispersion', 'Dispersão ao mirar'],
  ['weaponDetails.aimTime', 'Tempo de mira'],
  ['weaponDetails.dispersionFactor', 'Fator de dispersão'],
  ['hero.description', 'Descrição']
];

function nestedValue(object, path) {
  return path
    .split('.')
    .reduce((value, key) => value && value[key], object);
}

function formatReviewValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(4)));
  return String(value);
}

function heroRecognizedRows(normalized) {
  return HERO_REVIEW_FIELDS
    .map(([path, label]) => {
      const value = nestedValue(normalized, path);
      if (value === null || value === undefined || value === '') return null;
      return {
        path,
        label,
        value: formatReviewValue(value),
        wide: path === 'hero.description'
      };
    })
    .filter(Boolean);
}

function summaryHtml(entityType, normalized) {
  const confidence = Math.round(Number(normalized?.ocr?.confidence || 0) * 100);
  const coverage = entityType === 'hero'
    ? Math.round(Number(normalized?.ocr?.coverage || 0) * 100)
    : null;
  const warnings = normalized?.ocr?.warnings || [];
  const engine = normalized?.ocr?.engine || null;
  const engineLabel = engine?.label || 'OCR local';
  let recognized = 0;
  let recognizedHtml = '';

  if (entityType === 'equipment') {
    recognized = [
      normalized.name,
      normalized.slot,
      normalized.setName,
      normalized.description,
      normalized.recommendation
    ].filter(value => value !== null && value !== undefined && value !== '').length;
    recognized += Object.values(normalized.variants || {})
      .reduce((sum, list) => sum + list.length, 0);
    const batch = normalized?.ocr?.batch || {};
    const missing = Array.isArray(batch.missingRarities)
      ? batch.missingRarities.join(', ')
      : '';
    recognizedHtml = `<section class="admin-ai-recognized">
      <h3>Cobertura da leitura em massa</h3>
      <div class="admin-ai-recognized-grid">
        <div class="admin-ai-recognized-row"><span>Equipamento</span><strong>${escapeHtml(normalized.name || 'Não reconhecido')}</strong></div>
        <div class="admin-ai-recognized-row"><span>Raridades com atributos</span><strong>${escapeHtml(String(batch.rarityCount ?? Object.keys(normalized.variants || {}).length))}/${escapeHtml(String(batch.expectedRarityCount || '—'))}</strong></div>
        <div class="admin-ai-recognized-row"><span>Imagens com dados associados</span><strong>${escapeHtml(String(batch.mappedSourceCount ?? '—'))}/${escapeHtml(String(batch.sourceCount ?? '—'))}</strong></div>
        <div class="admin-ai-recognized-row is-wide"><span>Raridades ainda não reconhecidas</span><strong>${escapeHtml(missing || 'Nenhuma')}</strong></div>
      </div>
    </section>`;
  } else {
    const rows = heroRecognizedRows(normalized);
    recognized = rows.length;
    recognizedHtml = rows.length
      ? `<section class="admin-ai-recognized">
          <h3>Dados reconhecidos para revisão</h3>
          <div class="admin-ai-recognized-grid">
            ${rows.map(row => `
              <div class="admin-ai-recognized-row ${row.wide ? 'is-wide' : ''}">
                <span>${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(row.value)}</strong>
              </div>`).join('')}
          </div>
        </section>`
      : '';
  }

  return `
    <div class="admin-ai-summary">
      <div><strong>${recognized}</strong><small>campos reconhecidos</small></div>
      <div><strong>${confidence}%</strong><small>confiança dos campos</small></div>
      ${coverage !== null ? `<div><strong>${coverage}%</strong><small>cobertura estimada</small></div>` : ''}
      <div><strong>${warnings.length}</strong><small>alertas para revisar</small></div>
      <div><strong class="admin-ai-engine-name">${escapeHtml(engineLabel)}</strong><small>motor usado</small></div>
    </div>
    ${recognizedHtml}
    ${warnings.map((warning, index) => `<div class="admin-ai-warning ${normalized?.ocr?.batch?.incomplete && index === 0 ? 'critical' : ''}">⚠ ${escapeHtml(warning)}</div>`).join('')}
    <details class="admin-ai-json"><summary>Ver JSON interpretado</summary><pre>${escapeHtml(JSON.stringify(normalized, null, 2))}</pre></details>`;
}

export async function initAdminLocalImageImport({ entityType }) {
  if (!['hero', 'equipment'].includes(entityType)) return;

  const toolbar = entityType === 'hero'
    ? document.querySelector('.hero-editor-toolbar-actions')
    : document.querySelector('.equipment-editor-toolbar-actions, .admin-toolbar-actions, .equipment-toolbar-actions');
  if (!toolbar || toolbar.querySelector(`[data-ai-launch="${entityType}"]`)) return;

  const launch = document.createElement('button');
  launch.type = 'button';
  launch.className = 'admin-button admin-ai-launch';
  launch.dataset.aiLaunch = entityType;
  launch.innerHTML = `<span>Ler imagens</span><span class="admin-ai-badge">NEURAL</span>`;
  toolbar.insertBefore(launch, toolbar.firstChild);

  const backdrop = ensureUi(entityType);
  const input = backdrop.querySelector('[data-ai-files]');
  const drop = backdrop.querySelector('[data-ai-drop]');
  const grid = backdrop.querySelector('[data-ai-file-grid]');
  const progress = backdrop.querySelector('[data-ai-progress]');
  const resultHost = backdrop.querySelector('[data-ai-result]');
  const analyze = backdrop.querySelector('[data-ai-analyze]');
  const apply = backdrop.querySelector('[data-ai-apply]');
  const clear = backdrop.querySelector('[data-ai-clear]');
  let files = [];
  let normalized = null;
  let incompleteAcknowledged = false;

  const resetApplyState = () => {
    incompleteAcknowledged = false;
    apply.textContent = 'Aplicar no editor';
  };

  const setProgress = (text, kind = '') => {
    progress.textContent = text || '';
    progress.className = `admin-ai-progress ${text ? 'is-visible' : ''} ${kind}`;
  };

  const renderFiles = () => {
    grid.innerHTML = files.map((file, index) => {
      const url = URL.createObjectURL(file);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return `<div class="admin-ai-file"><img src="${url}" alt=""><strong>${escapeHtml(file.name)}</strong><small>${bytesLabel(file.size)}</small><br><button type="button" class="admin-ai-import-btn" data-ai-remove="${index}" style="margin-top:7px;padding:6px 9px">Remover</button></div>`;
    }).join('');
    analyze.disabled = files.length === 0;
    grid.querySelectorAll('[data-ai-remove]').forEach(button => button.addEventListener('click', () => {
      files.splice(Number(button.dataset.aiRemove), 1);
      normalized = null;
      resetApplyState();
      apply.hidden = true;
      resultHost.innerHTML = '';
      renderFiles();
    }));
  };

  const addFiles = incoming => {
    for (const file of incoming) {
      if (files.length >= MAX_IMAGES) break;
      if (!ALLOWED_TYPES.has(file.type)) {
        setProgress(`${file.name}: formato não suportado.`, 'error');
        continue;
      }
      if (file.size > MAX_SOURCE_BYTES) {
        setProgress(`${file.name}: arquivo maior que ${bytesLabel(MAX_SOURCE_BYTES)}.`, 'error');
        continue;
      }
      files.push(file);
    }
    normalized = null;
    resetApplyState();
    apply.hidden = true;
    resultHost.innerHTML = '';
    renderFiles();
  };

  const previousOverflow = {
    html: '',
    body: ''
  };

  const close = () => {
    backdrop.classList.remove('is-open');
    document.documentElement.style.overflow = previousOverflow.html;
    document.body.style.overflow = previousOverflow.body;
  };
  const open = () => {
    previousOverflow.html = document.documentElement.style.overflow;
    previousOverflow.body = document.body.style.overflow;
    backdrop.classList.add('is-open');
    backdrop.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  };

  launch.addEventListener('click', open);
  backdrop.querySelector('[data-ai-close]').addEventListener('click', close);
  backdrop.addEventListener('click', event => { if (event.target === backdrop) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && backdrop.classList.contains('is-open')) close(); });
  input.addEventListener('change', () => addFiles([...input.files]));
  ['dragenter', 'dragover'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach(type => drop.addEventListener(type, event => { event.preventDefault(); drop.classList.remove('is-drag'); }));
  drop.addEventListener('drop', event => addFiles([...event.dataTransfer.files]));

  clear.addEventListener('click', () => {
    files = [];
    input.value = '';
    normalized = null;
    resetApplyState();
    resultHost.innerHTML = '';
    apply.hidden = true;
    setProgress('');
    renderFiles();
  });

  analyze.addEventListener('click', async () => {
    if (!files.length || analyze.disabled) return;
    analyze.disabled = true;
    resetApplyState();
    apply.hidden = true;
    resultHost.innerHTML = '';
    try {

      setProgress('Preparando o OCR local...');
      const context = await loadContext(entityType);
      const identity = currentIdentity(entityType);

      const ocrRun = await runLocalOcr(
        files,
        entityType,
        message => setProgress(message)
      );

      normalized = parseLocalOcr({
        entityType,
        readings: ocrRun.readings,
        context,
        identity
      });

      normalized.ocr = normalized.ocr || {};
      normalized.ocr.engine = ocrRun.engine;
      normalized.ocr.evidence = await createGameCaptureEvidence(files);

      if (ocrRun.engine?.fallback) {
        const fallbackReason = String(
          ocrRun.engine?.reason ||
          'motivo técnico não informado'
        ).trim();

        normalized.ocr.warnings = [
          'O PaddleOCR neural não pôde ser usado nesta execução. Motivo: ' +
            fallbackReason +
            '. O resultado abaixo veio do fallback Tesseract e exige revisão reforçada.',
          ...(normalized.ocr.warnings || [])
        ];
      }

      if (!normalized) {
        throw new Error('O OCR local não retornou dados para revisão.');
      }

      resultHost.innerHTML = summaryHtml(entityType, normalized);
      apply.hidden = false;
      if (entityType === 'equipment' && normalized.ocr?.batch?.incomplete) {
        apply.textContent = 'Revisar leitura incompleta';
      }
      setProgress(`Leitura concluída com ${normalized.ocr?.engine?.label || 'OCR local'}. Revise os dados e alertas antes de aplicar.`, 'ok');

      requestAnimationFrame(() => {
        resultHost.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      });
    } catch (error) {
      console.error('Falha no OCR local:', error);
      const message = error?.message || 'Não foi possível ler as imagens localmente.';
      setProgress(message, 'error');
      resultHost.innerHTML = `<div class="admin-ai-warning">Nenhum dado foi alterado. Você pode ajustar os prints, tentar novamente ou usar a revisão manual por JSON.</div>`;
    } finally {
      analyze.disabled = files.length === 0;
    }
  });

  apply.addEventListener('click', () => {
    if (!normalized) return;
    if (
      entityType === 'equipment' &&
      normalized.ocr?.batch?.incomplete &&
      !incompleteAcknowledged
    ) {
      incompleteAcknowledged = true;
      apply.textContent = 'Aplicar mesmo assim';
      setProgress(
        'A leitura está incompleta e não será aplicada ainda. Revise as raridades faltantes; para assumir o risco, clique novamente em “Aplicar mesmo assim”.',
        'error'
      );
      resultHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    window.dispatchEvent(new CustomEvent('echoarena:image-import-result', {
      detail: { entityType, data: normalized }
    }));
    setProgress('Dados lidos pelo OCR foram enviados para a revisão. Nada foi salvo ainda.', 'ok');
    close();
  });
}
