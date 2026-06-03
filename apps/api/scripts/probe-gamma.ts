import 'dotenv/config';
import { polymarketFetch } from '../src/services/sports/polymarket-fetch';

async function main() {
  const id = process.argv[2] || '2354044';
  const data = await polymarketFetch(`/markets?id=${id}`);
  const m = Array.isArray(data) ? data[0] : data;
  if (!m) { console.log('empty'); return; }
  console.log(JSON.stringify({
    id: m.id, question: m.question?.slice(0, 60), closed: m.closed,
    umaResolutionStatus: m.umaResolutionStatus, questionID: m.questionID,
    negRisk: m.negRisk, negRiskRequestID: m.negRiskRequestID, negRiskMarketID: m.negRiskMarketID,
    conditionId: m.conditionId, resolvedBy: m.resolvedBy,
    outcomes: m.outcomes, outcomePrices: m.outcomePrices,
  }, null, 2));
}
main().catch(console.error);
