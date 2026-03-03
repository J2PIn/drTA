export type Candle = { t: number; o: number; h: number; l: number; c: number; v?: number };

export type IndicatorRequest =
  | { type: "ema"; length: number }
  | { type: "sma"; length: number }
  | { type: "rsi"; length: number }
  | { type: "bbands"; length: number; mult: number }
  | { type: "macd"; fast: number; slow: number; signal: number };

export type ChartRequest = {
  symbol?: string;
  timeframe?: string;
  candles: Candle[];
  indicators?: IndicatorRequest[];
};

export type Series =
  | { type: "candles"; name: string; data: Candle[]; panel?: "price" | "volume" | "rsi" | "macd" }
  | { type: "line"; name: string; data: { t: number; value: number | null }[]; panel?: "price" | "rsi" | "macd" }
  | { type: "hist"; name: string; data: { t: number; value: number | null }[]; panel?: "volume" | "macd" };

export type Marker = { t: number; panel: "price" | "rsi" | "macd"; text: string; kind: "info" | "buy" | "sell" };

export type ChartResponse = {
  meta: { symbol?: string; timeframe?: string; points: number };
  series: Series[];
  markers: Marker[];
};
