export interface EventItem {
  type: string; // Normal | Warning
  reason: string;
  message: string;
  count: number;
  age: string;
  source: string;
}

export interface Meta {
  live: boolean;
  needsContext: boolean;
}

export async function fetchMeta(): Promise<Meta> {
  try {
    const res = await fetch("/api/meta");
    if (!res.ok) {
      return { live: false, needsContext: false };
    }
    const data = (await res.json()) as Partial<Meta>;
    return { live: data.live === true, needsContext: data.needsContext === true };
  } catch {
    return { live: false, needsContext: false };
  }
}

export interface LogParams {
  namespace: string;
  pod: string;
  container: string;
  previous: boolean;
}

export function openLogSocket(
  p: LogParams,
  onLine: (line: string) => void,
  onClose: () => void,
): WebSocket {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const q = new URLSearchParams({
    namespace: p.namespace,
    pod: p.pod,
    container: p.container,
    previous: String(p.previous),
  });
  const ws = new WebSocket(`${proto}://${location.host}/api/logs?${q}`);
  let buf = "";
  ws.addEventListener("message", (e) => {
    // Chunks are not aligned on line boundaries: buffer until the next \n.
    buf += typeof e.data === "string" ? e.data : "";
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      onLine(buf.slice(0, nl));
      buf = buf.slice(nl + 1);
      nl = buf.indexOf("\n");
    }
  });
  ws.addEventListener("close", () => {
    if (buf) {
      onLine(buf);
      buf = "";
    }
    onClose();
  });
  ws.addEventListener("error", () => onClose());
  return ws;
}

export async function fetchEvents(namespace: string, uid: string): Promise<EventItem[]> {
  const q = new URLSearchParams({ namespace, uid });
  const res = await fetch(`/api/events?${q}`);
  if (!res.ok) {
    throw new Error(res.status === 503 ? "cluster mode required" : `error ${res.status}`);
  }
  return (await res.json()) as EventItem[];
}
