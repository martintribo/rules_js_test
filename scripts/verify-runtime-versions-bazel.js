#!/usr/bin/env node

/**
 * Verify runtime version isolation (Bazel version)
 *
 * Tests that each package loads its own version of lodash
 * and that rxjs peer dependency is shared.
 *
 * Under Bazel, node_modules are laid out by rules_js in the
 * package store, so we resolve from the Bazel-provided node_modules.
 */

const path = require('path');

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

// Under Bazel, require() resolves from the runfiles node_modules
// which rules_js sets up. We just require directly.

// =============================================================================
// LODASH VERSION ISOLATION TESTS
// =============================================================================

test('lib-b loads lodash@4.17.15', () => {
  const libB = require('@myorg/lib-b');
  assertEqual(libB.getLibBLodashVersion(), '4.17.15', 'lib-b lodash version');
});

test('lib-a loads lodash@4.17.21', () => {
  const libA = require('@myorg/lib-a');
  assertEqual(libA.getLibALodashVersion(), '4.17.21', 'lib-a lodash version');
});

test('lib-a can access lib-b functions', () => {
  const libA = require('@myorg/lib-a');
  assertEqual(libA.getLibBLodashVersion(), '4.17.15', 'lib-a -> lib-b lodash version');
});

// =============================================================================
// PEER DEPENDENCY SHARING TESTS (rxjs)
// =============================================================================

test('lib-a and lib-b share rxjs identity', () => {
  const libA = require('@myorg/lib-a');
  const libARxjs = libA.getLibARxjsIdentity();
  const libBRxjs = libA.getLibBRxjsIdentity();
  assert(
    libARxjs === libBRxjs,
    'rxjs Observable.toString() should be identical for lib-a and lib-b'
  );
});

// =============================================================================
// LIBRARY FUNCTION TESTS
// =============================================================================

test('lib-a greeting works', () => {
  const libA = require('@myorg/lib-a');
  const result = libA.libAGreeting('world');
  assert(result.includes('world'), `lib-a greeting should include "world", got: ${result}`);
});

test('lib-b greeting works', () => {
  const libA = require('@myorg/lib-a');
  const result = libA.libBGreeting('world');
  assert(result.includes('world'), `lib-b greeting should include "world", got: ${result}`);
});

// =============================================================================
// RUN TESTS
// =============================================================================

console.log('Verifying runtime version isolation (Bazel)...\n');

for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL: ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
