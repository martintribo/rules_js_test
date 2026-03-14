#!/usr/bin/env node

/**
 * Run all verification tests
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, description) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`▶ ${description}`);
  console.log(`${'═'.repeat(60)}\n`);

  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
    return true;
  } catch (e) {
    return false;
  }
}

let allPassed = true;

// 1. Verify pnpm structure
if (!run('node scripts/verify-pnpm-structure.js', 'Verifying pnpm structure')) {
  allPassed = false;
}

// 2. Build libraries (required for runtime tests)
console.log(`\n${'═'.repeat(60)}`);
console.log('▶ Building libraries');
console.log(`${'═'.repeat(60)}\n`);

try {
  execSync('pnpm --filter @myorg/lib-b exec tsc --project tsconfig.json', { cwd: ROOT, stdio: 'inherit' });
  execSync('pnpm --filter @myorg/lib-a exec tsc --project tsconfig.json', { cwd: ROOT, stdio: 'inherit' });
  execSync('pnpm --filter @myorg/lib-c exec tsc --project tsconfig.json', { cwd: ROOT, stdio: 'inherit' });
  console.log('  ✅ Libraries built successfully');
} catch (e) {
  console.log('  ❌ Library build failed');
  allPassed = false;
}

// 3. Verify runtime versions
if (!run('node scripts/verify-runtime-versions.js', 'Verifying runtime version isolation')) {
  allPassed = false;
}

// Summary
console.log(`\n${'═'.repeat(60)}`);
if (allPassed) {
  console.log('✅ All tests passed!');
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
