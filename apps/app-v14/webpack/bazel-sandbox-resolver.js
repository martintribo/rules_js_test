/**
 * Bazel Sandbox Webpack Resolver Plugin
 *
 * This plugin helps webpack resolve modules inside Bazel's sandbox.
 * When running in linux-sandbox, symlinks in node_modules may point to
 * absolute paths that don't exist in the sandbox namespace. This plugin
 * remaps such escaped paths back into the sandbox.
 *
 * The key insight is that we should NOT proactively intercept resolutions,
 * because webpack's normal resolution correctly handles version selection.
 * We only need to fix paths that escape the sandbox namespace.
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
  // Pattern 1: Path contains /execroot/<workspace>/...
  // Example: /home/user/.cache/bazel/.../execroot/_main/bazel-out/...
  const execrootPattern = /\/execroot\/([^/]+)(\/.*)?$/;
  const match = escapedPath.match(execrootPattern);

  if (match) {
    const relativePath = match[2] || '';
    const remappedPath = sandboxInfo.sandboxExecroot + relativePath;
    debug('Trying remap via execroot pattern:', escapedPath, '->', remappedPath);

    if (fs.existsSync(remappedPath)) {
      return remappedPath;
    }
  }

  // Pattern 2: Path contains /bazel-out/...
  // Extract from bazel-out onwards and prepend sandbox execroot
  const bazelOutIdx = escapedPath.indexOf('/bazel-out/');
  if (bazelOutIdx >= 0) {
    const relativePath = escapedPath.substring(bazelOutIdx);
    const remappedPath = sandboxInfo.sandboxExecroot + relativePath;
    debug('Trying remap via bazel-out pattern:', escapedPath, '->', remappedPath);

    if (fs.existsSync(remappedPath)) {
      return remappedPath;
    }
  }

  // Pattern 3: Path contains /node_modules/.aspect_rules_js/...
  // This handles paths that reference the package store directly
  const aspectIdx = escapedPath.indexOf('/node_modules/.aspect_rules_js/');
  if (aspectIdx >= 0) {
    const relativePath = escapedPath.substring(aspectIdx);
    const binDir = process.env.BAZEL_BINDIR || 'bazel-out/k8-fastbuild/bin';
    const remappedPath = path.join(sandboxInfo.sandboxExecroot, binDir, relativePath);
    debug('Trying remap via aspect_rules_js pattern:', escapedPath, '->', remappedPath);

    if (fs.existsSync(remappedPath)) {
      return remappedPath;
    }
  }

  debug('Could not remap escaped path:', escapedPath);
  return null;
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

    // Only use the result hook to fix paths that escape the sandbox
    // We do NOT proactively intercept resolutions because:
    // 1. Webpack's normal resolution correctly handles version selection
    // 2. We might pick the wrong version if there are multiple
    resolver.getHook('result').tapAsync(this.name, (request, resolveContext, callback) => {
      // Skip if no path or already in sandbox
      if (!request.path || isInSandbox(request.path, sandboxInfo)) {
        return callback(null, request);
      }

      debug('Result path escaped sandbox:', request.path);

      // Try to remap the path back into the sandbox
      const remappedPath = remapToSandbox(request.path, sandboxInfo);
      if (remappedPath) {
        info('Remapped', request.path, '->', remappedPath);
        request.path = remappedPath;
      } else {
        // Log but don't fail - the path might still work in some cases
        debug('Could not remap escaped path, continuing anyway:', request.path);
      }

      callback(null, request);
    });
  }
}

module.exports = BazelSandboxResolverPlugin;
