'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './contact.module.css';

const SERVICE_GROUPS: Array<{ label: string; options: Array<{ slug: string; title: string }> }> = [
  {
    label: 'Cutting & mowing',
    options: [
      { slug: 'paddock-topping', title: 'Paddock topping' },
      { slug: 'flailing', title: 'Flailing' },
      { slug: 'flail-collecting', title: 'Flail collecting' },
      { slug: 'finish-mowing', title: 'Finish mowing' },
    ],
  },
  {
    label: 'Ground care',
    options: [
      { slug: 'harrowing', title: 'Harrowing' },
      { slug: 'rolling', title: 'Rolling' },
      { slug: 'rotavating', title: 'Rotavating' },
      { slug: 'mole-ploughing', title: 'Mole ploughing' },
      { slug: 'stone-burying', title: 'Stone burying' },
      { slug: 'land-ditch-clearance', title: 'Land & ditch clearance' },
    ],
  },
  {
    label: 'Treatment & upkeep',
    options: [
      { slug: 'weed-control', title: 'Weed control' },
      { slug: 'spraying', title: 'Spraying' },
      { slug: 'fertiliser-application', title: 'Fertiliser application' },
      { slug: 'overseeding', title: 'Overseeding' },
      { slug: 'manure-sweeping', title: 'Manure sweeping' },
    ],
  },
];

const REQUIRED_FIELDS = ['name', 'phone', 'location'] as const;
type RequiredField = (typeof REQUIRED_FIELDS)[number];

const ERROR_COPY: Record<RequiredField, string> = {
  name: "Please give me a name to put on the reply.",
  phone: "A phone number works best — I'll usually call back.",
  location: "Even a rough area helps — village name is fine.",
};

