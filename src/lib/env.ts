/**
 * Validates the environment variables Payload needs to boot. Importing this
 * module checks `process.env` once so a misconfigured deploy fails fast with a
 * clear, aggregated error — instead of silently starting with an empty
 * `PAYLOAD_SECRET` (insecure JWTs) or a broken `DATABASE_URL` that only fails
 * later with a confusing runtime error.
 *
 * The hard failure is gated to production (`NODE_ENV === 'production'`, i.e. a
 * real server/build) so it doesn't break env-less tooling such as
 * `payload generate:types`, which loads the config but needs no live DB. In
 * non-production it warns and falls back to the previous lenient behaviour.
 *
 * Only the boot-critical secrets are checked. S3/storage vars are intentionally
 * not required here (uploads fail loudly at call time if misconfigured).
 */
const REQUIRED = ['DATABASE_URL', 'PAYLOAD_SECRET'] as const;

const missing = REQUIRED.filter((key) => !process.env[key]);

if (missing.length > 0) {
  const msg =
    `[env] Missing required environment variables: ${missing.join(', ')}. ` +
    `Set them in .env.local (see .env.local.example) or your hosting provider.`;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(msg);
  }
  console.warn(`${msg} (continuing — non-production)`);
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  PAYLOAD_SECRET: process.env.PAYLOAD_SECRET ?? '',
};
