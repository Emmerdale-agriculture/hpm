import fs from 'node:fs/promises';
import path from 'node:path';
import { marked } from 'marked';
import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import { Footer } from '@/components/Footer';
import styles from './privacy.module.css';

export const metadata: Metadata = {
  // Bare title — the layout template appends " | Hampshire Paddock Management".
  title: 'Privacy Policy',
  description:
    'How Hampshire Paddock Management (Emmerdale Agriculture Ltd) handles personal information under UK GDPR.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

export default async function PrivacyPage() {
  const mdPath = path.join(process.cwd(), 'docs', 'content', 'privacy-policy.md');
  const source = await fs.readFile(mdPath, 'utf-8');
  const html = marked.parse(source, { async: false }) as string;

  return (
    <>
      <Nav variant="solid" />
      <main className={styles.page}>
        <article className={styles.article} dangerouslySetInnerHTML={{ __html: html }} />
      </main>
      <Footer />
    </>
  );
}
