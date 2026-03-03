import "./style.css";
import { renderPanel } from "./chart";

const exportBtn = document.getElementById("export") as HTMLButtonElement;
const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const apiEl = document.getElementById("api") as HTMLInputElement;
const runBtn = document.getElementById("run") as HTMLButtonElement;

let lastSpec: any = null;
let lastRequest: any = null;
let charts: any = {};

apiEl.value = "http://127.0.0.1:8787"; // local wrangler dev default

function sampleCandles() {
  const now = Date.now();
  const out = [];
  let price = 100;
  for (let i = 0; i < 200; i++) {
    const t = now - (200 - i) * 60_000; // 1m
    const o = price;
    const delta = (Math.random() - 0.5) * 2;
    const c = Math.max(1, o + delta);
    const h = Math.max(o, c) + Math.random();
    const l = Math.min(o, c) - Math.random();
    const v = 50 + Math.random() * 50;
    out.push({ t, o, h, l, c, v });
    price = c;
  }
  return out;
}

inputEl.value = JSON.stringify(
  {
    symbol: "DEMO",
    timeframe: "1m",
    candles: sampleCandles(),
    indicators: [
      { type: "ema", length: 20 },
      { type: "bbands", length: 20, mult: 2 },
      { type: "rsi", length: 14 },
      { type: "macd", fast: 12, slow: 26, signal: 9 }
    ],
  },
  null,
  2
);

async function run() {
  let body: any;
  try {
    body = JSON.parse(inputEl.value);
    lastRequest = body;
  } catch (e) {
    alert("Invalid JSON in input box");
    return;
  }

  const base = apiEl.value.replace(/\/$/, "");
  const res = await fetch(`${base}/chart`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data?.error ?? "API error");
    return;
  }
  lastSpec = data;
  
  charts.price = renderPanel("price", data, "price");
  charts.volume = renderPanel("volume", data, "volume");
  charts.rsi = renderPanel("rsi", data, "rsi");
  charts.macd = renderPanel("macd", data, "macd");
}

runBtn.onclick = run;

// initial render
run();

function chartToDataUrl(chart: any): string {
  // white background so PNG looks good when shared (not transparent)
  return chart.getDataURL({
    type: "png",
    pixelRatio: 2,
    backgroundColor: "#0b0f14",
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function exportCombinedPng() {
  if (!lastSpec || !charts.price || !charts.volume || !charts.rsi || !charts.macd) {
    alert("Generate a chart first.");
    return;
  }

  // Make sure charts are fully laid out
  charts.price.resize();
  charts.volume.resize();
  charts.rsi.resize();
  charts.macd.resize();

  const urls = {
    price: chartToDataUrl(charts.price),
    volume: chartToDataUrl(charts.volume),
    rsi: chartToDataUrl(charts.rsi),
    macd: chartToDataUrl(charts.macd),
  };

  const [imgPrice, imgVol, imgRsi, imgMacd] = await Promise.all([
    loadImage(urls.price),
    loadImage(urls.volume),
    loadImage(urls.rsi),
    loadImage(urls.macd),
  ]);

  // Assume all panels are same size as rendered
  const w = imgPrice.naturalWidth;
  const h = imgPrice.naturalHeight;

  const gap = 24;
  const header = 120;

  const outW = w * 2 + gap * 3;
  const outH = header + h * 2 + gap * 3;

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, outW, outH);

  // header text
  const symbol = lastRequest?.symbol ?? lastSpec?.meta?.symbol ?? "CHART";
  const tf = lastRequest?.timeframe ?? lastSpec?.meta?.timeframe ?? "";
  const indicators = Array.isArray(lastRequest?.indicators) ? lastRequest.indicators : [];
  const indicatorText = indicators.length
  ? indicators.map((x: any) => {
      if (!x?.type) return "unknown";
      if (x.type === "ema") return `EMA${x.length}`;
      if (x.type === "sma") return `SMA${x.length}`;
      if (x.type === "rsi") return `RSI${x.length}`;
      if (x.type === "bbands") return `BB(${x.length},${x.mult})`;
      if (x.type === "macd") return `MACD(${x.fast},${x.slow},${x.signal})`;
      return String(x.type);
    }).join("  ·  ")
  : "";
  ctx.fillStyle = "#e6edf3";
  ctx.font = "600 24px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(`${symbol} ${tf}`.trim(), gap, 42);

  ctx.fillStyle = "#9fb0c3";
  ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(`Generated: ${new Date().toLocaleString()}`, gap, 64);
  if (indicatorText) {
    ctx.fillStyle = "#9fb0c3";
    ctx.font = "14px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  
    // simple wrap into max 2 lines
    const maxWidth = outW - gap * 2;
    const words = indicatorText.split(" ");
    let line = "";
    let y = 88;
    let lines = 0;
  
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, gap, y);
        line = w;
        y += 18;
        lines++;
        if (lines >= 1) break; // max 2 lines total
      } else {
        line = test;
      }
    }
    if (line && lines < 2) ctx.fillText(line, gap, y);
  }

  const x1 = gap;
  const x2 = gap * 2 + w;
  const y1 = header + gap;
  const y2 = header + gap * 2 + h;

  // draw panels
  ctx.drawImage(imgPrice, x1, y1);
  ctx.drawImage(imgVol, x2, y1);
  ctx.drawImage(imgRsi, x1, y2);
  ctx.drawImage(imgMacd, x2, y2);

  // watermark
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = "#e6edf3";
  ctx.font = "700 18px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  const wm = "drTA";
  const pad = 14;
  const wmw = ctx.measureText(wm).width;
  ctx.fillText(wm, outW - pad - wmw, outH - pad);
  ctx.restore();

  const pngUrl = canvas.toDataURL("image/png");

  const a = document.createElement("a");
  const safeSym = String(symbol).replace(/[^a-z0-9_-]+/gi, "_");
  const safeTf = String(tf).replace(/[^a-z0-9_-]+/gi, "_");
  a.download = `drTA_${safeSym}${safeTf ? "_" + safeTf : ""}.png`;
  a.href = pngUrl;
  a.click();
}

exportBtn.onclick = () => {
  exportCombinedPng().catch((e) => {
    console.error(e);
    alert("Export failed. Check console.");
  });
};
