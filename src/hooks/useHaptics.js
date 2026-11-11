import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Triggers real device vibration (when supported) + subtle WebAudio haptic synthesis
 * so coded smartwatch alerts are perceptible both on mobile hardware and desktop demos.
 */
export function useHaptics({ soundEnabled = true } = {}) {
  const [activeWave, setActiveWave] = useState(null);
  const audioCtxRef = useRef(null);
  const waveTimerRef = useRef(null);

  const playSoundPattern = useCallback(
    (severity, pattern = [120]) => {
      if (!soundEnabled || typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }

        const baseFreq =
          severity === 'critical' ? 140 : severity === 'warn' ? 240 : severity === 'success' ? 420 : 310;

        let offset = 0;
        pattern.forEach((ms, index) => {
          const durationSec = Math.min(0.45, Math.max(0.05, ms / 1000));
          if (index % 2 === 0) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = severity === 'critical' ? 'triangle' : 'sine';
            osc.frequency.setValueAtTime(
              severity === 'success' && index > 0 ? baseFreq * 1.25 : baseFreq,
              ctx.currentTime + offset
            );
            gain.gain.setValueAtTime(0.001, ctx.currentTime + offset);
            gain.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + offset + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + offset + durationSec);

            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + offset);
            osc.stop(ctx.currentTime + offset + durationSec + 0.02);
          }
          offset += durationSec;
        });
      } catch {
        // Ignore audio policy restrictions before user gesture
      }
    },
    [soundEnabled]
  );

  const triggerHaptic = useCallback(
    (event) => {
      const pattern = Array.isArray(event?.pattern) ? event.pattern : [120, 60, 120];
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(pattern);
        } catch {
          // Ignore unsupported vibrate errors
        }
      }

      playSoundPattern(event?.severity || 'info', pattern);
      setActiveWave({
        ...event,
        triggeredAt: Date.now(),
      });

      if (waveTimerRef.current) clearTimeout(waveTimerRef.current);
      waveTimerRef.current = setTimeout(() => {
        setActiveWave(null);
      }, 3600);
    },
    [playSoundPattern]
  );

  useEffect(() => {
    return () => {
      if (waveTimerRef.current) clearTimeout(waveTimerRef.current);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return { activeWave, triggerHaptic };
}

/**
 * Listens for rapid wrist-flick motion on real mobile/watch hardware.
 */
export function useWristFlickDetector({ enabled = false, onFlick }) {
  const lastPeakRef = useRef(0);
  const flickCountRef = useRef(0);
  const onFlickRef = useRef(onFlick);
  onFlickRef.current = onFlick;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      return undefined;
    }

    function handleMotion(e) {
      const acc = e.accelerationIncludingGravity || e.acceleration;
      if (!acc) return;
      const magnitude = Math.hypot(acc.x || 0, acc.y || 0, acc.z || 0);
      const now = Date.now();
      if (magnitude > 23 && now - lastPeakRef.current > 240) {
        if (now - lastPeakRef.current < 1100) {
          flickCountRef.current += 1;
        } else {
          flickCountRef.current = 1;
        }
        lastPeakRef.current = now;
        if (flickCountRef.current >= 2) {
          flickCountRef.current = 0;
          onFlickRef.current?.();
        }
      }
    }

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [enabled]);
}

