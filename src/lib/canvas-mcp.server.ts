/**
 * Private Canvas MCP client. Never expose tool JSON or tokens to the browser.
 * Production pins a verified package/version; this module only talks to
 * CANVAS_MCP_URL with a service credential.
 */
export function canvasMcpConfigured(): boolean {
  return Boolean(process.env.CANVAS_MCP_URL && process.env.CANVAS_MCP_SERVICE_TOKEN);
}

export async function canvasMcpHealth(): Promise<{ ok: boolean; detail?: string }> {
  const url = process.env.CANVAS_MCP_URL;
  const token = process.env.CANVAS_MCP_SERVICE_TOKEN;
  if (!url || !token) return { ok: false, detail: "MCP not configured" };
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/health`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return { ok: res.ok, detail: res.ok ? undefined : `status ${res.status}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : "mcp unreachable" };
  }
}
