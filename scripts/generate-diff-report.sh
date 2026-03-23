#!/usr/bin/env bash
#
# Generate a markdown diff report comparing baseline (vanilla Angular) apps
# against the actual (Bazel-integrated) apps.
#
# Usage: ./scripts/generate-diff-report.sh
# Output: Markdown report to stdout

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "# Baseline vs Bazel Diff Report"
echo ""
echo "This report shows the differences between vanilla Angular apps (baseline) and"
echo "the Bazel-integrated versions in this repository."
echo ""
echo "_Generated on $(date -u '+%Y-%m-%d %H:%M:%S UTC')_"
echo ""

found_any=false

for app_dir in "$REPO_ROOT"/apps/app-*; do
  app_name="$(basename "$app_dir")"
  baseline_dir="$app_dir/baseline"

  if [ ! -d "$baseline_dir" ]; then
    continue
  fi

  found_any=true

  echo "---"
  echo ""
  echo "## $app_name"
  echo ""

  # Collect files from both sides, excluding certain directories and patterns
  # We compare baseline/ contents against the app root (excluding baseline/ itself)
  exclude_args="--exclude=node_modules --exclude=dist --exclude=.angular --exclude=baseline --exclude=*.spec.ts --exclude=BUILD.bazel"

  # Files only in Bazel version (actual app has, baseline does not)
  bazel_only_files=()
  baseline_only_files=()
  modified_files=()

  # Get list of all files in actual app (excluding certain dirs/files)
  actual_files=()
  while IFS= read -r -d '' file; do
    rel="${file#$app_dir/}"
    # Skip excluded patterns
    case "$rel" in
      node_modules/*|dist/*|.angular/*|baseline/*|*.spec.ts|BUILD.bazel) continue ;;
    esac
    actual_files+=("$rel")
  done < <(find "$app_dir" -type f -print0 2>/dev/null | sort -z)

  # Get list of all files in baseline (apply same exclusions)
  baseline_files=()
  while IFS= read -r -d '' file; do
    rel="${file#$baseline_dir/}"
    case "$rel" in
      *.spec.ts) continue ;;
    esac
    baseline_files+=("$rel")
  done < <(find "$baseline_dir" -type f -print0 2>/dev/null | sort -z)

  # Find files only in actual (Bazel-only)
  for f in "${actual_files[@]}"; do
    found=false
    for bf in "${baseline_files[@]}"; do
      if [ "$f" = "$bf" ]; then
        found=true
        break
      fi
    done
    if [ "$found" = false ]; then
      bazel_only_files+=("$f")
    fi
  done

  # Find files only in baseline
  for bf in "${baseline_files[@]}"; do
    found=false
    for f in "${actual_files[@]}"; do
      if [ "$bf" = "$f" ]; then
        found=true
        break
      fi
    done
    if [ "$found" = false ]; then
      baseline_only_files+=("$bf")
    fi
  done

  # Find modified files
  for bf in "${baseline_files[@]}"; do
    for f in "${actual_files[@]}"; do
      if [ "$bf" = "$f" ]; then
        if ! diff -q "$baseline_dir/$bf" "$app_dir/$f" > /dev/null 2>&1; then
          modified_files+=("$bf")
        fi
        break
      fi
    done
  done

  # Report: Bazel-only files
  if [ ${#bazel_only_files[@]} -gt 0 ]; then
    echo "### Files only in Bazel version (added for Bazel integration)"
    echo ""
    for f in "${bazel_only_files[@]}"; do
      echo "- \`$f\`"
    done
    echo ""
  fi

  # Report: Baseline-only files
  if [ ${#baseline_only_files[@]} -gt 0 ]; then
    echo "### Files only in baseline (removed for Bazel)"
    echo ""
    for bf in "${baseline_only_files[@]}"; do
      echo "- \`$bf\`"
    done
    echo ""
  fi

  # Report: Modified files with diffs
  if [ ${#modified_files[@]} -gt 0 ]; then
    echo "### Modified files"
    echo ""
    for mf in "${modified_files[@]}"; do
      echo "#### \`$mf\`"
      echo ""
      echo '```diff'
      diff -u "$baseline_dir/$mf" "$app_dir/$mf" \
        --label "baseline/$mf" \
        --label "bazel/$mf" \
        2>/dev/null || true
      echo '```'
      echo ""
    done
  fi

  # Summary if nothing changed
  if [ ${#bazel_only_files[@]} -eq 0 ] && [ ${#baseline_only_files[@]} -eq 0 ] && [ ${#modified_files[@]} -eq 0 ]; then
    echo "_No differences found._"
    echo ""
  fi

done

if [ "$found_any" = false ]; then
  echo "_No baseline directories found in apps/._"
fi
