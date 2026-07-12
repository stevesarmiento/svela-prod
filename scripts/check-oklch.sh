#!/usr/bin/env bash
# CI gate: source colors must be oklch() only — no hex / rgb(a) / hsl(a).
#
# Documented exceptions (allowlisted below):
#  - SVG data-URIs (oklch would need URL-encoding; riskier rasterization paths)
#  - Clerk appearance colorPrimary (third-party parser)
#  - Cal.com brandColor (expects hex)
#  - viewport themeColor (older WebView compat)
#  - recharts attribute matchers in chart.tsx ([stroke='#ccc'] matches
#    third-party rendered output, not authored colors)
#  - comments mentioning legacy formats
set -euo pipefail
cd "$(dirname "$0")/.."

matches=$(grep -rInE '(#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\()' \
  apps/web/src apps/app/src packages/ui/src \
  --include='*.css' --include='*.ts' --include='*.tsx' \
  | grep -vE '/oklch(\.test)?\.ts:' \
  | grep -v 'data:image' \
  | grep -v 'colorPrimary' \
  | grep -v 'brandColor' \
  | grep -v 'themeColor' \
  | grep -v 'recharts' \
  | grep -vE '^\S+:[0-9]+:\s*(//|\*|/\*)' \
  || true)

if [ -n "$matches" ]; then
  echo "Non-oklch color literals found:"
  echo "$matches"
  exit 1
fi
echo "OK: no hex/rgb/hsl color literals outside documented exceptions."
