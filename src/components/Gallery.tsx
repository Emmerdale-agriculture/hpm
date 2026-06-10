'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { mediaUrl } from '@/lib/media';
import styles from './Gallery.module.css';

type GalleryPhoto = {
  id: string | number;
  alt?: string | null;
  filename?: string | null;
  width?: number | null;
  height?: number | null;
  sizes?: Parameters<typeof mediaUrl>[0] extends infer T ? (T extends { sizes?: infer S } ? S : unknown) : unknown;
};

type Props = {
  photos: Array<Parameters<typeof mediaUrl>[0]>;
};

export function Gallery({ photos }: Props) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const backdropRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const navigate = useCallback(
    (direction: -1 | 1) => {
      setIndex((i) => (i + direction + photos.length) % photos.length);
    },
    [photos.length],
  );

  useEffect(() => {
    if (!open) return;
    // Lock background scroll while lightbox is open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Safety net: if the component unmounts with the lightbox still open
  // (client-side navigation mid-view), unconditionally restore scroll.
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Move focus into the dialog on open; restore to the trigger on close.
  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = document.activeElement as HTMLElement | null;
    backdropRef.current?.focus();
    return () => {
      prevFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') navigate(-1);
      else if (e.key === 'ArrowRight') navigate(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close, navigate]);

  // Focus trap: keep Tab/Shift+Tab inside the dialog buttons
  const onDialogKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !backdropRef.current) return;
    const focusables = backdropRef.current.querySelectorAll<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }, []);

  const current = photos[index];
  const lightboxUrl = current ? mediaUrl(current, 'hero') ?? mediaUrl(current) : null;
  const lightboxAlt =
    (current && typeof current === 'object' && current?.alt) || '';

  return (
    <>
      <div className={styles.masonry}>
        {photos.map((photo, i) => {
          const url = mediaUrl(photo, 'card') ?? mediaUrl(photo);
          if (!url) return null;
          const p = photo as GalleryPhoto;
          const w = Number(p.width) || 800;
          const h = Number(p.height) || 600;
          const alt = p.alt || '';
          return (
            <button
              key={String(p.id)}
              className={styles.tile}
              type="button"
              onClick={() => {
                setIndex(i);
                setOpen(true);
              }}
              aria-label={`View photo ${i + 1}${alt ? ` — ${alt}` : ''}`}
            >
              {/* Image is decorative inside the button — the button's
                  aria-label carries the description so AT isn't double-told. */}
              <Image
                src={url}
                alt=""
                aria-hidden="true"
                width={w}
                height={h}
                sizes="(max-width: 768px) 50vw, (max-width: 1100px) 33vw, 25vw"
                quality={60}
                loading="lazy"
              />
            </button>
          );
        })}
      </div>

      {open && lightboxUrl && (
        <div
          className={styles.lightbox}
          ref={backdropRef}
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
          tabIndex={-1}
          onKeyDown={onDialogKeyDown}
          onClick={(e) => {
            if (e.target === backdropRef.current) close();
          }}
        >
          <button
            className={`${styles.btn} ${styles.close}`}
            onClick={close}
            aria-label="Close"
            type="button"
          >
            ×
          </button>
          <button
            className={`${styles.btn} ${styles.nav} ${styles.prev}`}
            onClick={(e) => { e.stopPropagation(); navigate(-1); }}
            aria-label="Previous image"
            type="button"
          >
            ‹
          </button>
          <button
            className={`${styles.btn} ${styles.nav} ${styles.next}`}
            onClick={(e) => { e.stopPropagation(); navigate(1); }}
            aria-label="Next image"
            type="button"
          >
            ›
          </button>
          {/* Native <img> for the full-size view — next/image optimisation
              isn't a win here (one image at a time, already a sized variant). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxUrl} alt={lightboxAlt} className={styles.lightboxImg} />
          <div className={styles.counter}>
            {index + 1} / {photos.length}
          </div>
        </div>
      )}
    </>
  );
}
