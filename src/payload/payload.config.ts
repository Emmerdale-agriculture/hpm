import path from 'path';
import sharp from 'sharp';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { s3Storage } from '@payloadcms/storage-s3';
import { fileURLToPath } from 'url';

import { env } from '../lib/env';
import { Users } from './collections/users';
import { Pages } from './collections/pages';
import { Posts } from './collections/posts';
import { Services } from './collections/services';
import { Media } from './collections/media';
import { Videos } from './collections/videos';
import { Tools } from './collections/tools';
import { Redirects } from './collections/redirects';
import { Enquiries } from './collections/enquiries';
import { SeoOpportunities } from './collections/seo-opportunities';

import { Homepage } from './globals/homepage';
import { SiteSettings } from './globals/site-settings';
import { PricingPage } from './globals/pricing-page';
import { GscAuth } from './globals/gsc-auth';

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Payload CMS configuration.
 *
 * Database:   Supabase Postgres via node-postgres
 * Storage:    Supabase Storage (S3-compatible API)
 * Auth:       Payload's built-in (Users collection)
 *
 * Env vars expected (see .env.example):
 *   DATABASE_URL
 *   PAYLOAD_SECRET
 *   SUPABASE_S3_ENDPOINT
 *   SUPABASE_S3_REGION
 *   SUPABASE_S3_ACCESS_KEY_ID
 *   SUPABASE_S3_SECRET_ACCESS_KEY
 *   SUPABASE_S3_BUCKET
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' — HPM Admin',
    },
    components: {
      beforeNavLinks: [
        '@/payload/admin/SearchConsoleNavLink#SearchConsoleNavLink',
      ],
    },
  },

  editor: lexicalEditor({}),

  sharp,

  collections: [
    Users,
    Pages,
    Posts,
    Services,
    Media,
    Videos,
    Tools,
    Redirects,
    Enquiries,
    SeoOpportunities,
  ],

  globals: [Homepage, SiteSettings, PricingPage, GscAuth],

  db: postgresAdapter({
    pool: {
      connectionString: env.DATABASE_URL,
    },
  }),

  plugins: [
    s3Storage({
      collections: {
        media: {
          // Store the whole media collection in Supabase Storage
          prefix: 'media',
        },
      },
      bucket: process.env.SUPABASE_S3_BUCKET || 'hpm-media',
      config: {
        endpoint: process.env.SUPABASE_S3_ENDPOINT,
        region: process.env.SUPABASE_S3_REGION || 'eu-west-2',
        credentials: {
          accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY_ID || '',
          secretAccessKey: process.env.SUPABASE_S3_SECRET_ACCESS_KEY || '',
        },
        forcePathStyle: true, // Required for Supabase Storage
      },
    }),
  ],

  secret: env.PAYLOAD_SECRET,

  typescript: {
    outputFile: path.resolve(dirname, '../../payload-types.ts'),
  },

  // Trust the host so Payload builds correct URLs in production
  serverURL: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
});
