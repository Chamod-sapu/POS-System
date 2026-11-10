#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'dist', 'public'];
const IGNORED_PATHS = [
  'node_modules',
  '.git',
  '.gemini',
  'scripts',
  'docs',
  'coverage',
  '.nyc_output',
];

// Matches Supabase service_role keys or standard JWT signatures
const SERVICE_ROLE_REGEX = /service_role/i;
const JWT_SECRET_REGEX = /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;

const violations = [];

function scanFile(filePath) {
  // Skip binary/large non-code assets
  if (/\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|lock)$/i.test(filePath)) return;
  // Skip test files that deliberately mock security violations
  if (/\.test\.(ts|tsx|js|jsx)$/i.test(filePath)) return;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(ROOT, filePath);

    if (SERVICE_ROLE_REGEX.test(content)) {
      violations.push({
        file: relPath,
        reason: "Detected forbidden string 'service_role'",
      });
    }

    const jwtMatch = content.match(JWT_SECRET_REGEX);
    if (jwtMatch) {
      violations.push({
        file: relPath,
        reason: `Detected potential raw JWT token: ${jwtMatch[0].substring(0, 16)}...`,
      });
    }
  } catch (err) {
    // Ignore unreadable or locked files
  }
}

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const rel = path.relative(ROOT, fullPath);

    if (IGNORED_PATHS.some((ignored) => rel.startsWith(ignored))) {
      continue;
    }

    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile()) {
      scanFile(fullPath);
    }
  }
}

for (const target of TARGET_DIRS) {
  walk(path.join(ROOT, target));
}

if (violations.length > 0) {
  console.error('\x1b[31m[SECURITY AUDIT FAILED] Secret leakage detected in client bundle / sources:\x1b[0m');
  violations.forEach((v) => {
    console.error(`  - \x1b[33m${v.file}\x1b[0m: ${v.reason}`);
  });
  console.error('\nBuild aborted to prevent credential leakage.');
  process.exit(1);
} else {
  console.log('\x1b[32m[PASS] No service_role keys or exposed JWTs detected in client build or source trees.\x1b[0m');
  process.exit(0);
}

