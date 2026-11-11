import { randomUUID } from 'node:crypto';
import {
  DEFAULT_BASELINE,
  evaluateBiometrics,
  evaluateCooldownUnlock,
  evaluateOrderAttempt,
} from './engine/riskGuard.js';

const HAPTIC_CODES = {
  TILT_LOCK: {
    code: 'TILT_LOCK',
    pattern: [220, 80, 220, 80, 420],
    label: 'CIRCUIT BREAKER ACTIVO',
    severity: 'critical',
  },
  COOLDOWN_DONE: {
    code: 'COOLDOWN_DONE',
    pattern: [120, 90, 260],
    label: 'PULSO ESTABILIZADO',
    severity: 'success',
  },
  SURGE_SPIKE: {
    code: 'SURGE_SPIKE',
    pattern: [90, 60, 90],
    label: 'VOLATILIDAD ALCISTA (FOMO RISK)',
    severity: 'warn',
  },
  FLASH_DROP: {
    code: 'FLASH_DROP',
    pattern: [180, 70, 180, 70, 180],
    label: 'CAÍDA SÚBITA (FLASH DROP)',
    severity: 'critical',
  },
  TP_HIT: {
    code: 'TP_HIT',
    pattern: [300],
    label: 'TARGET DE UTILIDAD',
    severity: 'success',
  },
  SL_RISK: {
    code: 'SL_RISK',
    pattern: [140, 70, 140, 70, 140],
    label: 'STOP-LOSS EN ZONA CRÍTICA',
    severity: 'warn',
  },
  VIX_WARN: {
    code: 'VIX_WARN',
    pattern: [100, 80, 100],
    label: 'ALERTA SILENCIOSA DE MESA',
    severity: 'info',
  },
  EMERGENCY_HEDGE: {
    code: 'EMERGENCY_HEDGE',
    pattern: [260, 80, 140],
    label: 'COBERTURA EJECUTADA',
    severity: 'success',
  },
};

function sanitizeRoomId(raw) {
  const cleaned = String(raw || 'DEMO')
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, 12);
  return cleaned || 'DEMO';
}

function createInitialRoomState(roomId) {
  const bio = evaluateBiometrics(DEFAULT_BASELINE);
  return {
    roomId,
    clients: new Set(),
    biometrics: {
      ...bio,
      baseline: { ...DEFAULT_BASELINE },
      updatedAt: Date.now(),
    },
    hapticTapeEnabled: true,
    account: {
      startingEquity: 100_000,
      cash: 100_000,
      positions: [],
      closedTrades: [],
      stats: {
        blockedOrders: 0,
        executedOrders: 0,
        capitalProtectedUsd: 0,
        emergencyHedges: 0,
      },
    },
    cooldown: {
      active: false,
      requiredBreathCycles: 2,
      completedBreathCycles: 0,
      canConfirmOnWatch: false,
      unlockedByWatch: false,
      reason: null,
      blockedOrderPreview: null,
      startedAt: null,
    },
    auditLog: [
      {
        id: randomUUID(),
        ts: Date.now(),
        type: 'SYSTEM',
        title: 'Sesión PulseStop iniciada',
        detail: `Sala ${roomId} lista para sincronizar Teléfono ↔ Smartwatch.`,
      },
    ],
  };
}

export class RoomManager {
  constructor(marketEngine) {
    this.marketEngine = marketEngine;
    this.rooms = new Map();
  }

  getOrCreateRoom(roomId) {
    const id = sanitizeRoomId(roomId);
    if (!this.rooms.has(id)) {
      this.rooms.set(id, createInitialRoomState(id));
    }
    return this.rooms.get(id);
  }

  _countDevices(room) {
    let phoneCount = 0;
    let watchCount = 0;
    for (const client of room.clients) {
      if (client.ws.readyState !== 1) continue;
      if (client.role === 'PHONE') phoneCount += 1;
      if (client.role === 'WATCH') watchCount += 1;
    }
    return { phoneCount, watchCount };
  }

