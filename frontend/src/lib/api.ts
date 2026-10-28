/**
 * Thin fetch wrapper with the same behaviour as the previous page:
 * every response is mirrored into the "last API response" debug panel
 * (state lives in App and is passed in as a sink callback).
 */

export type JsonSink = (json: unknown) => void;

let sink: JsonSink = () => {};
export function setJsonSink(fn: JsonSink): void {
  sink = fn;
}

export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method: body !== undefined ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json()) as T;
  sink(json);
  return json;
}

export async function fetchHealth(): Promise<{
  paypalMode: string;
  paypalEnv: string;
  aiMode: string;
  aiModel: string | null;
}> {
  const res = await fetch("/health");
  return res.json();
}
