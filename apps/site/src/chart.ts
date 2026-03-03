import * as echarts from "echarts";

type Panel = "price" | "volume" | "rsi" | "macd";

export function renderPanel(domId: string, spec: any, panel: Panel) {
  const el = document.getElementById(domId)!;
  const chart = echarts.getInstanceByDom(el) ?? echarts.init(el);

  const series = (spec.series ?? []).filter((s: any) => (s.panel ?? "price") === panel);

  // x axis labels from candle timestamps
  const times = (spec.series?.find((s: any) => s.type === "candles")?.data ?? []).map((c: any) => c.t);

  const eSeries: any[] = [];

  for (const s of series) {
    if (s.type === "candles") {
      eSeries.push({
        type: "candlestick",
        name: s.name,
        data: s.data.map((c: any) => [c.o, c.c, c.l, c.h]),
      });
    } else if (s.type === "line") {
      eSeries.push({
        type: "line",
        name: s.name,
        showSymbol: false,
        data: s.data.map((p: any) => p.value),
      });
    } else if (s.type === "hist") {
      eSeries.push({
        type: "bar",
        name: s.name,
        data: s.data.map((p: any) => p.value),
      });
    }
  }

  chart.setOption({
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { show: true, textStyle: { color: "#e6edf3" } },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: "category",
      data: times.map((t: number) => new Date(t).toLocaleTimeString()),
      axisLabel: { color: "#9fb0c3" },
    },
    yAxis: { scale: true, axisLabel: { color: "#9fb0c3" } },
    series: eSeries,
  });

  // avoid stacking multiple resize listeners
  (chart as any).__resizeBound ??= (() => chart.resize());
  if (!(chart as any).__resizeAttached) {
    window.addEventListener("resize", (chart as any).__resizeBound);
    (chart as any).__resizeAttached = true;
  }

  return chart;
}
