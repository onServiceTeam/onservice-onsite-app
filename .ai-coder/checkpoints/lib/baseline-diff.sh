#!/bin/bash
# baseline-diff.sh
#
# Shared helpers used by gate scripts to make them baseline-delta-aware.
#
# Each gate script that surface-scans the repo (forbidden patterns, emoji,
# phantom tests, n+1) imports this file and uses these helpers to:
#   1. Determine which files have changed since the phase's baseline commit.
#   2. Filter absolute-scan results to only those whose violation file is
#      one of those changed files.
#   3. Pass the gate when the phase introduced ZERO new violations,
#      regardless of how many pre-existing violations remain.
#
# Pre-existing violations are reported informationally, then captured in the
# phase's BASELINE-DEBT.md by verify-master.sh. Constitution Article 13:
# silently ignoring or skipping a violation is still a violation; documenting
# it as deferred-to-phase-NN is not.
#
# Source this file:
#   source "$(dirname "$0")/lib/baseline-diff.sh"

# Returns the baseline commit SHA for the given phase, or empty string if the
# preflight log is missing.
get_baseline_commit() {
  local phase="$1"
  local f=".ai-coder/checkpoints/logs/${phase}/preflight/baseline-commit.txt"
  if [ -f "$f" ]; then
    head -n1 "$f" | tr -d '[:space:]'
  fi
}

# Returns the list of files (added or modified, not deleted) since baseline,
# one per line. Empty output means either nothing changed or no baseline file.
files_changed_since_baseline() {
  local phase="$1"
  local baseline
  baseline=$(get_baseline_commit "$phase")
  if [ -z "$baseline" ]; then
    return 0
  fi
  git diff --name-only --diff-filter=AM "$baseline" HEAD 2>/dev/null
}

# Reads `file:line:...` violation lines from stdin and prints only those whose
# file path is one of the files changed since the baseline.
#
# Usage:
#   filter_to_phase_diff PHASE-NN < all-violations.txt > delta-violations.txt
filter_to_phase_diff() {
  local phase="$1"
  local changed_files
  changed_files=$(files_changed_since_baseline "$phase")
  if [ -z "$changed_files" ]; then
    # No baseline or no files changed — nothing in scope for this phase.
    return 0
  fi

  # Build a fixed-string anchored match against the first colon-delimited field
  # (the file path). Using awk to avoid regex-escaping path characters.
  awk -F: -v files="$changed_files" '
    BEGIN {
      n = split(files, arr, "\n")
      for (i = 1; i <= n; i++) {
        if (arr[i] != "") changed[arr[i]] = 1
      }
    }
    {
      if ($1 in changed) print
    }
  '
}

# Prints a standardized baseline-delta report header to stdout.
# Args:
#   $1 = gate name (e.g. "gate-1-forbidden")
#   $2 = absolute violation count (integer)
#   $3 = phase-introduced violation count (integer)
#   $4 = path to the absolute-violations file (optional, used to print sample
#        of remaining violations)
report_baseline_delta() {
  local gate_name="$1"
  local absolute_count="$2"
  local delta_count="$3"
  local violations_file="${4:-}"

  echo "--- ${gate_name} ---"
  echo "Absolute violations in repo: ${absolute_count}"
  echo "Violations introduced by this phase: ${delta_count}"

  local deferred=$((absolute_count - delta_count))
  if [ "$deferred" -gt 0 ]; then
    echo "Violations remaining (deferred to later phases): ${deferred}"
    if [ -n "$violations_file" ] && [ -f "$violations_file" ]; then
      echo "Sample (first 10):"
      head -n 10 "$violations_file" | sed 's/^/  - /'
      if [ "$absolute_count" -gt 10 ]; then
        echo "  ... (full list in gate log)"
      fi
    fi
  fi
}
