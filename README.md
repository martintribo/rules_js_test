# rules_js_test

Test repository for Angular apps with Bazel integration using rules_js.

## Overview

This repository contains Angular applications (v14, v16, v19) configured to build with Bazel.
Each app under `apps/` has a `baseline/` directory containing the vanilla Angular equivalent
(without any Bazel customizations), making it easy to see exactly what changes are needed
for Bazel integration.

## Apps

| App | Angular Version | Builder (Bazel) | Builder (Vanilla) |
|-----|----------------|-----------------|-------------------|
| `app-latest` | 19 | `@angular-builders/custom-esbuild:application` | `@angular/build:application` |
| `app-v16` | 16 | `@angular-builders/custom-webpack:browser` | `@angular-devkit/build-angular:browser` |
| `app-v14` | 14 | `@angular-builders/custom-webpack:browser` | `@angular-devkit/build-angular:browser` |

## Baseline Diff Report

The following report is auto-generated showing the differences between vanilla Angular
apps and their Bazel-integrated versions.

<!-- BASELINE-DIFF-START -->

# Baseline vs Bazel Diff Report

This report shows the differences between vanilla Angular apps (baseline) and
the Bazel-integrated versions in this repository.

_Generated on 2026-03-23 20:50:13 UTC_

---

## app-latest

### Files only in Bazel version (added for Bazel integration)

- `esbuild/bazel-sandbox-plugin.js`
- `ng_config_no_symlinks.bzl`

### Modified files

#### `angular.json`

```diff
--- baseline/angular.json
+++ bazel/angular.json
@@ -10,7 +10,7 @@
       "prefix": "app",
       "architect": {
         "build": {
-          "builder": "@angular/build:application",
+          "builder": "@angular-builders/custom-esbuild:application",
           "options": {
             "outputPath": "dist/app-latest",
             "index": "src/index.html",
@@ -24,7 +24,8 @@
               }
             ],
             "styles": ["src/styles.css"],
-            "scripts": []
+            "scripts": [],
+            "plugins": ["./esbuild/bazel-sandbox-plugin.js"]
           },
           "configurations": {
             "production": {
```

#### `package.json`

```diff
--- baseline/package.json
+++ bazel/package.json
@@ -27,6 +27,7 @@
     "@angular/build": "^19.0.0",
     "@angular/cli": "^19.0.0",
     "@angular/compiler-cli": "^19.0.0",
+    "@angular-builders/custom-esbuild": "^19.0.0",
     "@types/lodash": "^4.17.0",
     "typescript": "~5.6.0"
   }
```

---

## app-v14

### Files only in Bazel version (added for Bazel integration)

- `webpack/bazel-sandbox-resolver.js`
- `webpack/webpack.config.js`

### Modified files

#### `angular.json`

```diff
--- baseline/angular.json
+++ bazel/angular.json
@@ -10,7 +10,7 @@
       "prefix": "app",
       "architect": {
         "build": {
-          "builder": "@angular-devkit/build-angular:browser",
+          "builder": "@angular-builders/custom-webpack:browser",
           "options": {
             "outputPath": "dist/app-v14",
             "index": "src/index.html",
@@ -19,7 +19,10 @@
             "tsConfig": "tsconfig.app.json",
             "assets": ["src/assets"],
             "styles": ["src/styles.css"],
-            "scripts": []
+            "scripts": [],
+            "customWebpackConfig": {
+              "path": "./webpack/webpack.config.js"
+            }
           },
           "configurations": {
             "production": {
```

#### `package.json`

```diff
--- baseline/package.json
+++ bazel/package.json
@@ -24,6 +24,7 @@
     "zone.js": "~0.11.8"
   },
   "devDependencies": {
+    "@angular-builders/custom-webpack": "^14.1.0",
     "@angular-devkit/build-angular": "^14.2.0",
     "@angular/cli": "^14.2.0",
     "@angular/compiler-cli": "^14.3.0",
```

---

## app-v16

### Files only in Bazel version (added for Bazel integration)

- `webpack/bazel-sandbox-resolver.js`
- `webpack/webpack.config.js`

### Modified files

#### `angular.json`

```diff
--- baseline/angular.json
+++ bazel/angular.json
@@ -10,7 +10,7 @@
       "prefix": "app",
       "architect": {
         "build": {
-          "builder": "@angular-devkit/build-angular:browser",
+          "builder": "@angular-builders/custom-webpack:browser",
           "options": {
             "outputPath": "dist/app-v16",
             "index": "src/index.html",
@@ -19,7 +19,10 @@
             "tsConfig": "tsconfig.app.json",
             "assets": ["src/assets"],
             "styles": ["src/styles.css"],
-            "scripts": []
+            "scripts": [],
+            "customWebpackConfig": {
+              "path": "./webpack/webpack.config.js"
+            }
           },
           "configurations": {
             "production": {
```

#### `package.json`

```diff
--- baseline/package.json
+++ bazel/package.json
@@ -24,6 +24,7 @@
     "zone.js": "~0.13.0"
   },
   "devDependencies": {
+    "@angular-builders/custom-webpack": "^16.0.0",
     "@angular-devkit/build-angular": "^16.2.0",
     "@angular/cli": "^16.2.0",
     "@angular/compiler-cli": "^16.2.0",
```


---

## rules_js fork changes

This project uses a fork of [`aspect_rules_js`](https://github.com/aspect-build/rules_js)
at [`9a1379b4d645`](https://github.com/martintribo/rules_js.git/commit/9a1379b4d64502ff277e2221ce4ce1105191e8e5).

Changes compared to upstream:

### Changed files

- `js/private/js_binary.sh.tpl`

### Diff

```diff
diff --git a/js/private/js_binary.sh.tpl b/js/private/js_binary.sh.tpl
index 5d0234cb..2a95f511 100644
--- a/js/private/js_binary.sh.tpl
+++ b/js/private/js_binary.sh.tpl
@@ -328,10 +328,16 @@ fi
 # Change directory to user specified package if set
 if [ "${JS_BINARY__CHDIR:-}" ]; then
     logf_debug "changing directory to user specified package %s" "$JS_BINARY__CHDIR"
-    case "$JS_BINARY__CHDIR" in
-    external/*) cd "$(resolve_execroot_bin_path "$JS_BINARY__CHDIR")" ;;
-    *) cd "$JS_BINARY__CHDIR" ;;
-    esac
+    # When using execroot entry point, chdir to bin path so node_modules resolution works
+    # (node_modules is at bazel-out/.../bin/node_modules, not at the source root)
+    if [ "${JS_BINARY__USE_EXECROOT_ENTRY_POINT:-}" ]; then
+        cd "$(resolve_execroot_bin_path "$JS_BINARY__CHDIR")"
+    else
+        case "$JS_BINARY__CHDIR" in
+        external/*) cd "$(resolve_execroot_bin_path "$JS_BINARY__CHDIR")" ;;
+        *) cd "$JS_BINARY__CHDIR" ;;
+        esac
+    fi
 fi
 
 # Gather node options
```


<!-- BASELINE-DIFF-END -->
