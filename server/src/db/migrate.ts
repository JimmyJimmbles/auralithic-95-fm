import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../config.js';

const main = async () => {
  const connection = postgres(config.databaseUrl, { max: 1, connect_timeout: 5 });
  try {
    await migrate(drizzle(connection), {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
  } finally {
    await connection.end({ timeout: 5 });
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'migration failed');
  process.exit(1);
});
