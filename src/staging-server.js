import {createRuntime} from './runtime.js';
import {createApp} from './app.js';
if(process.env.APP_MODE!=='demo'||process.env.LIVE_EXECUTION_ENABLED==='true')throw new Error('Staging requires demo adapters and paid execution disabled.');
const runtime=await createRuntime();
const server=createApp(runtime).listen(runtime.config.port,'0.0.0.0');
server.requestTimeout=240000;
async function stop(){server.close(async()=>{await runtime.close();process.exit(0);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
