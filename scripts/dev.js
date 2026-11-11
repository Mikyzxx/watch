import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const serverProc = spawn(process.execPath, [path.join(rootDir, 'server/index.js')], {
  cwd: rootDir,
  stdio: 'inherit',
  env: { ...process.env, PORT: '3001' },
});

const viteBin = path.join(rootDir, 'node_modules/vite/bin/vite.js');
const viteProc = spawn(process.execPath, [viteBin], {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

function shutdown(code = 0) {
  serverProc.kill();
  viteProc.kill();
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

serverProc.on('exit', (code) => {
  if (code && code !== 0) shutdown(code);
});

viteProc.on('exit', (code) => {
  shutdown(code || 0);
});

