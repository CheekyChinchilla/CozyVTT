/**
 * Settings for the Prisma command-line tools (`prisma generate`, `migrate
 * deploy`, `db push`, `db seed`). The running app does not read this file; it
 * connects through src/config/database.ts.
 *
 * Prisma no longer reads backend/.env by itself, so dotenv does it here. The
 * addresses come from process.env directly: Prisma's own env() helper throws
 * when a variable is unset, and `prisma generate` runs in the image build,
 * where no DATABASE_URL is set and none is needed.
 */
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
    // Only `prisma migrate diff` and `migrate dev` use it; see
    // backend/DATABASE_MIGRATIONS.md.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
