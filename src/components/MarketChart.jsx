import React, { useMemo } from 'react';

export function MarketChart({ ticker }) {
  const { pathD, areaD, minPrice, maxPrice, spikePoints, isPositive } = useMemo(() => {
    const history = ticker?.history || [];
    if (history.length < 2) {
      return {
        pathD: '',
        areaD: '',
        minPrice: 0,
        maxPrice: 0,
        spikePoints: [],
        isPositive: true,
      };
    }

    const prices = history.map((h) => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const pad = Math.max(0.01, (max - min) * 0.14);
    const lo = min - pad;
    const hi = max + pad;
    const width = 360;
    const height = 112;

    const coords = history.map((pt, i) => {
      const x = (i / (history.length - 1)) * width;
      const y = height - ((pt.price - lo) / (hi - lo)) * height;
      return { x, y, isSpike: pt.isSpike, price: pt.price };
    });

    const line = coords
      .map((c, idx) => `${idx === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;

    return {
      pathD: line,
      areaD: area,
      minPrice: min,
      maxPrice: max,
      spikePoints: coords.filter((c) => c.isSpike).slice(-5),
      isPositive: (ticker?.changePct ?? 0) >= 0,
    };
  }, [ticker]);

  if (!ticker) return null;

  const strokeColor = isPositive ? '#10b981' : '#f43f5e';
  const gradId = `chartGrad-${ticker.symbol}`;

  return (
    <div className="market-chart-card">
      <div className="chart-header-row">
        <div>
          <div className="ticker-title-row">
            <span className="ticker-symbol">{ticker.symbol}</span>
            <span className="ticker-name">{ticker.name}</span>
          </div>
          <div className="ticker-price-row">
            <span className="ticker-price">${ticker.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            <span className={`pill ${isPositive ? 'pill-green' : 'pill-red'}`}>
              {isPositive ? '+' : ''}
              {ticker.changePct}%
            </span>
            {Math.abs(ticker.recentBurstPct) >= 1.8 && (
              <span className="pill pill-amber">
                Impulso {ticker.recentBurstPct > 0 ? '+' : ''}
                {ticker.recentBurstPct}%
              </span>
            )}
          </div>
        </div>
        <div className="bid-ask-box">
          <div>
            <span className="muted">BID</span> <strong>${ticker.bid.toLocaleString('en-US')}</strong>
          </div>
          <div>
            <span className="muted">ASK</span> <strong>${ticker.ask.toLocaleString('en-US')}</strong>
          </div>
        </div>
      </div>

      <svg className="chart-svg" viewBox="0 0 360 112" preserveAspectRatio="none" aria-label={`Gráfica ${ticker.symbol}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.34" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="28" x2="360" y2="28" className="chart-grid-line" />
        <line x1="0" y1="56" x2="360" y2="56" className="chart-grid-line" />
        <line x1="0" y1="84" x2="360" y2="84" className="chart-grid-line" />
        {areaD && <path d={areaD} fill={`url(#${gradId})`} />}
        {pathD && <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="2.4" strokeLinecap="round" />}
        {spikePoints.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r="3.2" fill="#f59e0b" stroke="#060911" strokeWidth="1.2" />
        ))}
      </svg>

      <div className="chart-footer-row">
        <span>Mín: ${minPrice.toLocaleString('en-US')}</span>
        <span>{ticker.sector}</span>
        <span>Máx: ${maxPrice.toLocaleString('en-US')}</span>
      </div>
    </div>
  );
}

