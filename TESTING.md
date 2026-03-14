# rules_js Test Repository

Test repository for validating rules_js on Windows with pnpm and Angular.

## Purpose

This repo tests several interconnected features:

1. **rules_js on Windows** - Bazel's rules_js with Windows symlink support
2. **pnpm isolated linker** - Non-hoisted node_modules structure
3. **Angular builders** - Multiple Angular versions with different build systems
4. **Dependency version isolation** - Same package at different versions
5. **Peer dependency sharing** - Single instance shared across packages
6. **Injected vs symlinked workspace deps** - pnpm's `dependenciesMeta.injected`

---

## Project Structure

```
rules_js_test/
├── apps/
│   ├── app-latest/     # Angular 19 - @angular/build:application
│   ├── app-v16/        # Angular 16 - @angular-devkit/build-angular:browser-esbuild
│   └── app-v14/        # Angular 14 - @angular-devkit/build-angular:browser (webpack)
├── libs/
│   ├── lib-a/          # Depends on lib-b (INJECTED)
│   ├── lib-b/          # Base library
│   └── lib-c/          # Depends on lib-b (SYMLINKED)
├── MODULE.bazel        # Bazel bzlmod config
├── .bazelrc            # Bazel settings
├── .npmrc              # pnpm config (isolated linker, inject settings)
└── pnpm-workspace.yaml # Workspace packages
```

---

## Test Matrix

### 1. Lodash Version Isolation

Each package depends on a different version of lodash. At runtime, each should load its own version.

| Package    | lodash Version | Expected `_.VERSION` |
|------------|---------------|----------------------|
| app-*      | 4.17.20       | `"4.17.20"`          |
| lib-a      | 4.17.21       | `"4.17.21"`          |
| lib-b      | 4.17.15       | `"4.17.15"`          |
| lib-c      | 4.17.19       | `"4.17.19"`          |

**Why this matters:** Tests that pnpm's isolated node_modules correctly resolves different versions of the same package for different consumers.

### 2. Peer Dependency Sharing (rxjs)

All libraries declare `rxjs` as a peer dependency. The apps provide rxjs, and all libs should share the same instance.

| Package | rxjs Declaration      | Expected Behavior            |
|---------|----------------------|------------------------------|
| app-*   | `dependencies`       | Provides rxjs                |
| lib-a   | `peerDependencies`   | Uses app's rxjs              |
| lib-b   | `peerDependencies`   | Uses app's rxjs              |
| lib-c   | `peerDependencies`   | Uses app's rxjs              |

**Verification:** `Observable.toString()` should return identical strings across all packages.

### 3. Injected vs Symlinked Workspace Dependencies

Tests pnpm's `dependenciesMeta.injected` feature.

| Consumer | Dependency | Access Method | Config Location |
|----------|-----------|---------------|-----------------|
| lib-a    | lib-b     | **Injected**  | `libs/lib-a/package.json` → `dependenciesMeta` |
| lib-c    | lib-b     | Symlinked     | Default behavior |

**Injected config in lib-a/package.json:**
```json
{
  "dependenciesMeta": {
    "@myorg/lib-b": {
      "injected": true
    }
  }
}
```

**Why this matters:** Injected dependencies are hardlinked/copied instead of symlinked. This is important for:
- Bundlers that don't follow symlinks
- Version mismatch scenarios where pnpm creates virtual packages
- rules_js compatibility testing

### 4. Angular Builder Compatibility

Tests three different Angular build systems:

| App        | Angular | Builder                                      | Technology |
|------------|---------|----------------------------------------------|------------|
| app-v14    | 14.x    | `@angular-devkit/build-angular:browser`      | Webpack    |
| app-v16    | 16.x    | `@angular-devkit/build-angular:browser-esbuild` | ESBuild |
| app-latest | 19.x    | `@angular/build:application`                 | ESBuild    |

