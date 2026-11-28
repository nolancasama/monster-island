import * as fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const separator = args.indexOf('--');
if (separator < 0 || !args[separator + 1] || args.slice(0, separator).some(a => a !== '--swiftshader')) {
  console.error('Usage: node tests/support/test-lock.mjs [--swiftshader] -- <command string>');
  process.exit(2);
}
// The first argument is the command string itself. Arguments npm appends after it
// (`npm run e2e -- -g "a test name"`) arrive unquoted, so re-quote any that a shell
// would split or interpret (spaces, |, &, quotes...).
const quoteArg = arg => {
  if (/^[\w@%+=:,./\\-]+$/.test(arg)) return arg;
  return process.platform === 'win32'
    ? `"${arg.replace(/"/g, '\\"')}"`
    : `"${arg.replace(/(["\\$`])/g, '\\$1')}"`;
};
const command = [args[separator + 1], ...args.slice(separator + 2).map(quoteArg)].join(' ');
const projectRoot = process.cwd();
const root = path.resolve(process.env.AGENT_TEST_LOCK_DIR || path.join(process.env.LOCALAPPDATA || os.homedir(), 'agent-test-lock'));
const holderPath = path.join(root, 'holder');
const guardPath = path.join(root, 'guard');
const token = randomUUID();
const queuedAt = Date.now();
const ticketName = `${String(queuedAt).padStart(16, '0')}-${token}.json`;
const ticketPath = path.join(root, 'tickets', ticketName);
const record = { pid: process.pid, projectRoot, command, startedAt: new Date().toISOString(), token };
const staleMs = 120_000;
let acquired = false;
let ticketCreated = false;
let heartbeat;
let child;
let interrupted;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const read = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};
function stale(file) {
  try {
    const age = Date.now() - fs.statSync(file).mtimeMs;
    const data = read(file);
    return age > staleMs || (data !== null && !alive(data.pid));
  } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
function writeRecord(file) { fs.writeFileSync(file, JSON.stringify(record), { flag: 'wx' }); }
// Serialize the short synchronous lock-state mutations too, so competing stale
// cleanups cannot remove a newly acquired holder. No child work runs in this guard.
function guarded(action) {
  try { writeRecord(guardPath); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (stale(guardPath)) {
      // Atomic rename claims the abandoned guard; contenders retry next poll.
      const abandoned = `${guardPath}.${token}.stale`;
      try { fs.renameSync(guardPath, abandoned); fs.unlinkSync(abandoned); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    return { busy: true };
  }
  try { return { value: action() }; } finally { fs.unlinkSync(guardPath); }
}
function removeOwn(file) {
  if (read(file)?.token === token) fs.rmSync(file, { force: true });
}
function cleanup() {
  clearInterval(heartbeat);
  try { if (ticketCreated) removeOwn(ticketPath); if (acquired) removeOwn(holderPath); } catch (error) {
    console.warn(`[test-lock] cleanup warning: ${error.message}`);
  }
}
process.on('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted = signal;
  if (child) child.kill(signal); // Only this wrapper's own child, never another holder.
});
function holderInfo() {
  const holder = read(holderPath);
  return holder ? `${holder.projectRoot}; ${holder.command}; elapsed ${Math.max(0, Math.round((Date.now() - Date.parse(holder.startedAt)) / 1000))} s` : 'holder unavailable';
}
async function acquire() {
  if (process.env.TEST_LOCK_HELD) {
    console.log('[test-lock] nested TEST_LOCK_HELD: using inherited lock');
    return true;
  }
  const cap = Number(process.env.TEST_LOCK_WAIT_MINUTES ?? 30);
  if (!Number.isFinite(cap) || cap < 0) throw new Error('TEST_LOCK_WAIT_MINUTES must be a non-negative number');
  let nextStatus = queuedAt + 60_000;
  try {
    fs.mkdirSync(path.join(root, 'tickets'), { recursive: true });
    writeRecord(ticketPath);
    ticketCreated = true;
    heartbeat = setInterval(() => {
      try {
        const file = acquired ? holderPath : ticketPath;
        if (read(file)?.token === token) fs.utimesSync(file, new Date(), new Date());
      } catch (error) { console.warn(`[test-lock] heartbeat warning: ${error.message}`); }
    }, 10_000);
  } catch (error) {
    // Only an unusable lock directory runs unlocked. Errors once queued retry.
    cleanup();
    console.warn(`TEST_LOCK_UNAVAILABLE: ${root}: ${error.message}; running unlocked`);
    return true;
  }
  let lastRetryWarning = 0;
  while (!interrupted) {
    let attempt = { busy: true };
    try {
      attempt = guarded(() => {
        if (stale(holderPath)) fs.rmSync(holderPath, { force: true });
        for (const name of fs.readdirSync(path.join(root, 'tickets'))) {
          const file = path.join(root, 'tickets', name);
          if (stale(file)) fs.rmSync(file, { force: true });
        }
        const oldest = fs.readdirSync(path.join(root, 'tickets')).sort()[0];
        if (oldest !== ticketName || fs.existsSync(holderPath)) return false;
        writeRecord(holderPath); // Atomic exclusive creation is the acquisition point.
        acquired = true;
        removeOwn(ticketPath);
        return true;
      });
    } catch (error) {
      // Transient Windows file errors (EBUSY/EPERM) while queued: keep waiting, never run unlocked.
      try { removeOwn(guardPath); } catch { /* an own guard left behind goes stale and is reclaimed */ }
      if (acquired) return true;
      if (Date.now() - lastRetryWarning > 60_000) {
        console.warn(`[test-lock] lock state busy (${error.code || error.message}); retrying`);
        lastRetryWarning = Date.now();
      }
    }
    if (attempt.value) return true;
    if (Date.now() - queuedAt >= cap * 60_000) {
      console.error(`TEST_LOCK_TIMEOUT: ${holderInfo()}`);
      cleanup();
      process.exitCode = 75;
      return false;
    }
    if (Date.now() >= nextStatus) {
      console.log(`[test-lock] waiting: ${holderInfo()}`);
      nextStatus = Date.now() + 60_000;
    }
    await sleep(100);
  }
  cleanup();
  process.exitCode = interrupted === 'SIGINT' ? 130 : 143;
  return false;
}
function cpuSnapshot() {
  return os.cpus().reduce((sum, cpu) => {
    sum.idle += cpu.times.idle;
    sum.total += Object.values(cpu.times).reduce((a, b) => a + b, 0);
    return sum;
  }, { idle: 0, total: 0 });
}
function cpuPercent(start, end) {
  const total = end.total - start.total;
  return total > 0 ? Math.max(0, Math.min(100, 100 * (1 - (end.idle - start.idle) / total))) : 0;
}
async function run() {
  if (!await acquire()) return;
  const env = { ...process.env, TEST_LOCK_HELD: '1' };
  if (args.slice(0, separator).includes('--swiftshader')) env.CB_SWIFTSHADER = '1';
  let workers = Math.min(2, Math.max(1, Math.floor(Number(env.PW_WORKERS) || 1)));
  if (workers === 2) {
    const before = cpuSnapshot();
    await sleep(2000);
    const busy = cpuPercent(before, cpuSnapshot());
    if (busy > 30) {
      workers = 1;
      console.log(`[test-lock] machine CPU ${busy.toFixed(1)}% exceeds 30%; using PW_WORKERS=1`);
    }
  }
  if (interrupted) { process.exitCode = interrupted === 'SIGINT' ? 130 : 143; return; }
  env.PW_WORKERS = String(workers);
  const rendererPath = path.join(projectRoot, '.tmp', 'renderer.txt');
  // Remove a prior probe so failed setup cannot inherit another run's renderer.
  fs.rmSync(rendererPath, { force: true });
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const cpu = cpuSnapshot();
  const exitCode = await new Promise(resolve => {
    child = spawn(command, { shell: true, stdio: 'inherit', env });
    child.once('error', error => { console.error(`[test-lock] ${error.message}`); resolve(1); });
    child.once('close', (code, signal) => resolve(code ?? ((signal || interrupted) === 'SIGINT' ? 130 : 143)));
  });
  child = undefined;
  const seconds = Number(((performance.now() - started) / 1000).toFixed(2));
  const avgCpuPercent = Number(cpuPercent(cpu, cpuSnapshot()).toFixed(1));
  let renderer = null;
  try { renderer = fs.readFileSync(rendererPath, 'utf8').trim(); } catch { /* No probe in this command. */ }
  console.log(`[test-lock] ${seconds} s, avg machine CPU ${avgCpuPercent}%, workers ${workers}`);
  try {
    fs.mkdirSync(path.join(projectRoot, '.tmp'), { recursive: true });
    fs.appendFileSync(path.join(projectRoot, '.tmp/test-runs.jsonl'), JSON.stringify({ startedAt, command, seconds, avgCpuPercent, workers, exitCode, renderer }) + '\n');
  } catch (error) { console.warn(`[test-lock] run record warning: ${error.message}`); }
  process.exitCode = exitCode;
}
try { await run(); } catch (error) { console.error(error); process.exitCode = 1; } finally { cleanup(); }