type Status = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Report a successful enquiry to GA4 as `generate_lead` (GA4's recommended
 * lead event, already marked as a key event). Fired only after /api/contact
 * accepts the form — not on page view. gtag loads lazyOnload, so if it isn't
 * defined yet the call is queued on dataLayer in gtag's own format and sent
 * when the script arrives. No-op in dev (GA isn't loaded there either).
 */
function trackLead(service: string) {
  if (process.env.NODE_ENV !== 'production') return;
  const w = window as unknown as { gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };
  const params = { form: 'contact', service: service || 'unspecified' };
  if (typeof w.gtag === 'function') {
    w.gtag('event', 'generate_lead', params);
  } else {
    w.dataLayer = w.dataLayer || [];
    // gtag() pushes its `arguments` object; mirror that shape.
    const queue = function (this: unknown) {
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    } as (...a: unknown[]) => void;
    queue('event', 'generate_lead', params);
  }
}

export function ContactForm() {
  const params = useSearchParams();
  const preselected = params.get('service') ?? '';
  // /paddock-maintenance's contract CTA links here with ?subject=contract.
  // We forward it to the API so the Resend email subject is flagged
  // distinctly in Tom's inbox without putting words in the customer's mouth.
  const enquirySubject = params.get('subject') ?? '';

  const [service, setService] = useState(preselected);
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Partial<Record<RequiredField, true>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // If the user lands with one preselect and then changes via the dropdown,
  // they'd lose the preselect on reset. Keep the URL param as the canonical
  // "what to restore to".
  useEffect(() => {
    setService(preselected);
  }, [preselected]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const data = new FormData(formEl);

    const fieldErrs: Partial<Record<RequiredField, true>> = {};
    for (const f of REQUIRED_FIELDS) {
      const v = String(data.get(f) ?? '').trim();
      if (!v) fieldErrs[f] = true;
    }
    if (Object.keys(fieldErrs).length > 0) {
      setErrors(fieldErrs);
      setFormError(null);
      // Focus first errored field
      const first = REQUIRED_FIELDS.find((f) => fieldErrs[f]);
      if (first) (formEl.elements.namedItem(first) as HTMLElement | null)?.focus();
      return;
    }

    setErrors({});
    setFormError(null);
    setStatus('submitting');

    const payload = {
      name: String(data.get('name') ?? ''),
      phone: String(data.get('phone') ?? ''),
      email: String(data.get('email') ?? ''),
      location: String(data.get('location') ?? ''),
      service: String(data.get('service') ?? ''),
      message: String(data.get('message') ?? ''),
      enquirySubject,
      website: String(data.get('website') ?? ''), // honeypot
    };

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setFormError(
          j.error ||
            "Sorry — I couldn't send that. Please try again or call 07825 156062.",
        );
        setStatus('error');
        return;
      }
      setStatus('success');
      trackLead(payload.service);
      formEl.reset();
      setService(preselected);
    } catch {
      setFormError(
        "Sorry — network error. Please try again or call 07825 156062.",
      );
      setStatus('error');
    }
  }

  function reset() {
    setStatus('idle');
    setErrors({});
    setFormError(null);
    setService(preselected);
  }

  if (status === 'success') {
    return (
      <div className={styles.success} role="status" aria-live="polite">
        <div className={styles.successIcon}>✓</div>
        <h3 className={styles.successTitle}>Got it — thanks.</h3>
        <p className={styles.successBody}>
          I&rsquo;ll be in touch on the number you&rsquo;ve given me — usually within hours.
        </p>
        <button type="button" className={styles.successReset} onClick={reset}>
          Send another →
        </button>
      </div>
    );
  }

  const fieldClass = (f: RequiredField) =>
    `${styles.input} ${errors[f] ? styles.errorInput : ''}`.trim();

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      {/* Honeypot — visually hidden but reachable to bots */}
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Leave this blank
          <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div className={styles.fieldRow}>
        <div className={styles.field}>
          <label htmlFor="cf-name" className={styles.label}>
            Name <span className={styles.req}>*</span>
          </label>
          <input
            id="cf-name"
            name="name"
            type="text"
            autoComplete="name"
            className={fieldClass('name')}
          />
          {errors.name && <div className={styles.fieldError}>{ERROR_COPY.name}</div>}
        </div>
        <div className={styles.field}>
          <label htmlFor="cf-phone" className={styles.label}>
            Phone <span className={styles.req}>*</span>
          </label>
          <input
            id="cf-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            className={fieldClass('phone')}
          />
          {errors.phone && <div className={styles.fieldError}>{ERROR_COPY.phone}</div>}
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="cf-email" className={styles.label}>
          Email <span className={styles.opt}>(optional)</span>
        </label>
        <input
          id="cf-email"
          name="email"
          type="email"
          autoComplete="email"
          className={styles.input}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="cf-location" className={styles.label}>
          Paddock location <span className={styles.req}>*</span>
        </label>
        <input
          id="cf-location"
          name="location"
          type="text"
          placeholder="Nearest village or postcode"
          className={fieldClass('location')}
        />
        <div className={styles.fieldHint}>Helps me work out travel before I quote.</div>
        {errors.location && <div className={styles.fieldError}>{ERROR_COPY.location}</div>}
      </div>

      <div className={styles.field}>
        <label htmlFor="cf-service" className={styles.label}>
          Service
        </label>
        <select
          id="cf-service"
          name="service"
          className={styles.select}
          value={service}
          onChange={(e) => setService(e.target.value)}
        >
          <option value="">Not sure yet — I&rsquo;ll explain when we talk</option>
          {SERVICE_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="cf-message" className={styles.label}>
          Anything I should know? <span className={styles.opt}>(optional)</span>
        </label>
        <textarea
          id="cf-message"
          name="message"
          placeholder="Size, condition, timing, access — whatever&rsquo;s on your mind."
          className={styles.textarea}
        />
      </div>

      <div className={styles.submitRow}>
        <button type="submit" className={styles.submitBtn} disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Sending…' : 'Send enquiry →'}
        </button>
        <span className={styles.submitMeta}>Usually replies within hours</span>
      </div>
      {formError && <div className={styles.formError}>{formError}</div>}
    </form>
  );
}
