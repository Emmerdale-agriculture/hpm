/**
 * Persist — write opportunities (and linked Posts drafts for new articles)
 * to Payload via the Local API.
 *
 * Idempotency lives in the orchestrator: it calls `findExistingOpportunity`
 * and `findActivePriorOpportunity` before deciding whether to generate
 * and what status to persist with. This module just performs the writes.
 */

import { getPayload } from 'payload';
import config from '@payload-config';
import type { Opportunity, NewArticleOpportunity } from './types';
import type { ExistingDoc } from './cannibalisation';

type Payload = Awaited<ReturnType<typeof getPayload>>;

export async function getPayloadClient(): Promise<Payload> {
  return getPayload({ config });
}

/** Payload polymorphic relationship value — over-narrow generated type. */
type PolyRel = { relationTo: 'pages' | 'posts' | 'services'; value: number };

/**
 * Pull every Page, Post, and Service for the cannibalisation check and
 * for context passed into the classifier prompt.
 *
 * Depth 0 — we only need ids/titles/slugs.
 */
export async function fetchExistingDocs(payload: Payload): Promise<ExistingDoc[]> {
  const [pages, posts, services] = await Promise.all([
    payload.find({ collection: 'pages', limit: 500, depth: 0 }),
    payload.find({ collection: 'posts', limit: 500, depth: 0 }),
    payload.find({ collection: 'services', limit: 100, depth: 0 }),
  ]);

  return [
    ...pages.docs.map((d) => ({
      collection: 'pages' as const,
      id: Number(d.id),
      slug: String(d.slug ?? ''),
      title: String(d.title ?? ''),
    })),
    ...posts.docs.map((d) => ({
      collection: 'posts' as const,
      id: Number(d.id),
      slug: String(d.slug ?? ''),
      title: String(d.title ?? ''),
    })),
    ...services.docs.map((d) => ({
      collection: 'services' as const,
      id: Number(d.id),
      slug: String(d.slug ?? ''),
      title: String(d.title ?? ''),
    })),
  ];
}

/**
 * Look up an existing opportunity by uniqueness key. Returns the doc id
 * if found, otherwise null.
 */
export async function findExistingOpportunity(
  payload: Payload,
  args: { weekIdentified: string; query: string; type: string },
): Promise<number | null> {
  const res = await payload.find({
    collection: 'seo-opportunities',
    where: {
      and: [
        { weekIdentified: { equals: args.weekIdentified } },
        { query: { equals: args.query } },
        { type: { equals: args.type } },
      ],
    },
    limit: 1,
    depth: 0,
  });
  return res.docs[0]?.id ? Number(res.docs[0].id) : null;
}

/**
 * How long a resolved opportunity keeps its query off the pending list.
 * Long enough for a shipped change to be recrawled and show up in GSC
 * (this site's recrawl lag runs to months), short enough that a fix which
 * didn't work gets raised again.
 */
const RESOLVED_COOLDOWN_DAYS = 120;

/**
 * Check whether an earlier week already produced an opportunity for this
 * query. Caller treats a hit as a signal to persist the new opportunity as
 * `superseded` and skip generation. Brief §10.
 *
 * A hit is any opportunity for the same query, of ANY type, that is either
 * still open (pending/approved) or was raised within the cooldown, whatever
 * its outcome. Before 2026-11 this only matched open rows of the same type,
 * so each monthly review's close-out wiped the slate and the next run
 * re-raised (and re-drafted) the same queries: 38 of the first 66
 * opportunities repeated an already-resolved query, "paddock maintenance"
 * eight times, and the type flipped between meta_rewrite and on_page_tweak
 * from run to run.
 *
 * Rows this function caused to be auto-superseded (status superseded, no
 * decidedAt — a review always sets one) don't start a new cooldown, or a
 * query that keeps coming up would renew its own suppression forever.
 */
