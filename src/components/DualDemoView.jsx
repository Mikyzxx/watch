import React from 'react';
import { ArrowLeft, RotateCcw, Smartphone, Watch, Zap } from 'lucide-react';
import { PhoneTerminal } from './PhoneTerminal.jsx';
import { SmartwatchApp } from './SmartwatchApp.jsx';
import { usePulseSocket } from '../hooks/usePulseSocket.js';

export function DualDemoView({ roomId, onNavigate }) {
  const { connected, roomState, send } = usePulseSocket({
    roomId,
    role: 'OBSERVER',
  });

  const devices = roomState?.devices || { phoneCount: 0, watchCount: 0 };

  return (
    <div className="dual-demo-page">
      <header className="demo-topbar">
        <div className="demo-topbar-left">
          <button
            type="button"
            className="back-btn"
            onClick={() => onNavigate('/', roomId)}
          >
            <ArrowLeft size={15} /> Portal & QR
          </button>
          <div className="demo-title-block">
            <strong>PulseStop Live Dual Lab</strong>
            <span className="muted">
              Sala {roomId} · {connected ? `${devices.phoneCount} Teléfono ↔ ${devices.watchCount} Smartwatch` : 'Conectando...'}
            </span>
          </div>
        </div>

        <div className="demo-topbar-actions">
          <button
            type="button"
            className="demo-link-btn"
            onClick={() => onNavigate('/phone', roomId)}
          >
            <Smartphone size={14} /> Vista Teléfono
          </button>
          <button
            type="button"
            className="demo-link-btn"
            onClick={() => onNavigate('/watch', roomId)}
          >
            <Watch size={14} /> Vista Reloj
          </button>
          <button
            type="button"
            className="demo-reset-btn"
            onClick={() => send({ type: 'RESET_DEMO' })}
          >
            <RotateCcw size={14} /> Reiniciar Sala
          </button>
        </div>
      </header>

      <div className="demo-walkthrough-strip">
        <Zap size={14} className="strip-icon" />
        <span>
          <strong>Prueba guiada:</strong> (1) En el <em>Smartwatch</em> pulsa <strong>Pánico FOMO (134)</strong> →
          (2) En el <em>Teléfono</em> intenta <strong>Comprar NVDA 10x</strong> (observa el bloqueo biométrico y vibración) →
          (3) Respira con el reloj y pulsa <strong>Confirmar Calma</strong> para desbloquear.
        </span>
      </div>

      <main className="dual-stage">
        <div className="device-column">
          <div className="device-caption">
            <Smartphone size={15} /> Teléfono · Terminal Wall Street
          </div>
          <div className="iphone-frame">
            <div className="iphone-notch" />
            <div className="iphone-viewport">
              <PhoneTerminal roomId={roomId} embedded />
            </div>
          </div>
        </div>

        <div className="sync-bridge-indicator" aria-hidden="true">
          <div className="bridge-line" />
          <div className={`bridge-node ${roomState?.cooldown?.active ? 'locked' : 'synced'}`}>
            <span>{roomState?.cooldown?.active ? 'LOCK' : 'SYNC'}</span>
          </div>
          <div className="bridge-line" />
        </div>

        <div className="device-column">
          <div className="device-caption">
            <Watch size={15} /> Smartwatch · Sensor Biométrico & Llave Háptica
          </div>
          <SmartwatchApp roomId={roomId} embedded />
        </div>
      </main>
    </div>
  );
}

