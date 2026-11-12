import { buildApp } from './app.js';
import { closeDb } from './db/client.js';
import { config } from './config.js';

const start = async () => {
  const app = await buildApp();
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await closeDb();
  };
  process.once('SIGINT', () => {
    shutdown('SIGINT').then(() => process.exit(0), () => process.exit(1));
  });
  process.once('SIGTERM', () => {
    shutdown('SIGTERM').then(() => process.exit(0), () => process.exit(1));
  });
  await app.listen({ port: config.port, host: config.host });
};

start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'failed to start');
  closeDb().finally(() => process.exit(1));
});
