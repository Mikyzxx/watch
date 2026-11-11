import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  MonitorSmartphone,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Watch,
  Wifi,
} from 'lucide-react';

function randomRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'WS';
  for (let i = 0; i < 3; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function PairingPortal({ roomId, onRoomChange, onNavigate }) {
  const [lanIps, setLanIps] = useState([]);
  const [selectedIp, setSelectedIp] = useState('');

  useEffect(() => {
    fetch('/api/network-info')
      .then((res) => res.json())
      .then((data) => {
        const ips = data?.lanIps || [];
        setLanIps(ips);
        if (ips[0]) setSelectedIp(ips[0]);
      })
      .catch(() => {});
  }, []);

  const portPart = window.location.port ? `:${window.location.port}` : '';
  const baseOrigin = selectedIp
    ? `${window.location.protocol}//${selectedIp}${portPart}`
    : window.location.origin;

  const phoneUrl = `${baseOrigin}/phone?room=${encodeURIComponent(roomId)}`;
  const watchUrl = `${baseOrigin}/watch?room=${encodeURIComponent(roomId)}`;

  return (
    <div className="portal-page">
      <div className="portal-hero">
        <div className="hero-badge">
          <Activity size={14} /> Sector Económico · FinTech Wall Street
        </div>
        <h1>
          Pulse<span>Stop</span>
        </h1>
        <p className="hero-lead">
          Cortafuegos bioconductual en tiempo real que conecta tu <strong>Teléfono (Terminal de Inversión)</strong> con tu <strong>Smartwatch (Sensor de Estrés + Llave Háptica)</strong> para frenar decisiones impulsivas por FOMO, pánico o <em>revenge trading</em>.
        </p>

        <div className="hero-cta-row">
          <button
            type="button"
            className="primary-cta"
            onClick={() => onNavigate('/demo', roomId)}
          >
            <MonitorSmartphone size={18} />
            Abrir Simulador Dual (Teléfono + Reloj en Vivo)
            <ArrowRight size={16} />
          </button>
          <button
            type="button"
            className="secondary-cta"
            onClick={() => onNavigate('/phone', roomId)}
          >
            <Smartphone size={16} /> Solo Teléfono
          </button>
          <button
            type="button"
            className="secondary-cta"
            onClick={() => onNavigate('/watch', roomId)}
          >
            <Watch size={16} /> Solo Smartwatch
          </button>
        </div>
      </div>

      {/* Why Phone + Watch Synergy */}
      <section className="synergy-grid">
        <div className="synergy-card">
          <div className="syn-icon emerald">
            <ShieldAlert size={20} />
          </div>
          <h3>1. Bloqueo Fisiológico Anti-FOMO</h3>
          <p>
            Si tu smartwatch detecta un pico de adrenalina (BPM alto + caída de HRV) mientras intentas apalancarte en un spike del mercado, el teléfono bloquea la orden automáticamente.
          </p>
        </div>
        <div className="synergy-card">
          <div className="syn-icon sky">
            <Watch size={20} />
          </div>
          <h3>2. Respiración & Llave en Muñeca</h3>
          <p>
            El bloqueo no se puede saltar desde el celular: debes completar ciclos guiados por vibración en tu muñeca y confirmar calma física desde el reloj para desbloquear.
          </p>
        </div>
        <div className="synergy-card">
          <div className="syn-icon amber">
            <Wifi size={20} />
          </div>
          <h3>3. Haptic Tape & Cobertura Discreta</h3>
          <p>
            Recibe alertas codificadas por vibración sin mirar pantallas durante juntas, o ejecuta un cierre de emergencia al 50%/100% directo desde el smartwatch.
          </p>
        </div>
      </section>

      {/* Multi-device Wi-Fi Pairing via QR */}
      <section className="pairing-panel">
        <div className="pairing-header">
          <div>
            <h2>Emparejamiento en Dispositivos Reales (Wi-Fi Local)</h2>
            <p>
              Escanea estos QR desde tu celular y tu smartwatch (o abre en dos pestañas) usando la misma sala para probar la sincronización real por WebSockets.
            </p>
          </div>
          <div className="room-config-box">
            <label>
              <span>Código de Sala</span>
              <div className="room-input-row">
                <input
                  type="text"
                  value={roomId}
                  maxLength={12}
                  onChange={(e) => onRoomChange(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                />
                <button
                  type="button"
                  onClick={() => onRoomChange(randomRoomCode())}
                  title="Generar código nuevo"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </label>

            {lanIps.length > 0 && (
              <label>
                <span>IP Red Local</span>
                <select value={selectedIp} onChange={(e) => setSelectedIp(e.target.value)}>
                  {lanIps.map((ip) => (
                    <option key={ip} value={ip}>
                      {ip}
                    </option>
                  ))}
                  <option value="localhost">localhost</option>
                </select>
              </label>
            )}
          </div>
        </div>

        <div className="qr-grid">
          <div className="qr-card">
            <div className="qr-title">
              <Smartphone size={16} /> App Teléfono
            </div>
            <img
              className="qr-img"
              src={`/api/qr?text=${encodeURIComponent(phoneUrl)}`}
              alt={`QR Teléfono ${phoneUrl}`}
            />
            <code className="qr-url">{phoneUrl}</code>
          </div>

          <div className="qr-card">
            <div className="qr-title">
              <Watch size={16} /> App Smartwatch
            </div>
            <img
              className="qr-img"
              src={`/api/qr?text=${encodeURIComponent(watchUrl)}`}
              alt={`QR Smartwatch ${watchUrl}`}
            />
            <code className="qr-url">{watchUrl}</code>
          </div>
        </div>
      </section>
    </div>
  );
}

