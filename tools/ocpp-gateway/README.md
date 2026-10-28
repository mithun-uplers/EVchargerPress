# OCPP gateway and charger simulator

EVChargePress runs on serverless hosting (Vercel), which can't hold the long-lived WebSocket
connections OCPP 1.6J uses. This small Node service holds the sockets and relays every frame to
the app over HTTPS:

```
charger ──OCPP-J/WebSocket──▶ gateway.mjs ──HTTPS──▶ /api/integrations/ocpp/{id}  ──▶ public.ocpp_ingest()
        ◀── RemoteStart/Stop ──           ◀── poll ── /api/integrations/ocpp/{id}/commands
```

Supported charger → CSMS messages: BootNotification, Heartbeat, StatusNotification, Authorize,
StartTransaction, MeterValues (energy register, power, SoC, voltage, current), StopTransaction.
CSMS → charger: RemoteStartTransaction, RemoteStopTransaction. Anything else gets a CALLERROR
`NotImplemented`. The idTag is the booking reference; a charger only starts for a checked-in booking
on one of its own connectors.

## Run locally

```bash
cd tools/ocpp-gateway && npm install
EVCP_URL=http://localhost:3000 npm run gateway          # terminal 1 (app running on :3000)
CP_ID=CP-DEMO-1 CP_SECRET=<secret> npm run charger      # terminal 2
```

Register a charge point and wire it to a charging point in the Supabase SQL editor:

```sql
insert into public.charger_networks (slug, name, protocol) values ('my-network', 'My network', 'ocpp16j') on conflict do nothing;
select app.register_charge_point('my-network', '<station uuid>', 'CP-DEMO-1');  -- returns the secret once
update public.evses set charge_point_id = (select id from public.charge_points where identity = 'CP-DEMO-1'),
       ocpp_connector_id = 1 where id = '<evse uuid>';
```

## Built-in simulator (no gateway needed)

The 5 demo stations are wired to an in-database simulator (`app.simulator_tick()`, pg_cron every
10 s, set up by `supabase/scripts/demo_live_charging.sql`). It goes through the same OCPP handling
code, and everything it writes is flagged `is_simulated` and labelled **Simulated** in the app.

## Production notes

- Terminate TLS in front of the gateway (wss://) and upgrade chargers to security profile 2.
- Run more than one gateway instance behind a load balancer with sticky sessions per identity.
- Rotate a charger's secret by re-running `app.register_charge_point` and updating the charger.
