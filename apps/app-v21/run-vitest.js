#!/usr/bin/env node
/**
 * Wrapper to run vitest programmatically.
 * Used by js_test in Bazel since vitest needs to be invoked
 * from the project directory with the right config.
 */
const { startVitest } = require('vitest/node');

async function main() {
  const vitest = await startVitest('test', [], {
    watch: false,
    reporters: ['verbose'],
  });

  if (!vitest) {
    console.error('Failed to start vitest');
    process.exit(1);
  }

  await vitest.close();

  const failed = vitest.state.getCountOfFailedTests();
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
