import { createRuntime } from './runtime.js';
import { createApp } from './app.js';
const runtime = await createRuntime();
const app = createApp(runtime);
const server = app.listen(
  runtime.config.port,
  runtime.config.production ? '0.0.0.0' : '127.0.0.1',
  () =>
    console.log(
      `AdPilot API ready at http://localhost:${runtime.config.port} (${runtime.config.mode})`,
    ),
);
server.requestTimeout = 240000;
async function stop() {
  server.close(async () => {
    await runtime.close();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
