import type { ChartRequest, ChartResponse, Candle, Series, Marker } from "./types";
import { jsonResponse, badRequest, sortCandlesByTime } from "./utils";
import { closesFromCandles, ema, sma, rsiFromCloses, bbands, macd, rollingTrend } from "./indicators";

function toLine(candles: Candle[], values: (number | null)[], name: string, panel: any = "price"): Series {
  return {
    type: "line",
    name,
    panel,
    data: candles.map((c, i) => ({ t: c.t, value: values[i] ?? null })),
  };
}

if (!body.candles && Array.isArray((body as any).series)) {
  const s = (body as any).series.sort((a:any,b:any)=>a.t-b.t);
  const candles = [];

  for (let i = 1; i < s.length; i++) {
    const prev = s[i-1].value;
    const curr = s[i].value;

    candles.push({
      t: s[i].t,
      o: prev,
      h: Math.max(prev, curr),
      l: Math.min(prev, curr),
      c: curr
    });
  }

  body.candles = candles;
}

function validateCandles(candles: any): Candle[] {
  if (!Array.isArray(candles) || candles.length < 2) throw new Error("candles must be an array with at least 2 points");
  for (const c of candles) {
    if (typeof c !== "object" || c == null) throw new Error("invalid candle object");
    for (const k of ["t", "o", "h", "l", "c"]) {
      if (typeof c[k] !== "number" || !Number.isFinite(c[k])) throw new Error(`candle.${k} must be a finite number`);
    }
    if (c.v != null && (typeof c.v !== "number" || !Number.isFinite(c.v))) throw new Error("candle.v must be a finite number if provided");
  }
  return sortCandlesByTime(candles as Candle[]);
}

function addTrendMarkers(
  candles: Candle[],
  markers: Marker[],
  slopePct: (number | null)[],
  r2: (number | null)[],
  r2Min: number,
  slopeMin: number,
  mode: "business" | "market"
) {
  const lastIdx = slopePct.length - 1;
  const s = slopePct[lastIdx];
  const rr = r2[lastIdx];
  if (s == null || rr == null) return;

  if (rr >= r2Min && s >= slopeMin) {
    markers.push({
      t: candles[lastIdx].t,
      panel: "price",
      kind: "buy",
      text: mode === "business" ? `Strong uptrend (slope ${s.toFixed(2)}%/bar, R² ${rr.toFixed(2)})`
                               : `Uptrend (slope ${s.toFixed(2)}%/bar, R² ${rr.toFixed(2)})`,
    });
  }

  if (rr >= r2Min && s <= -slopeMin) {
    markers.push({
      t: candles[lastIdx].t,
      panel: "price",
      kind: "sell",
      text: mode === "business" ? `Strong downtrend (slope ${s.toFixed(2)}%/bar, R² ${rr.toFixed(2)})`
                               : `Downtrend (slope ${s.toFixed(2)}%/bar, R² ${rr.toFixed(2)})`,
    });
  }
}

