import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';

export const sql = postgres(config.databaseUrl, {
  max: 10,
  connect_timeout: 5,
  idle_timeout: 20,
  connection: { application_name: 'auralithic' },
});

export const db = drizzle(sql);

export const closeDb = async () => {
  await sql.end({ timeout: 5 });
};
