import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { checkServerIdentity } from './server-identity.ts';

const wrapper = fileURLToPath(new URL('./test-lock.mjs', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(condition, description) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await delay(20);
  }
  throw new Error(`HARNESS_PRECONDITION_FAILED: ${description}`);
}
const exists = async file => { try { await fs.access(file); return true; } catch { return false; } };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-kit-'));
  const runs = [];
  t.after(async () => {
    await fs.writeFile(path.join(root, 'release'), 'cleanup');
    await Promise.all(runs);
    await fs.rm(root, { recursive: true, force: true });
  });
  const lock = path.join(root, 'lock');
  let count = 0;
  async function launch(source, overrides = {}) {
    const script = path.join(root, `child-${count++}.mjs`);
    await fs.writeFile(script, source);
    const env = { ...process.env, AGENT_TEST_LOCK_DIR: lock, PW_WORKERS: '1', ...overrides };
    // Isolate tests from an inherited outer wrapper/external server profile.
    if (!Object.hasOwn(overrides, 'TEST_LOCK_HELD')) delete env.TEST_LOCK_HELD;
    const proc = spawn(process.execPath, [wrapper, '--', `"${process.execPath}" "${script}"`], { cwd: root, env });
    let output = '';
    proc.stdout.on('data', data => { output += data; });
    proc.stderr.on('data', data => { output += data; });
    const done = new Promise((resolve, reject) => {
      proc.once('error', reject);
      proc.once('close', code => resolve({ code, output }));
    });
    runs.push(done);
    return { done, proc };
  }
  return { root, lock, launch };
}
const gated = (marker, release, exit = 0) => `
  import { writeFile, access } from 'node:fs/promises';
  await writeFile(${JSON.stringify(marker)}, 'started');
  while (true) {
    try { await access(${JSON.stringify(release)}); break; } catch {}
    await new Promise(r => setTimeout(r, 20));
  }
  await writeFile(${JSON.stringify(marker + '.ended')}, 'ended');
  process.exitCode = ${exit};
`;

test('concurrent runs serialize and append run records', async t => {
  const { root, lock, launch } = await fixture(t);
  const marker = path.join(root, 'first');
  const release = path.join(root, 'release');
  const first = await launch(gated(marker, release));
  await waitFor(() => exists(marker), 'first child running with the lock');
  const second = await launch(`import { access } from 'node:fs/promises'; await access(${JSON.stringify(marker + '.ended')}); console.log('SECOND_STARTED_AFTER_FIRST_ENDED');`);
  await waitFor(async () => (await fs.readdir(path.join(lock, 'tickets'))).length === 1, 'second wrapper queued');
  await fs.writeFile(release, 'go');
  assert.equal((await first.done).code, 0);
  const result = await second.done;
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /SECOND_STARTED_AFTER_FIRST_ENDED/);
  assert.match(result.output, /\[test-lock\] .*avg machine CPU .*workers 1/);
  const records = (await fs.readFile(path.join(root, '.tmp/test-runs.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(records.length, 2);
  assert.equal(records[0].exitCode, 0);
  assert.equal(records[0].renderer, null);
  assert.equal(typeof records[0].avgCpuPercent, 'number');
});

test('dead holder and stale tickets are cleared', async t => {
  const { lock, launch } = await fixture(t);
  const dead = spawn(process.execPath, ['-e', '']);
  await new Promise(resolve => dead.once('close', resolve));
  await fs.mkdir(path.join(lock, 'tickets'), { recursive: true });
  const record = JSON.stringify({ pid: dead.pid, projectRoot: 'dead project', command: 'dead', startedAt: new Date().toISOString() });
  await fs.writeFile(path.join(lock, 'holder'), record);
  await fs.writeFile(path.join(lock, 'tickets', '000-dead.json'), record);
  const result = await (await launch('console.log("CLEARED")')).done;
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /CLEARED/);
  assert.equal(await exists(path.join(lock, 'holder')), false);
  assert.deepEqual(await fs.readdir(path.join(lock, 'tickets')), []);
});

test('wait cap exits 75 without interrupting holder or changing its exit code', async t => {
  const { root, launch } = await fixture(t);
  const marker = path.join(root, 'holder-running');
  const release = path.join(root, 'release');
  const holder = await launch(gated(marker, release, 23));
  await waitFor(() => exists(marker), 'holder command running before waiter');
  const waiter = await launch('throw new Error("waiter must never start")', { TEST_LOCK_WAIT_MINUTES: '0.003' });
  const result = await waiter.done;
  assert.equal(result.code, 75, result.output);
  assert.match(result.output, /TEST_LOCK_TIMEOUT:.*child-0/);
  assert.equal(await exists(marker + '.ended'), false, 'holder still waiting on its own release');
  await fs.writeFile(release, 'go');
  assert.equal((await holder.done).code, 23);
  assert.equal(await exists(marker + '.ended'), true);
});

test('nested calls skip acquisition even with a live holder', async t => {
  const { lock, launch } = await fixture(t);
  await fs.mkdir(lock, { recursive: true });
  const record = JSON.stringify({ pid: process.pid, token: 'parent', startedAt: new Date().toISOString() });
  await fs.writeFile(path.join(lock, 'holder'), record);
  const result = await (await launch('console.log(process.env.TEST_LOCK_HELD)', { TEST_LOCK_HELD: '1' })).done;
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /nested TEST_LOCK_HELD/);
  assert.equal(await fs.readFile(path.join(lock, 'holder'), 'utf8'), record);
});

