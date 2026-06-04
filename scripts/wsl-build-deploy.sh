#!/usr/bin/env bash
# Sync current git source into the WSL anchor build dir and build.
# Avoids the stale-build-dir regression (see bug_program_regression_per_side).
set -euo pipefail

SRC="/mnt/c/Users/Lian Li/UpDown"
DST="/home/alex_linux/parimutuel-pools-build"

echo "== rsync programs/ =="
rsync -a --delete "$SRC/programs/" "$DST/programs/"

echo "== sync root build files =="
cp "$SRC/Anchor.toml" "$DST/Anchor.toml"
[ -f "$SRC/Cargo.toml" ] && cp "$SRC/Cargo.toml" "$DST/Cargo.toml" || true
[ -f "$SRC/Cargo.lock" ] && cp "$SRC/Cargo.lock" "$DST/Cargo.lock" || true
if [ -d "$SRC/patches" ]; then
  rsync -a --delete "$SRC/patches/" "$DST/patches/"
else
  echo "no patches dir"
fi

echo "== anchor build =="
cd "$DST"
anchor build

echo "== artifact =="
ls -la "$DST/target/deploy/parimutuel_pools.so"
echo "BUILD_OK"
