#!/usr/bin/env node
/**
 * Run the tender watch from the command line (same code as /api/tender-watch).
 *
 *   Dry run (local mirror, writes nothing):
 *     node_modules/.bin/tsx --env-file=.env.local scripts/tender-watch.mjs
 *   Write to the local mirror:
 *     node_modules/.bin/tsx --env-file=.env.local scripts/tender-watch.mjs --execute
 *   Backfill Find a Tender further back:
 *     ... scripts/tender-watch.mjs --since=2026-09-01
 *
 * On production, prefer the deployed route (it runs where the prod DB is):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://hampshirepaddockmanagement.com/api/tender-watch?since=2026-09-01"
 */

const EXECUTE = process.argv.includes('--execute');
const SKIP_RENEWALS = process.argv.includes('--skip-renewals');
const sinceArg = process.argv.find((a) => a.startsWith('--since='))?.slice(8);

async function main() {
  const { runTenderWatch } = await import('../src/lib/tenders/watch.ts');
  console.log(EXECUTE ? '[execute] tender watch' : '[dry-run] use --execute to write');
  const s = await runTenderWatch({
    dryRun: !EXECUTE,
    skipRenewals: SKIP_RENEWALS,
    findATenderSince: sinceArg ? new Date(sinceArg) : undefined,
  });
  console.log('fetched (local, pre-scoring):', s.fetched);
  console.log('kept:', s.kept, '| already in DB:', s.updated);
  const rows = [...s.created].sort((a, b) => (a.actionBy ?? '').localeCompare(b.actionBy ?? ''));
  for (const c of rows) {
    console.log(
      [
        (c.actionBy ?? '').slice(0, 10).padEnd(10),
        c.kind.padEnd(8),
        (c.fit ?? '').padEnd(11),
        String(c.score).padStart(3),
        `${c.buyer} — ${c.title}`.slice(0, 95),
        c.valueHigh ? `£${Math.round(c.valueHigh).toLocaleString('en-GB')}` : '',
        c.incumbent ? `[${c.incumbent.slice(0, 30)}]` : '',
        c.distanceMiles != null ? `${c.distanceMiles}mi` : '',
      ].join('  '),
    );
  }
  if (s.errors.length) console.log('errors:', s.errors);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