function buildMarkers(candles: Candle[], rsi14?: (number | null)[], mode: "business" | "market" = "market"): Marker[]
  const markers = buildMarkers(candles, rsi14, mode);
  if (!rsi14) return markers;

  // simple RSI threshold markers 
  for (let i = 0; i < rsi14.length; i++) {
    const v = rsi14[i];
    if (v == null) continue;
    if (v <= 30) {
      markers.push({
        t: candles[i].t,
        panel: "rsi",
        kind: "buy",
        text: mode === "business"
          ? "Momentum exhaustion (possible rebound)"
          : "RSI <= 30",
      });
    }
    
    if (v >= 70) {
      markers.push({
        t: candles[i].t,
        panel: "rsi",
        kind: "sell",
        text: mode === "business"
          ? "Overextension risk"
          : "RSI >= 70",
      });
    }
  }
  return markers;
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return jsonResponse({ ok: true });

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("ta-chart-api ok", { status: 200 });
    }

    if (request.method !== "POST" || url.pathname !== "/chart") {
      return new Response("Not found", { status: 404 });
    }

    let body: ChartRequest;
    try {
      body = await request.json();
    } catch {
      return badRequest("Invalid JSON");
    }


    // If no candles provided but generic series is provided,
      // convert series into synthetic candles
      if (!body.candles && Array.isArray(body.series)) {
        const s = body.series
          .filter((x: any) => typeof x?.t === "number" && typeof x?.value === "number")
          .sort((a: any, b: any) => a.t - b.t);
      
        const synthetic: any[] = [];
      
        for (let i = 1; i < s.length; i++) {
          const prev = s[i - 1].value;
          const curr = s[i].value;
      
          synthetic.push({
            t: s[i].t,
            o: prev,
            h: Math.max(prev, curr),
            l: Math.min(prev, curr),
            c: curr,
          });
        }
      
        body.candles = synthetic;
      }

    try {
      const candles = validateCandles((body as any).candles);
      const closes = closesFromCandles(candles);

      const primaryName = mode === "business" ? "KPI" : "price";

      const series: Series[] = [
        { type: "candles", name: primaryName, panel: "price", data: candles },
      ];

      // volume panel if present
      const volumeName = mode === "business" ? "activity" : "volume";

        series.push({
          type: "hist",
          name: volumeName,
          panel: "volume",
          data: candles.map(c => ({ t: c.t, value: typeof c.v === "number" ? c.v : null })),
        });
      }

      const reqs = body.indicators ?? [];
      const analysis: any = {};
      const mode = body.mode === "business" ? "business" : "market";
      let rsi14: (number | null)[] | undefined;

      for (const r of reqs) {
        if (r.type === "ema") series.push(toLine(candles, ema(closes, r.length), `EMA${r.length}`, "price"));
        if (r.type === "sma") series.push(toLine(candles, sma(closes, r.length), `SMA${r.length}`, "price"));

        if (r.type === "rsi") {
          const vals = rsiFromCloses(closes, r.length);
          series.push(toLine(candles, vals, `RSI${r.length}`, "rsi"));
          if (r.length === 14) rsi14 = vals;
        }

        if (r.type === "trend") {
          const len = r.length;
          const r2Min = typeof (r as any).r2Min === "number" ? (r as any).r2Min : 0.6;
          const slopeMin = typeof (r as any).slopeMin === "number" ? (r as any).slopeMin : 0.05;
        
          const tr = rollingTrend(closes, len);
        
          // Put both lines on the MACD panel so your existing UI shows them
          series.push(toLine(candles, tr.slopePct, `Trend.slope%(${len})`, "macd"));
          series.push(toLine(candles, tr.r2, `Trend.R2(${len})`, "macd"));
        
          // markers + meta summary (safe extra)
          addTrendMarkers(candles, markers, tr.slopePct, tr.r2, r2Min, slopeMin, mode);
        
          // attach latest analysis for any client that wants it
          const last = candles.length - 1;
          const s = tr.slopePct[last];
          const rr = tr.r2[last];
          (out.meta as any).analysis ??= {};
          (out.meta as any).analysis.trend = {
            length: len,
            slopePctPerBar: s,
            r2: rr,
            r2Min,
            slopeMin,
            regime:
              s == null || rr == null ? "unknown" :
              rr < r2Min ? "noisy" :
              s >= slopeMin ? "uptrend" :
              s <= -slopeMin ? "downtrend" : "flat",
          };
        }

        if (r.type === "bbands") {
          const b = bbands(closes, r.length, r.mult);
          series.push(toLine(candles, b.mid, `BB.mid(${r.length})`, "price"));
          series.push(toLine(candles, b.upper, `BB.upper(${r.length},${r.mult})`, "price"));
          series.push(toLine(candles, b.lower, `BB.lower(${r.length},${r.mult})`, "price"));
        }

        if (r.type === "macd") {
          const m = macd(closes, r.fast, r.slow, r.signal);
          series.push(toLine(candles, m.line, `MACD(${r.fast},${r.slow})`, "macd"));
          series.push(toLine(candles, m.signal, `MACD.signal(${r.signal})`, "macd"));
          series.push({
            type: "hist",
            name: "MACD.hist",
            panel: "macd",
            data: candles.map((c, i) => ({ t: c.t, value: m.hist[i] ?? null })),
          });
        }
      }

    const markers: Marker[] = [];
    // later after RSI computed:
    markers.push(...buildMarkers(candles, rsi14, mode));

    const out: ChartResponse = {
    meta: { symbol: body.symbol, timeframe: body.timeframe, points: candles.length, analysis },
    series,
    markers,
    };

      return jsonResponse(out);
    } catch (e: any) {
      return badRequest(e?.message ?? "Bad request");
    }
  },
};
