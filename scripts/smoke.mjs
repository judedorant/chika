// Real HTTP + MySQL/Redis/worker/Reverb smoke test for a disposable local stack.
// node --env-file=backend/.env scripts/smoke.mjs
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// Use the installed client tooling's ws transport so we can send an Origin.
const wsModule = createRequire(new URL('../mobile/package.json', import.meta.url))('ws');
const WebSocket = wsModule.WebSocket ?? wsModule;

const base = process.env.RCHAT_SMOKE_URL || 'http://127.0.0.1:8000/api/v1';
const socketBase = process.env.RCHAT_SMOKE_SOCKET || 'ws://127.0.0.1:8080';
for (const url of [base, socketBase]) {
  assert(['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname), 'Smoke tests only target a disposable loopback stack.');
}
const key = process.env.REVERB_APP_KEY;
assert(key, 'Set REVERB_APP_KEY to the local public socket key.');
let checks = 0;
async function request(path, { token, body, method = 'GET', status = 200 } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${path}`, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status, `${method} ${path}: expected ${status}, received ${response.status}`);
  checks++;
  console.log(`OK ${method} ${path}: ${response.status}`);
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : null;
}
async function account(name) {
  const password = `Smoke-${randomUUID()}-Aa1`;
  return request('/auth/register', { method: 'POST', status: 201, body: { name, email: `${randomUUID()}@smoke.test`, password, password_confirmation: password, device_name: 'Local smoke test' } });
}
const a = await account('Smoke Alice');
const b = await account('Smoke Bob');
const outsider = await account('Smoke Outsider');
const ws = new WebSocket(`${socketBase}/app/${key}?protocol=7&client=js&version=8.6.0&flash=false`, { origin: new URL(base).origin });
ws.addEventListener('error', () => console.error('Reverb transport error.'));
const waiting = new Set();
ws.addEventListener('message', ({ data }) => {
  const event = JSON.parse(String(data));
  console.log(`Socket event: ${event.event}`);
  if (typeof event.data === 'string') event.data = JSON.parse(event.data);
  if (event.event === 'pusher:error') console.error('Socket error:', event.data.code, event.data.message);
  if (event.event === 'pusher:ping') ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
  for (const listener of [...waiting]) listener(event);
});
function waitFor(predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { waiting.delete(listener); reject(new Error('Timed out waiting for a real Reverb event.')); }, 15000);
    const listener = event => {
      if (predicate(event)) { clearTimeout(timeout); waiting.delete(listener); resolve(event); }
    };
    waiting.add(listener);
  });
}
try {
  const connected = await waitFor(e => e.event === 'pusher:connection_established');
  const channel = `private-users.${b.user.id}`;
  const auth = await request('/broadcasting/auth', { method: 'POST', token: b.token, body: { channel_name: channel, socket_id: connected.data.socket_id } });
  assert(auth.auth === `${key}:${createHmac('sha256', process.env.REVERB_APP_SECRET).update(`${connected.data.socket_id}:${channel}`).digest('hex')}`, 'API must sign with the configured local socket secret.');
  await request('/broadcasting/auth', { method: 'POST', token: outsider.token, status: 403, body: { channel_name: channel, socket_id: connected.data.socket_id } });
  const subscribed = waitFor(e => e.event === 'pusher_internal:subscription_succeeded');
  ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel, auth: auth.auth } }));
  await subscribed;
  const { data: conversation } = await request('/conversations', { method: 'POST', token: a.token, body: { type: 'private', participant_ids: [b.user.id] } });
  const event = waitFor(e => e.event === 'chat.changed' && e.data.kind === 'message' && e.data.conversation_id === conversation.id);
  const payload = { body: 'A real queued broadcast', client_message_id: randomUUID() };
  const { data: message } = await request(`/conversations/${conversation.id}/messages`, { method: 'POST', token: a.token, status: 201, body: payload });
  const broadcast = await event;
  assert.equal(broadcast.data.data.message_id, message.id); checks++;
  const retry = await request(`/conversations/${conversation.id}/messages`, { method: 'POST', token: a.token, body: payload });
  assert.equal(retry.data.id, message.id); checks++;
  await request(`/conversations/${conversation.id}/messages`, { token: outsider.token, status: 403 });
  await request(`/messages/${message.id}/delivered`, { method: 'POST', token: b.token });
  await request(`/messages/${message.id}/read`, { method: 'POST', token: b.token });
  const history = await request(`/conversations/${conversation.id}/messages`, { token: a.token });
  assert(history.data[0].receipts[0].read_at); checks++;
  await request('/me/heartbeat', { method: 'POST', token: b.token, status: 204 });
  const presence = await request(`/users/${b.user.id}/presence`, { token: a.token });
  assert.equal(presence.online, true); checks++;
  const typing = waitFor(e => e.event === 'chat.changed' && e.data.kind === 'typing' && e.data.data.user_id === a.user.id);
  await request(`/conversations/${conversation.id}/typing`, { method: 'POST', token: a.token, status: 204 });
  await typing; checks++;
  const image = new FormData();
  image.append('client_message_id', randomUUID());
  image.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'pixel.png');
  const photo = await request(`/conversations/${conversation.id}/messages`, { method: 'POST', token: a.token, status: 201, body: image });
  const attachment = photo.data.attachments[0].id;
  await request(`/attachments/${attachment}`, { token: b.token });
  await request(`/attachments/${attachment}`, { token: outsider.token, status: 403 });
  await request(`/users/${a.user.id}/block`, { method: 'POST', token: b.token, status: 204 });
  await request(`/conversations/${conversation.id}/messages`, { method: 'POST', token: a.token, status: 403, body: { ...payload, client_message_id: randomUUID() } });
  console.log(`PASS: ${checks} local HTTP/socket checks, including real queued Reverb delivery, Redis presence/typing, receipts, private files, and blocking.`);
} finally {
  ws.close();
  // Keep disposable sample messages; revoke every smoke session/device.
  for (const actor of [a, b, outsider]) await request('/auth/tokens', { method: 'DELETE', token: actor.token, status: 204 }).catch(() => {});
}
