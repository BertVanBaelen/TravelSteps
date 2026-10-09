import path from 'node:path';
import { loadConfig } from './config.js';
import { DB_FILE, openDatabase, renameLegacyDatabase } from './db.js';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const renamed = renameLegacyDatabase(config.dataDir);
  if (renamed instanceof Error) {
    console.warn(`Kon oude database niet hernoemen, start met een nieuwe: ${renamed.message}`);
  }
  const db = openDatabase(path.join(config.dataDir, DB_FILE));
  const app = await buildApp(config, db);

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} ontvangen, afsluiten...`);
    try {
      await app.close();
    } finally {
      db.close();
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`TravelSteps draait op poort ${config.port}, data in ${config.dataDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
