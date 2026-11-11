import test from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createPulseServer } from '../server/index.js';

function connectClient(url, roomId, role) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    const waiters = [];

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      const matchIdx = waiters.findIndex((w) => w.predicate(msg));
      if (matchIdx !== -1) {
        const [waiter] = waiters.splice(matchIdx, 1);
        waiter.resolve(msg);
      } else {
        inbox.push(msg);
      }
    });

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'JOIN', roomId, role }));
      resolve({
        ws,
        waitFor(predicate, timeoutMs = 2000) {
          const existingIdx = inbox.findIndex(predicate);
          if (existingIdx !== -1) {
            return Promise.resolve(inbox.splice(existingIdx, 1)[0]);
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              const i = waiters.findIndex((w) => w.resolve === res);
              if (i !== -1) waiters.splice(i, 1);
              rej(new Error(`Timeout waiting for message (${role})`));
            }, timeoutMs);
            waiters.push({
              predicate,
              resolve: (msg) => {
                clearTimeout(timer);
                res(msg);
              },
            });
          });
        },
        send(payload) {
          ws.send(JSON.stringify(payload));
        },
      });
    });

    ws.on('error', reject);
  });
}

test('Phone and Smartwatch synchronize biometrics, circuit breaker lock, watch unlock, and emergency hedge', async () => {
  const pulse = createPulseServer({ tickIntervalMs: 0 });
  await new Promise((resolve) => pulse.server.listen(0, '127.0.0.1', resolve));
  const { port } = pulse.server.address();
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  let phone;
  let watch;

  try {
    phone = await connectClient(wsUrl, 'WALLST', 'PHONE');
    watch = await connectClient(wsUrl, 'WALLST', 'WATCH');

    const pairedState = await phone.waitFor(
      (m) => m.type === 'ROOM_STATE' && m.devices.phoneCount === 1 && m.devices.watchCount === 1
    );
    assert.equal(pairedState.roomId, 'WALLST');

    // 1. Watch sends stressed biometrics
    watch.send({ type: 'WATCH_BIOMETRICS', bpm: 132, hrv: 19, agitation: 0.7 });
    const phoneBioState = await phone.waitFor(
      (m) => m.type === 'ROOM_STATE' && m.biometrics.state === 'TILT'
    );
    assert.ok(phoneBioState.biometrics.stressScore >= 75);

    // 2. Phone attempts high-leverage FOMO trade -> Circuit breaker blocks & notifies Watch
    phone.send({
      type: 'PHONE_SUBMIT_ORDER',
      symbol: 'NVDA',
      side: 'BUY',
      notionalUsd: 20000,
      leverage: 10,
      stopLossPct: 0,
    });

    const orderResult = await phone.waitFor((m) => m.type === 'ORDER_RESULT');
    assert.equal(orderResult.verdict.allowed, false);
    assert.equal(orderResult.verdict.action, 'BLOCK_TILT');

    const watchHaptic = await watch.waitFor(
      (m) => m.type === 'HAPTIC_EVENT' && m.code === 'TILT_LOCK'
    );
    assert.ok(Array.isArray(watchHaptic.pattern));

    // 3. Watch completes breathing cycles & recovers calm pulse -> Watch unlocks Phone
    watch.send({ type: 'WATCH_BREATH_CYCLE' });
    watch.send({ type: 'WATCH_BREATH_CYCLE' });
    watch.send({ type: 'WATCH_BREATH_CYCLE' });
    watch.send({ type: 'WATCH_BIOMETRICS', bpm: 70, hrv: 58, agitation: 0.05 });

    const readyState = await watch.waitFor(
      (m) => m.type === 'ROOM_STATE' && m.cooldown.canConfirmOnWatch === true
    );
    assert.equal(readyState.cooldown.active, true);

    watch.send({ type: 'WATCH_CONFIRM_UNLOCK' });
    const unlockedPhone = await phone.waitFor(
      (m) =>
        m.type === 'ROOM_STATE' &&
        m.cooldown.active === false &&
        m.cooldown.unlockedByWatch === true
    );
    assert.equal(unlockedPhone.cooldown.unlockedByWatch, true);

    // 4. Phone now executes disciplined trade -> Watch emergency wrist hedge closes it
    phone.send({
      type: 'PHONE_SUBMIT_ORDER',
      symbol: 'SPY',
      side: 'BUY',
      notionalUsd: 5000,
      leverage: 2,
      stopLossPct: 1.5,
    });
    const okOrder = await phone.waitFor(
      (m) => m.type === 'ORDER_RESULT' && m.verdict.allowed === true
    );
    assert.equal(okOrder.position.symbol, 'SPY');

    watch.send({ type: 'WATCH_EMERGENCY_HEDGE', action: 'CLOSE_ALL' });
    const hedgedPhone = await phone.waitFor(
      (m) => m.type === 'ROOM_STATE' && m.account.stats.emergencyHedges === 1
    );
    assert.equal(hedgedPhone.account.positions.length, 0);
  } finally {
    phone?.ws.close();
    watch?.ws.close();
    await pulse.close();
  }
});
