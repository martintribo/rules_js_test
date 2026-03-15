/**
 * Bazel Sandbox Webpack Resolver Plugin
 *
 * This plugin helps webpack resolve modules inside Bazel's sandbox.
 * When running in linux-sandbox, symlinks in node_modules may point to
 * absolute paths that don't exist in the sandbox namespace.
 *
 * Strategy:
 * 1. Let webpack try normal resolution first
 * 2. If resolution fails, try finding the package in the Bazel package store
 * 3. Remap any escaped paths back into the sandbox
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
  // or .../sandbox/processwrapper-sandbox/<id>/execroot/_main/...
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
 * Find all versions of a package in the package store
 */
function findAllVersionsInPackageStore(moduleName, sandboxInfo) {
  const binDir = process.env.BAZEL_BINDIR || 'bazel-out/k8-fastbuild/bin';
  const packageStorePath = path.join(sandboxInfo.sandboxExecroot, binDir, 'node_modules/.aspect_rules_js');

  if (!fs.existsSync(packageStorePath)) {
    return [];
  }

  try {
    const entries = fs.readdirSync(packageStorePath);
    const isScoped = moduleName.startsWith('@');
    const searchName = isScoped ? moduleName.replace('/', '+') : moduleName;

    // Find all matching directories (e.g., lodash@4.17.21, lodash@4.17.15)
    const matches = entries
      .filter(entry => entry.startsWith(searchName + '@'))
      .map(matchDir => {
        const fullPath = path.join(packageStorePath, matchDir, 'node_modules', moduleName);
        if (fs.existsSync(fullPath)) {
          // Extract version from directory name
          const versionMatch = matchDir.match(/@([^@_]+)(?:_|$)/);
          return {
            path: fullPath,
            version: versionMatch ? versionMatch[1] : null,
            dir: matchDir,
          };
        }
        // For scoped packages
        const scopedPath = path.join(packageStorePath, matchDir, 'node_modules', ...moduleName.split('/'));
        if (fs.existsSync(scopedPath)) {
          const versionMatch = matchDir.match(/@([^@_]+)(?:_|$)/);
          return {
            path: scopedPath,
            version: versionMatch ? versionMatch[1] : null,
            dir: matchDir,
          };
        }
        return null;
      })
      .filter(Boolean);

    return matches;
  } catch (e) {
    debug('Error searching package store:', e.message);
    return [];
  }
}

/**
 * Resolve the main entry point of a package
 */
function resolvePackageMain(packagePath) {
  const pkgJsonPath = path.join(packagePath, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    const indexPath = path.join(packagePath, 'index.js');
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
    return null;
  }

  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

    const entryPoints = [
      pkgJson.module,
      pkgJson.main,
      pkgJson.exports?.['.']?.import,
      pkgJson.exports?.['.']?.require,
      pkgJson.exports?.['.']?.default,
      typeof pkgJson.exports?.['.'] === 'string' ? pkgJson.exports['.'] : null,
      'index.js',
    ];

    for (const entry of entryPoints) {
      if (typeof entry === 'string') {
        const entryPath = path.join(packagePath, entry);
        if (fs.existsSync(entryPath)) {
          return entryPath;
        }
        if (!entry.endsWith('.js') && fs.existsSync(entryPath + '.js')) {
          return entryPath + '.js';
        }
      }
    }
  } catch (e) {
    debug('Error reading package.json:', e.message);
  }

  return null;
}

/**
 * Check if a path is within the sandbox execroot
 */
function isInSandbox(filepath, sandboxInfo) {
  if (!filepath) return true;
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

  const bazelOutIdx = escapedPath.indexOf('/bazel-out/');
  if (bazelOutIdx >= 0) {
    const relativePath = escapedPath.substring(bazelOutIdx);
    const remappedPath = sandboxInfo.sandboxExecroot + relativePath;
    if (fs.existsSync(remappedPath)) {
      return remappedPath;
    }
  }

  return null;
}

/**
 * Extract the package name from a request
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

    // Use the 'resolve' hook to try normal resolution first, then fallback
    resolver.getHook('resolve').tapAsync(this.name, (request, resolveContext, callback) => {
      // Skip if already processed by us
      if (request.bazelSandboxProcessed) {
        return callback();
      }

      // Skip relative and absolute paths
      if (!request.request || request.request.startsWith('.') || request.request.startsWith('/')) {
        return callback();
      }

      // Mark as processed to avoid infinite loops
      const newRequest = Object.assign({}, request, { bazelSandboxProcessed: true });

      // Try normal resolution first
      resolver.doResolve(
        resolver.getHook('resolve'),
        newRequest,
        null,
        resolveContext,
        (err, result) => {
          // If resolution succeeded, return the result
          if (!err && result && result.path) {
            return callback(null, result);
          }

          // Resolution failed - try to find in package store
          const packageName = getPackageName(request.request);
          const subpath = getSubpath(request.request);

          debug('Resolution failed for:', request.request, 'trying package store');

          const versions = findAllVersionsInPackageStore(packageName, sandboxInfo);
          if (versions.length === 0) {
            // Couldn't find in package store either, return original error
            return callback(err);
          }

          // For now, use the first version found
          // TODO: Could be smarter about version selection based on context
          const packagePath = versions[0].path;

          let targetPath;
          if (subpath) {
            targetPath = path.join(packagePath, subpath);
            const extensions = ['', '.js', '.mjs', '.json'];
            for (const ext of extensions) {
              const tryPath = targetPath + ext;
              if (fs.existsSync(tryPath) && fs.statSync(tryPath).isFile()) {
                info('Resolved (fallback)', request.request, '->', tryPath);
                return callback(null, {
                  ...request,
                  path: tryPath,
                  bazelSandboxProcessed: true,
                });
              }
            }
            // Try index.js
            const indexPath = path.join(targetPath, 'index.js');
            if (fs.existsSync(indexPath)) {
              info('Resolved (fallback)', request.request, '->', indexPath);
              return callback(null, {
                ...request,
                path: indexPath,
                bazelSandboxProcessed: true,
              });
            }
          } else {
            targetPath = resolvePackageMain(packagePath);
            if (targetPath) {
              info('Resolved (fallback)', request.request, '->', targetPath);
              return callback(null, {
                ...request,
                path: targetPath,
                bazelSandboxProcessed: true,
              });
            }
          }

          // Still couldn't resolve, return original error
          return callback(err);
        }
      );
    });

    // Also intercept the result to fix escaped paths
    resolver.getHook('result').tapAsync(this.name, (request, resolveContext, callback) => {
      if (!request.path || isInSandbox(request.path, sandboxInfo)) {
        return callback(null, request);
      }

      debug('Result path escaped sandbox:', request.path);

      const remappedPath = remapToSandbox(request.path, sandboxInfo);
      if (remappedPath) {
        info('Remapped', request.path, '->', remappedPath);
        request.path = remappedPath;
      }

      callback(null, request);
    });
  }
}

module.exports = BazelSandboxResolverPlugin;
