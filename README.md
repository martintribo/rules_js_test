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
    urls = ["https://github.com/martintribo/rules_js/releases/download/v3.0.3-fork.1/rules_js-3.0.3-fork.1.tar.gz"],
    strip_prefix = "rules_js-3.0.3-fork.1",
    integrity = "sha256-DG4+KH3eOCUQ2HVOIPe1YOQQDSu0IhTs999Q0aIwNtI=",
)

bazel_dep(name = "rules_angular")
archive_override(
    module_name = "rules_angular",
    urls = ["https://github.com/martintribo/rules_angular/releases/download/v0.0.1-fork.3/rules_angular-0.0.1-fork.3.tar.gz"],
    strip_prefix = "rules_angular-0.0.1-fork.3",
    integrity = "sha256-7nunHXvK+tAgR7BKgfcIEIDJXUsJ5cl4y0wSztezAvE=",
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

Angular apps using the esbuild application builder (Angular 19+) need `@angular-builders/custom-esbuild` in their `package.json` devDependencies. The `rules_angular` fork handles everything else automatically:

- `ng_config` swaps `@angular/build:application` to `@angular-builders/custom-esbuild:application` and injects a sandbox plugin
- `ng_application` auto-includes `custom-esbuild` from the app's `node_modules`

No changes needed to `angular.json` or `BUILD.bazel` — just use the vanilla `@angular/build:application` builder.

Angular 14-16 webpack apps work without any additional dependencies.

> **TODO:** Ideally `rules_angular` would auto-add `@angular-builders/custom-esbuild` to the app's Bazel node_modules via `npm_import`, so users don't need to add it to their `package.json` at all.

### Releasing new fork versions

GitHub's auto-generated source archives are non-deterministic, so we upload
deterministic archives created with `git archive` as release assets.

```bash
# After pushing changes to the fork:
cd rules_js
git archive --format=tar.gz --prefix=rules_js-3.0.3-fork.2/ HEAD -o /tmp/rules_js-3.0.3-fork.2.tar.gz
gh release create v3.0.3-fork.2 /tmp/rules_js-3.0.3-fork.2.tar.gz --repo martintribo/rules_js --target main

# Get the integrity hash:
sha256sum /tmp/rules_js-3.0.3-fork.2.tar.gz | awk '{print $1}' | xxd -r -p | base64
# Update archive_override urls and integrity in consuming repos
```
