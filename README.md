# rules_js_test

[![CI](https://github.com/martintribo/rules_js_test/actions/workflows/test.yml/badge.svg)](https://github.com/martintribo/rules_js_test/actions/workflows/test.yml)

Test repository for Angular apps with Bazel integration using [rules_js](https://github.com/aspect-build/rules_js).

## What this tests

This repo validates that [pnpm](https://pnpm.io/) workspace dependencies with version isolation work correctly across multiple Angular versions, both with standard `ng build` and with [Bazel](https://bazel.build/) via `rules_js` + `rules_angular`.

### Dependency version isolation

Each package declares a different version of `lodash` to verify that pnpm's isolated linker resolves the correct version per-package at runtime:

| Package | lodash version |
|---------|---------------|
| `lib-a` | 4.17.21 |
| `lib-b` | 4.17.15 |
| `lib-c` | 4.17.19 |
| `app-*` | 4.17.20 |

### Peer dependency sharing

`lib-a`, `lib-b`, and `lib-c` declare `rxjs` as a peer dependency. The tests verify that all packages share the same `rxjs` instance provided by the consuming app.

### Injected vs symlinked workspace dependencies

`lib-a` uses `dependenciesMeta.injected: true` for its dependency on `lib-b`, while `lib-c` uses a normal symlink. The structure tests verify both resolution strategies work.

### Angular build compatibility

The same libraries are built into Angular apps across three versions to verify the full toolchain works:

| App | Angular | Builder | Notes |
|-----|---------|---------|-------|
| `app-latest` | 19 | `@angular/build:application` (esbuild) | Standalone components |
| `app-v16` | 16 | `@angular-devkit/build-angular:browser` (webpack) | Standalone components |
| `app-v14` | 14 | `@angular-devkit/build-angular:browser` (webpack) | NgModule architecture |

### Bazel sandbox compatibility

When building with Bazel, Angular's build tools run inside an isolated sandbox where normal `node_modules` symlinks don't work. Each app includes a sandbox-aware resolver plugin:

- **app-latest**: esbuild plugin (`esbuild/bazel-sandbox-plugin.js`)
- **app-v14/v16**: webpack plugin (`webpack/bazel-sandbox-resolver.js`)

These plugins resolve packages from the `.aspect_rules_js` package store when standard resolution fails inside the sandbox.

## Test results

[Latest CI run](https://github.com/martintribo/rules_js_test/actions/workflows/test.yml) -- each run includes a detailed summary report with test descriptions and results.

## Baseline diffs

Each app has a `baseline/` directory containing the vanilla Angular equivalent (no Bazel customizations). See [DIFF_REPORT.md](DIFF_REPORT.md) for the auto-generated diff showing exactly what changes are needed for Bazel integration.

This project also uses a [fork of rules_js](https://github.com/martintribo/rules_js) with a fix to `js_binary.sh.tpl` for correct `chdir` behavior when `JS_BINARY__USE_EXECROOT_ENTRY_POINT` is set. The fork diff is included in the report.
