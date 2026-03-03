export function jsonResponse(obj: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(JSON.stringify(obj), { ...init, headers });
}

export function badRequest(message: string) {
  return jsonResponse({ error: message }, { status: 400 });
}

export function ensureNumber(x: unknown, name: string): number {
  if (typeof x !== "number" || !Number.isFinite(x)) throw new Error(`Invalid number: ${name}`);
  return x;
}

export function sortCandlesByTime<T extends { t: number }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.t - b.t);
}