test('arguments appended after the command keep spaces and shell characters', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-kit-args-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'argv.mjs');
  await fs.writeFile(script, 'console.log("ARGV=" + JSON.stringify(process.argv.slice(2)));');
  const extra = ['plain/file.spec.ts:7', 'contradicting answers|permission denied', 'say "hi" & go'];
  const proc = spawn(process.execPath, [wrapper, '--', `"${process.execPath}" "${script}"`, ...extra],
    { cwd: root, env: { ...process.env, TEST_LOCK_HELD: '1' } });
  let output = '';
  proc.stdout.on('data', data => { output += data; });
  proc.stderr.on('data', data => { output += data; });
  const code = await new Promise(resolve => proc.once('close', resolve));
  assert.equal(code, 0, output);
  const line = output.split(/\r?\n/).find(l => l.startsWith('ARGV='));
  assert.ok(line, output);
  assert.deepEqual(JSON.parse(line.slice(5)), extra);
});

test('unwritable lock directory warns and runs unlocked', async t => {
  const { root, launch } = await fixture(t);
  const blocked = path.join(root, 'file-not-directory');
  await fs.writeFile(blocked, 'blocks mkdir, including on Windows/admin accounts');
  const result = await (await launch('console.log("UNLOCKED_CHILD")', { AGENT_TEST_LOCK_DIR: blocked })).done;
  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /TEST_LOCK_UNAVAILABLE/);
  assert.match(result.output, /UNLOCKED_CHILD/);
});

test('heartbeat older than 120 s is stale even with a live pid', async t => {
  const { lock, launch } = await fixture(t);
  await fs.mkdir(lock, { recursive: true });
  const holder = path.join(lock, 'holder');
  await fs.writeFile(holder, JSON.stringify({ pid: process.pid }));
  const old = new Date(Date.now() - 121_000);
  await fs.utimes(holder, old, old);
  assert.equal((await (await launch('')).done).code, 0);
});

test('server identity accepts normalised matching HTML and rejects wrong or missing build', async t => {
  const { root } = await fixture(t);
  const previous = process.env.BASE_URL;
  delete process.env.BASE_URL;
  t.after(() => { if (previous === undefined) delete process.env.BASE_URL; else process.env.BASE_URL = previous; });
  await fs.mkdir(path.join(root, 'dist'));
  await fs.writeFile(path.join(root, 'dist/index.html'), '<html>  \r\n  same\r\n</html>\r\n');
  let html = '<html>\n  same\n</html>\n';
  const server = createServer((_req, res) => res.end(html));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  await checkServerIdentity(url, root);
  html = '<html>different project</html>';
  await assert.rejects(checkServerIdentity(url, root), { message: new RegExp(`^WRONG_SERVER: port ${port}.*differs`) });
  await fs.rm(path.join(root, 'dist/index.html'));
  await assert.rejects(checkServerIdentity(url, root), /^Error: WRONG_SERVER:.*missing/);
});