  _computeEquity(room) {
    const snapshot = this.marketEngine.getSnapshot();
    let unrealizedPnl = 0;
    let allocatedMargin = 0;

    const enrichedPositions = room.account.positions.map((pos) => {
      const ticker = snapshot[pos.symbol];
      const markPrice = ticker ? ticker.price : pos.entryPrice;
      const priceDeltaPct = (markPrice - pos.entryPrice) / pos.entryPrice;
      const signedPct = pos.side === 'BUY' ? priceDeltaPct : -priceDeltaPct;
      const pnl = Number((pos.notionalUsd * pos.leverage * signedPct).toFixed(2));
      unrealizedPnl += pnl;
      allocatedMargin += pos.notionalUsd;
      return {
        ...pos,
        markPrice,
        pnl,
        pnlPct: Number((signedPct * pos.leverage * 100).toFixed(2)),
      };
    });

    const realizedPnl = room.account.closedTrades.reduce((acc, t) => acc + t.pnl, 0);
    const equity = Number((room.account.startingEquity + realizedPnl + unrealizedPnl).toFixed(2));

    return {
      startingEquity: room.account.startingEquity,
      equity,
      cash: Number((equity - allocatedMargin).toFixed(2)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(2)),
      realizedPnl: Number(realizedPnl.toFixed(2)),
      positions: enrichedPositions,
      closedTrades: room.account.closedTrades.slice(0, 10),
      stats: { ...room.account.stats },
    };
  }

  _buildRoomStatePayload(room) {
    return {
      type: 'ROOM_STATE',
      roomId: room.roomId,
      devices: this._countDevices(room),
      biometrics: room.biometrics,
      hapticTapeEnabled: room.hapticTapeEnabled,
      account: this._computeEquity(room),
      cooldown: room.cooldown,
      auditLog: room.auditLog.slice(0, 25),
      market: this.marketEngine.getSnapshot(),
      serverTs: Date.now(),
    };
  }

