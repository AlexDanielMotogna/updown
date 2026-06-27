#!/usr/bin/env bash
#
# Deploy the parimutuel_pools Anchor program to a given cluster, using a given
# program keypair, WITHOUT permanently changing the committed program id.
#
# It temporarily rewrites declare_id! (and the matching Anchor.toml line) to the
# keypair's pubkey so `anchor build` embeds the right id, deploys with
# `solana program deploy`, then restores both files from git. Same flow we used
# for the localhost (CnJf) and dev (5rjyBee) programs.
#
# Usage (run from repo root, in WSL where solana/anchor live):
#   ./scripts/deploy-program.sh <program-keypair.json> <cluster> <fee-payer-keypair.json>
#
# Example (mainnet):
#   ./scripts/deploy-program.sh \
#     programs/parimutuel_pools-MAINNET-keypair.json \
#     mainnet-beta \
#     ~/keys/mainnet-upgrade-authority.json
#
set -euo pipefail

KEYPAIR="${1:?usage: deploy-program.sh <program-keypair.json> <cluster> <fee-payer.json>}"
CLUSTER="${2:?cluster: devnet | mainnet-beta}"
FEEPAYER="${3:?fee payer keypair (= upgrade authority)}"

PID=$(solana-keygen pubkey "$KEYPAIR")
PAYER=$(solana-keygen pubkey "$FEEPAYER")
OLD=$(grep -oE 'declare_id!\("[^"]+"\)' programs/parimutuel_pools/src/lib.rs | grep -oE '[1-9A-HJ-NP-Za-km-z]{32,}')

echo "Program id (new):   $PID"
echo "Fee payer:          $PAYER"
echo "Cluster:            $CLUSTER"
echo "Replacing old id:   $OLD"
echo "Payer balance:      $(solana balance "$PAYER" --url "$CLUSTER")"
read -rp "Proceed? [y/N] " ok; [ "$ok" = "y" ] || { echo "aborted"; exit 1; }

# 1. point declare_id + Anchor.toml at the new id (OLD only appears in declare_id
#    and the devnet line, never in localnet's system default)
sed -i "s/$OLD/$PID/g" programs/parimutuel_pools/src/lib.rs Anchor.toml

# 2. build + deploy
anchor build
solana program deploy target/deploy/parimutuel_pools.so \
  --program-id "$KEYPAIR" \
  --keypair "$FEEPAYER" \
  --url "$CLUSTER"

# 3. restore the committed id (so main/prod source stays unchanged)
git checkout -- programs/parimutuel_pools/src/lib.rs Anchor.toml

echo "---"
echo "Deployed. PROGRAM_ID=$PID  (source reverted to $OLD)"
solana program show "$PID" --url "$CLUSTER" | head -8
