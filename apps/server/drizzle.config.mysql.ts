import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/mysql/schema.ts',
  out: './migrations/mysql',
  strict: true,
  verbose: true,
});
