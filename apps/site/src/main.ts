import "./style.css";
import { renderPanel } from "./chart";

const inputEl = document.getElementById("input") as HTMLTextAreaElement;
const apiEl = document.getElementById("api") as HTMLInputElement;
const runBtn = document.getElementById("run") as HTMLButtonElement;

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

  renderPanel("price", data, "price");
  renderPanel("volume", data, "volume");
  renderPanel("rsi", data, "rsi");
  renderPanel("macd", data, "macd");
}

runBtn.onclick = run;

// initial render
run();
