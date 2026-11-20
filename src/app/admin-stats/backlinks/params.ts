import type { LinkSettings } from '@/app/api/cheatcode/lib/link-targets';

/** Form/URL field names → LinkSettings (unparseable values fall back later). */
function num(v: unknown): number | undefined {
  if (typeof v !== 'string' || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseCampaignForm(
  src: FormData | Record<string, string | string[] | undefined>,
): Partial<LinkSettings> {
  const get = (k: string) => {
    const v = src instanceof FormData ? src.get(k) : src[k];
    return Array.isArray(v) ? v[0] : (v ?? undefined);
  };
  return {
    linksPerMonth: num(get('links')),
    daMin: num(get('daMin')),
    daMax: num(get('daMax')),
    maxLinkPages: num(get('pages')),
  };
}
