export interface ContextsResponse {
  contexts: string[];
  current: string;
}

export async function fetchContexts(): Promise<ContextsResponse> {
  const res = await fetch("/api/contexts");
  if (!res.ok) {
    throw new Error(`/api/contexts responded ${res.status}`);
  }
  return (await res.json()) as ContextsResponse;
}

export async function selectContext(name: string): Promise<void> {
  const res = await fetch("/api/context", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw new Error((await res.text()) || `/api/context responded ${res.status}`);
  }
}
