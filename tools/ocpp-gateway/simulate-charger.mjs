// A minimal OCPP 1.6J charger that connects to the gateway, boots, reports status,
// accepts RemoteStart/RemoteStop and sends MeterValues every 10 s.
//
//   CP_ID=CP-DEMO-1 CP_SECRET=... GATEWAY=ws://localhost:9000/ocpp node simulate-charger.mjs
//
// Register the charge point first (Supabase SQL editor):
//   select app.register_charge_point('<network-slug>', '<station uuid>', 'CP-DEMO-1');   -- returns the secret
//   update public.evses set charge_point_id = (select id from public.charge_points where identity = 'CP-DEMO-1'),
//          ocpp_connector_id = 1 where id = '<evse uuid>';
import WebSocket from "ws";

const ID = process.env.CP_ID;
const SECRET = process.env.CP_SECRET;
const GATEWAY = process.env.GATEWAY ?? "ws://localhost:9000/ocpp";
const POWER_W = Number(process.env.POWER_W ?? 22000);
if (!ID || !SECRET) throw new Error("Set CP_ID and CP_SECRET");

const ws = new WebSocket(`${GATEWAY}/${ID}`, "ocpp1.6", { headers: { authorization: `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}` } });
const pending = new Map();
let register = 0; // Wh
let tx = null;
let meterTimer = null;

const now = () => new Date().toISOString();
function call(action, payload) {
  const id = crypto.randomUUID();
  ws.send(JSON.stringify([2, id, action, payload]));
  return new Promise((resolve) => pending.set(id, resolve));
}
const status = (status, connectorId = 1) => call("StatusNotification", { connectorId, status, errorCode: "NoError", timestamp: now() });

async function start(idTag) {
  await status("Preparing");
  const r = await call("StartTransaction", { connectorId: 1, idTag, meterStart: Math.round(register), timestamp: now() });
  if (r.idTagInfo?.status !== "Accepted") {
    console.log("start refused", r);
    return status("Available");
  }
  tx = r.transactionId;
  await status("Charging");
  meterTimer = setInterval(() => {
    register += (POWER_W * 10) / 3600;
    call("MeterValues", { connectorId: 1, transactionId: tx, meterValue: [{ timestamp: now(), sampledValue: [
      { measurand: "Energy.Active.Import.Register", unit: "Wh", value: register.toFixed(1) },
      { measurand: "Power.Active.Import", unit: "W", value: String(POWER_W) },
    ] }] });
  }, 10_000);
}
async function stop(reason = "Remote") {
  clearInterval(meterTimer);
  if (tx === null) return;
  await call("StopTransaction", { transactionId: tx, meterStop: Math.round(register), timestamp: now(), reason });
  tx = null;
  await status("Available");
}

ws.on("open", async () => {
  console.log("connected");
  const boot = await call("BootNotification", { chargePointVendor: "EVCP", chargePointModel: "SimCharger" });
  console.log("boot", boot.status);
  await status("Available");
  setInterval(() => call("Heartbeat", {}), (boot.interval ?? 60) * 1000);
});
ws.on("message", async (raw) => {
  const f = JSON.parse(raw.toString());
  if (f[0] === 3 || f[0] === 4) {
    pending.get(f[1])?.(f[0] === 3 ? f[2] : { error: f[2] });
    return pending.delete(f[1]);
  }
  const [, id, action, payload] = f;
  console.log("command", action, payload);
  if (action === "RemoteStartTransaction") {
    ws.send(JSON.stringify([3, id, { status: tx === null ? "Accepted" : "Rejected" }]));
    if (tx === null) start(payload.idTag);
  } else if (action === "RemoteStopTransaction") {
    ws.send(JSON.stringify([3, id, { status: payload.transactionId === tx ? "Accepted" : "Rejected" }]));
    if (payload.transactionId === tx) stop();
  } else {
    ws.send(JSON.stringify([4, id, "NotImplemented", `${action} not supported`, {}]));
  }
});
ws.on("close", (code, reason) => console.log("closed", code, reason.toString()));
process.on("SIGINT", async () => { await stop("Local"); process.exit(0); });