export async function findActivePriorOpportunity(
  payload: Payload,
  query: string,
): Promise<number | null> {
  const cutoff = new Date(Date.now() - RESOLVED_COOLDOWN_DAYS * 86_400_000).toISOString();
  const res = await payload.find({
    collection: 'seo-opportunities',
    where: {
      and: [
        { query: { equals: query } },
        {
          or: [
            { status: { in: ['pending', 'approved'] } },
            {
              and: [
                { createdAt: { greater_than: cutoff } },
                {
                  or: [
                    { status: { not_equals: 'superseded' } },
                    { decidedAt: { exists: true } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    limit: 1,
    depth: 0,
  });
  return res.docs[0]?.id ? Number(res.docs[0].id) : null;
}

export type PersistResult = {
  opportunityId: number;
  postId?: number;
  /** Non-fatal error (e.g. Post draft creation failed) — surfaces to digest. */
  postError?: string;
};

/**
 * Create a single SeoOpportunity, optionally with a linked Post draft
 * (only when type === 'new_article' AND draftContent is present).
 *
 * The orchestrator decides `status` after running the idempotency lookups;
 * this function performs the writes only.
 *
 * Re-run safety net: a final unique-key check before insert protects
 * against the rare race where two runs see the same week as missing.
 */
export async function persistOpportunity(
  payload: Payload,
  opp: Opportunity,
  runId: string,
  status: 'pending' | 'superseded',
): Promise<PersistResult> {
  // Safety net: if another writer raced us, return the existing id.
  const racing = await findExistingOpportunity(payload, {
    weekIdentified: opp.weekIdentified,
    query: opp.query,
    type: opp.type,
  });
  if (racing) return { opportunityId: racing };

  const targetPage: PolyRel | undefined =
    opp.targetPageId && opp.targetPageCollection
      ? { relationTo: opp.targetPageCollection, value: opp.targetPageId }
      : undefined;

  // Create the linked Post draft for new_article (when we have draftContent).
  let postId: number | undefined;
  let postError: string | undefined;
  if (opp.type === 'new_article' && opp.draftContent && status === 'pending') {
    try {
      postId = await createDraftPost(payload, opp);
    } catch (err) {
      postError = `Post draft create failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error('[seo-agent]', postError);
    }
  }

  const created = await payload.create({
    collection: 'seo-opportunities',
    data: {
      query: opp.query,
      type: opp.type,
      intent: opp.intent,
      status,
      weekIdentified: opp.weekIdentified,
      metrics: opp.metrics,
      rationale: postError ? `${opp.rationale}\n\n[${postError}]` : opp.rationale,
      // Polymorphic relationships are over-narrowed in generated types.
      targetPage: targetPage as never,
      draftContent: (opp.draftContent ?? undefined) as never,
      relatedPost: postId,
      deferred: opp.type === 'new_article' ? Boolean(opp.deferred) : false,
      agentRunId: runId,
    },
  });

  return {
    opportunityId: Number(created.id),
    postId,
    postError,
  };
}

/**
 * Create a `Posts` draft holding the agent-generated article body.
 *
 * Body conversion: markdown is dropped into a single richText block as
 * a paragraph of plain text. Tom reformats during review — see
 * docs/SEO-AGENT.md. Auto markdown→Lexical-blocks is a v2 upgrade.
 *
 * Throws on failure so the caller can surface the error to the digest.
 */
async function createDraftPost(
  payload: Payload,
  opp: NewArticleOpportunity,
): Promise<number> {
  if (!opp.draftContent) throw new Error('no draftContent');
  const draft = opp.draftContent;

  const created = await payload.create({
    collection: 'posts',
    // Force draft regardless of validation.
    draft: true,
    data: {
      title: draft.title,
      slug: draft.slug,
      excerpt: draft.metaDescription?.slice(0, 280),
      category: 'paddock',
      seoSource: 'agent',
      seo: {
        metaTitle: draft.title.length <= 60 ? draft.title : undefined,
        metaDescription: draft.metaDescription,
      },
      content: [
        {
          blockType: 'richText',
          content: markdownAsLexicalState(draft.bodyMarkdown) as never,
        },
      ],
    },
  });
  return Number(created.id);
}

/**
 * Wrap markdown text in a minimal Lexical editor state — one paragraph
 * per blank-line-separated chunk, plain text only. Markdown syntax
 * remains visible (e.g. "## Heading") for Tom to reformat manually.
 */
function markdownAsLexicalState(markdown: string): unknown {
  const paragraphs = markdown.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        children: [
          {
            type: 'text',
            format: 0,
            style: '',
            mode: 'normal',
            text,
            version: 1,
            detail: 0,
          },
        ],
      })),
    },
  };
}

/**
 * Resolve a GSC page URL to a Payload doc by matching slug.
 * Returns null if the URL doesn't map to a known doc.
 */
export function resolveTargetPage(
  pageUrl: string | undefined,
  existing: ExistingDoc[],
): { id: number; collection: 'pages' | 'posts' | 'services' } | null {
  if (!pageUrl) return null;
  // GSC returns full URLs; pull the path and the leaf slug.
  let path: string;
  try {
    path = new URL(pageUrl).pathname;
  } catch {
    path = pageUrl;
  }
  const segments = path.replace(/^\/+|\/+$/g, '').split('/');
  const leaf = segments[segments.length - 1] || segments[0];
  if (!leaf) return null;

  // Prefer service > post > page (most specific intent first).
  const order: Array<'services' | 'posts' | 'pages'> = ['services', 'posts', 'pages'];
  for (const coll of order) {
    const hit = existing.find((d) => d.collection === coll && d.slug === leaf);
    if (hit) return { id: hit.id, collection: hit.collection };
  }
  return null;
}
