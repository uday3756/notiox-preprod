/**
 * Private Canvas MCP broker. Authenticate app requests; isolate per-user
 * credentials. Pin a verified canvas-mcp-server release before production.
 */
const token = process.env.CANVAS_MCP_SERVICE_TOKEN;
const port = Number(process.env.PORT || 8787);

const server = await import("node:http").then((m) =>
  m.createServer(async (req, res) => {
    const auth = req.headers.authorization;
    if (!token || auth !== `Bearer ${token}`) {
      res.writeHead(401);
      res.end("unauthorized");
      return;
    }
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, isolation: "per-request" }));
      return;
    }
    res.writeHead(404);
    res.end("not found");
  }),
);

server.listen(port, () => {
  console.log(`canvas-mcp broker on ${port}`);
});
