import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_BASELINE,
  evaluateBiometrics,
  evaluateCooldownUnlock,
  evaluateOrderAttempt,
} from '../server/engine/riskGuard.js';

test('evaluateBiometrics classifies calm vs tilt accurately', () => {
  const calm = evaluateBiometrics(DEFAULT_BASELINE);
  assert.equal(calm.state, 'CALM');
  assert.ok(calm.stressScore < 40);

  const tilt = evaluateBiometrics({ bpm: 128, hrv: 20, agitation: 0.7 });
  assert.equal(tilt.state, 'TILT');
  assert.ok(tilt.stressScore >= 65);
});

test('evaluateOrderAttempt allows disciplined order when calm', () => {
  const verdict = evaluateOrderAttempt({
    order: { symbol: 'SPY', side: 'BUY', notionalUsd: 5000, leverage: 2, stopLossPct: 1.5 },
    biometrics: { bpm: 70, hrv: 58, agitation: 0.05 },
    marketTicker: { symbol: 'SPY', recentBurstPct: 0.4 },
    accountEquity: 100_000,
  });

  assert.equal(verdict.allowed, true);
  assert.equal(verdict.action, 'EXECUTE');
});

test('evaluateOrderAttempt blocks FOMO + high leverage when watch detects elevated stress', () => {
  const verdict = evaluateOrderAttempt({
    order: { symbol: 'NVDA', side: 'BUY', notionalUsd: 15000, leverage: 10, stopLossPct: 0 },
    biometrics: { bpm: 118, hrv: 26, agitation: 0.45 },
    marketTicker: { symbol: 'NVDA', recentBurstPct: 3.1 },
    accountEquity: 100_000,
  });

  assert.equal(verdict.allowed, false);
  assert.equal(verdict.action, 'BLOCK_TILT');
  assert.ok(verdict.flags.includes('HIGH_LEVERAGE'));
  assert.ok(verdict.flags.includes('FOMO_SPIKE'));
  assert.ok(verdict.flags.includes('NO_STOP_LOSS'));
  assert.equal(verdict.protectedCapitalUsd, 150_000);
});

test('evaluateOrderAttempt detects revenge trading after recent loss', () => {
  const now = Date.now();
  const verdict = evaluateOrderAttempt({
    order: { symbol: 'TSLA', side: 'BUY', notionalUsd: 12000, leverage: 4, stopLossPct: 2 },
    biometrics: { bpm: 112, hrv: 28, agitation: 0.3 },
    marketTicker: { symbol: 'TSLA', recentBurstPct: 0.2 },
    recentClosedTrades: [{ pnl: -1800, closedAt: now - 20_000 }],
    accountEquity: 100_000,
    now,
  });

  assert.equal(verdict.allowed, false);
  assert.ok(verdict.flags.includes('REVENGE_TRADING'));
});

test('evaluateCooldownUnlock enforces both breathing cycles and stabilized pulse', () => {
  const stillStressed = evaluateCooldownUnlock({
    biometrics: { bpm: 115, hrv: 25, agitation: 0.2 },
    completedBreathCycles: 2,
    requiredBreathCycles: 2,
    watchConfirmed: true,
  });
  assert.equal(stillStressed.canConfirmOnWatch, false);
  assert.equal(stillStressed.unlocked, false);

  const missingCycle = evaluateCooldownUnlock({
    biometrics: { bpm: 70, hrv: 60, agitation: 0 },
    completedBreathCycles: 1,
    requiredBreathCycles: 2,
    watchConfirmed: true,
  });
  assert.equal(missingCycle.canConfirmOnWatch, false);
  assert.equal(missingCycle.unlocked, false);

  const readyAndConfirmed = evaluateCooldownUnlock({
    biometrics: { bpm: 71, hrv: 59, agitation: 0.05 },
    completedBreathCycles: 2,
    requiredBreathCycles: 2,
    watchConfirmed: true,
  });
  assert.equal(readyAndConfirmed.canConfirmOnWatch, true);
  assert.equal(readyAndConfirmed.unlocked, true);
});

