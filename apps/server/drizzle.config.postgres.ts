import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/postgres/schema.ts',
  out: './migrations/postgres',
  strict: true,
  verbose: true,
});
