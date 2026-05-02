#!/usr/bin/env node
/**
 * One-shot diagnostic: pull GSC daily history for an exact query string,
 * plus the destination pages it lands on. Used to investigate ranking
 * regressions on a single term.
 *
 *   set -a && source .env.local && set +a
 *   node scripts/diag-gsc-query.mjs "paddock maintenance services near me" 120
 */

import pg from 'pg';

const QUERY = process.argv[2];
if (!QUERY) {
  console.error('Usage: node scripts/diag-gsc-query.mjs "<exact query>" [days=120]');
  process.exit(1);
}
const DAYS = Number(process.argv[3] || 120);

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SITE = process.env.GSC_SITE_URL;
if (!SITE) { console.error('GSC_SITE_URL not set'); process.exit(1); }

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function getRefreshToken() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const res = await client.query('SELECT refresh_token FROM gsc_auth LIMIT 1');
    return res.rows[0]?.refresh_token ?? null;
  } finally {
    await client.end();
  }
}

async function getAccessToken(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function gsc(token, body) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GSC ${res.status} ${await res.text()}`);
  return (await res.json()).rows ?? [];
}

const rt = await getRefreshToken();
if (!rt) { console.error('No refresh_token in gsc_auth — run /admin-stats/auth/connect'); process.exit(1); }
const token = await getAccessToken(rt);

const startDate = isoDaysAgo(DAYS + 3);
const endDate = isoDaysAgo(3);
const filter = {
  startDate, endDate, rowLimit: 5000,
  dimensionFilterGroups: [{ filters: [{ dimension: 'query', operator: 'equals', expression: QUERY }] }],
};

console.log(`# GSC diagnostics — "${QUERY}"  (${startDate} → ${endDate}, ${DAYS} days)\n`);

const byDate = await gsc(token, { ...filter, dimensions: ['date'] });
console.log(`## By week (avg position, sum clicks/impr)`);
const byWeek = new Map();
for (const r of byDate) {
  const d = new Date(r.keys[0] + 'T00:00:00Z');
  const day = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  const k = monday.toISOString().slice(0, 10);
  const acc = byWeek.get(k) ?? { clicks: 0, impressions: 0, posSum: 0, posN: 0 };
  acc.clicks += r.clicks;
  acc.impressions += r.impressions;
  acc.posSum += r.position * r.impressions;
  acc.posN += r.impressions;
  byWeek.set(k, acc);
}
const weeks = [...byWeek.entries()].sort();
console.log('week-start  | clicks | impr | avg-pos');
for (const [k, v] of weeks) {
  const avg = v.posN > 0 ? v.posSum / v.posN : 0;
  console.log(`${k}  | ${String(v.clicks).padStart(6)} | ${String(v.impressions).padStart(4)} | ${avg.toFixed(2)}`);
}

const byPage = await gsc(token, { ...filter, dimensions: ['page'] });
console.log(`\n## Pages this query lands on (whole window)`);
console.log('page                                                   | clicks | impr | avg-pos');
for (const r of byPage.sort((a, b) => b.impressions - a.impressions)) {
  console.log(`${r.keys[0].padEnd(54)} | ${String(r.clicks).padStart(6)} | ${String(r.impressions).padStart(4)} | ${r.position.toFixed(2)}`);
}

const byPageDate = await gsc(token, { ...filter, dimensions: ['page', 'date'] });
console.log(`\n## Page × week (which URL was ranking when)`);
const byPageWeek = new Map();
for (const r of byPageDate) {
  const [page, date] = r.keys;
  const d = new Date(date + 'T00:00:00Z');
  const day = d.getUTCDay();
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  const wk = monday.toISOString().slice(0, 10);
  const k = `${wk}|${page}`;
  const acc = byPageWeek.get(k) ?? { clicks: 0, impressions: 0, posSum: 0, posN: 0, page, wk };
  acc.clicks += r.clicks;
  acc.impressions += r.impressions;
  acc.posSum += r.position * r.impressions;
  acc.posN += r.impressions;
  byPageWeek.set(k, acc);
}
const pageWeeks = [...byPageWeek.values()].sort((a, b) => a.wk.localeCompare(b.wk) || a.page.localeCompare(b.page));
console.log('week-start  | page                                                 | impr | avg-pos');
for (const v of pageWeeks) {
  const avg = v.posN > 0 ? v.posSum / v.posN : 0;
  const path = v.page.replace(/^https?:\/\/[^/]+/, '') || '/';
  console.log(`${v.wk}  | ${path.padEnd(52)} | ${String(v.impressions).padStart(4)} | ${avg.toFixed(2)}`);
}

process.exit(0);
