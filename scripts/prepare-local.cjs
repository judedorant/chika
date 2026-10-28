// Prepare ignored local configuration. Never log configuration values.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function prepare(root) {
  const files = ['.env', 'backend/.env', 'mobile/.env'];
  const docs = new Map(files.map(file => [file, fs.readFileSync(path.join(root, fs.existsSync(path.join(root, file)) ? file : file + '.example'), 'utf8')]));
  function get(file, key) {
    const match = docs.get(file).match(new RegExp('^' + key + '=(.*)$', 'm'));
    return match ? match[1].trim().replace(/^(['"])(.*)\1$/, '$2') : '';
  }
  function set(file, key, value) {
    const re = new RegExp('^' + key + '=.*$', 'm');
    const original = docs.get(file);
    docs.set(file, re.test(original) ? original.replace(re, () => key + '=' + value) : original.trimEnd() + '\n' + key + '=' + value + '\n');
  }
  function fill(file, key, value) { if (!get(file, key)) set(file, key, value); }
  if (get('backend/.env', 'APP_ENV') !== 'local') throw Error('Refusing non-local backend environment. Use a separate local checkout.');
  for (const [key, value] of Object.entries({ DB_CONNECTION: 'mysql', DB_DATABASE: 'rchat', DB_USERNAME: 'rchat', REVERB_SCHEME: 'http' })) {
    if (get('backend/.env', key) !== value) throw Error('Custom backend configuration detected: ' + key + '. Review it before using the local Compose workflow; nothing was written.');
  }
  for (const key of ['RCHAT_DB_PASSWORD', 'RCHAT_DB_ROOT_PASSWORD']) fill('.env', key, crypto.randomBytes(32).toString('hex'));
  const dbPassword = get('.env', 'RCHAT_DB_PASSWORD');
  if (get('backend/.env', 'DB_PASSWORD') && get('backend/.env', 'DB_PASSWORD') !== dbPassword) throw Error('Database password mismatch. Reconcile root and backend local files with the existing MySQL volume; nothing was written.');
  fill('backend/.env', 'DB_PASSWORD', dbPassword);
  fill('backend/.env', 'APP_KEY', 'base64:' + crypto.randomBytes(32).toString('base64'));
  fill('backend/.env', 'REVERB_APP_SECRET', crypto.randomBytes(32).toString('hex'));
  if (!/^base64:[A-Za-z0-9+/]{43}=$/.test(get('backend/.env', 'APP_KEY'))) throw Error('Existing Laravel application key is invalid. Preserve data and review it locally; nothing was written.');
  const publicKey = get('backend/.env', 'REVERB_APP_KEY');
  if (!/^[A-Za-z0-9_-]+$/.test(publicKey)) throw Error('Invalid local public Reverb key; correct it before retrying.');
  if (get('backend/.env', 'REVERB_APP_SECRET').length < 32) throw Error('Existing Reverb secret is too short; replace it locally before retrying.');
  // Only migrate untouched localhost defaults; preserve custom working endpoints.
  if (get('backend/.env', 'APP_URL') === 'http://localhost:8000') set('backend/.env', 'APP_URL', 'http://10.0.2.2:8000');
  if (!get('backend/.env', 'REVERB_ALLOWED_ORIGINS').split(',').map(value => value.trim()).includes('10.0.2.2')) throw Error('Add 10.0.2.2 to the local Reverb allowed origins; nothing was written.');
  const expected = { EXPO_PUBLIC_API_URL: 'http://10.0.2.2:8000/api/v1', EXPO_PUBLIC_REVERB_HOST: '10.0.2.2', EXPO_PUBLIC_REVERB_PORT: '8080', EXPO_PUBLIC_REVERB_SCHEME: 'http', EXPO_PUBLIC_REVERB_APP_KEY: publicKey, EXPO_PUBLIC_APP_ENV: 'development' };
  // Missing mobile files are initialized from examples with the actual local key.
  if (!fs.existsSync(path.join(root, 'mobile/.env'))) set('mobile/.env', 'EXPO_PUBLIC_REVERB_APP_KEY', publicKey);
  for (const [key, value] of Object.entries(expected)) {
    fill('mobile/.env', key, value);
    if (get('mobile/.env', key) !== value) throw Error('Custom mobile configuration detected: ' + key + '. Preserve it in another checkout or explicitly configure this checkout for the emulator; nothing was written.');
  }
  if (get('backend/.env', 'APP_URL') !== 'http://10.0.2.2:8000') throw Error('Custom backend APP_URL detected. Review emulator attachment connectivity before changing it; nothing was written.');
  for (const [file, content] of docs) {
    const target = path.join(root, file);
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== content) fs.writeFileSync(target, content, { mode: 0o600 });
  }
}
module.exports = { prepare };
if (require.main === module) {
  try { prepare(path.resolve(__dirname, '..')); console.log('Local configuration ready. Existing secrets preserved; no values displayed.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
