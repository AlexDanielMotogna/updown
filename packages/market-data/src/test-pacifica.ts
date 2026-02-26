/**
 * Test script for Pacifica market data integration
 * Run with: npx tsx packages/market-data/src/test-pacifica.ts
 */
import { PacificaProvider } from './providers/pacifica';

async function testPacificaIntegration() {
  console.log('=== Testing Pacifica Market Data Integration ===\n');

  const provider = new PacificaProvider();

  // Test 1: Health check
  console.log('1. Testing health check...');
  try {
    const healthy = await provider.isHealthy();
    console.log(`   Health check: ${healthy ? '✓ PASSED' : '✗ FAILED'}\n`);
  } catch (error) {
    console.log(`   Health check: ✗ FAILED - ${error}\n`);
  }

  // Test 2: Get all prices
  console.log('2. Testing getAllPrices()...');
  try {
    const prices = await provider.getAllPrices();
    console.log(`   Retrieved ${prices.length} prices`);
    if (prices.length > 0) {
      console.log('   Sample prices:');
      prices.slice(0, 3).forEach(p => {
        console.log(`     - ${p.symbol}: ${Number(p.price) / 1_000_000} USD`);
      });
    }
    console.log('   getAllPrices: ✓ PASSED\n');
  } catch (error) {
    console.log(`   getAllPrices: ✗ FAILED - ${error}\n`);
  }

  // Test 3: Get specific price (BTC)
  console.log('3. Testing getSpotPrice("BTC")...');
  try {
    const btcPrice = await provider.getSpotPrice('BTC');
    console.log(`   BTC Price: ${Number(btcPrice.price) / 1_000_000} USD`);
    console.log(`   Timestamp: ${btcPrice.timestamp}`);
    console.log(`   Source: ${btcPrice.source}`);
    console.log(`   Raw Hash: ${btcPrice.rawHash.slice(0, 16)}...`);
    console.log('   getSpotPrice: ✓ PASSED\n');
  } catch (error) {
    console.log(`   getSpotPrice: ✗ FAILED - ${error}\n`);
  }

  // Test 4: WebSocket subscription (5 second test)
  console.log('4. Testing WebSocket subscription (5 seconds)...');
  let wsUpdates = 0;

  provider.subscribe('BTC', (tick) => {
    wsUpdates++;
    if (wsUpdates <= 3) {
      console.log(`   WS Update ${wsUpdates}: BTC = ${Number(tick.price) / 1_000_000} USD`);
    }
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log(`   Received ${wsUpdates} WebSocket updates`);
  console.log(`   WebSocket: ${wsUpdates > 0 ? '✓ PASSED' : '⚠ No updates (may need longer wait)'}\n`);

  // Cleanup
  provider.disconnect();

  console.log('=== Test Complete ===');
}

testPacificaIntegration().catch(console.error);
