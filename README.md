# rules_js_test

[![CI](https://github.com/martintribo/rules_js_test/actions/workflows/test.yml/badge.svg)](https://github.com/martintribo/rules_js_test/actions/workflows/test.yml)

Test repository for Angular apps with Bazel integration using [rules_js](https://github.com/aspect-build/rules_js).

- [Test results](https://github.com/martintribo/rules_js_test/actions/workflows/test.yml) -- each run includes a summary report with test descriptions and results
- [Baseline diffs](DIFF_REPORT.md) -- auto-generated diff showing changes needed for Bazel integration
- [Workspace linking plan](WORKSPACE_LINKING_PLAN.md) -- proposed rules_js change to support pnpm injected vs symlinked workspace packages

## Using the forked rules

This repo uses forks of [rules_js](https://github.com/martintribo/rules_js) and [rules_angular](https://github.com/martintribo/rules_angular) with fixes for pnpm workspace package support in Bazel. To use them in your own repo, add the following to your `MODULE.bazel`:

```python
bazel_dep(name = "aspect_rules_js", version = "3.0.3")
archive_override(
    module_name = "aspect_rules_js",
    urls = ["https://github.com/martintribo/rules_js/archive/refs/tags/v3.0.3-fork.1.tar.gz"],
    strip_prefix = "rules_js-3.0.3-fork.1",
    integrity = "sha256-DG4+KH3eOCUQ2HVOIPe1YOQQDSu0IhTs999Q0aIwNtI=",
)

bazel_dep(name = "rules_angular")
archive_override(
    module_name = "rules_angular",
    urls = ["https://github.com/martintribo/rules_angular/archive/refs/tags/v0.0.1-fork.1.tar.gz"],
    strip_prefix = "rules_angular-0.0.1-fork.1",
    integrity = "sha256-4xwAMkh7m10qEF6KL6TyMPnt3ci5clOzKVSIP73IIFM=",
)
```

### What the forks change

**[rules_js fork](https://github.com/martintribo/rules_js)** (based on v3.0.3):
- Adds `workspace_package` macro that creates both `pkginjected` and `pkglinked` targets for workspace packages
- Auto-generated code reads the pnpm lockfile protocol (`file:` vs `link:`) to choose the right linking mode per consumer

**[rules_angular fork](https://github.com/martintribo/rules_angular)**:
- Removes `preserveSymlinks = true` from `ng_config` -- this was disabling webpack's symlink following, breaking pnpm's package store resolution for transitive workspace deps
- Strips tsconfig `paths` entries pointing outside the project dir -- in Bazel, workspace packages resolve through `node_modules` instead

### Workspace package setup

In each workspace package's `BUILD.bazel`, use `workspace_package` instead of `npm_package`:

```python
load("@aspect_rules_js//npm:defs.bzl", "workspace_package")

workspace_package(
    name = "pkg",
    srcs = ["package.json", ":my_ts_project"],
    package = "@myorg/my-lib",
    deps = [":node_modules"],  # important: propagates npm deps transitively
    visibility = ["//visibility:public"],
)
```

In consuming apps, reference workspace packages via local `node_modules`:

```python
ng_application(
    name = "build",
    deps = [
        ":node_modules/@myorg/my-lib",  # local, not //:node_modules/...
        ...
    ],
)
```

### Angular esbuild apps

Angular apps using the esbuild application builder (Angular 19+) need a sandbox plugin because esbuild is a Go binary that bypasses Node's patched `fs`. Add `esbuild/bazel-sandbox.js` (see [example](apps/app-latest/esbuild/bazel-sandbox.js)) and reference it via `@angular-builders/custom-esbuild`:

```json
{
  "builder": "@angular-builders/custom-esbuild:application",
  "options": {
    "plugins": ["./esbuild/bazel-sandbox.js"]
  }
}
```

Angular 14-16 webpack apps work without any plugins.

### Releasing new fork versions

```bash
# After pushing changes to the fork:
gh release create v3.0.3-fork.2 --repo martintribo/rules_js --target main

# Get the new integrity hash:
curl -sL https://github.com/martintribo/rules_js/archive/refs/tags/v3.0.3-fork.2.tar.gz | sha256sum
# Convert hex to SRI: echo -n "<hex>" | xxd -r -p | base64
# Update archive_override in consuming repos
```
