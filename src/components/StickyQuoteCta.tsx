'use client';

import { useActionState, useEffect, useState } from 'react';
import { submitQuote, type QuoteState } from '@/app/actions/quote';
import styles from './StickyQuoteCta.module.css';

type Props = {
  serviceSlug: string;
  serviceTitle: string;
};

const initialState: QuoteState = { ok: false, message: '' };

export function StickyQuoteCta({ serviceSlug, serviceTitle }: Props) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(submitQuote, initialState);

  // Reveal once the user has scrolled past ~80% of the hero. The hero is
  // always the first <section>, which matches what ServiceHero renders.
  useEffect(() => {
    const hero = document.querySelector('section');
    if (!hero) {
      setVisible(true);
      return;
    }
    // Measure the hero once; the threshold doesn't change as you scroll.
    const threshold = hero.getBoundingClientRect().height * 0.8;
    const onScroll = () => {
      if (window.scrollY > threshold) {
        setVisible(true);
        // Once revealed there's nothing left to watch — stop listening so we
        // aren't running a handler on every scroll tick for the whole page.
        window.removeEventListener('scroll', onScroll);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close the form automatically once the action succeeds
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state.ok]);

  const label = `Quote for ${serviceTitle.toLowerCase()}`;

  return (
    <div className={`${styles.wrap} ${visible ? '' : styles.hidden}`} aria-live="polite">
      {!open && (
        <button type="button" className={styles.fab} onClick={() => setOpen(true)}>
          {label}
        </button>
      )}
      {open && (
        <div className={`${styles.form} ${styles.open}`} role="dialog" aria-label={label}>
          <div className={styles.head}>
            <div>
              <div className={styles.title}>{label}</div>
              <div className={styles.titleSub}>Usually replies within hours, day or night.</div>
            </div>
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {state.ok ? (
            <div className={styles.success}>{state.message}</div>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="serviceSlug" value={serviceSlug} />
              <input type="hidden" name="serviceTitle" value={serviceTitle} />
              {/* Honeypot */}
              <div className={styles.trap} aria-hidden="true">
                <label>
                  Leave this blank
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    defaultValue=""
                  />
                </label>
              </div>

              <label htmlFor="qf-name">Name</label>
              <input id="qf-name" name="name" type="text" required />
              <label htmlFor="qf-phone">Phone</label>
              <input id="qf-phone" name="phone" type="tel" required />
              <label htmlFor="qf-email">Email (optional)</label>
              <input id="qf-email" name="email" type="email" autoComplete="email" />
              <label htmlFor="qf-location">Paddock location (nearest village)</label>
              <input id="qf-location" name="location" type="text" required />
              <label htmlFor="qf-message">Anything we should know?</label>
              <textarea
                id="qf-message"
                name="message"
                placeholder="Size, condition, when you'd like it done..."
              />
              <button type="submit" className={styles.submit} disabled={isPending}>
                {isPending ? 'Sending…' : 'Send quote request →'}
              </button>
              {state.message && !state.ok && (
                <div className={styles.error}>{state.message}</div>
              )}
              <div className={styles.footnote}>
                Usually back within hours — day or night.
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