**Why this matters:** Each builder handles node_modules resolution differently. Testing all three ensures rules_js works across Angular's evolution.

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                        APPS                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ app-v14  │  │ app-v16  │  │app-latest│                   │
│  │ lodash   │  │ lodash   │  │ lodash   │                   │
│  │ 4.17.20  │  │ 4.17.20  │  │ 4.17.20  │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       │             │             │                          │
│       └─────────────┼─────────────┘                          │
│                     │                                        │
│                     ▼                                        │
│              ┌────────────┐                                  │
│              │   lib-a    │                                  │
│              │  lodash    │                                  │
│              │  4.17.21   │                                  │
│              └──────┬─────┘                                  │
│                     │ (INJECTED)                             │
│                     ▼                                        │
│              ┌────────────┐         ┌────────────┐          │
│              │   lib-b    │◄────────│   lib-c    │          │
│              │  lodash    │(SYMLINK)│  lodash    │          │
│              │  4.17.15   │         │  4.17.19   │          │
│              └────────────┘         └────────────┘          │
└─────────────────────────────────────────────────────────────┘

Peer Dependencies (rxjs):
  apps provide rxjs
    └── lib-a, lib-b, lib-c all use the same instance
```

---

## pnpm Configuration

**.npmrc:**
```ini
# Required for rules_js - no hoisting
node-linker=isolated

# Enable symlinks on Windows
symlink=true

# Auto-install peer dependencies
auto-install-peers=true
strict-peer-dependencies=false
```

---

## Build & Test Commands

### Automated Tests

```bash
# Run ALL tests (recommended)
pnpm test

# Run only structure verification (15 tests)
pnpm test:structure

# Run only runtime version tests (12 tests)
pnpm test:runtime
```

**What `pnpm test` verifies:**

1. **Structure Tests** (`scripts/verify-pnpm-structure.js`)
   - pnpm uses isolated linker
   - lib-a has `dependenciesMeta.injected` for lib-b
   - lib-c does NOT have injection (uses symlink)
   - All symlinks/paths exist
   - Correct lodash versions in package.json
   - Peer dependencies configured correctly
   - Lockfile records injection metadata

2. **Runtime Tests** (`scripts/verify-runtime-versions.js`)
   - Each package loads its own lodash version
   - 4 unique lodash versions across packages
   - rxjs peer dependency is shared
   - Library exports work correctly
   - Cross-library access works

### Manual Build Commands

```bash
# Install dependencies
pnpm install

# Build libraries
pnpm build:libs

# Build Angular apps
pnpm build:app-latest
pnpm build:app-v16
pnpm build:app-v14

# Build all apps
pnpm build:apps
```

### With Bazel (TODO)

```bash
# Build all
pnpm bazel:build

# Test all
pnpm bazel:test
```

---

## Runtime Verification

Each Angular app displays a test report showing:

1. **Lodash versions** - Each package's `_.VERSION`
2. **Version correctness** - Whether each matches expected
3. **Peer dep sharing** - Whether rxjs is the same instance
4. **Library functions** - `libAGreeting()`, `libBGreeting()` work correctly

### Expected Console Output

```
=== rules_js + pnpm + Angular Test Results ===
Lodash versions: { app: "4.17.20", libA: "4.17.21", libB: "4.17.15" }
rxjs peer dep shared: true
All tests passed: true
```

---

## Known Issues / Status

| Feature | Status | Notes |
|---------|--------|-------|
| pnpm isolated linker | ✅ Working | Required for rules_js |
| Lodash version isolation | ✅ Working | Verified in Angular builds |
| Peer dependency sharing | ✅ Working | rxjs shared correctly |
| Injected workspace deps | ✅ Configured | `dependenciesMeta.injected` in lib-a |
| Angular 14 (webpack) | ✅ Building | |
| Angular 16 (esbuild) | ✅ Building | |
| Angular 19 (application) | ✅ Building | |
| Bazel / rules_js | ⚠️ TODO | Needs bzlmod config fixes |

---

## Files Reference

| File | Purpose |
|------|---------|
| `MODULE.bazel` | Bazel module dependencies (bzlmod) |
| `.bazelrc` | Bazel build settings |
| `.npmrc` | pnpm configuration |
| `pnpm-workspace.yaml` | Workspace package locations |
| `libs/*/package.json` | Library configs with version specs |
| `apps/*/angular.json` | Angular builder configuration |
| `scripts/test-all.js` | Main test runner |
| `scripts/verify-pnpm-structure.js` | pnpm structure tests (15 tests) |
| `scripts/verify-runtime-versions.js` | Runtime version tests (12 tests) |
| `apps/app-latest/src/app/app.component.spec.ts` | Angular unit tests |
