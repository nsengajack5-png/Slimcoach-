import { loadConfig } from './lib/config.js';
import { createApp } from './lib/app.js';

const config = loadConfig(process.env);
const app = await createApp(config, console);

app.server.listen(config.port, config.host, () => {
  console.log(`SlimCoach démarré sur http://${config.host}:${config.port}`);
});

const stop = async (signal) => {
  console.log(`Arrêt requested (${signal})`);
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
