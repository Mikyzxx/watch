import { useCallback, useEffect, useRef, useState } from 'react';

function buildWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/**
 * Shared real-time WebSocket hook linking Phone and Smartwatch clients in the same room.
 */
export function usePulseSocket({ roomId = 'WALLST', role = 'OBSERVER', onHapticEvent } = {}) {
  const [connected, setConnected] = useState(false);
  const [latencyMs, setLatencyMs] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [lastOrderResult, setLastOrderResult] = useState(null);
  const [lastError, setLastError] = useState(null);

  const wsRef = useRef(null);
  const hapticHandlerRef = useRef(onHapticEvent);
  hapticHandlerRef.current = onHapticEvent;

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    let active = true;
    let reconnectTimer = null;
    let pingInterval = null;

    function connect() {
      if (!active) return;
      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) return;
        setConnected(true);
        setLastError(null);
        ws.send(JSON.stringify({ type: 'JOIN', roomId, role }));
        ws.send(JSON.stringify({ type: 'PING', clientTs: Date.now() }));

        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'PING', clientTs: Date.now() }));
          }
        }, 3000);
      };

      ws.onmessage = (event) => {
        if (!active) return;
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'PONG') {
          setLatencyMs(Math.max(1, Date.now() - msg.clientTs));
          return;
        }

        if (msg.type === 'ROOM_STATE') {
          setRoomState(msg);
          return;
        }

        if (msg.type === 'MARKET_TICK') {
          setRoomState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              market: msg.market,
              account: msg.account || prev.account,
              serverTs: msg.ts,
            };
          });
          return;
        }

        if (msg.type === 'ORDER_RESULT') {
          setLastOrderResult({ ...msg, receivedAt: Date.now() });
          return;
        }

        if (msg.type === 'HAPTIC_EVENT') {
          hapticHandlerRef.current?.(msg);
          return;
        }

        if (msg.type === 'ERROR') {
          setLastError(msg.message);
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setConnected(false);
        if (pingInterval) clearInterval(pingInterval);
        reconnectTimer = setTimeout(connect, 1200);
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    return () => {
      active = false;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [roomId, role]);

  const clearOrderResult = useCallback(() => setLastOrderResult(null), []);

  return {
    connected,
    latencyMs,
    roomState,
    lastOrderResult,
    clearOrderResult,
    lastError,
    send,
  };
}

