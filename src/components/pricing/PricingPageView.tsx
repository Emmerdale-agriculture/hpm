import Image from 'next/image'

import { Breadcrumb } from '@/components/Breadcrumb'
import { Nav } from '@/components/Nav'
import type { PricingPageData, PricingType } from '@/lib/pricing-types'
import {
  ModelIcon,
  pickModelIcon,
  PinIcon,
  ShieldIcon,
} from './icons'
import styles from './PricingPage.module.css'

type RailPhoto = { url: string; alt: string; id: number | string }

interface PricingPageViewProps {
  data: PricingPageData
  heroUrl?: string | null
  heroAlt?: string
  railPhotos?: RailPhoto[]
}

const badgeClassFor: Record<PricingType, string> = {
  hourly: styles.pricingBadgeHourly,
  perAcre: styles.pricingBadgePerAcre,
  dayRate: styles.pricingBadgeDayRate,
  programme: styles.pricingBadgeProgramme,
}

const badgeLabelFor: Record<PricingType, string> = {
  hourly: 'Hourly',
  perAcre: 'Per acre',
  dayRate: 'Day rate',
  programme: 'Programme',
}

// CMS-supplied; fall back to /contact if an editor pastes something unsafe
// (e.g. `javascript:`). Accepts site-relative paths and common safe schemes.
function safeHref(value: string | null | undefined): string {
  const v = (value ?? '').trim()
  if (!v) return '/contact'
  if (/^(\/|https?:\/\/|mailto:|tel:|#)/i.test(v)) return v
  return '/contact'
}

export function PricingPageView({
  data,
  heroUrl,
  heroAlt = 'Hampshire paddock work',
  railPhotos = [],
}: PricingPageViewProps) {
  const half = Math.ceil(railPhotos.length / 2)
  const leftPhotos = railPhotos.slice(0, half)
  const rightPhotos = railPhotos.slice(half)

  return (
    <>
      <section className={styles.heroPhoto}>
        <Nav variant="overlay" />
        <div className={styles.heroPhotoImage}>
          {heroUrl && (
            <Image
              src={heroUrl}
              alt={heroAlt}
              fill
              priority
              sizes="100vw"
              style={{ objectFit: 'cover' }}
            />
          )}
        </div>
        <div className={styles.heroPhotoGradient} />
        <div className={styles.heroPhotoInner}>
          <Breadcrumb items={[{ label: 'Pricing' }]} />
          <p className={styles.heroPhotoEyebrow}>{data.eyebrow}</p>
          <h1 className={styles.heroPhotoHeading}>{data.heading}</h1>
          <p className={styles.heroPhotoSub}>{data.subheading}</p>
        </div>
      </section>

      <div className={styles.pageWrap}>
        <aside
          className={styles.sideRail}
          aria-label="Photos of Hampshire paddock work"
        >
          {leftPhotos.map((p) => (
            <div key={p.id} className={styles.sideRailItem}>
              <Image
                src={p.url}
                alt={p.alt}
                fill
                sizes="(max-width: 1100px) 0px, 140px"
                quality={60}
                style={{ objectFit: 'cover' }}
              />
            </div>
          ))}
        </aside>

        <article className={styles.page}>
          <blockquote className={styles.introQuote}>{data.introQuote}</blockquote>

      <h2 className={styles.sectionHeading}>{data.modelsHeading}</h2>
      <p className={styles.sectionIntro}>{data.modelsIntro}</p>

      <div className={styles.modelGrid}>
        {(data.pricingModels ?? []).map((model) => (
          <div key={model.id ?? model.title} className={styles.modelCard}>
            <div className={styles.modelCardHeader}>
              <span className={styles.modelIcon} aria-hidden="true">
                <ModelIcon which={pickModelIcon(model.title)} />
              </span>
              <p className={styles.modelTitle}>{model.title}</p>
            </div>
            <p className={styles.modelDescription}>{model.description}</p>
            {model.tagline ? (
              <p className={styles.modelTagline}>{model.tagline}</p>
            ) : null}
          </div>
        ))}
      </div>

      <aside className={styles.travelCallout} role="note">
        <PinIcon className={styles.travelIcon} />
        <div>
          <p className={styles.travelHeading}>{data.travelHeading}</p>
          <p className={styles.travelBody}>{data.travelBody}</p>
        </div>
      </aside>

      <h2 className={styles.sectionHeading}>{data.tableHeading}</h2>

      <div className={styles.serviceTable} role="table" aria-label="Pricing by service">
        <div className={styles.serviceTableHeader} role="row">
          <p className={styles.serviceTableHeaderLabel} role="columnheader">
            Service
          </p>
          <p className={styles.serviceTableHeaderLabelRight} role="columnheader">
            Priced by
          </p>
        </div>
        {(data.serviceRows ?? []).map((row) => (
          <div
            key={row.id ?? row.name}
            className={styles.serviceRow}
            role="row"
          >
            <p className={styles.serviceName} role="cell">
              {row.name}
            </p>
            <span
              className={badgeClassFor[row.pricingType]}
              role="cell"
            >
              {badgeLabelFor[row.pricingType]}
            </span>
          </div>
        ))}
      </div>

      <h2 className={styles.sectionHeading}>{data.factorsHeading}</h2>

      <div className={styles.factorsGrid}>
        {(data.factors ?? []).map((factor) => (
          <div key={factor.id ?? factor.title} className={styles.factorCard}>
            <p className={styles.factorTitle}>{factor.title}</p>
            <p className={styles.factorBody}>{factor.body}</p>
          </div>
        ))}
      </div>

      <h2 className={styles.sectionHeading}>{data.processHeading}</h2>

      <ol className={styles.processList}>
        {(data.processSteps ?? []).map((step, index) => (
          <li key={step.id ?? step.title} className={styles.processStep}>
            <span className={styles.processNumber} aria-hidden="true">
              {String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <p className={styles.processTitle}>{step.title}</p>
              <p className={styles.processBody}>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className={styles.cta} aria-labelledby="cta-heading">
        <h2 id="cta-heading" className={styles.ctaHeading}>
          {data.ctaHeading}
        </h2>
        <p className={styles.ctaSubheading}>{data.ctaSubheading}</p>
        <div className={styles.ctaButtons}>
          <a href={safeHref(data.ctaPrimaryHref)} className={styles.ctaPrimary}>
            {data.ctaPrimaryLabel}
          </a>
          <a
            href={`tel:${data.ctaPhoneNumber}`}
            className={styles.ctaSecondary}
          >
            {data.ctaPhoneLabel}
          </a>
        </div>
      </section>

          <footer className={styles.trust}>
            <span className={styles.trustIcon} aria-hidden="true">
              <ShieldIcon />
            </span>
            <div>
              <p className={styles.trustHeading}>{data.trustHeading}</p>
              <p className={styles.trustBody}>{data.trustBody}</p>
            </div>
          </footer>
        </article>

        <aside className={styles.sideRail} aria-hidden="true">
          {rightPhotos.map((p) => (
            <div key={p.id} className={styles.sideRailItem}>
              <Image
                src={p.url}
                alt={p.alt}
                fill
                sizes="(max-width: 1100px) 0px, 140px"
                quality={60}
                style={{ objectFit: 'cover' }}
              />
            </div>
          ))}
        </aside>
      </div>
    </>
  )
}
