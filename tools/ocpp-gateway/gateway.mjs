// OCPP 1.6J WebSocket gateway.
//
// Chargers connect to  ws(s)://<host>:<port>/ocpp/<chargeBoxIdentity>  (subprotocol "ocpp1.6",
// HTTP Basic auth identity:secret — OCPP security profile 1; use TLS in production).
// Each frame is relayed to the EVChargePress HTTPS endpoint, and pending commands
// (RemoteStart/RemoteStop) are polled and pushed down the socket.
//
//   EVCP_URL=https://your-app.vercel.app PORT=9000 node gateway.mjs
import { createServer } from "node:http";
import { WebSocketServer } from "ws";

const EVCP_URL = (process.env.EVCP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PORT = Number(process.env.PORT ?? 9000);
const POLL_MS = Number(process.env.POLL_MS ?? 3000);
const IDENTITY = /^[A-Za-z0-9._-]{3,48}$/;

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function relay(identity, auth, frames) {
  const res = await fetch(`${EVCP_URL}/api/integrations/ocpp/${identity}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify(frames),
  });
  if (res.status === 401) throw Object.assign(new Error("unauthorized"), { status: 401 });
  if (!res.ok) throw new Error(`EVChargePress returned ${res.status}`);
  return (await res.json()).replies;
}

const server = createServer((_, res) => res.writeHead(426).end("Upgrade to WebSocket"));
const wss = new WebSocketServer({ noServer: true, handleProtocols: (p) => (p.has("ocpp1.6") ? "ocpp1.6" : false) });

server.on("upgrade", (req, socket, head) => {
  const identity = decodeURIComponent((req.url ?? "").split("/").filter(Boolean).at(-1) ?? "");
  const auth = req.headers.authorization;
  if (!IDENTITY.test(identity) || !auth?.startsWith("Basic ")) {
    socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, identity, auth));
});

wss.on("connection", (ws, identity, auth) => {
  log("connected", identity);
  let closed = false;
  const poll = setInterval(async () => {
    try {
      const res = await fetch(`${EVCP_URL}/api/integrations/ocpp/${identity}/commands`, { headers: { authorization: auth } });
      if (res.status === 401) return ws.close(4001, "unauthorized");
      if (!res.ok) return;
      for (const call of (await res.json()).commands ?? []) {
        log(identity, "→", call[2]);
        ws.send(JSON.stringify(call));
      }
    } catch (e) {
      log(identity, "poll failed", e.message);
    }
  }, POLL_MS);

  ws.on("message", async (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }
    try {
      const [reply] = await relay(identity, auth, frame);
      if (reply && !closed) ws.send(JSON.stringify(reply));
      if (frame[0] === 2) log(identity, "←", frame[2]);
    } catch (e) {
      if (e.status === 401) return ws.close(4001, "unauthorized");
      log(identity, "relay failed", e.message);
      if (frame[0] === 2) ws.send(JSON.stringify([4, frame[1], "InternalError", "Upstream unavailable", {}]));
    }
  });
  ws.on("close", () => {
    closed = true;
    clearInterval(poll);
    log("disconnected", identity);
  });
});

server.listen(PORT, () => log(`OCPP gateway on :${PORT} → ${EVCP_URL}`));
