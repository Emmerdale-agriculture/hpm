# SEO Agent

Weekly automated agent that ingests Google Search Console performance data,
identifies three categories of underperforming queries, and produces draft
work in Payload for Tom to review. **The agent never publishes.** Everything
lands as `pending` for human approval.

Spec: [`SEO-AGENT-BRIEF.docx`](./SEO-AGENT-BRIEF.docx).

## Pipeline

```
GSC pull → triage → classify (Haiku) → cannibalisation → generate (Opus) → persist → digest email
```

Three opportunity types:

| Type | Trigger | Output |
|---|---|---|
| `meta_rewrite` | Position 1–5, ≥30 imp, CTR < 70% of position-expected | 3 alternative title+meta pairs |
| `on_page_tweak` | Position 8–20, ≥50 imp | New H2 + body + internal links + FAQ |
| `new_article` | Position ≥20, ≥30 imp, informational/commercial intent | Full markdown draft + linked Posts entry |

## File map

```
src/payload/collections/seo-opportunities.ts   # Payload collection
src/payload/collections/posts.ts                # adds `seoSource` field
src/app/api/seo-agent/route.ts                  # GET — cron entrypoint
src/app/api/seo-agent/run/route.ts              # POST — manual trigger
src/app/api/seo-agent/lib/
  ├── types.ts                                  # shared shapes + ISO week + CTR table
  ├── triage.ts                                 # threshold rules
  ├── anthropic.ts                              # SDK wrapper + token budget
  ├── classify.ts                               # Haiku 4.5 classifier
  ├── cannibalisation.ts                        # lexical dedupe (v1)
  ├── generate.ts                               # Opus 4.7 draft generators
  ├── persist.ts                                # Payload Local API writes
  ├── digest.ts                                 # Resend email composer
  └── orchestrate.ts                            # runs the pipeline end-to-end
scripts/seo-agent-local.mjs                     # dry-run harness
vercel.json                                     # cron entry: 1st of each month, 07:00 UTC
```

## Environment variables

Required additions to `.env.local`:

```bash
CRON_SECRET=...           # openssl rand -hex 32
ANTHROPIC_API_KEY=sk-...  # console.anthropic.com
DIGEST_TO_EMAIL=tom@hampshirepaddockmanagement.com
```

Reused (already configured for `/admin-stats`):

```bash
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GSC_SITE_URL=sc-domain:hampshirepaddockmanagement.com
RESEND_API_KEY=...
```

The agent uses the existing GSC OAuth refresh token stored in the
`gsc-auth` global — no service account needed. If the token is missing,
visit `/admin-stats/auth/connect` first.

## Running locally (dry-run)

In one shell:

```bash
npm run dev
```

In another, after sourcing `.env.local`:

```bash
set -a && source .env.local && set +a
node scripts/seo-agent-local.mjs                  # logs candidates, no email, no Payload writes
node scripts/seo-agent-local.mjs --send-test-email # also sends the digest to DIGEST_TO_EMAIL
```

A snapshot of each run is written to `extracted/seo-agent/run_<ts>.json`
for diffing across iterations while tuning prompts.

## Triggering an off-cycle run in production

```bash
curl -X POST https://hampshirepaddockmanagement.com/api/seo-agent/run \
  -H "Authorization: Bearer $CRON_SECRET"
```

Add `?dryRun=1` to skip Payload writes; `?sendEmail=1` (with `dryRun`)
to test the digest render against current GSC data without persisting.

## Reading the digest

The monthly email summarises three sections (meta rewrites, on-page tweaks,
new articles), each with a small table of query / position / CTR /
impressions. The primary CTA links to:

```
/admin/collections/seo-opportunities?where[status][equals]=pending
```

Even quiet weeks send an email — silence makes the system feel broken.

## Approving an opportunity

For every type, in `/admin/collections/seo-opportunities`:

1. Read `rationale` — the agent's one-line justification.
2. Read `metrics` — the GSC numbers that triggered it.
3. Read `draftContent` — the suggestion (shape varies by type, see below).
4. Apply the change manually in the relevant collection.
5. Set `status` to `approved` (intent to do it), `completed` (done), or `rejected` (won't do).

### Meta rewrite (`type: meta_rewrite`)

```json
{
  "alternatives": [
    { "title": "...", "meta": "...", "rationale": "..." }
  ]
}
```

Pick one alternative, paste into the target page's `seo.metaTitle` /
`seo.metaDescription`. The `targetPage` relationship resolves the doc.

### On-page tweak (`type: on_page_tweak`)

```json
{
  "newH2": "...",
  "newH2Body": "...",
  "internalLinksToAdd": [{ "anchor": "...", "slug": "...", "reason": "..." }],
  "faqAdditions": [{ "question": "...", "answer": "..." }],
  "rationale": "..."
}
```

Add the H2 as a new RichText block. Add internal links inline. FAQs go
into a Callout block or a dedicated FAQ section if the page has one.

### New article (`type: new_article`)

The `relatedPost` relationship points at a draft `Posts` entry that the
agent created alongside the opportunity. Open the draft post:

- Title, slug, SEO meta are pre-filled.
- Body is in a single RichText block as **plain text containing the markdown**
  — i.e. `## Foo` shows up literally, not as a heading.
- Reformat: split into proper Lexical heading / paragraph / list nodes
  using the editor toolbar.

Auto-conversion of markdown → Lexical blocks is a v2 upgrade. For v1 the
brief is happy with manual reformatting since Tom reviews everything anyway.

## Diagnosing failures

Every Claude call is logged with `[seo-agent]` prefix in Vercel function
logs. The digest email always includes an `Errors during run:` block when
non-empty. Common ones:

| Error | Fix |
|---|---|
| `GSC pull failed: ...` | OAuth token expired — re-connect at `/admin-stats/auth/connect`. |
| `Persist "..." failed: ...` | Payload validation — usually the generated slug clashed. The opportunity won't be created; re-run after deleting any orphaned draft post. |
| `Budget exceeded after N classifications` | Too many candidates this week. Raise `budgetUsd` in `runAgent()` if needed, or tighten triage thresholds. |
| `Classify "..." failed: ...` | Anthropic transient error. Will retry once internally; if still failing the opportunity is skipped. |

## Non-negotiables (from the brief)

- **Draft-only.** Never publish, never modify a live Page or non-draft Post.
- **Idempotent on week.** Same week's data must not create duplicates.
  Uniqueness key: `weekIdentified + query + type`.
- **No invented facts.** Prompts forbid invented stats / quotes / citations.
  Don't loosen this in any prompt edit.
- **No competitor brand content.** Filter happens in `triage.ts`.
- **Cost ceiling.** Soft cap of $2.50 / run via `TokenBudget`. Exceeding it
  aborts further generation and emails Tom with the partial set.
- **Logs everything.** Every classification + every Claude call must be
  diagnosable from Vercel logs alone.

## Phased rollout

1. **Week 1** — dry-run only. Tune prompts and thresholds from console output.
2. **Week 2** — enable persistence (cron writes to Payload), keep digest off.
3. **Week 3** — enable digest. Full system live.
4. **Week 4+** — weekly review. After 4 stable weeks, consider relaxing
   draft-only for `meta_rewrite` only (lowest-risk category).
