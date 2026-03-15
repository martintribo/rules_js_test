/**
 * Bazel Sandbox esbuild Plugin for Angular
 *
 * This plugin helps esbuild resolve modules inside Bazel's sandbox.
 * When running in linux-sandbox, symlinks in node_modules may point to
 * absolute paths that don't exist in the sandbox namespace. This plugin
 * intercepts failed resolutions and finds modules in the package store.
 *
 * Based on: https://github.com/aspect-build/rules_esbuild
 */

const path = require('path');
const fs = require('fs');

const DEBUG = process.env.JS_BINARY__LOG_DEBUG === '1' || process.env.BAZEL_SANDBOX_DEBUG === '1';

function debug(...args) {
  if (DEBUG) {
    console.error('[bazel-sandbox]', ...args);
  }
}

// Always log critical info for debugging
function info(...args) {
  console.error('[bazel-sandbox]', ...args);
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
  const bindir = process.env.BAZEL_BINDIR;
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
 * Find the main entry point of a package
 */
function resolvePackageMain(packagePath) {
  const pkgJsonPath = path.join(packagePath, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    // Try index.js as fallback
    const indexPath = path.join(packagePath, 'index.js');
    if (fs.existsSync(indexPath)) {
      return indexPath;
    }
    return null;
  }

  try {
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));

    // Try various entry points in order of preference
    const entryPoints = [
      pkgJson.exports?.['.']?.require,
      pkgJson.exports?.['.']?.default,
      pkgJson.exports?.['.'],
      pkgJson.main,
      'index.js',
    ];

    for (const entry of entryPoints) {
      if (typeof entry === 'string') {
        const entryPath = path.join(packagePath, entry);
        if (fs.existsSync(entryPath)) {
          return entryPath;
        }
      }
    }
  } catch (e) {
    debug('Error reading package.json:', e.message);
  }

  return null;
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
 * Create the bazel-sandbox plugin for esbuild
 */
function createBazelSandboxPlugin() {
  const sandboxInfo = detectSandboxInfo();

  return {
    name: 'bazel-sandbox',
    setup(build) {
      // Intercept all module resolution
      build.onResolve({ filter: /.*/ }, async (args) => {
        // Skip if we already processed this (prevent infinite recursion)
        if (args.pluginData?.bazelSandboxProcessed) {
          return null;
        }

        // Skip entry points
        if (args.kind === 'entry-point') {
          return null;
        }

        // Let esbuild try to resolve first
        let result;
        try {
          result = await build.resolve(args.path, {
            kind: args.kind,
            importer: args.importer,
            resolveDir: args.resolveDir,
            namespace: args.namespace,
            pluginData: { ...args.pluginData, bazelSandboxProcessed: true },
          });
        } catch (e) {
          debug('Resolution threw error for', args.path, ':', e.message);
          result = { errors: [{ text: e.message }] };
        }

        // If resolution failed, try to find the module in the package store
        if (result.errors && result.errors.length > 0) {
          debug('Resolution failed for:', args.path, 'from:', args.resolveDir);

          // Skip relative and absolute paths - only handle bare module specifiers
          if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
            // Try to find in package store
            const packagePath = findInPackageStore(args.path, sandboxInfo);

            if (packagePath) {
              const mainPath = resolvePackageMain(packagePath);
              if (mainPath) {
                info('Resolved', args.path, '->', mainPath);
                return { path: mainPath };
              }

              // Return the directory and let esbuild figure out the entry point
              return { path: packagePath };
            }
          }

          // Return the original error if we couldn't help
          return result;
        }

        // Skip external modules
        if (result.external) {
          return result;
        }

        // Check if the resolved path escaped the sandbox
        if (result.path && !isInSandbox(result.path, sandboxInfo)) {
          debug('Path escaped sandbox:', result.path);

          // Try to remap the path back into the sandbox
          const remappedPath = remapToSandbox(result.path, sandboxInfo);
          if (remappedPath) {
            debug('Remapped to:', remappedPath);
            return { ...result, path: remappedPath };
          }

          // Try extracting the relative path from bazel-out onwards
          const bazelOutIdx = result.path.indexOf('/bazel-out/');
          if (bazelOutIdx >= 0) {
            const relativePath = result.path.substring(bazelOutIdx);
            const alternativePath = sandboxInfo.sandboxExecroot + relativePath;
            if (fs.existsSync(alternativePath)) {
              debug('Remapped via bazel-out:', alternativePath);
              return { ...result, path: alternativePath };
            }
          }
        }

        return result;
      });
    },
  };
}

// Export the plugin object directly
module.exports = createBazelSandboxPlugin();
