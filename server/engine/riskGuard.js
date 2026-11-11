/**
 * PulseStop Biometric & Behavioral Risk Guard.
 * Combines real-time Smartwatch physiological telemetry (BPM, HRV, wrist agitation)
 * with Wall Street behavioral finance risk detectors (FOMO, Panic, Revenge Trading,
 * and excessive leverage) to prevent emotional trading losses.
 */

export const DEFAULT_BASELINE = Object.freeze({
  bpm: 68,
  hrv: 62,
});

export const RISK_THRESHOLDS = Object.freeze({
  ELEVATED_STRESS: 40,
  TILT_STRESS: 65,
  HARD_LOCK_STRESS: 78,
  BEHAVIORAL_LOCK_STRESS: 58,
  UNLOCK_TARGET_STRESS: 45,
  HIGH_LEVERAGE: 5,
  OVERSIZED_EXPOSURE_RATIO: 0.6,
  BURST_THRESHOLD_PCT: 2.0,
  REVENGE_WINDOW_MS: 90_000,
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Evaluates physiological stress/tilt score (0-100) from Smartwatch telemetry.
 */
export function evaluateBiometrics({
  bpm = DEFAULT_BASELINE.bpm,
  hrv = DEFAULT_BASELINE.hrv,
  agitation = 0,
  baseline = DEFAULT_BASELINE,
} = {}) {
  const safeBaseBpm = Math.max(40, baseline.bpm || DEFAULT_BASELINE.bpm);
  const safeBaseHrv = Math.max(15, baseline.hrv || DEFAULT_BASELINE.hrv);

  const bpmDelta = Math.max(0, bpm - safeBaseBpm);
  // +50 BPM above baseline contributes up to 50 points
  const bpmComponent = clamp((bpmDelta / 50) * 50, 0, 52);

  // HRV suppression: dropping from baseline to 15ms indicates strong sympathetic stress
  const hrvDropRatio = clamp((safeBaseHrv - hrv) / (safeBaseHrv - 12), 0, 1);
  const hrvComponent = hrvDropRatio * 36;

  // Wrist micro-tremors / rapid agitation (0..1) contributes up to 16 points
  const agitationComponent = clamp(agitation, 0, 1) * 16;

  const stressScore = Math.round(clamp(bpmComponent + hrvComponent + agitationComponent, 0, 100));

  let state = 'CALM';
  if (stressScore >= RISK_THRESHOLDS.TILT_STRESS) {
    state = 'TILT';
  } else if (stressScore >= RISK_THRESHOLDS.ELEVATED_STRESS) {
    state = 'ELEVATED';
  }

  return {
    bpm: Math.round(bpm),
    hrv: Math.round(hrv),
    agitation: Number(clamp(agitation, 0, 1).toFixed(2)),
    bpmDelta: Math.round(bpmDelta),
    stressScore,
    state,
  };
}

/**
 * Detects behavioral & position-sizing risk flags on a proposed trade.
 */
export function detectOrderRiskFlags({
  order,
  marketTicker,
  accountEquity = 100_000,
  recentClosedTrades = [],
  now = Date.now(),
}) {
  const flags = [];
  const leverage = Math.max(1, Number(order.leverage) || 1);
  const notionalUsd = Math.max(0, Number(order.notionalUsd) || 0);
  const effectiveExposure = notionalUsd * leverage;
  const burstPct = Number(marketTicker?.recentBurstPct || 0);

  if (leverage >= RISK_THRESHOLDS.HIGH_LEVERAGE) {
    flags.push('HIGH_LEVERAGE');
  }

  if (accountEquity > 0 && effectiveExposure > accountEquity * RISK_THRESHOLDS.OVERSIZED_EXPOSURE_RATIO) {
    flags.push('OVERSIZED_EXPOSURE');
  }

  if (leverage >= 3 && (!order.stopLossPct || Number(order.stopLossPct) <= 0)) {
    flags.push('NO_STOP_LOSS');
  }

  if (order.side === 'BUY' && burstPct >= RISK_THRESHOLDS.BURST_THRESHOLD_PCT) {
    flags.push('FOMO_SPIKE');
  }

  if (order.side === 'SELL' && burstPct <= -RISK_THRESHOLDS.BURST_THRESHOLD_PCT) {
    flags.push('PANIC_DUMP');
  }

  const recentLoss = recentClosedTrades.find(
    (trade) => trade.pnl < 0 && now - trade.closedAt <= RISK_THRESHOLDS.REVENGE_WINDOW_MS
  );
  if (recentLoss && (leverage >= 3 || notionalUsd >= 10_000)) {
    flags.push('REVENGE_TRADING');
  }

  return flags;
}

const FLAG_DESCRIPTIONS = {
  HIGH_LEVERAGE: 'Apalancamiento agresivo (>= 5x)',
  OVERSIZED_EXPOSURE: 'Exposición excesiva respecto al capital',
  NO_STOP_LOSS: 'Orden apalancada sin Stop-Loss definido',
  FOMO_SPIKE: 'Persecución alcista (FOMO) tras pico súbito',
  PANIC_DUMP: 'Venta por pánico tras caída brusca',
  REVENGE_TRADING: 'Intento de recuperación impulsiva tras pérdida reciente (Revenge Trading)',
};

/**
 * Main Circuit Breaker decision gate evaluated before any Phone order hits execution.
 */
export function evaluateOrderAttempt({
  order,
  biometrics,
  marketTicker,
  accountEquity = 100_000,
  recentClosedTrades = [],
  cooldownState = null,
  now = Date.now(),
}) {
  const bio = evaluateBiometrics(biometrics);
  const flags = detectOrderRiskFlags({
    order,
    marketTicker,
    accountEquity,
    recentClosedTrades,
    now,
  });

  const leverage = Math.max(1, Number(order.leverage) || 1);
  const notionalUsd = Math.max(0, Number(order.notionalUsd) || 0);
  const effectiveExposure = Math.round(notionalUsd * leverage);

  if (cooldownState?.active && !cooldownState.unlockedByWatch) {
    return {
      allowed: false,
      action: 'BLOCK_TILT',
      reasonCode: 'COOLDOWN_ACTIVE',
      tiltScore: bio.stressScore,
      bioState: bio.state,
      flags,
      headline: 'Terminal en enfriamiento biométrico activo',
      explanation:
        'Completa los ciclos de respiración guiada en tu Smartwatch y confirma calma en la muñeca antes de operar.',
      suggestedSafeNotional: Math.min(notionalUsd, Math.round(accountEquity * 0.05)),
      suggestedSafeLeverage: 1,
      requiredBreathCycles: cooldownState.requiredBreathCycles || 2,
      protectedCapitalUsd: effectiveExposure,
    };
  }

  const hardLock = bio.stressScore >= RISK_THRESHOLDS.HARD_LOCK_STRESS;
  const behavioralLock = bio.stressScore >= RISK_THRESHOLDS.BEHAVIORAL_LOCK_STRESS && flags.length >= 1;

  if (hardLock || behavioralLock) {
    const flagLabels = flags.map((f) => FLAG_DESCRIPTIONS[f] || f);
    const reasonSummary =
      flagLabels.length > 0
        ? `Señales detectadas: ${flagLabels.join(' · ')}.`
        : 'Estrés fisiológico severo detectado por el Smartwatch.';

    const requiredBreathCycles = bio.stressScore >= 80 ? 3 : 2;

    return {
      allowed: false,
      action: 'BLOCK_TILT',
      reasonCode: hardLock ? 'HARD_PHYSIOLOGICAL_TILT' : 'BEHAVIORAL_TILT',
      tiltScore: bio.stressScore,
      bioState: bio.state,
      flags,
      headline: hardLock
        ? 'Circuit Breaker: Estrés fisiológico crítico'
        : 'Circuit Breaker: Riesgo emocional (FOMO / Tilt)',
      explanation: `Smartwatch reporta ${bio.bpm} BPM (+${bio.bpmDelta} sobre base) y HRV de ${bio.hrv} ms (Tilt ${bio.stressScore}/100). ${reasonSummary}`,
      suggestedSafeNotional: Math.max(1000, Math.min(notionalUsd, Math.round(accountEquity * 0.05))),
      suggestedSafeLeverage: 1,
      requiredBreathCycles,
      protectedCapitalUsd: effectiveExposure,
    };
  }

  return {
    allowed: true,
    action: 'EXECUTE',
    reasonCode: 'DISCIPLINED_EXECUTION',
    tiltScore: bio.stressScore,
    bioState: bio.state,
    flags,
    headline: 'Ejecución aprobada por Guardián Biométrico',
    explanation: `Estado ${bio.state} (${bio.bpm} BPM, HRV ${bio.hrv} ms). Orden dentro de parámetros seguros.`,
    suggestedSafeNotional: notionalUsd,
    suggestedSafeLeverage: leverage,
    requiredBreathCycles: 0,
    protectedCapitalUsd: 0,
  };
}

/**
 * Verifies whether the Smartwatch cooldown can unlock based on stabilized biometrics
 * and completed breathing cycles.
 */
export function evaluateCooldownUnlock({
  biometrics,
  completedBreathCycles = 0,
  requiredBreathCycles = 2,
  watchConfirmed = false,
}) {
  const bio = evaluateBiometrics(biometrics);
  const remainingCycles = Math.max(0, requiredBreathCycles - completedBreathCycles);
  const pulseStabilized = bio.stressScore <= RISK_THRESHOLDS.UNLOCK_TARGET_STRESS;
  const canConfirmOnWatch = remainingCycles === 0 && pulseStabilized;
  const unlocked = canConfirmOnWatch && Boolean(watchConfirmed);

  return {
    bio,
    remainingCycles,
    pulseStabilized,
    canConfirmOnWatch,
    unlocked,
    targetStressScore: RISK_THRESHOLDS.UNLOCK_TARGET_STRESS,
  };
}