  _send(ws, payload) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(payload));
    }
  }

  _broadcast(room, payload, roleFilter = null) {
    const raw = JSON.stringify(payload);
    for (const client of room.clients) {
      if (client.ws.readyState !== 1) continue;
      if (roleFilter && client.role !== roleFilter) continue;
      client.ws.send(raw);
    }
  }

  _pushAudit(room, entry) {
    room.auditLog = [
      { id: randomUUID(), ts: Date.now(), ...entry },
      ...room.auditLog.slice(0, 29),
    ];
  }

  _emitHapticToWatch(room, codeKey, detail) {
    const preset = HAPTIC_CODES[codeKey] || HAPTIC_CODES.VIX_WARN;
    this._broadcast(
      room,
      {
        type: 'HAPTIC_EVENT',
        code: preset.code,
        pattern: preset.pattern,
        label: preset.label,
        severity: preset.severity,
        detail,
        ts: Date.now(),
      },
      'WATCH'
    );
  }

  attachClient(ws, roomId, role = 'OBSERVER') {
    const normalizedRole = ['PHONE', 'WATCH', 'OBSERVER'].includes(String(role).toUpperCase())
      ? String(role).toUpperCase()
      : 'OBSERVER';

    // Remove from any previous room first
    this.detachClient(ws);

    const room = this.getOrCreateRoom(roomId);
    const clientRecord = { ws, role: normalizedRole, connectedAt: Date.now() };
    room.clients.add(clientRecord);
    ws._pulseRoom = room;
    ws._pulseClient = clientRecord;

    this._broadcast(room, this._buildRoomStatePayload(room));
    return room;
  }

  detachClient(ws) {
    const room = ws._pulseRoom;
    const client = ws._pulseClient;
    if (!room || !client) return;

    room.clients.delete(client);
    ws._pulseRoom = null;
    ws._pulseClient = null;
    this._broadcast(room, this._buildRoomStatePayload(room));
  }

  handleMessage(ws, rawMessage) {
    let msg;
    try {
      msg = JSON.parse(rawMessage.toString());
    } catch {
      this._send(ws, { type: 'ERROR', message: 'Invalid JSON payload' });
      return;
    }

    if (msg.type === 'PING') {
      this._send(ws, { type: 'PONG', clientTs: msg.clientTs, serverTs: Date.now() });
      return;
    }

    if (msg.type === 'JOIN') {
      this.attachClient(ws, msg.roomId, msg.role);
      return;
    }

    const room = ws._pulseRoom;
    if (!room) {
      this._send(ws, { type: 'ERROR', message: 'Join a room first' });
      return;
    }

    switch (msg.type) {
      case 'WATCH_BIOMETRICS':
        this._onWatchBiometrics(room, msg);
        break;
      case 'PHONE_SUBMIT_ORDER':
        this._onPhoneSubmitOrder(room, ws, msg);
        break;
      case 'PHONE_CLOSE_POSITION':
        this._onPhoneClosePosition(room, msg);
        break;
      case 'PHONE_TRIGGER_VOLATILITY':
        this._onTriggerVolatility(room, msg);
        break;
      case 'PHONE_TOGGLE_HAPTIC_TAPE':
        room.hapticTapeEnabled = Boolean(msg.enabled);
        this._pushAudit(room, {
          type: 'SYSTEM',
          title: room.hapticTapeEnabled ? 'Haptic Tape activado' : 'Haptic Tape silenciado',
          detail: room.hapticTapeEnabled
            ? 'El reloj recibirá alertas codificadas por vibración.'
            : 'Solo alertas críticas del Circuit Breaker vibrarán en muñeca.',
        });
        this._broadcast(room, this._buildRoomStatePayload(room));
        break;
      case 'PHONE_PING_WATCH_HAPTIC':
        this._emitHapticToWatch(
          room,
          msg.code || 'VIX_WARN',
          msg.detail || 'Señal silenciosa enviada desde el terminal móvil.'
        );
        this._pushAudit(room, {
          type: 'HAPTIC_ALERT',
          title: `Pulso háptico enviado (${msg.code || 'VIX_WARN'})`,
          detail: msg.detail || 'Confirmación táctil silenciosa en Smartwatch.',
        });
        this._broadcast(room, this._buildRoomStatePayload(room));
        break;
      case 'WATCH_BREATH_CYCLE':
        this._onWatchBreathCycle(room);
        break;
      case 'WATCH_CONFIRM_UNLOCK':
        this._onWatchConfirmUnlock(room);
        break;
      case 'WATCH_EMERGENCY_HEDGE':
        this._onWatchEmergencyHedge(room, msg);
        break;
      case 'RESET_DEMO':
        this._onResetDemo(room);
        break;
      default:
        this._send(ws, { type: 'ERROR', message: `Unsupported message type: ${msg.type}` });
    }
  }

  _onWatchBiometrics(room, msg) {
    const bio = evaluateBiometrics({
      bpm: Number(msg.bpm ?? room.biometrics.bpm),
      hrv: Number(msg.hrv ?? room.biometrics.hrv),
      agitation: Number(msg.agitation ?? room.biometrics.agitation),
      baseline: room.biometrics.baseline,
    });

    room.biometrics = {
      ...bio,
      baseline: room.biometrics.baseline,
      updatedAt: Date.now(),
    };

    if (room.cooldown.active) {
      const unlockCheck = evaluateCooldownUnlock({
        biometrics: room.biometrics,
        completedBreathCycles: room.cooldown.completedBreathCycles,
        requiredBreathCycles: room.cooldown.requiredBreathCycles,
        watchConfirmed: false,
      });
      const becameReady = !room.cooldown.canConfirmOnWatch && unlockCheck.canConfirmOnWatch;
      room.cooldown.canConfirmOnWatch = unlockCheck.canConfirmOnWatch;
      if (becameReady) {
        this._emitHapticToWatch(
          room,
          'COOLDOWN_DONE',
          'Pulso estabilizado. Toca "Confirmar Calma" en tu reloj.'
        );
      }
    }

    this._broadcast(room, this._buildRoomStatePayload(room));
  }

  _onPhoneSubmitOrder(room, senderWs, msg) {
    const symbol = String(msg.symbol || 'NVDA').toUpperCase();
    const side = msg.side === 'SELL' ? 'SELL' : 'BUY';
    const notionalUsd = Math.max(500, Math.round(Number(msg.notionalUsd) || 5000));
    const leverage = Math.max(1, Math.min(20, Math.round(Number(msg.leverage) || 1)));
    const stopLossPct = msg.stopLossPct ? Number(msg.stopLossPct) : 0;

    const marketTicker = this.marketEngine.getTicker(symbol);
    if (!marketTicker) {
      this._send(senderWs, { type: 'ERROR', message: `Unknown ticker ${symbol}` });
      return;
    }

    const accountSummary = this._computeEquity(room);
    const verdict = evaluateOrderAttempt({
      order: { symbol, side, notionalUsd, leverage, stopLossPct },
      biometrics: room.biometrics,
      marketTicker,
      accountEquity: accountSummary.equity,
      recentClosedTrades: room.account.closedTrades,
      cooldownState: room.cooldown,
    });

    if (!verdict.allowed) {
      room.account.stats.blockedOrders += 1;
      room.account.stats.capitalProtectedUsd += verdict.protectedCapitalUsd;

      room.cooldown = {
        active: true,
        requiredBreathCycles: verdict.requiredBreathCycles,
        completedBreathCycles: room.cooldown.active ? room.cooldown.completedBreathCycles : 0,
        canConfirmOnWatch: false,
        unlockedByWatch: false,
        reason: verdict.explanation,
        headline: verdict.headline,
        blockedOrderPreview: {
          symbol,
          side,
          notionalUsd,
          leverage,
          suggestedSafeNotional: verdict.suggestedSafeNotional,
          suggestedSafeLeverage: verdict.suggestedSafeLeverage,
        },
        startedAt: room.cooldown.startedAt || Date.now(),
      };

      this._pushAudit(room, {
        type: 'BLOCKED',
        symbol,
        amountUsd: verdict.protectedCapitalUsd,
        title: `Orden bloqueada: ${side} ${symbol} (${leverage}x)`,
        detail: verdict.explanation,
      });

      this._emitHapticToWatch(
        room,
        'TILT_LOCK',
        `${side} ${symbol} ${leverage}x bloqueada (Tilt ${verdict.tiltScore}/100). Inicia respiración.`
      );

      this._send(senderWs, { type: 'ORDER_RESULT', verdict });
      this._broadcast(room, this._buildRoomStatePayload(room));
      return;
    }

    // Execute order
    const execPrice = side === 'BUY' ? marketTicker.ask : marketTicker.bid;
    const position = {
      id: randomUUID().slice(0, 8),
      symbol,
      side,
      notionalUsd,
      leverage,
      entryPrice: execPrice,
      stopLossPct,
      openedAt: Date.now(),
    };

    room.account.positions = [position, ...room.account.positions];
    room.account.stats.executedOrders += 1;

    this._pushAudit(room, {
      type: 'EXECUTED',
      symbol,
      amountUsd: notionalUsd * leverage,
      title: `Orden ejecutada: ${side} ${symbol} $${notionalUsd.toLocaleString()} (${leverage}x)`,
      detail: `Entrada @ $${execPrice.toLocaleString()} con Tilt ${verdict.tiltScore}/100 (${verdict.bioState}).`,
    });

    if (room.hapticTapeEnabled) {
      this._emitHapticToWatch(
        room,
        'VIX_WARN',
        `Ejecutada ${side} ${symbol} ${leverage}x @ $${execPrice}`
      );
    }

    this._send(senderWs, { type: 'ORDER_RESULT', verdict, position });
    this._broadcast(room, this._buildRoomStatePayload(room));
  }

  _onPhoneClosePosition(room, msg) {
    const idx = room.account.positions.findIndex((p) => p.id === msg.positionId);
    if (idx === -1) return;

    const pos = room.account.positions[idx];
    const ticker = this.marketEngine.getTicker(pos.symbol);
    const exitPrice = ticker ? (pos.side === 'BUY' ? ticker.bid : ticker.ask) : pos.entryPrice;
    const priceDeltaPct = (exitPrice - pos.entryPrice) / pos.entryPrice;
    const signedPct = pos.side === 'BUY' ? priceDeltaPct : -priceDeltaPct;
    const pnl = Number((pos.notionalUsd * pos.leverage * signedPct).toFixed(2));

    room.account.positions.splice(idx, 1);
    room.account.closedTrades = [
      {
        ...pos,
        exitPrice,
        pnl,
        closedAt: Date.now(),
      },
      ...room.account.closedTrades.slice(0, 19),
    ];

    this._pushAudit(room, {
      type: pnl >= 0 ? 'EXECUTED' : 'SYSTEM',
      symbol: pos.symbol,
      amountUsd: Math.abs(pnl),
      title: `Posición cerrada: ${pos.symbol} (${pnl >= 0 ? '+' : ''}$${pnl})`,
      detail:
        pnl < 0
          ? 'Pérdida registrada. Guardián monitoreará riesgo de Revenge Trading por 90s.'
          : 'Utilidad realizada registrada en balance.',
    });

    if (room.hapticTapeEnabled && pnl > 0) {
      this._emitHapticToWatch(room, 'TP_HIT', `Cierre ${pos.symbol}: +$${pnl}`);
    }

    this._broadcast(room, this._buildRoomStatePayload(room));
  }

  _onTriggerVolatility(room, msg) {
    const symbol = String(msg.symbol || 'NVDA').toUpperCase();
    const direction = msg.direction === 'SPIKE' ? 'SPIKE' : 'CRASH';
    const result = this.marketEngine.triggerVolatilityEvent(symbol, direction);
    if (!result) return;

    const { alert } = result;
    this._pushAudit(room, {
      type: 'VOLATILITY_EVENT',
      symbol,
      title:
        direction === 'SPIKE'
          ? `Short Squeeze en ${symbol} (${alert.burstPct > 0 ? '+' : ''}${alert.burstPct}%)`
          : `Flash Drop en ${symbol} (${alert.burstPct}%)`,
      detail: 'Evento de alta volatilidad inducido. Sensor FOMO/Pánico en alerta.',
    });

    if (room.hapticTapeEnabled) {
      this._emitHapticToWatch(
        room,
        alert.type,
        `${symbol} movió ${alert.burstPct > 0 ? '+' : ''}${alert.burstPct}% ($${alert.price})`
      );
    }

    this._broadcast(room, this._buildRoomStatePayload(room));
  }

  _onWatchBreathCycle(room) {
    if (!room.cooldown.active) return;

    room.cooldown.completedBreathCycles += 1;
    const unlockCheck = evaluateCooldownUnlock({
      biometrics: room.biometrics,
      completedBreathCycles: room.cooldown.completedBreathCycles,
      requiredBreathCycles: room.cooldown.requiredBreathCycles,
      watchConfirmed: false,
    });

    room.cooldown.canConfirmOnWatch = unlockCheck.canConfirmOnWatch;
    if (unlockCheck.canConfirmOnWatch) {
      this._emitHapticToWatch(
        room,
        'COOLDOWN_DONE',
        'Ciclos completos y pulso calmado. Confirma en tu reloj para desbloquear.'
      );
    }

    this._broadcast(room, this._buildRoomStatePayload(room));
  }

  _onWatchConfirmUnlock(room) {
    if (!room.cooldown.active) return;

    const unlockCheck = evaluateCooldownUnlock({
      biometrics: room.biometrics,
      completedBreathCycles: room.cooldown.completedBreathCycles,
      requiredBreathCycles: room.cooldown.requiredBreathCycles,
      watchConfirmed: true,
    });

    if (!unlockCheck.unlocked) {
      this._emitHapticToWatch(
        room,
        'VIX_WARN',
        `Aún no cumples calma (${room.biometrics.stressScore}/45 máx) o ciclos restantes.`
      );
      return;
    }

    room.cooldown = {
      active: false,
      requiredBreathCycles: 2,
      completedBreathCycles: 0,
      canConfirmOnWatch: false,
      unlockedByWatch: true,
      reason: null,
      blockedOrderPreview: null,
      startedAt: null,
    };

    this._pushAudit(room, {
      type: 'UNLOCKED',
      title: 'Desbloqueo confirmado desde Smartwatch',
      detail: `Pulso estabilizado en ${room.biometrics.bpm} BPM (Tilt ${room.biometrics.stressScore}/100). Terminal listo.`,
    });

    this._emitHapticToWatch(room, 'COOLDOWN_DONE', 'Terminal móvil desbloqueado con disciplina.');
    this._broadcast(room, this._buildRoomStatePayload(room));
  }

  _onWatchEmergencyHedge(room, msg) {
    const action = msg.action === 'CUT_HALF' ? 'CUT_HALF' : 'CLOSE_ALL';
    if (room.account.positions.length === 0) {
      this._emitHapticToWatch(room, 'VIX_WARN', 'Sin posiciones abiertas que cubrir.');
      return;
    }

    const snapshot = this.marketEngine.getSnapshot();
    let realized = 0;

    if (action === 'CLOSE_ALL') {
      for (const pos of room.account.positions) {
        const ticker = snapshot[pos.symbol];
        const exitPrice = ticker ? (pos.side === 'BUY' ? ticker.bid : ticker.ask) : pos.entryPrice;
        const delta = (exitPrice - pos.entryPrice) / pos.entryPrice;
        const signed = pos.side === 'BUY' ? delta : -delta;
        const pnl = Number((pos.notionalUsd * pos.leverage * signed).toFixed(2));
        realized += pnl;
        room.account.closedTrades = [
          { ...pos, exitPrice, pnl, closedAt: Date.now() },
          ...room.account.closedTrades.slice(0, 19),
        ];
      }
      room.account.positions = [];
    } else {
      room.account.positions = room.account.positions.map((pos) => {
        const remaining = Math.max(250, Math.round(pos.notionalUsd / 2));
        const closedNotional = pos.notionalUsd - remaining;
        const ticker = snapshot[pos.symbol];
        const exitPrice = ticker ? (pos.side === 'BUY' ? ticker.bid : ticker.ask) : pos.entryPrice;
        const delta = (exitPrice - pos.entryPrice) / pos.entryPrice;
        const signed = pos.side === 'BUY' ? delta : -delta;
        const pnl = Number((closedNotional * pos.leverage * signed).toFixed(2));
        realized += pnl;
        if (closedNotional > 0) {
          room.account.closedTrades = [
            { ...pos, notionalUsd: closedNotional, exitPrice, pnl, closedAt: Date.now() },
            ...room.account.closedTrades.slice(0, 19),
          ];
        }
        return { ...pos, notionalUsd: remaining };
      });
    }

    room.account.stats.emergencyHedges += 1;
    this._pushAudit(room, {
      type: 'EMERGENCY_HEDGE',
      amountUsd: Math.abs(Math.round(realized)),
      title:
        action === 'CLOSE_ALL'
          ? 'Cierre de emergencia desde Smartwatch'
          : 'Reducción 50% de riesgo desde Smartwatch',
      detail: `Gesto de muñeca redujo exposición inmediatamente (PnL realizado: ${realized >= 0 ? '+' : ''}$${realized.toFixed(2)}).`,
    });

    this._emitHapticToWatch(
      room,
      'EMERGENCY_HEDGE',
      action === 'CLOSE_ALL' ? '100% posiciones cerradas.' : 'Exposición reducida al 50%.'
    );
    this._broadcast(room, this._buildRoomStatePayload(room));
  }

  _onResetDemo(room) {
    const clients = room.clients;
    const fresh = createInitialRoomState(room.roomId);
    fresh.clients = clients;
    this.rooms.set(room.roomId, fresh);
    this._broadcast(fresh, this._buildRoomStatePayload(fresh));
  }

  /**
   * Broadcasts live market tick and pushes subtle haptic alerts if thresholds trigger.
   */
  broadcastMarketTick() {
    const { ts, snapshot, alerts } = this.marketEngine.tick();
    for (const room of this.rooms.values()) {
      if (room.clients.size === 0) continue;

      this._broadcast(room, {
        type: 'MARKET_TICK',
        ts,
        market: snapshot,
        account: this._computeEquity(room),
      });

      if (room.hapticTapeEnabled && alerts.length > 0) {
        for (const alert of alerts) {
          this._emitHapticToWatch(
            room,
            alert.type,
            `${alert.symbol} ${alert.burstPct > 0 ? '+' : ''}${alert.burstPct}% @ $${alert.price}`
          );
        }
      }
    }
  }
}
