/**
 * Wall Street multi-asset market simulator.
 * Generates realistic intraday ticks, bid/ask spreads, rolling history,
 * and sudden volatility events (flash crash / short squeeze) for live demos.
 */

const INITIAL_TICKERS = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corp.',
    sector: 'AI & Semiconductors',
    basePrice: 142.5,
    volatility: 0.0042,
    spreadBps: 4,
  },
  {
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF',
    sector: 'US Equities Index',
    basePrice: 598.2,
    volatility: 0.0018,
    spreadBps: 2,
  },
  {
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    sector: 'EV & Autonomy',
    basePrice: 318.4,
    volatility: 0.0055,
    spreadBps: 5,
  },
  {
    symbol: 'BTC',
    name: 'Bitcoin Spot',
    sector: 'Digital Macro',
    basePrice: 89450.0,
    volatility: 0.0048,
    spreadBps: 6,
  },
  {
    symbol: 'GLD',
    name: 'SPDR Gold Trust',
    sector: 'Safe Haven Macro',
    basePrice: 248.6,
    volatility: 0.0014,
    spreadBps: 3,
  },
];

const HISTORY_LIMIT = 90;
const BURST_WINDOW = 8;

function roundPrice(price) {
  if (price >= 1000) return Number(price.toFixed(2));
  return Number(price.toFixed(2));
}

function gaussianRandom() {
  // Box-Muller transform for realistic fat-tailed-adjacent market noise
  const u1 = Math.max(1e-7, Math.random());
  const u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

export class MarketEngine {
  constructor() {
    this.tickers = new Map();
    this._seedInitialHistory();
  }

  _seedInitialHistory() {
    const now = Date.now();
    for (const def of INITIAL_TICKERS) {
      let price = def.basePrice;
      const history = [];
      for (let i = HISTORY_LIMIT; i > 0; i -= 1) {
        const shock = gaussianRandom() * def.volatility * 0.7;
        price = Math.max(def.basePrice * 0.7, price * (1 + shock));
        history.push({
          ts: now - i * 1000,
          price: roundPrice(price),
          volume: Math.round(120 + Math.random() * 880),
          isSpike: false,
        });
      }

      const openPrice = history[0].price;
      const ticker = this._buildTickerState(def, price, openPrice, history);
      this.tickers.set(def.symbol, ticker);
    }
  }

  _buildTickerState(def, price, openPrice, history) {
    const rounded = roundPrice(price);
    const halfSpread = (rounded * (def.spreadBps / 10000)) / 2;
    const recentSlice = history.slice(-BURST_WINDOW);
    const burstAnchor = recentSlice[0]?.price || openPrice;
    const recentBurstPct = Number((((rounded - burstAnchor) / burstAnchor) * 100).toFixed(2));
    const changePct = Number((((rounded - openPrice) / openPrice) * 100).toFixed(2));

    return {
      symbol: def.symbol,
      name: def.name,
      sector: def.sector,
      volatility: def.volatility,
      spreadBps: def.spreadBps,
      price: rounded,
      openPrice,
      bid: roundPrice(rounded - halfSpread),
      ask: roundPrice(rounded + halfSpread),
      changePct,
      recentBurstPct,
      history,
    };
  }

  /**
   * Advances all tickers by one simulated tick and returns market alerts if thresholds hit.
   */
  tick() {
    const now = Date.now();
    const alerts = [];

    for (const [symbol, current] of this.tickers.entries()) {
      // Mean-reversion pull + stochastic volatility
      const reversion = ((current.openPrice - current.price) / current.openPrice) * 0.03;
      const stepPct = reversion + gaussianRandom() * current.volatility * 0.55;
      const nextPrice = Math.max(current.openPrice * 0.5, current.price * (1 + stepPct));

      const nextHistory = [
        ...current.history.slice(-(HISTORY_LIMIT - 1)),
        {
          ts: now,
          price: roundPrice(nextPrice),
          volume: Math.round(150 + Math.random() * 1400),
          isSpike: Math.abs(stepPct) > current.volatility * 1.4,
        },
      ];

      const updated = this._buildTickerState(current, nextPrice, current.openPrice, nextHistory);
      this.tickers.set(symbol, updated);

      if (Math.abs(updated.recentBurstPct) >= 2.2 && Math.abs(current.recentBurstPct) < 2.2) {
        alerts.push({
          symbol,
          type: updated.recentBurstPct > 0 ? 'SURGE_SPIKE' : 'FLASH_DROP',
          burstPct: updated.recentBurstPct,
          price: updated.price,
        });
      }
    }

    return {
      ts: now,
      snapshot: this.getSnapshot(),
      alerts,
    };
  }

  /**
   * Triggers a sharp institutional volatility shock (for live FOMO/Panic demos).
   */
  triggerVolatilityEvent(symbol, direction = 'CRASH') {
    const ticker = this.tickers.get(symbol);
    if (!ticker) return null;

    const now = Date.now();
    const magnitude = direction === 'SPIKE' ? 0.036 : -0.034;
    const steps = 3;
    let price = ticker.price;
    let history = [...ticker.history];

    for (let i = 0; i < steps; i += 1) {
      price = Math.max(ticker.openPrice * 0.45, price * (1 + magnitude / steps));
      history = [
        ...history.slice(-(HISTORY_LIMIT - 1)),
        {
          ts: now + i * 20,
          price: roundPrice(price),
          volume: Math.round(2800 + Math.random() * 2500),
          isSpike: true,
        },
      ];
    }

    const updated = this._buildTickerState(ticker, price, ticker.openPrice, history);
    this.tickers.set(symbol, updated);

    return {
      ticker: updated,
      alert: {
        symbol,
        type: direction === 'SPIKE' ? 'SURGE_SPIKE' : 'FLASH_DROP',
        burstPct: updated.recentBurstPct,
        price: updated.price,
      },
    };
  }

  getTicker(symbol) {
    return this.tickers.get(symbol) || null;
  }

  getSnapshot() {
    const result = {};
    for (const [symbol, ticker] of this.tickers.entries()) {
      result[symbol] = ticker;
    }
    return result;
  }
}

