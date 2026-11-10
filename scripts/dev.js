import 'dotenv/config';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('../', import.meta.url));

function available(port, label) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', (error) => reject(Object.assign(new Error(error.code === 'EADDRINUSE'
      ? `${label} port ${port} is already in use. The lobby may already be running. Stop its existing terminal with Ctrl+C before starting another copy.`
      : `Cannot use ${label} port ${port}: ${error.code}`), { code: error.code })));
    probe.listen(port, () => probe.close(resolve));
  });
}

try {
  await Promise.all([available(5173, 'Client'), available(Number(process.env.PORT) || 3001, 'API')]);
  const services = ['client', 'server'];
  console.log('Lobby and built-in Assets Builder: http://localhost:5173/');
  const packagePath = require.resolve('concurrently/package.json');
  const metadata = JSON.parse(readFileSync(packagePath, 'utf8'));
  const cli = path.resolve(path.dirname(packagePath), typeof metadata.bin === 'string' ? metadata.bin : metadata.bin.concurrently);
  const child = spawn(process.execPath, [cli, '-k', '-n', services.join(','), ...services.map((name) => `npm:dev:${name}`)], { stdio: 'inherit', cwd: projectRoot });
  child.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
  child.on('exit', (code) => { process.exitCode = code ?? 1; });
} catch (error) {
  console.error(`\n${error.message}\nOpen the existing lobby at http://localhost:5173/ if it is already running.\n`);
  process.exitCode = 1;
}
