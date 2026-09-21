import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const ignored = new Set(['.git', 'node_modules']);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile() && fullPath.endsWith('.js')) files.push(fullPath);
  }
}

walk(root);

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  try {
    new vm.SourceTextModule(source, { identifier: path.relative(root, file) });
  } catch (error) {
    failures.push(`${path.relative(root, file)}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`Falha de sintaxe em ${failures.length} arquivo(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Sintaxe JavaScript válida em ${files.length} arquivo(s).`);
