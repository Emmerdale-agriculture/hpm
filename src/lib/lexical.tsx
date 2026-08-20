import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { mediaDimensions, mediaUrl } from './media';

/**
 * Minimal Lexical → JSX renderer matching the node shapes the WordPress
 * importer produces. Covers: paragraph, heading (h1-h6), list (bullet/number),
 * listitem, text (with bold/italic/underline format flags), link, linebreak,
 * quote, horizontalrule, upload.
 *
 * Unknown node types fall back to rendering their children or the text content
 * so nothing is lost silently.
 */

type LexicalNode = {
  type?: string;
  tag?: string;
  children?: LexicalNode[];
  text?: string;
  format?: number | string;
  listType?: 'bullet' | 'number';
  fields?: { url?: string; newTab?: boolean; linkType?: 'custom' | 'internal' };
  relationTo?: string;
  value?: unknown;
};

type MediaDoc = Parameters<typeof mediaUrl>[0];

type RenderOpts = {
  /** Map of upload node `value` (media id) → media doc, for rendering <img>. */
  mediaById?: Map<number, MediaDoc>;
};

export function renderLexical(root: LexicalNode | undefined, opts: RenderOpts = {}): ReactNode {
  if (!root) return null;
  const node = root as { root?: LexicalNode };
  const top = node.root ?? root;
  if (!top || !Array.isArray(top.children)) return null;
  return <>{top.children.map((child, i) => renderNode(child, String(i), opts))}</>;
}

function renderNode(node: LexicalNode | undefined, key: string, opts: RenderOpts): ReactNode {
  if (!node) return null;
  const type = node.type;

  if (type === 'paragraph') {
    return <p key={key}>{renderChildren(node.children, key, opts)}</p>;
  }

  if (type === 'heading') {
    let tag = typeof node.tag === 'string' ? node.tag : 'h2';
    // The page template owns the single h1 (the post title); body headings
    // authored as h1 in the editor demote to h2 so we never ship multiple h1s.
    if (tag === 'h1') tag = 'h2';
    const Tag = tag as keyof React.JSX.IntrinsicElements;
    return <Tag key={key}>{renderChildren(node.children, key, opts)}</Tag>;
  }

  if (type === 'list') {
    const ordered = node.listType === 'number' || node.tag === 'ol';
    const Tag = ordered ? 'ol' : 'ul';
    return <Tag key={key}>{renderChildren(node.children, key, opts)}</Tag>;
  }

  if (type === 'listitem') {
    return <li key={key}>{renderChildren(node.children, key, opts)}</li>;
  }

  if (type === 'quote') {
    return <blockquote key={key}>{renderChildren(node.children, key, opts)}</blockquote>;
  }

  if (type === 'horizontalrule') {
    return <hr key={key} />;
  }

  if (type === 'linebreak') {
    return <br key={key} />;
  }

  if (type === 'link') {
    const url = node.fields?.url ?? '';
    const inner = renderChildren(node.children, key, opts);
    if (!url) return <>{inner}</>;
    const isInternal = url.startsWith('/') || url.startsWith('#');
    if (isInternal) {
      return (
        <Link key={key} href={url}>
          {inner}
        </Link>
      );
    }
    return (
      <a
        key={key}
        href={url}
        target={node.fields?.newTab ? '_blank' : undefined}
        rel={node.fields?.newTab ? 'noopener noreferrer' : undefined}
      >
        {inner}
      </a>
    );
  }

  if (type === 'upload') {
    // `value` arrives as a bare id when the doc was fetched at depth 0 (the
    // caller then hydrates via collectUploadIds → opts.mediaById), but Payload
    // populates it into the media doc itself at depth >= 1. Accept both:
    // reading only the number silently rendered nothing on every page that
    // fetches with depth (e.g. /notes/[slug]).
    const populated =
      node.value && typeof node.value === 'object' ? (node.value as MediaDoc) : null;
    const id =
      typeof node.value === 'number'
        ? node.value
        : (populated as { id?: unknown } | null)?.id;
    const media = populated ?? (typeof id === 'number' ? opts.mediaById?.get(id) : null);
    if (!media) return null;
    const url = mediaUrl(media, 'feature') ?? mediaUrl(media);
    if (!url) return null;
    const alt = (typeof media === 'object' && media?.alt) || '';
    // Real dimensions keep the aspect-ratio placeholder honest — a fixed
    // 1200×800 made portrait uploads shift layout when the file loaded.
    const dims =
      (typeof media === 'object' ? mediaDimensions(media, 'feature') : null) ??
      { width: 1200, height: 800 };
    return (
      <figure key={key} style={{ margin: '32px 0' }}>
        <Image
          src={url}
          alt={alt}
          width={dims.width}
          height={dims.height}
          sizes="(max-width: 900px) 100vw, 800px"
          style={{ width: '100%', height: 'auto', display: 'block' }}
        />
      </figure>
    );
  }

  if (type === 'text' && typeof node.text === 'string') {
    return applyTextFormat(node.text, typeof node.format === 'number' ? node.format : 0, key);
  }

  // Unknown type — try to recurse through children, else dump text
  if (node.children) return <>{renderChildren(node.children, key, opts)}</>;
  if (typeof node.text === 'string') return node.text;
  return null;
}

function renderChildren(
  children: LexicalNode[] | undefined,
  parentKey: string,
  opts: RenderOpts,
): ReactNode {
  if (!Array.isArray(children)) return null;
  return children.map((c, i) => renderNode(c, `${parentKey}.${i}`, opts));
}

/** Lexical text format is a bitmask: 1=bold, 2=italic, 4=strikethrough, 8=underline. */
function applyTextFormat(text: string, format: number, key: string): ReactNode {
  // Plain text — return the raw string so CSS like :first-child and
  // white-space: pre-wrap work as expected on the parent.
  if (!format) return text;
  let node: ReactNode = text;
  if (format & 8) node = <u>{node}</u>;
  if (format & 2) node = <em>{node}</em>;
  if (format & 1) node = <strong>{node}</strong>;
  if (format & 4) node = <s>{node}</s>;
  return <span key={key}>{node}</span>;
}

/** Walk richText content looking for upload node `value` ids. */
export function collectUploadIds(content: unknown): number[] {
  const ids = new Set<number>();
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const node = n as LexicalNode;
    if (node.type === 'upload') {
      // Bare id at depth 0; already-populated media doc at depth >= 1 (nothing
      // to fetch in that case, but collect the id so callers stay consistent).
      if (typeof node.value === 'number') ids.add(node.value);
      else if (node.value && typeof node.value === 'object') {
        const inner = (node.value as { id?: unknown }).id;
        if (typeof inner === 'number') ids.add(inner);
      }
    }
    if (Array.isArray(node.children)) node.children.forEach(walk);
    if ('root' in (n as Record<string, unknown>)) {
      walk((n as { root: unknown }).root);
    }
  };
  walk(content);
  return [...ids];
}
