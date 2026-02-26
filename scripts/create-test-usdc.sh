#!/bin/bash
# Script to create a test USDC token on devnet

set -e

echo "Creating test USDC token on devnet..."

# Create a new token with 6 decimals (like real USDC)
TOKEN_OUTPUT=$(spl-token create-token --decimals 6 --url devnet 2>&1)
echo "$TOKEN_OUTPUT"

# Extract the token address
TOKEN_ADDRESS=$(echo "$TOKEN_OUTPUT" | grep "Creating token" | awk '{print $3}')

if [ -z "$TOKEN_ADDRESS" ]; then
  echo "Failed to create token"
  exit 1
fi

echo ""
echo "Token created: $TOKEN_ADDRESS"

# Create a token account for the current wallet
echo ""
echo "Creating token account..."
spl-token create-account $TOKEN_ADDRESS --url devnet

# Mint 10,000 USDC to the wallet
echo ""
echo "Minting 10,000 test USDC..."
spl-token mint $TOKEN_ADDRESS 10000 --url devnet

# Show balance
echo ""
echo "Balance:"
spl-token balance $TOKEN_ADDRESS --url devnet

echo ""
echo "=========================================="
echo "TEST USDC TOKEN CREATED SUCCESSFULLY!"
echo "=========================================="
echo ""
echo "Token Mint Address: $TOKEN_ADDRESS"
echo ""
echo "Add this to your apps/api/.env:"
echo "USDC_MINT=\"$TOKEN_ADDRESS\""
echo ""
