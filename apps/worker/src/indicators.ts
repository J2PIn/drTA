import type { Candle } from "./types";

export function sma(values: (number | null)[], length: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  let sum = 0;
  let count = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      out[i] = null;
      continue;
    }
    sum += v; count++;

    if (i >= length) {
      const prev = values[i - length];
      if (prev != null) { sum -= prev; count--; }
    }

    out[i] = (i >= length - 1 && count === length) ? sum / length : null;
  }
  return out;
}

export function ema(values: (number | null)[], length: number): (number | null)[] {
  const out: (number | null)[] = Array(values.length).fill(null);
  const k = 2 / (length + 1);

  let prevEma: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) { out[i] = null; continue; }

    if (prevEma == null) {
      // seed with SMA when enough data exists
      if (i >= length - 1) {
        const window = values.slice(i - length + 1, i + 1);
        if (window.every(x => x != null)) {
          const seed = (window as number[]).reduce((a, b) => a + b, 0) / length;
          prevEma = seed;
          out[i] = seed;
        } else out[i] = null;
      } else out[i] = null;
    } else {
      const next = v * k + prevEma * (1 - k);
      prevEma = next;
      out[i] = next;
    }
  }
  return out;
}

export function rsiFromCloses(closes: (number | null)[], length: number): (number | null)[] {
  const out: (number | null)[] = Array(closes.length).fill(null);

  let avgGain: number | null = null;
  let avgLoss: number | null = null;

  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const curr = closes[i];
    if (prev == null || curr == null) continue;

    const change = curr - prev;
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);

    if (i === length) {
      // seed using first length changes (1..length)
      let g = 0, l = 0;
      for (let j = 1; j <= length; j++) {
        const a = closes[j - 1], b = closes[j];
        if (a == null || b == null) { g = 0; l = 0; break; }
        const d = b - a;
        g += Math.max(0, d);
        l += Math.max(0, -d);
      }
      avgGain = g / length;
      avgLoss = l / length;
    } else if (i > length && avgGain != null && avgLoss != null) {
      avgGain = (avgGain * (length - 1) + gain) / length;
      avgLoss = (avgLoss * (length - 1) + loss) / length;
    }

    if (i >= length && avgGain != null && avgLoss != null) {
      if (avgLoss === 0) out[i] = 100;
      else {
        const rs = avgGain / avgLoss;
        out[i] = 100 - 100 / (1 + rs);
      }
    }
  }

  return out;
}

export function bbands(values: (number | null)[], length: number, mult: number) {
  const mid = sma(values, length);
  const upper: (number | null)[] = Array(values.length).fill(null);
  const lower: (number | null)[] = Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    const window = values.slice(i - length + 1, i + 1);
    if (window.some(x => x == null) || mid[i] == null) continue;

    const m = mid[i] as number;
    const variance = (window as number[]).reduce((acc, x) => acc + (x - m) ** 2, 0) / length;
    const sd = Math.sqrt(variance);

    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }

  return { mid, upper, lower };
}

export function macd(values: (number | null)[], fast: number, slow: number, signal: number) {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);

  const line: (number | null)[] = values.map((_, i) => {
    const a = fastE[i], b = slowE[i];
    return (a == null || b == null) ? null : a - b;
  });

  const signalLine = ema(line, signal);
  const hist: (number | null)[] = line.map((x, i) => (x == null || signalLine[i] == null) ? null : x - (signalLine[i] as number));

  return { line, signal: signalLine, hist };
}

export function closesFromCandles(candles: Candle[]): (number | null)[] {
  return candles.map(c => c.c);
}

export function rollingTrend(values: (number | null)[], length: number) {
  const slopePct: (number | null)[] = Array(values.length).fill(null);
  const r2: (number | null)[] = Array(values.length).fill(null);

  // x = 0..length-1 constants
  const n = length;
  const sumX = (n - 1) * n / 2;
  const sumX2 = (n - 1) * n * (2 * n - 1) / 6;
  const denom = n * sumX2 - sumX * sumX;

  for (let i = length - 1; i < values.length; i++) {
    const window = values.slice(i - length + 1, i + 1);
    if (window.some(v => v == null)) continue;

    const y = window as number[];
    const sumY = y.reduce((a, b) => a + b, 0);
    const meanY = sumY / n;

    let sumXY = 0;
    for (let k = 0; k < n; k++) sumXY += k * y[k];

    // linear regression: y = a + b x
    const b = (n * sumXY - sumX * sumY) / denom;

    // R^2
    const a = meanY - b * (sumX / n);
    let ssTot = 0;
    let ssRes = 0;
    for (let k = 0; k < n; k++) {
      const yHat = a + b * k;
      ssTot += (y[k] - meanY) ** 2;
      ssRes += (y[k] - yHat) ** 2;
    }
    const r2v = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    // normalize slope into % per bar relative to last value
    const last = y[n - 1];
    const slopePctPerBar = last === 0 ? 0 : (b / last) * 100;

    slopePct[i] = slopePctPerBar;
    r2[i] = r2v;
  }

  return { slopePct, r2 };
}
