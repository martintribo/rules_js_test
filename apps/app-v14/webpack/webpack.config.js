/**
 * Custom webpack configuration for Angular 14
 *
 * This extends the default Angular webpack config to add the Bazel sandbox
 * resolver plugin, which helps webpack find modules when running inside
 * Bazel's linux-sandbox.
 */

const BazelSandboxResolverPlugin = require('./bazel-sandbox-resolver');

module.exports = (config, options) => {
  // Only add the plugin when running in Bazel (indicated by BAZEL_BINDIR)
  if (process.env.BAZEL_BINDIR) {
    console.log('[webpack.config.js] Running in Bazel, adding BazelSandboxResolverPlugin');

    // Add our custom resolver plugin
    config.resolve = config.resolve || {};
    config.resolve.plugins = config.resolve.plugins || [];
    config.resolve.plugins.push(new BazelSandboxResolverPlugin());
  }

  return config;
};
