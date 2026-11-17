/**
 * Page context — what the target page actually says, for draft generation.
 *
 * Until 2026-11 the on-page drafts were given the page TITLE only and the
 * meta drafts an empty current meta. With nothing to read, Opus invented
 * what it couldn't see and re-proposed what was already there:
 *   - #56 invented 450–600mm mole-plough depths,
 *   - #66 claimed a rotary mower on a page listing a Kuhn flail topper,
 *     Wessex finishing mower and flat topper,
 *   - the homepage and post 29 were offered FAQs/H2s they already had,
 *     month after month.
 *
 * We fetch the LIVE page (what Google sees) rather than reading Payload, so
 * every URL works the same way: CMS pages, hard-coded routes like
 * /paddock-maintenance, and the homepage global. Failures return null and
 * the caller falls back to title-only, so a slow page never sinks a run.
 */

import * as cheerio from 'cheerio';

export type PageContext = {
  url: string;
  title: string;
  metaDescription: string;
  h1: string;
  /** Every h2/h3 in document order, e.g. "## When to Top Your Paddock". */
  headings: string[];
  /** Headings phrased as questions — the page's existing FAQ coverage. */
  existingQuestions: string[];
  /** Internal paths the page already links to (deduped). */
  internalLinks: string[];
  /** Main-content text, headings inline, capped at ~MAX_BODY_CHARS. */
  bodyText: string;
  /**
   * Sidebar facts (service pages: equipment list, best time, frequency).
   * Rendered in an <aside> OUTSIDE <main>, so collected separately.
   */
  sidebar: string;
};

const MAX_BODY_CHARS = 9000; // ~1,500 words; plenty to ground a draft
const FETCH_TIMEOUT_MS = 10_000;

export async function fetchPageContext(pageUrl: string): Promise<PageContext | null> {
  if (!pageUrl) return null;
  try {
    const res = await fetch(pageUrl, {
      headers: { 'User-Agent': 'HPM-Cheatcode/1.0 (+internal)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return parsePageContext(pageUrl, await res.text());
  } catch {
    return null;
  }
}

/** Pure parser — exported so it can be checked against saved HTML. */
export function parsePageContext(pageUrl: string, html: string): PageContext {
  const $ = cheerio.load(html);
  const title = $('head > title').first().text().trim();
  const metaDescription = ($('meta[name="description"]').attr('content') ?? '').trim();

  // Sidebar facts first, from the ONE aside that holds them: ServiceBody marks
  // its equipment/timing aside with data-page-facts. Other asides (callout
  // blocks in notes, pricing rails, the contact sidebar) aren't facts about
  // machinery and mustn't be labelled as ground truth.
  const sidebar = extractSidebar($);

  // Parse from <body>, not <main>: most pages have no <main>, and on service
  // pages <main> wraps only the lede + body, leaving out the hero H1 and the
  // related-notes/related-services links. Strip site chrome instead: header,
  // nav, footer, the mobile menu (a plain div, not a <nav>), decorative
  // aria-hidden rails, and the facts aside already captured above.
  $(
    'script, style, noscript, svg, header, nav, footer, form, #mobile-menu, [aria-hidden="true"], [data-page-facts]',
  ).remove();
  const root = $('body');

  const h1 = root.find('h1').first().text().replace(/\s+/g, ' ').trim();
  const headings: string[] = [];
  const existingQuestions: string[] = [];
  root.find('h2, h3').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    headings.push(`${el.tagName === 'h2' ? '##' : '###'} ${text}`);
    if (text.endsWith('?')) existingQuestions.push(text);
  });
  // FAQ accordions often use <summary>/<dt> rather than headings.
  root.find('summary, dt').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.endsWith('?') && !existingQuestions.includes(text)) existingQuestions.push(text);
  });

  let origin = '';
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    /* relative url — leave origin empty */
  }
  const links = new Set<string>();
  root.find('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    let path: string | null = null;
    if (href.startsWith('/') && !href.startsWith('//')) path = href;
    else if (origin && href.startsWith(origin)) path = href.slice(origin.length) || '/';
    if (path) links.add(normalisePath(path));
  });

  const parts: string[] = [];
  root.find('h1, h2, h3, h4, p, li, td, dt, dd, summary, figcaption').each((_, el) => {
    // Skip containers whose text a nested match will emit anyway.
    if ($(el).parents('li, td, dd').length && el.tagName !== 'li') return;
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (/^h[1-4]$/.test(el.tagName)) parts.push(`\n${'#'.repeat(Number(el.tagName[1]))} ${text}`);
    else if (el.tagName === 'li') parts.push(`- ${text}`);
    else parts.push(text);
  });
  // The mobile menu isn't in a <nav>, so its links lead the walk; the page
  // proper starts at the h1.
  const h1At = parts.findIndex((p) => p.startsWith('\n# '));
  let bodyText = (h1At > 0 ? parts.slice(h1At) : parts).join('\n').trim();
  if (bodyText.length > MAX_BODY_CHARS) {
    bodyText = bodyText.slice(0, MAX_BODY_CHARS).replace(/\s+\S*$/, '') + '\n[…page continues]';
  }


  return {
    url: pageUrl,
    title,
    metaDescription,
    h1,
    headings,
    existingQuestions,
    internalLinks: Array.from(links).sort(),
    bodyText,
    sidebar,
  };
}

function extractSidebar($: cheerio.CheerioAPI): string {
  // Leaf-text join keeps "Kuhn BP 20" and "2.0m flail topper" apart instead
  // of running them together as "Kuhn BP 202.0m flail topper".
  const lines: string[] = [];
  $('[data-page-facts]').each((_, aside) => {
    $(aside)
      .find('h2, h3, h4, li, p, dt, dd')
      .each((_, el) => {
        if ($(el).parents('li').length) return;
        const leaves = $(el)
          .find('*')
          .addBack()
          .filter((_, n) => $(n).children().length === 0)
          .map((_, n) => $(n).text().replace(/\s+/g, ' ').trim())
          .get()
          .filter(Boolean);
        const line = leaves.join(' · ');
        if (line) lines.push(/^h[2-4]$/.test(el.tagName) ? `[${line}]` : `- ${line}`);
      });
  });
  return lines.join('\n').slice(0, 2500);
}

/** Normalise an internal href/path for comparison: no origin, query, hash or trailing slash. */
export function normalisePath(href: string): string {
  let p = href.trim();
  try {
    if (/^https?:\/\//.test(p)) p = new URL(p).pathname;
  } catch {
    /* keep as-is */
  }
  p = p.split('#')[0].split('?')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

/** Render a context block for a prompt. */
export function formatPageContext(ctx: PageContext): string {
  return [
    `Current <title>: ${ctx.title || '(none)'}`,
    `Current meta description: ${ctx.metaDescription || '(none)'}`,
    `H1: ${ctx.h1 || '(none)'}`,
    `Existing headings:\n${ctx.headings.join('\n') || '(none)'}`,
    `Questions the page already answers:\n${ctx.existingQuestions.map((q) => `- ${q}`).join('\n') || '(none)'}`,
    `Internal links already on the page: ${ctx.internalLinks.join(', ') || '(none)'}`,
    `Page body:\n<page_body>\n${ctx.bodyText}\n</page_body>`,
    ...(ctx.sidebar
      ? [`Service facts panel (equipment, timing — treat as ground truth):\n<sidebar>\n${ctx.sidebar}\n</sidebar>`]
      : []),
  ].join('\n\n');
}
