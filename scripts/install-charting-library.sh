#!/usr/bin/env bash
# Install the TradingView Charting Library into the terminal's public/ folder.
#
# The library is private + licensed, so it's gitignored (this repo is public) and
# fetched on demand here. You need pull access to github.com/tradingview/charting_library
# (granted by TradingView). Auth via `gh auth login` (uses gh's git credential helper)
# or set GH_TOKEN / a token in the URL for CI.
#
# Usage:   bash scripts/install-charting-library.sh [version]
#   version: a git ref/tag (default: master). e.g. v31.2.0
#
# CI/Railway: provide a token with repo read access, e.g.
#   GH_TOKEN=xxxxx bash scripts/install-charting-library.sh
set -euo pipefail

REF="${1:-master}"
REPO="tradingview/charting_library"
DEST="apps/terminal/public"
TMP="$(mktemp -d)"

# Build the clone URL — embed GH_TOKEN if present (CI), else rely on git credentials.
if [ -n "${GH_TOKEN:-}" ]; then
  URL="https://x-access-token:${GH_TOKEN}@github.com/${REPO}.git"
else
  URL="https://github.com/${REPO}.git"
fi

echo "→ Cloning ${REPO}@${REF} (charting_library + datafeeds only)…"
git clone --depth 1 --branch "${REF}" --filter=blob:none --sparse "${URL}" "${TMP}" >/dev/null 2>&1 \
  || git clone --depth 1 --filter=blob:none --sparse "${URL}" "${TMP}"  # fallback if REF isn't a branch/tag
git -C "${TMP}" sparse-checkout set charting_library datafeeds >/dev/null

echo "→ Copying into ${DEST}/…"
rm -rf "${DEST}/charting_library" "${DEST}/datafeeds"
cp -r "${TMP}/charting_library" "${DEST}/charting_library"
cp -r "${TMP}/datafeeds" "${DEST}/datafeeds"
rm -rf "${TMP}"

echo "✓ Installed TradingView Charting Library to ${DEST}/charting_library (+ datafeeds)."
