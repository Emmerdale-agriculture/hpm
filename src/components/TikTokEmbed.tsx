'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './TikTokEmbed.module.css';

const EMBED_SRC = 'https://www.tiktok.com/embed.js';

type Props = {
  /** Numeric video id from the TikTok URL. */
  videoId: string;
  /** Account handle without the @. */
  username: string;
  /** Video caption — shown as the fallback text until the player loads. */
  caption: string;
};

/**
 * TikTok's official blockquote embed, lazy-loaded. The player iframe pulls
 * 1–2 MB of third-party JS/media, so embed.js is only injected once the
 * blockquote approaches the viewport — visitors who never scroll to the
 * video never pay for it. The links inside the blockquote remain a working
 * fallback if the script is blocked.
 */
export function TikTokEmbed({ videoId, username, caption }: Props) {
  const ref = useRef<HTMLQuoteElement>(null);
  const [nearViewport, setNearViewport] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // No IntersectionObserver (very old browsers) → just load.
    if (typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNearViewport(true);
          io.disconnect();
        }
      },
      // Start loading a screen early so the player is usually ready on arrival.
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    // embed.js only scans the DOM when it loads, so append a fresh script
    // element — that also makes the blockquote upgrade after client-side
    // navigation.
    const script = document.createElement('script');
    script.src = EMBED_SRC;
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [nearViewport]);

  return (
    <blockquote
      ref={ref}
      className={`tiktok-embed ${styles.embed}`}
      cite={`https://www.tiktok.com/@${username}/video/${videoId}`}
      data-video-id={videoId}
    >
      <section>
        <a
          target="_blank"
          rel="noreferrer"
          title={`@${username}`}
          href={`https://www.tiktok.com/@${username}?refer=embed`}
        >
          @{username}
        </a>
        <p>{caption}</p>
      </section>
    </blockquote>
  );
}
