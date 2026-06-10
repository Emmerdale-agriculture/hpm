'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { NoteCard } from './types';
import styles from './notes.module.css';

type Props = {
  posts: NoteCard[];
  /** Tag slugs to render chips for, in the order the user picked. */
  tagOptions: Array<{ slug: string; label: string }>;
};

const PAGE_SIZE = 12;
const ALL = 'all';

function formatMonth(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function NotesClient({ posts, tagOptions }: Props) {
  const params = useSearchParams();
  const initial = params.get('tag') ?? ALL;

  const [activeTag, setActiveTag] = useState<string>(initial);
  const [shownCount, setShownCount] = useState<number>(PAGE_SIZE);

  // Mirror the active tag into the URL via replaceState (no Next nav).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (activeTag === ALL) url.searchParams.delete('tag');
    else url.searchParams.set('tag', activeTag);
    window.history.replaceState(null, '', url.toString());
  }, [activeTag]);

  // Keep state in sync if the URL changes externally
  useEffect(() => {
    setActiveTag(params.get('tag') ?? ALL);
  }, [params]);

  const filtered = useMemo(() => {
    if (activeTag === ALL) return posts;
    return posts.filter((p) => p.tags.includes(activeTag));
  }, [posts, activeTag]);

  const visible = filtered.slice(0, shownCount);
  const hasMore = filtered.length > shownCount;

  function selectTag(t: string) {
    setActiveTag(t);
    setShownCount(PAGE_SIZE);
  }

  return (
    <>
      {/* Sticky tag filter */}
      <div className={styles.filterBar}>
        <div className={styles.filterInner}>
          <span className={styles.filterLabel}>Browse by topic</span>
          <div className={styles.filterChips}>
            <button
              type="button"
              className={`${styles.chip} ${activeTag === ALL ? styles.chipActive : ''}`}
              onClick={() => selectTag(ALL)}
            >
              All notes
            </button>
            {tagOptions.map((t) => (
              <button
                key={t.slug}
                type="button"
                className={`${styles.chip} ${activeTag === t.slug ? styles.chipActive : ''}`}
                onClick={() => selectTag(t.slug)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className={styles.countPill}>
            {filtered.length} {filtered.length === 1 ? 'post' : 'posts'}
          </span>
        </div>
      </div>

      {/* Grid */}
      <section className={styles.postsWrap}>
        {filtered.length === 0 ? (
          <div className={styles.empty}>No posts under this topic yet. Try another.</div>
        ) : (
          <>
            <div className={styles.postsGrid}>
              {visible.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            {hasMore && (
              <div className={styles.loadMoreWrap}>
                <button
                  type="button"
                  className={styles.loadMore}
                  onClick={() => setShownCount((c) => c + PAGE_SIZE)}
                >
                  Load more →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

function PostCard({ post }: { post: NoteCard }) {
  return (
    <Link href={`/notes/${post.slug}`} className={styles.postCard}>
      {post.hero?.url && (
        <div className={styles.postPhotoWrap}>
          <Image
            src={post.hero.url}
            alt={post.hero.alt}
            width={post.hero.width ?? 800}
            height={post.hero.height ?? 500}
            sizes="(max-width: 768px) 100vw, (max-width: 1100px) 50vw, 33vw"
            quality={60}
            className={styles.postPhoto}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
      <div className={styles.postMeta}>
        {post.primaryTag && <span className={styles.tagPill}>{post.primaryTag}</span>}
        {post.publishedAt && <span>·</span>}
        {post.publishedAt && <span>{formatMonth(post.publishedAt)}</span>}
      </div>
      <h3 className={styles.postTitle}>{post.title}</h3>
      {post.excerpt && <p className={styles.postExcerpt}>{post.excerpt}</p>}
    </Link>
  );
}
