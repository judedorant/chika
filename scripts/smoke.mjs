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
assert(/^[A-Za-z0-9_-]+$/.test(key), 'The public Reverb app key must not contain a colon.');
// Compose reports a running container before Laravel has opened its socket.
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
    if (response.ok) { ready = true; break; }
  } catch { /* Retry only startup readiness, never message creation. */ }
  await new Promise(resolve => setTimeout(resolve, 250));
}
assert(ready, 'The local API did not become ready.');
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
  const email = `${randomUUID()}@smoke.test`;
  const actor = await request('/auth/register', { method: 'POST', status: 201, body: { name, email, password, password_confirmation: password, device_name: 'Local smoke test' } });
  return { ...actor, login: { email, password, device_name: 'Local smoke test' } };
}
const a = await account('Smoke Alice');
const b = await account('Smoke Bob');
const outsider = await account('Smoke Outsider');
const waiting = new Set();
let ws;
function connectSocket() {
  const socket = new WebSocket(`${socketBase}/app/${key}?protocol=7&client=js&version=8.6.0&flash=false`, { origin: new URL(base).origin });
  socket.addEventListener('error', () => console.error('Reverb transport error.'));
  socket.addEventListener('message', ({ data }) => {
  const event = JSON.parse(String(data));
  console.log(`Socket event: ${event.event}`);
  if (typeof event.data === 'string') event.data = JSON.parse(event.data);
  if (event.event === 'pusher:error') console.error('Socket error:', event.data.code, event.data.message);
  if (event.event === 'pusher:ping') socket.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
  for (const listener of [...waiting]) listener(event);
});
  return socket;
}
ws = connectSocket();
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
  const login = await request('/auth/login', { method: 'POST', body: a.login });
  await request('/auth/logout', { method: 'POST', token: login.token, status: 204 });
  await request('/me', { token: login.token, status: 401 });
  const channel = `private-users.${b.user.id}`;
  const auth = await request('/broadcasting/auth', { method: 'POST', token: b.token, body: { channel_name: channel, socket_id: connected.data.socket_id } });
  assert(auth.auth === `${key}:${createHmac('sha256', process.env.REVERB_APP_SECRET).update(`${connected.data.socket_id}:${channel}`).digest('hex')}`, 'API must sign with the configured local socket secret.');
  await request('/broadcasting/auth', { method: 'POST', token: outsider.token, status: 403, body: { channel_name: channel, socket_id: connected.data.socket_id } });
  const subscribed = waitFor(e => e.event === 'pusher_internal:subscription_succeeded');
  ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel, auth: auth.auth } }));
  await subscribed;
  const { data: conversation } = await request('/conversations', { method: 'POST', token: a.token, status: 201, body: { type: 'private', participant_ids: [b.user.id] } });
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
  const { data: group } = await request('/conversations', { method: 'POST', token: a.token, status: 201, body: { type: 'group', name: 'Live smoke group', participant_ids: [b.user.id] } });
  const groupEvent = waitFor(e => e.event === 'chat.changed' && e.data.kind === 'message' && e.data.conversation_id === group.id);
  const [groupMessage] = await Promise.all([
    request(`/conversations/${group.id}/messages`, { method: 'POST', token: a.token, status: 201, body: { body: 'Live group message', client_message_id: randomUUID() } }),
    groupEvent,
  ]);
  assert.equal(groupMessage.data.receipts[0].user_id, b.user.id); checks++;
  await request(`/conversations/${group.id}`, { method: 'PATCH', token: b.token, status: 403, body: { name: 'Denied' } });
  const removed = waitFor(e => e.event === 'chat.changed' && e.data.kind === 'removed' && e.data.conversation_id === group.id);
  await Promise.all([
    request(`/conversations/${group.id}/participants/${b.user.id}`, { method: 'DELETE', token: a.token, status: 204 }),
    removed,
  ]);
  await request(`/conversations/${group.id}/messages`, { token: b.token, status: 403 });
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
  // Simulate a transport interruption while keeping the recipient's auth session.
  await new Promise(resolve => { ws.once('close', resolve); ws.close(); });
  const missed = await request(`/conversations/${conversation.id}/messages`, { method: 'POST', token: a.token, status: 201, body: { body: 'Sent during disconnection', client_message_id: randomUUID() } });
  ws = connectSocket();
  const reconnected = await waitFor(e => e.event === 'pusher:connection_established');
  const reconnectAuth = await request('/broadcasting/auth', { method: 'POST', token: b.token, body: { channel_name: channel, socket_id: reconnected.data.socket_id } });
  const resubscribed = waitFor(e => e.event === 'pusher_internal:subscription_succeeded');
  ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { channel, auth: reconnectAuth.auth } }));
  await resubscribed;
  const synced = await request(`/conversations/${conversation.id}/messages`, { token: b.token });
  assert(synced.data.some(message => message.id === missed.data.id)); checks++;
  const afterReconnect = waitFor(e => e.event === 'chat.changed' && e.data.kind === 'message' && e.data.conversation_id === conversation.id && e.data.data.message_id > missed.data.id);
  const [newMessage, newEvent] = await Promise.all([request(`/conversations/${conversation.id}/messages`, { method: 'POST', token: a.token, status: 201, body: { body: 'After reconnection', client_message_id: randomUUID() } }), afterReconnect]);
  assert.equal(newEvent.data.data.message_id, newMessage.data.id); checks++;
  await request(`/users/${a.user.id}/block`, { method: 'POST', token: b.token, status: 204 });
  await request(`/conversations/${conversation.id}/messages`, { method: 'POST', token: a.token, status: 403, body: { ...payload, client_message_id: randomUUID() } });
  console.log(`PASS: ${checks} local HTTP/socket checks, including real queued Reverb delivery, Redis presence/typing, receipts, private files, and blocking.`);
} finally {
  ws.close();
  // Keep disposable sample messages; revoke every smoke session/device.
  for (const actor of [a, b, outsider]) await request('/auth/tokens', { method: 'DELETE', token: actor.token, status: 204 }).catch(() => {});
}
