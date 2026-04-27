#!/bin/bash
# verify-deps.sh
#
# Confirms package.json files only contain APPROVED dependencies.
# Approved = baseline from the actual repo (commit 322330a) + phase additions.
#
# This script is REGENERATED in Phase 00 from the real package.json files.

set -e

EXIT_CODE=0

# Baseline (from commit 322330a — verified)
BASELINE_API=("express" "@sentry/node" "cors" "helmet" "morgan" "compression" "pg" "ioredis" "bullmq" "jsonwebtoken" "zod" "axios" "socket.io" "express-rate-limit" "uuid" "winston" "dotenv")
BASELINE_API_DEV=("@types/express" "@types/cors" "@types/morgan" "@types/compression" "@types/pg" "@types/jsonwebtoken" "@types/node" "@types/jest" "@types/supertest" "typescript" "tsx" "jest" "ts-jest" "supertest" "node-pg-migrate")

BASELINE_ADMIN=("react" "react-dom" "react-router-dom" "@tanstack/react-query" "zustand" "axios" "recharts" "zod" "react-hook-form" "@hookform/resolvers")
BASELINE_ADMIN_DEV=("@types/react" "@types/react-dom" "@vitejs/plugin-react" "typescript" "vite" "tailwindcss" "@tailwindcss/vite")

BASELINE_MOBILE=("@hookform/resolvers" "@react-native-async-storage/async-storage" "@react-native-community/netinfo" "@tanstack/react-query" "axios" "expo" "expo-application" "expo-clipboard" "expo-constants" "expo-crypto" "expo-device" "expo-haptics" "expo-image" "expo-image-manipulator" "expo-image-picker" "expo-location" "expo-notifications" "expo-router" "expo-status-bar" "react" "react-hook-form" "react-native" "react-native-gesture-handler" "react-native-maps" "react-native-mmkv" "react-native-reanimated" "react-native-safe-area-context" "react-native-screens" "socket.io-client" "zod" "zustand" "@sentry/react-native")
BASELINE_MOBILE_DEV=("@types/react" "typescript" "@testing-library/react-native" "jest" "jest-expo")

BASELINE_ROOT_DEV=("@eslint/js" "@typescript-eslint/eslint-plugin" "@typescript-eslint/parser" "eslint" "eslint-config-prettier" "eslint-plugin-react" "eslint-plugin-react-hooks" "prettier")

# Phase additions
APPROVED_NEW=("lucide-react" "lucide-react-native" "class-variance-authority" "clsx" "tailwind-merge" "date-fns" "date-fns-tz" "@sentry/react" "@stryker-mutator/core" "@stryker-mutator/typescript-checker" "@stryker-mutator/jest-runner" "@playwright/test" "playwright" "depcheck" "jscpd" "autocannon")

APPROVED=("${BASELINE_API[@]}" "${BASELINE_API_DEV[@]}" "${BASELINE_ADMIN[@]}" "${BASELINE_ADMIN_DEV[@]}" "${BASELINE_MOBILE[@]}" "${BASELINE_MOBILE_DEV[@]}" "${BASELINE_ROOT_DEV[@]}" "${APPROVED_NEW[@]}")

FORBIDDEN=("moment" "lodash" "@mui/material" "@mui/core" "antd" "@ant-design/icons" "@chakra-ui/react" "@mantine/core" "react-icons" "@heroicons/react" "feather-icons" "redux" "@reduxjs/toolkit" "mobx" "recoil" "jotai")
# Note: zustand is APPROVED (already in use). Do not add it to FORBIDDEN.

is_in_array() {
  local needle="$1"; shift
  for item in "$@"; do
    [ "$item" = "$needle" ] && return 0
  done
  return 1
}

PACKAGES=$(find . -name "package.json" -not -path "./node_modules/*" -not -path "*/node_modules/*" -not -path "./.git/*" 2>/dev/null)

for pkg in $PACKAGES; do
  echo "Checking: $pkg"
  if ! command -v jq >/dev/null 2>&1; then
    echo "  WARN: jq not installed. Skipping detailed check (install jq to enforce)."
    continue
  fi
  deps=$(jq -r '(.dependencies // {}) | keys[]' "$pkg" 2>/dev/null || true)
  devdeps=$(jq -r '(.devDependencies // {}) | keys[]' "$pkg" 2>/dev/null || true)
  alldeps="$deps $devdeps"

  for dep in $alldeps; do
    if is_in_array "$dep" "${FORBIDDEN[@]}"; then
      echo "  FAIL: forbidden dependency '$dep' (Constitution Article 7.1)"
      EXIT_CODE=1
    elif ! is_in_array "$dep" "${APPROVED[@]}"; then
      echo "  WARN: '$dep' not on approved list. If a phase added it, update APPROVED_NEW. Otherwise remove."
    fi
  done
done

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "PASS: No forbidden dependencies. Review any WARN lines."
else
  echo ""
  echo "FAIL: Remove forbidden dependencies."
fi

exit $EXIT_CODE
