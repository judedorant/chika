const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepare } = require('../prepare-local.cjs');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rchat-local-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ['.env.example', 'backend/.env.example', 'mobile/.env.example']) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '../..', file), path.join(root, file));
  }
  return root;
}
const read = (root, file) => fs.readFileSync(path.join(root, file), 'utf8');
test('first setup generates distinct secrets and reruns preserve every byte', t => {
  const root = fixture(t);
  prepare(root);
  const files = ['.env', 'backend/.env', 'mobile/.env'];
  const before = files.map(file => read(root, file));
  const password = before[0].match(/^RCHAT_DB_PASSWORD=(.+)$/m)[1];
  const rootPassword = before[0].match(/^RCHAT_DB_ROOT_PASSWORD=(.+)$/m)[1];
  assert.match(password, /^[a-f0-9]{64}$/);
  assert.notEqual(password, rootPassword);
  assert.ok(before[1].includes('DB_PASSWORD=' + password));
  assert.match(before[1], /^APP_KEY=base64:[A-Za-z0-9+/]{43}=$/m);
  assert.match(before[1], /^APP_URL=http:\/\/10\.0\.2\.2:8000$/m);
  prepare(root);
  assert.deepEqual(files.map(file => read(root, file)), before);
});
test('production configuration is rejected without creating files', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'backend/.env'), read(root, 'backend/.env.example').replace('APP_ENV=local', 'APP_ENV=production'));
  assert.throws(() => prepare(root), /non-local/);
  assert.equal(fs.existsSync(path.join(root, '.env')), false);
});
test('conflicting existing passwords are rejected without modifying existing files', t => {
  const root = fixture(t);
  prepare(root);
  const target = path.join(root, 'backend/.env');
  fs.writeFileSync(target, read(root, 'backend/.env').replace(/^DB_PASSWORD=.*$/m, 'DB_PASSWORD=another-password'));
  const before = read(root, 'backend/.env');
  assert.throws(() => prepare(root), /mismatch/);
  assert.equal(read(root, 'backend/.env'), before);
});
test('custom mobile endpoints are preserved and rejected before any writes', t => {
  const root = fixture(t);
  const custom = read(root, 'mobile/.env.example').replace('10.0.2.2:8000', '192.168.1.20:8000');
  fs.writeFileSync(path.join(root, 'mobile/.env'), custom);
  assert.throws(() => prepare(root), /Custom mobile configuration/);
  assert.equal(read(root, 'mobile/.env'), custom);
  assert.equal(fs.existsSync(path.join(root, '.env')), false);
});
test('new mobile file uses the existing custom public key without replacing private secrets', t => {
  const root = fixture(t);
  prepare(root);
  fs.unlinkSync(path.join(root, 'mobile/.env'));
  const target = path.join(root, 'backend/.env');
  fs.writeFileSync(target, read(root, 'backend/.env').replace('REVERB_APP_KEY=rchat-local', 'REVERB_APP_KEY=custom-local-key'));
  const before = read(root, 'backend/.env');
  prepare(root);
  assert.equal(read(root, 'backend/.env'), before);
  assert.match(read(root, 'mobile/.env'), /^EXPO_PUBLIC_REVERB_APP_KEY=custom-local-key$/m);
});
