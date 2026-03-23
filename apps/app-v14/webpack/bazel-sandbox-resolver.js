/**
 * Bazel Sandbox Webpack Resolver Plugin
 *
 * This plugin helps webpack resolve modules inside Bazel's sandbox.
 * When running in linux-sandbox, symlinks in node_modules may point to
 * absolute paths that don't exist in the sandbox namespace. This plugin
 * intercepts failed resolutions and finds modules in the package store.
 *
 * Similar to the esbuild plugin at apps/app-latest/esbuild/bazel-sandbox-plugin.js
 */

const path = require('path');
const fs = require('fs');

const DEBUG = process.env.JS_BINARY__LOG_DEBUG === '1' || process.env.BAZEL_SANDBOX_DEBUG === '1';

function debug(...args) {
  if (DEBUG) {
    console.error('[bazel-sandbox-resolver]', ...args);
  }
}

function info(...args) {
  console.error('[bazel-sandbox-resolver]', ...args);
}

/**
 * Detect sandbox and execroot information
 */
function detectSandboxInfo() {
  const cwd = process.cwd();

  // Pattern: .../sandbox/linux-sandbox/<id>/execroot/_main/...
  const sandboxPattern = /^(.*\/sandbox\/(?:linux|processwrapper)-sandbox\/\d+)(\/execroot\/[^/]+)(\/.*)?$/;
  const match = cwd.match(sandboxPattern);

  if (match) {
    const sandboxRoot = match[1];
    const execrootPart = match[2];
    info('Running in sandbox:', sandboxRoot);
    info('Execroot:', sandboxRoot + execrootPart);
    return {
      inSandbox: true,
      sandboxRoot: sandboxRoot,
      sandboxExecroot: sandboxRoot + execrootPart,
    };
  }

  // Find execroot from BAZEL_BINDIR or cwd
  const bazelOutIdx = cwd.indexOf('/bazel-out/');
  if (bazelOutIdx > 0) {
    const execroot = cwd.substring(0, bazelOutIdx);
    info('Running in execroot (no sandbox):', execroot);
    return {
      inSandbox: false,
      sandboxRoot: null,
      sandboxExecroot: execroot,
    };
  }

  info('Could not detect Bazel environment, using cwd:', cwd);
  return {
    inSandbox: false,
    sandboxRoot: null,
    sandboxExecroot: cwd,
  };
}

/**
 * Find a package in the .aspect_rules_js package store
 */
function findInPackageStore(moduleName, sandboxInfo) {
  const binDir = process.env.BAZEL_BINDIR || 'bazel-out/k8-fastbuild/bin';
  const packageStorePath = path.join(sandboxInfo.sandboxExecroot, binDir, 'node_modules/.aspect_rules_js');

  debug('Looking for', moduleName, 'in package store:', packageStorePath);

  if (!fs.existsSync(packageStorePath)) {
    debug('Package store does not exist:', packageStorePath);
    return null;
  }

  try {
    const entries = fs.readdirSync(packageStorePath);

    // Handle scoped packages like @types/lodash
    const isScoped = moduleName.startsWith('@');
    let searchName;

    if (isScoped) {
      // @types/lodash -> @types+lodash
      // @myorg/lib-a -> @myorg+lib-a
      searchName = moduleName.replace('/', '+');
    } else {
      searchName = moduleName;
    }

    // Find matching directories (e.g., lodash@4.17.21, rxjs@7.8.2)
    const matches = entries.filter(entry => {
      // Match package@version pattern
      return entry.startsWith(searchName + '@');
    });

    debug('Found matches for', moduleName, ':', matches);

    if (matches.length > 0) {
      // Use the first match (or we could be smarter about version selection)
      const matchDir = matches[0];
      const fullPath = path.join(packageStorePath, matchDir, 'node_modules', moduleName);

      if (fs.existsSync(fullPath)) {
        debug('Found package at:', fullPath);
        return fullPath;
      }

      // For scoped packages, the structure is different
      // @types+lodash@4.17.24 -> node_modules/@types/lodash
      const scopedPath = path.join(packageStorePath, matchDir, 'node_modules', ...moduleName.split('/'));
      if (fs.existsSync(scopedPath)) {
        debug('Found scoped package at:', scopedPath);
        return scopedPath;
      }
    }
  } catch (e) {
    debug('Error searching package store:', e.message);
  }

  return null;
}

/**
 * Check if a path is within the sandbox execroot
 */
