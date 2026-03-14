#!/usr/bin/env node

/**
 * Verify runtime version isolation
 * Tests that each package loads its own version of lodash
 * and that rxjs peer dependency is shared
 */

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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected "${expected}", got "${actual}"`);
  }
}

// =============================================================================
// LOAD PACKAGES
// We need to load each package in a way that respects their node_modules
// =============================================================================

// Helper to require from a specific package's context
function requireFromPackage(packagePath, moduleName) {
  const pkgNodeModules = path.join(ROOT, packagePath, 'node_modules');
  const modulePath = require.resolve(moduleName, { paths: [pkgNodeModules] });
  return require(modulePath);
}

// =============================================================================
// LODASH VERSION ISOLATION TESTS
// =============================================================================

test('lib-b loads lodash@4.17.15', () => {
  const lodash = requireFromPackage('libs/lib-b', 'lodash');
  assertEqual(lodash.VERSION, '4.17.15', 'lib-b lodash version');
});

test('lib-a loads lodash@4.17.21', () => {
  const lodash = requireFromPackage('libs/lib-a', 'lodash');
  assertEqual(lodash.VERSION, '4.17.21', 'lib-a lodash version');
});

test('lib-c loads lodash@4.17.19', () => {
  const lodash = requireFromPackage('libs/lib-c', 'lodash');
  assertEqual(lodash.VERSION, '4.17.19', 'lib-c lodash version');
});

test('app-latest loads lodash@4.17.20', () => {
  const lodash = requireFromPackage('apps/app-latest', 'lodash');
  assertEqual(lodash.VERSION, '4.17.20', 'app-latest lodash version');
});

test('app-v16 loads lodash@4.17.20', () => {
  const lodash = requireFromPackage('apps/app-v16', 'lodash');
  assertEqual(lodash.VERSION, '4.17.20', 'app-v16 lodash version');
});

test('app-v14 loads lodash@4.17.20', () => {
  const lodash = requireFromPackage('apps/app-v14', 'lodash');
  assertEqual(lodash.VERSION, '4.17.20', 'app-v14 lodash version');
});

test('all packages load different lodash versions', () => {
  const versions = {
    'lib-a': requireFromPackage('libs/lib-a', 'lodash').VERSION,
    'lib-b': requireFromPackage('libs/lib-b', 'lodash').VERSION,
    'lib-c': requireFromPackage('libs/lib-c', 'lodash').VERSION,
    'app-latest': requireFromPackage('apps/app-latest', 'lodash').VERSION,
  };

  const uniqueVersions = new Set(Object.values(versions));
  assertEqual(
    uniqueVersions.size,
    4,
    `Should have 4 unique lodash versions, got ${uniqueVersions.size}: ${JSON.stringify(versions)}`
  );
});

// =============================================================================
// PEER DEPENDENCY SHARING TESTS (rxjs)
// =============================================================================

test('lib-a and lib-b share the same rxjs instance (via app-latest)', () => {
  // When lib-a and lib-b are used by app-latest, they should share app's rxjs
  const appRxjs = requireFromPackage('apps/app-latest', 'rxjs');

  // lib-a should resolve to app's rxjs (peer dep)
  const libANodeModules = path.join(ROOT, 'libs/lib-a/node_modules');
  const libARxjsPath = require.resolve('rxjs', { paths: [libANodeModules, path.join(ROOT, 'apps/app-latest/node_modules')] });
  const libARxjs = require(libARxjsPath);

  // They should be the exact same module instance
  assert(
    appRxjs.Observable === libARxjs.Observable,
    'rxjs Observable should be the same instance for app and lib-a'
  );
});

// =============================================================================
// LIBRARY FUNCTION TESTS
// =============================================================================

test('lib-b exports work correctly', () => {
  // Build lib-b first, then test
  const libBDist = path.join(ROOT, 'libs/lib-b/dist/index.js');
  try {
    const libB = require(libBDist);
    const version = libB.getLibBLodashVersion();
    assertEqual(version, '4.17.15', 'lib-b getLibBLodashVersion()');
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      throw new Error('lib-b not built. Run: pnpm --filter @myorg/lib-b exec tsc --project tsconfig.json');
    }
    throw e;
  }
});

test('lib-a exports work correctly', () => {
  const libADist = path.join(ROOT, 'libs/lib-a/dist/index.js');
  try {
    const libA = require(libADist);
    const version = libA.getLibALodashVersion();
    assertEqual(version, '4.17.21', 'lib-a getLibALodashVersion()');
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      throw new Error('lib-a not built. Run: pnpm --filter @myorg/lib-a exec tsc --project tsconfig.json');
    }
    throw e;
  }
});

test('lib-a can access lib-b functions', () => {
  const libADist = path.join(ROOT, 'libs/lib-a/dist/index.js');
  try {
    const libA = require(libADist);
    const libBVersion = libA.getLibBLodashVersion();
    assertEqual(libBVersion, '4.17.15', 'lib-a accessing lib-b lodash version');
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      throw new Error('Libraries not built. Run build first.');
    }
    throw e;
  }
});

test('lib-c exports work correctly', () => {
  const libCDist = path.join(ROOT, 'libs/lib-c/dist/index.js');
  try {
    const libC = require(libCDist);
    const version = libC.getLibCLodashVersion();
    assertEqual(version, '4.17.19', 'lib-c getLibCLodashVersion()');
  } catch (e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      throw new Error('lib-c not built. Run: pnpm --filter @myorg/lib-c exec tsc --project tsconfig.json');
    }
    throw e;
  }
});

// =============================================================================
// RUN TESTS
// =============================================================================

console.log('🧪 Verifying runtime version isolation...\n');

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
