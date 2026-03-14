#!/usr/bin/env node

/**
 * Verify pnpm node_modules structure
 * Checks symlinked vs injected workspace dependencies
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isSymlink(filepath) {
  try {
    return fs.lstatSync(filepath).isSymbolicLink();
  } catch {
    return false;
  }
}

function readSymlink(filepath) {
  try {
    return fs.readlinkSync(filepath);
  } catch {
    return null;
  }
}

function fileExists(filepath) {
  try {
    fs.accessSync(filepath);
    return true;
  } catch {
    return false;
  }
}

function readPackageJson(pkgPath) {
  const pkgJsonPath = path.join(pkgPath, 'package.json');
  if (!fileExists(pkgJsonPath)) return null;
  return JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
}

function getResolvedPath(filepath) {
  try {
    return fs.realpathSync(filepath);
  } catch {
    return null;
  }
}

// =============================================================================
// STRUCTURE TESTS
// =============================================================================

test('pnpm uses isolated linker (not hoisted)', () => {
  const npmrc = fs.readFileSync(path.join(ROOT, '.npmrc'), 'utf8');
  assert(
    npmrc.includes('node-linker=isolated'),
    '.npmrc should specify node-linker=isolated'
  );
});

test('lib-a has dependenciesMeta.injected for lib-b', () => {
  const pkg = readPackageJson(path.join(ROOT, 'libs/lib-a'));
  assert(pkg, 'lib-a/package.json should exist');
  assert(
    pkg.dependenciesMeta?.['@myorg/lib-b']?.injected === true,
    'lib-a should have dependenciesMeta.injected=true for @myorg/lib-b'
  );
});

test('lib-c does NOT have dependenciesMeta.injected for lib-b', () => {
  const pkg = readPackageJson(path.join(ROOT, 'libs/lib-c'));
  assert(pkg, 'lib-c/package.json should exist');
  const injected = pkg.dependenciesMeta?.['@myorg/lib-b']?.injected;
  assert(
    !injected,
    'lib-c should NOT have dependenciesMeta.injected for @myorg/lib-b'
  );
});

test('lib-a/node_modules/@myorg/lib-b exists', () => {
  const libBPath = path.join(ROOT, 'libs/lib-a/node_modules/@myorg/lib-b');
  assert(fileExists(libBPath), 'lib-a should have @myorg/lib-b in node_modules');
});

test('lib-c/node_modules/@myorg/lib-b exists', () => {
  const libBPath = path.join(ROOT, 'libs/lib-c/node_modules/@myorg/lib-b');
  assert(fileExists(libBPath), 'lib-c should have @myorg/lib-b in node_modules');
});

test('lib-c/node_modules/@myorg/lib-b is a symlink', () => {
  const libBPath = path.join(ROOT, 'libs/lib-c/node_modules/@myorg/lib-b');
  assert(
    isSymlink(libBPath),
    'lib-c\'s @myorg/lib-b should be a symlink (not injected)'
  );
});

// =============================================================================
// VERSION TESTS (package.json declarations)
// =============================================================================

test('lib-a depends on lodash@4.17.21', () => {
  const pkg = readPackageJson(path.join(ROOT, 'libs/lib-a'));
  assert(
    pkg.dependencies?.lodash === '4.17.21',
    `lib-a should depend on lodash@4.17.21, got ${pkg.dependencies?.lodash}`
  );
});

test('lib-b depends on lodash@4.17.15', () => {
  const pkg = readPackageJson(path.join(ROOT, 'libs/lib-b'));
  assert(
    pkg.dependencies?.lodash === '4.17.15',
    `lib-b should depend on lodash@4.17.15, got ${pkg.dependencies?.lodash}`
  );
});

test('lib-c depends on lodash@4.17.19', () => {
  const pkg = readPackageJson(path.join(ROOT, 'libs/lib-c'));
  assert(
    pkg.dependencies?.lodash === '4.17.19',
    `lib-c should depend on lodash@4.17.19, got ${pkg.dependencies?.lodash}`
  );
});

test('app-latest depends on lodash@4.17.20', () => {
  const pkg = readPackageJson(path.join(ROOT, 'apps/app-latest'));
  assert(
    pkg.dependencies?.lodash === '4.17.20',
    `app-latest should depend on lodash@4.17.20, got ${pkg.dependencies?.lodash}`
  );
});

// =============================================================================
// PEER DEPENDENCY TESTS
// =============================================================================

test('lib-a has rxjs as peerDependency', () => {
  const pkg = readPackageJson(path.join(ROOT, 'libs/lib-a'));
  assert(
    pkg.peerDependencies?.rxjs,
    'lib-a should have rxjs as peerDependency'
  );
});

test('lib-b has rxjs as peerDependency', () => {
  const pkg = readPackageJson(path.join(ROOT, 'libs/lib-b'));
  assert(
    pkg.peerDependencies?.rxjs,
    'lib-b should have rxjs as peerDependency'
  );
});

test('lib-c has rxjs as peerDependency', () => {
  const pkg = readPackageJson(path.join(ROOT, 'libs/lib-c'));
  assert(
    pkg.peerDependencies?.rxjs,
    'lib-c should have rxjs as peerDependency'
  );
});

test('app-latest has rxjs as dependency (provides peer)', () => {
  const pkg = readPackageJson(path.join(ROOT, 'apps/app-latest'));
  assert(
    pkg.dependencies?.rxjs,
    'app-latest should have rxjs as dependency to provide peer'
  );
});

// =============================================================================
// LOCKFILE TESTS
// =============================================================================

test('pnpm-lock.yaml records lib-a lib-b as injected', () => {
  const lockfile = fs.readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8');
  // Check that lib-a's section has injected: true for lib-b
  const libASection = lockfile.split('libs/lib-a:')[1]?.split('\n  libs/')[0] || '';
  assert(
    libASection.includes('injected: true'),
    'pnpm-lock.yaml should record lib-a\'s lib-b dependency as injected'
  );
});

// =============================================================================
// RUN TESTS
// =============================================================================

console.log('🧪 Verifying pnpm structure...\n');

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
