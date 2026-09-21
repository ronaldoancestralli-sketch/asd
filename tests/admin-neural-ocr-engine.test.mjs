import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';
import { buildRecognitionDictionary } from '../admin/js/admin-neural-ocr.js';

const neural = await readFile(
  new URL('../admin/js/admin-neural-ocr.js', import.meta.url),
  'utf8'
);
const importer = await readFile(
  new URL('../admin/js/admin-ai-image-import.js', import.meta.url),
  'utf8'
);
const bundle = await readFile(
  new URL('../admin/js/vendor/paddleocr-browser.bundle.mjs', import.meta.url),
  'utf8'
);
const packageJson = await readFile(
  new URL('../package.json', import.meta.url),
  'utf8'
);
const prepareScript = await readFile(
  new URL('../scripts/prepare-neural-ocr-assets.mjs', import.meta.url),
  'utf8'
);
const csp = await readFile(
  new URL('../scripts/security-pages-postprocess.mjs', import.meta.url),
  'utf8'
);

test('browser neural OCR uses the lightweight PaddleOCR runtime with pinned versions', () => {
  assert.match(packageJson, /"paddleocr": "1\.2\.0"/);
  assert.match(packageJson, /"onnxruntime-web": "1\.22\.0"/);
  assert.match(packageJson, /"esbuild": "0\.25\.9"/);

  assert.match(neural, /\.\/vendor\/paddleocr-browser\.bundle\.mjs/);
  assert.match(neural, /modelPreset: 'PP-OCRv5_mobile'/);
  assert.match(neural, /PaddleOcrService\.createInstance/);
  assert.match(neural, /latin-ppocr-v5-mobile-rec\.onnx/);
  assert.match(neural, /latin-ppocr-v5-dict\.txt/);
  assert.doesNotMatch(neural, /esm\.sh\/@paddleocr/);
  assert.doesNotMatch(neural, /@paddleocr\/paddleocr-js/);
});

test('generated browser bundle contains no unenv or Node process.binding path', () => {
  assert.match(bundle, /PaddleOcrService/);
  assert.doesNotMatch(bundle, /\[unenv\]/);
  assert.doesNotMatch(bundle, /process\.binding is not implemented yet/);
  assert.doesNotMatch(bundle, /process\.binding\s*\(/);
  assert.doesNotMatch(bundle, /node:(?:fs|path|process)/);
});

test('self-hosted PP-OCRv5 mobile detector and Latin recognition assets exist', async () => {
  const detector = await stat(
    new URL('../assets/ocr/ppocr-v5-mobile-det.onnx', import.meta.url)
  );
  const recognizer = await stat(
    new URL('../assets/ocr/latin-ppocr-v5-mobile-rec.onnx', import.meta.url)
  );
  const dictionary = await stat(
    new URL('../assets/ocr/latin-ppocr-v5-dict.txt', import.meta.url)
  );

  assert.ok(detector.size > 4_000_000);
  assert.ok(recognizer.size > 6_000_000);
  assert.ok(dictionary.size > 1_000);

  assert.match(
    prepareScript,
    /51c2133b5a7ea27b795fa8c400fdbfbd5337dd6a/
  );
  assert.match(
    prepareScript,
    /7b02d0a30a07ba2b92ad1ff5a8941ae2c633de65/
  );
});

test('Tesseract remains fallback and paid AI stays outside the browser path', () => {
  const start = importer.indexOf('async function runLocalOcr');
  assert.ok(start >= 0);
  const localRun = importer.slice(start, start + 2200);
  assert.ok(localRun.indexOf('runPaddleOcr') >= 0);
  assert.ok(localRun.indexOf('runTesseractOcr') > localRun.indexOf('runPaddleOcr'));
  assert.match(importer, /tesseract\.js@5\.1\.1/);
  assert.doesNotMatch(importer, /functions\.invoke\(['"]admin-content-ai-import/);
  assert.doesNotMatch(importer, /OPENAI_API_KEY/);
});

test('equipment crop includes wrapped lower lines and fallback preserves reading boundaries', () => {
  assert.match(importer, /heroRegionCanvas\(base, 0\.385, 0\.265, 0\.605, 0\.675, 'contrast'\)/);
  assert.match(importer, /return partial\.map\(read => \(\{/);
  assert.match(importer, /region: read\.region/);
  assert.doesNotMatch(importer, /mergeReadingTexts\(partial\)/);
});

test('review discloses the actual OCR engine and fallback reason', () => {
  assert.match(importer, /motor usado/);
  assert.match(importer, /normalized\.ocr\.engine = ocrRun\.engine/);
  assert.match(importer, /engine\?\.fallback/);
  assert.match(importer, /Motivo:/);
  assert.match(importer, /engine\?\.reason/);
});

test('production CSP no longer needs remote Paddle model hosts', () => {
  assert.match(csp, /https:\/\/cdn\.jsdelivr\.net/);
  assert.match(csp, /'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp, /paddle-model-ecology\.bj\.bcebos\.com/);
  assert.doesNotMatch(csp, /huggingface\.co/);
});


test('Latin PP-OCRv5 dictionary adds the trained space character and matches 504 CTC classes', async () => {
  const dictionaryText = await readFile(
    new URL('../assets/ocr/latin-ppocr-v5-dict.txt', import.meta.url),
    'utf8'
  );

  const characters = buildRecognitionDictionary(dictionaryText);

  assert.equal(characters.length, 503);
  assert.equal(characters.at(-1), ' ');
  assert.ok(characters.includes('A'));
  assert.ok(characters.includes('a'));
});

test('dictionary assembly fails closed instead of accepting the 502-character mismatch seen on iPhone', () => {
  const fake502 = Array.from({ length: 502 }, (_, index) => 'x' + index).join('\n');
  const characters = buildRecognitionDictionary(fake502);
  assert.equal(characters.length, 503);
  assert.equal(characters.at(-1), ' ');

  assert.throws(
    () => buildRecognitionDictionary('A\nB\nC'),
    /Dicionário Latin incompatível/
  );
});
