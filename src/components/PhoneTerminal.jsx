import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Flame,
  History,
  Lock,
  Radio,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Watch,
  Zap,
} from 'lucide-react';
import { usePulseSocket } from '../hooks/usePulseSocket.js';
import { MarketChart } from './MarketChart.jsx';

const SYMBOLS = ['NVDA', 'SPY', 'TSLA', 'BTC', 'GLD'];
const NOTIONAL_PRESETS = [2500, 5000, 15000, 30000];
const LEVERAGE_PRESETS = [1, 2, 5, 10, 20];
const SL_PRESETS = [
  { label: 'Sin SL', value: 0 },
  { label: '1.5%', value: 1.5 },
  { label: '3.0%', value: 3.0 },
];

export function PhoneTerminal({ roomId, embedded = false }) {
  const [selectedSymbol, setSelectedSymbol] = useState('NVDA');
  const [side, setSide] = useState('BUY');
  const [notionalUsd, setNotionalUsd] = useState(15000);
  const [leverage, setLeverage] = useState(10);
  const [stopLossPct, setStopLossPct] = useState(0);
  const [activeTab, setActiveTab] = useState('positions');

  const { connected, latencyMs, roomState, lastOrderResult, clearOrderResult, send } =
    usePulseSocket({
      roomId,
      role: 'PHONE',
    });

  const market = roomState?.market || {};
  const ticker = market[selectedSymbol] || Object.values(market)[0];
  const biometrics = roomState?.biometrics;
  const account = roomState?.account;
  const cooldown = roomState?.cooldown;
  const watchConnected = (roomState?.devices?.watchCount || 0) > 0;
  const hapticEnabled = roomState?.hapticTapeEnabled ?? true;

  const effectiveExposure = notionalUsd * leverage;
  const totalPnl = (account?.unrealizedPnl || 0) + (account?.realizedPnl || 0);

  const bioBadgeClass = useMemo(() => {
    if (!watchConnected) return 'status-warn';
    if (biometrics?.state === 'TILT') return 'status-danger';
    if (biometrics?.state === 'ELEVATED') return 'status-warn';
    return 'status-ok';
  }, [watchConnected, biometrics?.state]);

  const submitOrder = (e) => {
    e.preventDefault();
    clearOrderResult();
    send({
      type: 'PHONE_SUBMIT_ORDER',
      symbol: selectedSymbol,
      side,
      notionalUsd,
      leverage,
      stopLossPct,
    });
  };

  const applySafeSuggestion = () => {
    const preview = cooldown?.blockedOrderPreview;
    if (preview) {
      setNotionalUsd(preview.suggestedSafeNotional || 5000);
      setLeverage(preview.suggestedSafeLeverage || 1);
      setStopLossPct(1.5);
    }
  };

  return (
    <div className={`phone-shell ${embedded ? 'phone-embedded' : 'phone-standalone'}`}>
      {/* Top Bar */}
      <header className="phone-header">
        <div className="brand-group">
          <div className="brand-logo">
            <Activity size={16} />
          </div>
          <div>
            <div className="brand-title">PulseStop</div>
            <div className="brand-sub">Sala {roomId} · {connected ? `${latencyMs ?? 10}ms` : 'Reconectando'}</div>
          </div>
        </div>

        <div className="header-actions">
          <div className={`watch-link-pill ${bioBadgeClass}`}>
            <Watch size={13} />
            {watchConnected ? (
              <span>{biometrics?.bpm ?? 68} BPM · {biometrics?.state}</span>
            ) : (
              <span>Sin Reloj</span>
            )}
          </div>
          <button
            type="button"
            className={`tape-toggle-btn ${hapticEnabled ? 'active' : ''}`}
            onClick={() => send({ type: 'PHONE_TOGGLE_HAPTIC_TAPE', enabled: !hapticEnabled })}
            title="Activar/Desactivar alertas hápticas silenciosas en Smartwatch"
          >
            <Radio size={13} />
            <span>{hapticEnabled ? 'Tape ON' : 'Tape OFF'}</span>
          </button>
        </div>
      </header>

      {/* Account & Capital Protected KPIs */}
      <section className="kpi-grid">
        <div className="kpi-card">
          <span className="kpi-label">Capital Total</span>
          <strong className="kpi-val">
            ${(account?.equity ?? 100000).toLocaleString('en-US', { maximumFractionDigits: 0 })}
          </strong>
          <span className={`kpi-sub ${totalPnl >= 0 ? 'text-green' : 'text-red'}`}>
            {totalPnl >= 0 ? '+' : ''}
            ${totalPnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} PnL
          </span>
        </div>

        <div className="kpi-card highlight-shield">
          <span className="kpi-label">
            <ShieldCheck size={12} /> Capital Protegido
          </span>
          <strong className="kpi-val text-emerald">
            ${(account?.stats?.capitalProtectedUsd ?? 0).toLocaleString('en-US')}
          </strong>
          <span className="kpi-sub">
            {account?.stats?.blockedOrders ?? 0} bloqueos · {account?.stats?.emergencyHedges ?? 0} coberturas reloj
          </span>
        </div>
      </section>

      {/* Ticker Selector */}
      <div className="ticker-strip">
        {SYMBOLS.map((sym) => {
          const item = market[sym];
          const isUp = (item?.changePct ?? 0) >= 0;
          return (
            <button
              key={sym}
              type="button"
              className={`ticker-chip ${selectedSymbol === sym ? 'selected' : ''}`}
              onClick={() => setSelectedSymbol(sym)}
            >
              <span className="chip-sym">{sym}</span>
              <span className={`chip-pct ${isUp ? 'text-green' : 'text-red'}`}>
                {isUp ? '+' : ''}
                {item?.changePct ?? '0.00'}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Live Chart */}
      <MarketChart ticker={ticker} />

      {/* Volatility & Haptic Demo Triggers */}
      <div className="sim-actions-row">
        <button
          type="button"
          className="sim-btn spike"
          onClick={() =>
            send({ type: 'PHONE_TRIGGER_VOLATILITY', symbol: selectedSymbol, direction: 'SPIKE' })
          }
        >
          <TrendingUp size={13} /> Simular Spike FOMO
        </button>
        <button
          type="button"
          className="sim-btn crash"
          onClick={() =>
            send({ type: 'PHONE_TRIGGER_VOLATILITY', symbol: selectedSymbol, direction: 'CRASH' })
          }
        >
          <TrendingDown size={13} /> Simular Flash Crash
        </button>
        <button
          type="button"
          className="sim-btn ping"
          onClick={() =>
            send({
              type: 'PHONE_PING_WATCH_HAPTIC',
              code: 'VIX_WARN',
              detail: `Pulso táctil manual (${selectedSymbol})`,
            })
          }
        >
          <Zap size={13} /> Pulsar Reloj
        </button>
      </div>

      {/* Order Execution Ticket + Circuit Breaker Lock */}
      <section className="order-ticket-card">
        {cooldown?.active && (
          <div className="circuit-lock-overlay" role="alert">
            <div className="lock-icon-ring">
              <Lock size={22} />
            </div>
            <h4>{cooldown.headline || 'Circuit Breaker Biométrico Activo'}</h4>
            <p className="lock-reason">{cooldown.reason}</p>

            <div className="lock-sync-box">
              <div className="lock-sync-row">
                <span>Pulso en Smartwatch:</span>
                <strong className={biometrics?.stressScore <= 45 ? 'text-green' : 'text-red'}>
                  {biometrics?.bpm ?? '--'} BPM · Tilt {biometrics?.stressScore ?? '--'}/100
                </strong>
              </div>
              <div className="lock-sync-row">
                <span>Respiración en muñeca:</span>
                <strong>
                  {cooldown.completedBreathCycles}/{cooldown.requiredBreathCycles} ciclos
                </strong>
              </div>
              <div className="lock-sync-state">
                {cooldown.canConfirmOnWatch
                  ? '✅ Pulso estable. Confirma desbloqueo tocando tu Smartwatch.'
                  : '⏳ Respira siguiendo el reloj para habilitar desbloqueo.'}
              </div>
            </div>

            {cooldown.blockedOrderPreview && (
              <button
                type="button"
                className="safe-suggest-btn"
                onClick={applySafeSuggestion}
              >
                Precargar tamaño seguro (${cooldown.blockedOrderPreview.suggestedSafeNotional.toLocaleString()} · 1x · SL 1.5%)
              </button>
            )}
          </div>
        )}

        <form onSubmit={submitOrder} className="order-form">
          <div className="side-toggle">
            <button
              type="button"
              className={`side-btn buy ${side === 'BUY' ? 'active' : ''}`}
              onClick={() => setSide('BUY')}
            >
              <ArrowUpRight size={15} /> COMPRAR (LONG)
            </button>
            <button
              type="button"
              className={`side-btn sell ${side === 'SELL' ? 'active' : ''}`}
              onClick={() => setSide('SELL')}
            >
              <ArrowDownRight size={15} /> VENDER (SHORT)
            </button>
          </div>

          <div className="ticket-control-group">
            <div className="control-label-row">
              <span>Margen (USD)</span>
              <strong>${notionalUsd.toLocaleString('en-US')}</strong>
            </div>
            <div className="pill-options-row">
              {NOTIONAL_PRESETS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={`mini-opt ${notionalUsd === amt ? 'selected' : ''}`}
                  onClick={() => setNotionalUsd(amt)}
                >
                  ${(amt / 1000).toFixed(1).replace('.0', '')}k
                </button>
              ))}
            </div>
          </div>

          <div className="ticket-split-controls">
            <div className="ticket-control-group">
              <div className="control-label-row">
                <span>Apalancamiento</span>
                <strong className={leverage >= 5 ? 'text-amber' : ''}>{leverage}x</strong>
              </div>
              <div className="pill-options-row">
                {LEVERAGE_PRESETS.map((lev) => (
                  <button
                    key={lev}
                    type="button"
                    className={`mini-opt ${leverage === lev ? 'selected' : ''}`}
                    onClick={() => setLeverage(lev)}
                  >
                    {lev}x
                  </button>
                ))}
              </div>
            </div>

            <div className="ticket-control-group">
              <div className="control-label-row">
                <span>Stop-Loss</span>
                <strong>{stopLossPct > 0 ? `${stopLossPct}%` : 'Ninguno'}</strong>
              </div>
              <div className="pill-options-row">
                {SL_PRESETS.map((sl) => (
                  <button
                    key={sl.value}
                    type="button"
                    className={`mini-opt ${stopLossPct === sl.value ? 'selected' : ''}`}
                    onClick={() => setStopLossPct(sl.value)}
                  >
                    {sl.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Pre-flight biometric guard notice */}
          <div
            className={`preflight-bar ${
              biometrics?.state === 'TILT'
                ? 'danger'
                : biometrics?.state === 'ELEVATED'
                ? 'warn'
                : 'ok'
            }`}
          >
            {biometrics?.state === 'TILT' ? (
              <>
                <Flame size={14} />
                <span>
                  Smartwatch en <strong>MODO TILT ({biometrics.bpm} BPM)</strong> · Exposición ${effectiveExposure.toLocaleString()} será bloqueada
                </span>
              </>
            ) : biometrics?.state === 'ELEVATED' ? (
              <>
                <AlertOctagon size={14} />
                <span>
                  Estrés moderado ({biometrics.bpm} BPM) · Evita apalancamiento alto o perseguir picos
                </span>
              </>
            ) : (
              <>
                <ShieldCheck size={14} />
                <span>
                  Biometría estable ({biometrics?.bpm ?? 68} BPM · HRV {biometrics?.hrv ?? 62}ms) · Exposición ${effectiveExposure.toLocaleString()}
                </span>
              </>
            )}
          </div>

          <button
            type="submit"
            className={`submit-order-btn ${side === 'BUY' ? 'buy' : 'sell'}`}
            disabled={Boolean(cooldown?.active)}
          >
            {side === 'BUY' ? 'Ejecutar Compra' : 'Ejecutar Venta'} {selectedSymbol} (${effectiveExposure.toLocaleString()})
          </button>
        </form>

        {lastOrderResult && !cooldown?.active && (
          <div
            className={`order-toast ${lastOrderResult.verdict?.allowed ? 'ok' : 'blocked'}`}
            onClick={clearOrderResult}
          >
            <CheckCircle2 size={15} />
            <span>{lastOrderResult.verdict?.headline}</span>
          </div>
        )}
      </section>

      {/* Positions & Behavioral Audit Tabs */}
      <section className="bottom-ledger-card">
        <div className="ledger-tabs">
          <button
            type="button"
            className={`ledger-tab ${activeTab === 'positions' ? 'active' : ''}`}
            onClick={() => setActiveTab('positions')}
          >
            Posiciones ({account?.positions?.length || 0})
          </button>
          <button
            type="button"
            className={`ledger-tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <History size={13} /> Bitácora Conductual
          </button>
        </div>

        {activeTab === 'positions' ? (
          <div className="positions-list">
            {!account?.positions?.length ? (
              <div className="empty-state">
                Sin posiciones abiertas. Ejecuta una orden en calma o prueba simular FOMO con el Smartwatch alterado.
              </div>
            ) : (
              account.positions.map((pos) => (
                <div key={pos.id} className="position-row">
                  <div>
                    <div className="pos-title">
                      <span className={`side-tag ${pos.side === 'BUY' ? 'buy' : 'sell'}`}>
                        {pos.side}
                      </span>
                      <strong>{pos.symbol}</strong>
                      <span className="muted">{pos.leverage}x · ${pos.notionalUsd.toLocaleString()}</span>
                    </div>
                    <div className="pos-sub">
                      Entrada ${pos.entryPrice} → Actual ${pos.markPrice}
                    </div>
                  </div>
                  <div className="pos-right">
                    <strong className={pos.pnl >= 0 ? 'text-green' : 'text-red'}>
                      {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                    </strong>
                    <button
                      type="button"
                      className="close-pos-btn"
                      onClick={() => send({ type: 'PHONE_CLOSE_POSITION', positionId: pos.id })}
                    >
                      Cerrar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="audit-list">
            {(roomState?.auditLog || []).map((entry) => (
              <div key={entry.id} className={`audit-row type-${entry.type.toLowerCase()}`}>
                <div className="audit-top">
                  <strong>{entry.title}</strong>
                  <span className="muted">
                    {new Date(entry.ts).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                </div>
                <p>{entry.detail}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

