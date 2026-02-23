import type { Config } from 'drizzle-kit';

export default {
  schema: './app/db/schema/index.ts',
  out: './app/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env.PGHOST!,
    database: process.env.PGDATABASE!,
    user: process.env.PGUSER!,
    password: process.env.PGPASSWORD!,
    port: 5432,
    ssl: 'require',
  },
  tablesFilter: ['!spatial_ref_sys', '!__drizzle_migrations'],
} satisfies Config;
