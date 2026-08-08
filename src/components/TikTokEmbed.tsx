'use client';

import { useEffect } from 'react';
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
 * TikTok's official blockquote embed. embed.js only scans the DOM when it
 * first loads, so append a fresh script element on every mount — that makes
 * the blockquote upgrade after client-side navigation too, and the links
 * inside the blockquote remain a working fallback if the script is blocked.
 */
export function TikTokEmbed({ videoId, username, caption }: Props) {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = EMBED_SRC;
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  return (
    <blockquote
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
