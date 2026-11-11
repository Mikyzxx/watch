import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Heart,
  Lock,
  Radio,
  ShieldAlert,
  Volume2,
  VolumeX,
  Wind,
  Zap,
} from 'lucide-react';
import { usePulseSocket } from '../hooks/usePulseSocket.js';
import { useHaptics, useWristFlickDetector } from '../hooks/useHaptics.js';

function deriveBioFromBpm(bpm, agitationOverride = null) {
  const clampedBpm = Math.max(52, Math.min(160, Number(bpm) || 68));
  // Physiological inverse relation between HR spike and HRV (RMSSD in ms)
  const hrv = Math.round(Math.max(14, Math.min(78, 86 - (clampedBpm - 55) * 0.72)));
  const agitation =
    agitationOverride !== null
      ? agitationOverride
      : Number(Math.max(0.04, Math.min(0.95, (clampedBpm - 68) / 75)).toFixed(2));
  return { bpm: clampedBpm, hrv, agitation };
}

export function SmartwatchApp({ roomId, embedded = false }) {
  const [soundOn, setSoundOn] = useState(true);
  const [autoRecover, setAutoRecover] = useState(true);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [localBpm, setLocalBpm] = useState(68);
  const [breathPhase, setBreathPhase] = useState('INHALA');
  const [cycleProgress, setCycleProgress] = useState(0);
  const [lastHapticLog, setLastHapticLog] = useState(null);

  const { activeWave, triggerHaptic } = useHaptics({ soundEnabled: soundOn });

  const { connected, latencyMs, roomState, send } = usePulseSocket({
    roomId,
    role: 'WATCH',
    onHapticEvent: (evt) => {
      setLastHapticLog(evt);
      triggerHaptic(evt);
    },
  });

  const cooldown = roomState?.cooldown;
  const biometrics = roomState?.biometrics;
  const positionsCount = roomState?.account?.positions?.length || 0;
  const phoneConnected = (roomState?.devices?.phoneCount || 0) > 0;

  // Keep local slider synchronized when room resets
  useEffect(() => {
    if (biometrics?.bpm && Math.abs(biometrics.bpm - localBpm) > 18 && !cooldown?.active) {
      setLocalBpm(biometrics.bpm);
    }
  }, [biometrics?.bpm, cooldown?.active]);

  const sendBiometrics = (bpmVal, agitationOverride = null) => {
    const packet = deriveBioFromBpm(bpmVal, agitationOverride);
    setLocalBpm(packet.bpm);
    send({ type: 'WATCH_BIOMETRICS', ...packet });
  };

  // Real physical double wrist-flick emergency hedge
  useWristFlickDetector({
    enabled: motionEnabled,
    onFlick: () => {
      triggerHaptic({
        code: 'EMERGENCY_HEDGE',
        pattern: [200, 60, 200],
        label: 'GESTO MUÑECA DETECTADO',
        severity: 'warn',
      });
      send({ type: 'WATCH_EMERGENCY_HEDGE', action: 'CLOSE_ALL' });
    },
  });

  // Guided breathing pacer loop during biometric cooldown
  const localBpmRef = useRef(localBpm);
  localBpmRef.current = localBpm;

  useEffect(() => {
    if (!cooldown?.active) {
      setCycleProgress(0);
      setBreathPhase('INHALA');
      return undefined;
    }

    const cycleMs = 3600;
    const stepMs = 150;
    let elapsed = 0;

    const timer = setInterval(() => {
      elapsed += stepMs;
      const ratio = (elapsed % cycleMs) / cycleMs;
      setCycleProgress(ratio);

      if (ratio < 0.36) setBreathPhase('INHALA');
      else if (ratio < 0.62) setBreathPhase('MANTÉN');
      else setBreathPhase('EXHALA');

      if (elapsed >= cycleMs) {
        elapsed = 0;
        send({ type: 'WATCH_BREATH_CYCLE' });

        if (autoRecover && localBpmRef.current > 70) {
          const nextBpm = Math.max(69, Math.round(localBpmRef.current - 22));
          const packet = deriveBioFromBpm(nextBpm, nextBpm <= 75 ? 0.06 : null);
          setLocalBpm(packet.bpm);
          send({ type: 'WATCH_BIOMETRICS', ...packet });
        }
      }
    }, stepMs);

    return () => clearInterval(timer);
  }, [cooldown?.active, autoRecover, send]);

  const tiltScore = biometrics?.stressScore ?? 8;
  const bioState = biometrics?.state ?? 'CALM';
  const ringColor =
    bioState === 'TILT' ? '#f43f5e' : bioState === 'ELEVATED' ? '#f59e0b' : '#10b981';

  const radius = 136;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (tiltScore / 100) * circumference;

  const waveClass = activeWave
    ? `watch-wave-${activeWave.severity || 'info'}`
    : '';

  return (
    <div className={`watch-wrapper ${embedded ? 'watch-embedded' : 'watch-standalone'}`}>
      {/* Circular Wear OS / Smartwatch Hardware Bezel */}
      <div className={`watch-bezel ${waveClass}`}>
        <div className="watch-crown" title="Corona háptica" />
        <div className="watch-side-btn" title="Botón de emergencia" />

        <div className="watch-screen">
          {/* Outer Circular Tilt Gauge */}
          <svg className="watch-gauge-svg" viewBox="0 0 300 300" aria-hidden="true">
            <circle cx="150" cy="150" r={radius} className="watch-gauge-track" />
            <circle
              cx="150"
              cy="150"
              r={radius}
              className="watch-gauge-fill"
              stroke={ringColor}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>

          {/* Watch Inner Face */}
          <div className="watch-content">
            <div className="watch-top-status">
              <span className={`dot ${connected && phoneConnected ? 'dot-green' : 'dot-amber'}`} />
              <span>
                {!connected
                  ? 'SIN RED'
                  : phoneConnected
                  ? `SYNC · ${latencyMs ?? 12}ms`
                  : 'ESPERANDO TEL.'}
              </span>
              <button
                type="button"
                className="watch-mute-btn"
                onClick={() => setSoundOn((s) => !s)}
                title={soundOn ? 'Silenciar audio háptico' : 'Activar audio háptico'}
              >
                {soundOn ? <Volume2 size={13} /> : <VolumeX size={13} />}
              </button>
            </div>

            {cooldown?.active ? (
              <div className="watch-cooldown-view">
                <div className="watch-lock-badge">
                  <Lock size={12} /> CIRCUIT BREAKER
                </div>

                <div
                  className={`breath-orb ${breathPhase.toLowerCase()}`}
                  style={{
                    transform:
                      breathPhase === 'INHALA'
                        ? `scale(${0.88 + cycleProgress * 0.55})`
                        : breathPhase === 'MANTÉN'
                        ? 'scale(1.12)'
                        : `scale(${1.12 - (cycleProgress - 0.62) * 0.6})`,
                  }}
                >
                  <Wind size={20} />
                  <span>{breathPhase}</span>
                </div>

                <div className="watch-cooldown-metrics">
                  <strong>{biometrics?.bpm ?? localBpm} BPM</strong> · Tilt {tiltScore}/100
                </div>
                <div className="watch-cycles-pill">
                  Ciclos: {cooldown.completedBreathCycles}/{cooldown.requiredBreathCycles}
                </div>

                {cooldown.canConfirmOnWatch ? (
                  <button
                    type="button"
                    className="watch-unlock-btn"
                    onClick={() => send({ type: 'WATCH_CONFIRM_UNLOCK' })}
                  >
                    <CheckCircle2 size={15} /> Confirmar Calma
                  </button>
                ) : (
                  <div className="watch-wait-hint">
                    {cooldown.completedBreathCycles < cooldown.requiredBreathCycles
                      ? 'Respira siguiendo el pulso...'
                      : 'Baja tu pulso (Tilt ≤ 45)'}
                  </div>
                )}
              </div>
            ) : (
              <div className="watch-normal-view">
                <div className="watch-bio-pill" style={{ color: ringColor, borderColor: `${ringColor}44` }}>
                  {bioState === 'TILT' && <AlertTriangle size={12} />}
                  {bioState === 'CALM' ? 'ESTADO CALMA' : bioState === 'ELEVATED' ? 'ESTRÉS MODERADO' : 'MODO TILT / FOMO'}
                </div>

                <div className="watch-bpm-row">
                  <Heart
                    size={22}
                    className="heart-pulse"
                    style={{
                      color: ringColor,
                      animationDuration: `${Math.max(0.4, 60 / (biometrics?.bpm || 68))}s`,
                    }}
                  />
                  <span className="watch-bpm-value">{biometrics?.bpm ?? localBpm}</span>
                  <span className="watch-bpm-unit">BPM</span>
                </div>

                <div className="watch-submetrics">
                  <span>HRV {biometrics?.hrv ?? 62} ms</span>
                  <span>·</span>
                  <span>Tilt {tiltScore}/100</span>
                </div>

                {activeWave ? (
                  <div className={`watch-haptic-toast severity-${activeWave.severity}`}>
                    <Zap size={13} />
                    <div>
                      <div className="toast-title">{activeWave.label}</div>
                      <div className="toast-detail">{activeWave.detail}</div>
                    </div>
                  </div>
                ) : lastHapticLog ? (
                  <div className="watch-last-tape">
                    <Radio size={11} /> {lastHapticLog.label}
                  </div>
                ) : (
                  <div className="watch-last-tape">
                    <Activity size={11} /> Haptic Tape en escucha
                  </div>
                )}

                <div className="watch-actions-row">
                  <button
                    type="button"
                    className="watch-action-btn warn"
                    disabled={positionsCount === 0}
                    onClick={() => send({ type: 'WATCH_EMERGENCY_HEDGE', action: 'CUT_HALF' })}
                    title="Reducir exposición abierta al 50%"
                  >
                    -50% Riesgo
                  </button>
                  <button
                    type="button"
                    className="watch-action-btn danger"
                    disabled={positionsCount === 0}
                    onClick={() => send({ type: 'WATCH_EMERGENCY_HEDGE', action: 'CLOSE_ALL' })}
                    title="Cerrar todas las posiciones abiertas con gesto de muñeca"
                  >
                    <ShieldAlert size={13} /> Cerrar ({positionsCount})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sensor & Telemetry Simulator Controls below watch bezel */}
      <div className="watch-sensor-deck">
        <div className="deck-header">
          <span>Sensores de Muñeca (Simulador en Vivo)</span>
          <span className="muted">Sala {roomId}</span>
        </div>

        <div className="preset-btn-row">
          <button
            type="button"
            className={`preset-chip ${localBpm < 80 ? 'active-green' : ''}`}
            onClick={() => sendBiometrics(68, 0.06)}
          >
            Calma (68)
          </button>
          <button
            type="button"
            className={`preset-chip ${localBpm >= 80 && localBpm < 115 ? 'active-amber' : ''}`}
            onClick={() => sendBiometrics(98, 0.38)}
          >
            Tensión (98)
          </button>
          <button
            type="button"
            className={`preset-chip ${localBpm >= 115 ? 'active-red' : ''}`}
            onClick={() => sendBiometrics(134, 0.78)}
          >
            Pánico FOMO (134)
          </button>
        </div>

        <label className="bpm-slider-row">
          <span>Pulso cardíaco: <strong>{localBpm} BPM</strong></span>
          <input
            type="range"
            min="54"
            max="155"
            value={localBpm}
            onChange={(e) => sendBiometrics(Number(e.target.value))}
          />
        </label>

        <div className="deck-toggles">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={autoRecover}
              onChange={(e) => setAutoRecover(e.target.checked)}
            />
            <span>Auto-calmar pulso al respirar</span>
          </label>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={motionEnabled}
              onChange={(e) => setMotionEnabled(e.target.checked)}
            />
            <span>Gesto físico acelerómetro</span>
          </label>
        </div>
      </div>
    </div>
  );
}

