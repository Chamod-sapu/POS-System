#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve('src');
let violations = [];

function scanDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDir(fullPath);
    } else if (/\.(tsx?|jsx?|html)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('dangerouslySetInnerHTML')) {
        violations.push(path.relative(process.cwd(), fullPath));
      }
    }
  }
}

scanDir(SRC_DIR);

if (violations.length > 0) {
  console.error('\x1b[31m[SECURITY AUDIT FAILED] Forbidden dangerouslySetInnerHTML detected in:\x1b[0m');
  violations.forEach((v) => console.error(`  - ${v}`));
  process.exit(1);
} else {
  console.log('\x1b[32m[PASS] Zero instances of dangerouslySetInnerHTML found. All rendered content is text-safe.\x1b[0m');
  process.exit(0);
}

