import { closeDb, db } from './client.js';
import { artistLinks, artists, playbacks, releases, trackLikes, tracks } from './schema.js';

const clearCatalog = async () => {
  await db.transaction(async (tx) => {
    await tx.delete(playbacks);
    await tx.delete(trackLikes);
    await tx.delete(tracks);
    await tx.delete(releases);
    await tx.delete(artistLinks);
    await tx.delete(artists);
  });
};

const main = async () => {
  try {
    await clearCatalog();
  } finally {
    await closeDb();
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'seed failed');
  process.exit(1);
});
