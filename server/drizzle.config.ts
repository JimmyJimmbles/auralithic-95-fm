import { defineConfig } from 'drizzle-kit';

// Local Docker default only. Production passes DATABASE_URL in the environment.
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://auralithic:auralithic@localhost:5432/auralithic';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
});
