# Workspace Package Linking Plan

This document describes a proposed change to [rules_js](https://github.com/aspect-build/rules_js) to support pnpm's `injected` vs `symlinked` linking modes for workspace packages.

## Problem

pnpm supports two ways to link workspace packages:

- **Symlinked** (`link:` in lockfile): The consumer gets a symlink to the source package. Default behavior.
- **Injected** (`file:` in lockfile, `dependenciesMeta.*.injected: true`): The consumer gets a hard-linked copy with its own `node_modules` tree containing the package's dependencies.

rules_js currently ignores this distinction. The linking behavior is determined by the Bazel provider type of the user's target (`NpmPackageInfo` from `npm_package` vs `JsInfo` from `js_library`), not by what the pnpm lockfile specifies. This means:

1. A workspace package can't be injected by one consumer and symlinked by another
2. The user has to know which provider type to use, and it may not match what pnpm does
3. Bundlers like webpack that walk up `node_modules/` to find deps fail when the linking mode is wrong (e.g. EISDIR errors, missing deps)

## How pnpm signals the mode

The pnpm lockfile already distinguishes the two modes:

- `link:../lib/a` = **symlinked**
- `file:../lib/a` = **injected** (also has `dependenciesMeta` in the importer)

The current rules_js code in `npm_translate_lock_generate.bzl` already splits on these two protocols (lines 129 vs 140), but then converges to a single `src = "//path:pkg"` target.

## Proposed solution

### 1. New user-facing macro: `workspace_package`

A new macro in `npm/private/workspace_package.bzl` that creates both target variants:

```python
def workspace_package(name, srcs, package = "", version = "0.0.0", visibility = None, **kwargs):
    npm_package(name = name + "injected", srcs = srcs, package = package, version = version, visibility = visibility, **kwargs)
    js_library(name = name + "linked", srcs = srcs, visibility = visibility)
```

The user writes this in their workspace package's BUILD.bazel:

```python
workspace_package(name = "pkg", srcs = glob(["src/**/*", "package.json"]))
```

This creates two targets: `pkginjected` (provides `NpmPackageInfo`) and `pkglinked` (provides `JsInfo`).

### 2. Code generation chooses the right target

In `npm_translate_lock_generate.bzl`, the `_npm_local_package_store` generation (lines 350-388) changes to:

- `file:` protocol consumers reference `src = "//path:pkginjected"`
- `link:` protocol consumers reference `src = "//path:pkglinked"`
- When the same package is consumed both ways, two store entries are generated with suffixed `package_store_name` values (e.g. `@myorg+lib-a@0.0.0_injected` and `@myorg+lib-a@0.0.0_linked`)

### 3. No changes to `npm_package_store` rule

The store rule implementation (`npm_package_store.bzl` lines 163-334) already handles both providers correctly:

- `NpmPackageInfo` path (lines 217-315): copies/extracts files into the store, creates dependency symlinks in `node_modules/`
- `JsInfo` path (lines 316-334): creates a directory symlink to the source location

The behavior difference is already correct for each mode. The fix is just about routing to the right provider.

## Files to modify

| File | Change |
|------|--------|
| `npm/private/workspace_package.bzl` | **New file.** `workspace_package` macro |
| `npm/defs.bzl` | Export `workspace_package` |
| `npm/private/npm_translate_lock_generate.bzl` | Generate mode-specific `src` labels and store entries (lines 88-412) |
| `npm/private/npm_translate_lock.bzl` | Add `workspace_package_target_names` attribute for configurable target name suffixes |

## Edge cases

| Case | Behavior |
|------|----------|
| Same package, both modes | Two store entries with suffixed names, two link factories |
| Single mode only | One store entry, unsuffixed name, backward compatible |
| Migration from `npm_package(name = "pkg")` | Works if all consumers use the same mode |
| Lockfile without `dependenciesMeta` | Falls back to existing behavior using `npm_package_target_name` |

## Implementation

This change is being developed in the [martintribo/rules_js](https://github.com/martintribo/rules_js) fork on a feature branch.
