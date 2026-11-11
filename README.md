# PulseStop — Cortafuegos Bioconductual Teléfono ↔ Smartwatch

**Sector:** Económico (Inversión / Trading nivel Wall Street)  
**Stack:** React 19 + Vite + Node.js + Express 5 + WebSockets (`ws`) + PWA

---

## Idea Original y Problema que Resuelve

En mercados financieros de alta volatilidad (Wall Street, futuros, cripto o renta variable), **la principal causa de pérdidas graves no es la falta de gráficas, sino el sesgo emocional (*tilt*)**: compras impulsivas por *FOMO*, ventas por pánico y *revenge trading* tras una pérdida.

**PulseStop** convierte la pareja **Teléfono + Smartwatch** en un **cortafuegos bioconductual en tiempo real**:

1. **Smartwatch (Sensor fisiológico + Llave háptica en muñeca):**
   - Monitorea ritmo cardíaco (**BPM**), variabilidad cardíaca (**HRV**) y agitación de muñeca para calcular un **Tilt Score (0–100)**.
   - Recibe **Haptic Tape** (alertas silenciosas codificadas por vibración `navigator.vibrate`) cuando el mercado sufre picos súbitos o cruza umbrales, sin sacar el celular en juntas.
   - Permite ejecutar **Cobertura de Emergencia** (`-50%` o `Cerrar Todo`) directamente con un gesto de muñeca o botón táctil en el reloj.
2. **Teléfono (Terminal Wall Street + Motor de Reglas de Riesgo):**
   - Ejecuta órdenes (`BUY / SELL`), apalancamiento (`1x–20x`) y Stop-Loss sobre activos simulados en tiempo real (`NVDA`, `SPY`, `TSLA`, `BTC`, `GLD`).
   - Evalúa cada orden contra la telemetría en vivo del Smartwatch: si detecta estrés/tilt combinado con alto apalancamiento, persecución *FOMO* o *revenge trading*, **bloquea la orden antes de enviarse** y registra el **Capital Protegido**.
   - **Bloqueo imposible de burlar desde el celular:** exige completar ciclos de respiración guiada sincronizados en el reloj y confirmar calma física desde la muñeca (`WATCH_CONFIRM_UNLOCK`).

---

## Estructura del Proyecto

- `server/engine/marketEngine.js`: Simulador de mercado Wall Street con historial intradía, spread Bid/Ask y eventos de volatilidad (*Short Squeeze* / *Flash Crash*).
- `server/engine/riskGuard.js`: Motor bioconductual (cálculo de estrés, detección de *FOMO*, *Panic Dump*, *Revenge Trading* y reglas de desbloqueo).
- `server/roomManager.js`: Puente WebSocket bidireccional por salas (`JOIN`, `WATCH_BIOMETRICS`, `PHONE_SUBMIT_ORDER`, `HAPTIC_EVENT`, `WATCH_BREATH_CYCLE`, `WATCH_CONFIRM_UNLOCK`, `WATCH_EMERGENCY_HEDGE`).
- `server/index.js`: Servidor HTTP + WebSocket + generador QR (`/api/qr`) + detección de IP local (`/api/network-info`).
- `src/components/PairingPortal.jsx`: Portal inicial con emparejamiento por código de sala y códigos QR para dispositivos reales en Wi-Fi.
- `src/components/DualDemoView.jsx`: Simulador dual en vivo (Teléfono y Smartwatch lado a lado usando sockets independientes reales).
- `src/components/PhoneTerminal.jsx`: Interfaz móvil del terminal financiero.
- `src/components/SmartwatchApp.jsx`: Interfaz circular tipo Wear OS con anillo de estrés, pacer de respiración 4-4-6 y vibración háptica.
- `test/`: Pruebas unitarias y de integración WebSocket de extremo a extremo.

---

## Cómo Ejecutar

### 1. Instalar dependencias
```bash
npm install
```

### 2. Modo Desarrollo (React HMR + Servidor WebSocket)
```bash
npm run dev
```
- Abre `http://localhost:5173` en tu navegador.
- Para probar con un **teléfono y smartwatch reales** en el mismo Wi-Fi, abre el portal `/` y escanea los códigos QR generados con tu IP local.

### 3. Modo Producción (Un solo puerto)
```bash
npm run build
npm start
```
Disponible en `http://localhost:3050`.

### 4. Ejecutar Pruebas
```bash
npm test
```

---

## Rutas Disponibles

- `/` — Portal de arquitectura y emparejamiento QR por sala.
- `/demo?room=WALLST` — Vista Dual en vivo (Teléfono + Smartwatch sincronizados).
- `/phone?room=WALLST` — App independiente del Teléfono (PWA).
- `/watch?room=WALLST` — App independiente circular del Smartwatch (PWA).

