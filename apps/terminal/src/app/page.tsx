import { redirect } from 'next/navigation';

// The terminal lands directly on the trade view; assets are switched from the
// MarketSelector dropdown above the chart (not a separate markets-list page).
export default function Home() {
  redirect('/market/BTC-USD');
}
