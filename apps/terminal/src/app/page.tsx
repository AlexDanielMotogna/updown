import { getTickers } from '@/lib/exchange';
import { MarketsTable } from '@/components/MarketsTable';

// Server component: fetch initial markets from HyperLiquid on the server.
export const dynamic = 'force-dynamic';

export default async function Page() {
  let initial = [] as Awaited<ReturnType<typeof getTickers>>;
  let error: string | null = null;
  try {
    initial = await getTickers();
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <h1 className="text-lg font-semibold">Trade</h1>
      {error ? (
        <div className="rounded border border-down/40 bg-down/10 p-3 text-sm text-down">
          Failed to load markets: {error}
        </div>
      ) : (
        <MarketsTable initial={initial} />
      )}
    </div>
  );
}