function isInSandbox(filepath, sandboxInfo) {
  const resolved = path.resolve(filepath);
  const normalizedExecroot = path.resolve(sandboxInfo.sandboxExecroot);
  return resolved.startsWith(normalizedExecroot + path.sep) || resolved === normalizedExecroot;
}

/**
 * Remap an escaped path back into the sandbox
 */
function remapToSandbox(escapedPath, sandboxInfo) {
  const execrootPattern = /\/execroot\/([^/]+)(\/.*)?$/;
  const match = escapedPath.match(execrootPattern);

  if (match) {
    const relativePath = match[2] || '';
    const remappedPath = sandboxInfo.sandboxExecroot + relativePath;

    if (fs.existsSync(remappedPath)) {
      return remappedPath;
    }
  }

  // Try extracting the relative path from bazel-out onwards
  const bazelOutIdx = escapedPath.indexOf('/bazel-out/');
  if (bazelOutIdx >= 0) {
    const relativePath = escapedPath.substring(bazelOutIdx);
    const alternativePath = sandboxInfo.sandboxExecroot + relativePath;
    if (fs.existsSync(alternativePath)) {
      return alternativePath;
    }
  }

  return null;
}

/**
 * Extract the package name from a request
 * e.g., "lodash/get" -> "lodash", "@myorg/lib-a/utils" -> "@myorg/lib-a"
 */
function getPackageName(request) {
  if (request.startsWith('@')) {
    const parts = request.split('/');
    if (parts.length >= 2) {
      return parts[0] + '/' + parts[1];
    }
    return request;
  }
  return request.split('/')[0];
}

/**
 * Get the subpath within a package
 * e.g., "lodash/get" -> "get", "@myorg/lib-a/utils" -> "utils"
 */
function getSubpath(request) {
  const packageName = getPackageName(request);
  if (request === packageName) {
    return '';
  }
  return request.substring(packageName.length + 1);
}

/**
 * Webpack resolver plugin class
 */
class BazelSandboxResolverPlugin {
  constructor() {
    this.sandboxInfo = detectSandboxInfo();
    this.name = 'BazelSandboxResolverPlugin';
  }

  apply(resolver) {
    const sandboxInfo = this.sandboxInfo;

    // Hook into the resolve process
    resolver.getHook('resolve').tapAsync(this.name, (request, resolveContext, callback) => {
      // Skip if already processed
      if (request.bazelSandboxProcessed) {
        return callback();
      }

      // Skip relative and absolute paths
      if (!request.request || request.request.startsWith('.') || request.request.startsWith('/')) {
        return callback();
      }

      // Let the normal resolution try first
      const newRequest = Object.assign({}, request, { bazelSandboxProcessed: true });

      resolver.doResolve(
        resolver.getHook('resolve'),
        newRequest,
        null,
        resolveContext,
        (err, result) => {
          // If resolution succeeded, check if the path escaped the sandbox
          if (!err && result && result.path) {
            if (!isInSandbox(result.path, sandboxInfo)) {
              debug('Path escaped sandbox:', result.path);

              // Try to remap the path back into the sandbox
              const remappedPath = remapToSandbox(result.path, sandboxInfo);
              if (remappedPath) {
                debug('Remapped to:', remappedPath);
                result.path = remappedPath;
              }
            }
            return callback(null, result);
          }

          // If resolution failed, try to find the module in the package store
          if (err || !result) {
            const packageName = getPackageName(request.request);
            const subpath = getSubpath(request.request);

            debug('Resolution failed for:', request.request, 'trying package store');

            const packagePath = findInPackageStore(packageName, sandboxInfo);

            if (packagePath) {
              let targetPath = packagePath;
              if (subpath) {
                targetPath = path.join(packagePath, subpath);
              }

              // Try to resolve to an actual file
              const extensions = ['', '.js', '.json', '.node', '/index.js', '/index.json'];
              for (const ext of extensions) {
                const tryPath = targetPath + ext;
                if (fs.existsSync(tryPath)) {
                  const stat = fs.statSync(tryPath);
                  if (stat.isFile()) {
                    info('Resolved', request.request, '->', tryPath);
                    return callback(null, {
                      path: tryPath,
                      request: request.request,
                    });
                  }
                }
              }

              // Return the package directory and let webpack figure out the entry
              if (fs.existsSync(targetPath)) {
                info('Resolved', request.request, '->', targetPath);
                return callback(null, {
                  path: targetPath,
                  request: request.request,
                });
              }
            }

            // Couldn't help, return original error
            return callback(err);
          }

          return callback(null, result);
        }
      );
    });
  }
}

module.exports = BazelSandboxResolverPlugin;
