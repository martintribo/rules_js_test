/**
 * Custom webpack configuration for Angular 14
 *
 * This extends the default Angular webpack config to add Bazel sandbox support.
 * Instead of complex resolver plugins, we add the package store directories
 * to webpack's module resolution paths so it can find packages there.
 */

const path = require('path');
const fs = require('fs');

function findPackageStorePaths() {
  const cwd = process.cwd();
  const binDir = process.env.BAZEL_BINDIR || 'bazel-out/k8-fastbuild/bin';

  // Find the execroot
  let execroot = cwd;
  const sandboxPattern = /^(.*\/sandbox\/(?:linux|processwrapper)-sandbox\/\d+\/execroot\/[^/]+)(\/.*)?$/;
  const match = cwd.match(sandboxPattern);
  if (match) {
    execroot = match[1];
  } else {
    const bazelOutIdx = cwd.indexOf('/bazel-out/');
    if (bazelOutIdx > 0) {
      execroot = cwd.substring(0, bazelOutIdx);
    }
  }

  const packageStorePath = path.join(execroot, binDir, 'node_modules/.aspect_rules_js');
  const paths = [];

  if (fs.existsSync(packageStorePath)) {
    console.log('[webpack.config.js] Found package store:', packageStorePath);

    // Add node_modules directories from each package in the store
    try {
      const entries = fs.readdirSync(packageStorePath);
      for (const entry of entries) {
        const nodeModulesPath = path.join(packageStorePath, entry, 'node_modules');
        if (fs.existsSync(nodeModulesPath)) {
          paths.push(nodeModulesPath);
        }
      }
    } catch (e) {
      console.error('[webpack.config.js] Error reading package store:', e.message);
    }
  }

  return paths;
}

module.exports = (config, options) => {
  // Only modify when running in Bazel
  if (process.env.BAZEL_BINDIR) {
    console.log('[webpack.config.js] Running in Bazel, configuring module resolution');

    // Find package store paths
    const packageStorePaths = findPackageStorePaths();

    if (packageStorePaths.length > 0) {
      console.log('[webpack.config.js] Adding', packageStorePaths.length, 'package store paths to resolve.modules');

      // Add package store paths to webpack's module resolution
      config.resolve = config.resolve || {};
      config.resolve.modules = config.resolve.modules || ['node_modules'];

      // Add package store paths
      config.resolve.modules = [...config.resolve.modules, ...packageStorePaths];
    }
  }

  return config;
};
