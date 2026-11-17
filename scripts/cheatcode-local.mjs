#!/usr/bin/env node
/**
 * scripts/cheatcode-local.mjs
 *
 * Local dry-run harness for the weekly Cheatcode SEO agent. Hits the running dev
 * server's /api/cheatcode/run endpoint with dryRun=1, pretty-prints the
 * resulting opportunities, and optionally sends the digest to a test
 * inbox so the email render can be reviewed.
 *
 * Usage:
 *   set -a && source .env.local && set +a
 *   npm run dev   # in another shell
 *   node scripts/cheatcode-local.mjs                  # dry-run, no email
 *   node scripts/cheatcode-local.mjs --send-test-email
 *   node scripts/cheatcode-local.mjs --base http://localhost:3001
 *
 * Output: prints the AgentRunSummary JSON to stdout; writes the same
 * JSON to extracted/cheatcode/<runId>.json for diffing across runs.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const optValue = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const baseUrl = optValue('base') ?? 'http://localhost:3000';
const sendEmail = flag('send-test-email');
const showOpportunities = !flag('quiet');

const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('CRON_SECRET not set — `set -a && source .env.local && set +a` first.');
  process.exit(1);
}

const url = new URL('/api/cheatcode/run', baseUrl);
url.searchParams.set('dryRun', '1');
if (sendEmail) url.searchParams.set('sendEmail', '1');

console.log(`→ POST ${url.toString()}`);
const started = Date.now();

let res;
try {
  res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
} catch (err) {
  console.error(`fetch failed: ${err.message}`);
  console.error('Is the dev server running? `npm run dev`');
  process.exit(1);
}

if (!res.ok) {
  const body = await res.text().catch(() => '');
  console.error(`HTTP ${res.status}: ${body}`);
  process.exit(1);
}

const data = await res.json();
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

console.log(`✓ run ${data.runId} (${elapsed}s)  week ${data.week}`);
console.log('  counts:', JSON.stringify(data.counts));
if (data.errors?.length) {
  console.log('  errors:');
  for (const e of data.errors) console.log(`    - ${e}`);
}

if (showOpportunities && Array.isArray(data.opportunities)) {
  console.log(`\nopportunities (${data.opportunities.length}):`);
  for (const o of data.opportunities) {
    console.log(
      `  [${o.type.padEnd(14)}] "${o.query}"  pos=${o.metrics.position.toFixed(1)} imp=${o.metrics.impressions} ctr=${(o.metrics.ctr * 100).toFixed(1)}%`,
    );
    if (o.draftContent === null) console.log('     (no draft — generation skipped or failed)');
  }
}

// Snapshot for diffing across runs
const outDir = path.join(process.cwd(), 'extracted', 'cheatcode');
await fs.mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `${data.runId}.json`);
await fs.writeFile(outPath, JSON.stringify(data, null, 2));
console.log(`\nsnapshot written to ${path.relative(process.cwd(), outPath)}`);
