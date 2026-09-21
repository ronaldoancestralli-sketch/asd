import { readFile, writeFile, unlink } from 'node:fs/promises';

const sourceUrl = new URL('./admin-local-ocr-parser.cases.mjs', import.meta.url);
const generatedName = '.admin-local-ocr-parser.generated.mjs';
const generatedUrl = new URL(generatedName, import.meta.url);
let source = await readFile(sourceUrl, 'utf8');

source = source.replace(
  /const parserSource = await readFile\([\s\S]*?const \{\s*parseHeroOcr,\s*parseEquipmentOcr\s*\} = await import\([\s\S]*?\);\n/,
  "const { parseHeroOcr, parseEquipmentOcr } = await import(new URL('../admin/js/admin-local-ocr-parser.js', import.meta.url));\n"
);

source = source.replaceAll(
  "name: `raridade-${activeIndex + 1}.jpeg`,\n        region:",
  "name: `raridade-${activeIndex + 1}.jpeg`,\n        sourceIndex: activeIndex,\n        region:"
);
source = source.replace(
  "name: 'item-final.jpeg',\n    region:",
  "name: 'item-final.jpeg',\n    sourceIndex: 11,\n    region:"
);
await writeFile(generatedUrl, source, 'utf8');
try {
  await import(generatedUrl.href + `?run=${Date.now()}`);
} finally {
  await unlink(generatedUrl).catch(() => {});
}
