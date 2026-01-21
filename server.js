const fs = require("fs/promises");
const { Servient } = require("@node-wot/core");
const { HttpServer } = require("@node-wot/binding-http");

const PORT = 5555;

// ✅ écoute réseau + CORS (utile pour front sur autre port)
const servient = new Servient();
const httpServer = new HttpServer({
  port: PORT,
  address: "0.0.0.0",
  cors: { origin: "*" }
});
servient.addServer(httpServer);

let lampState = { powerState: "off" };

function normalizePowerState(v) {
  const s = String(v ?? "").trim().toLowerCase().replaceAll('"', "");
  if (s !== "on" && s !== "off") throw new Error("powerState must be 'on' or 'off'");
  return s;
}

async function webOfThingsHandler(WoT) {
  const td = JSON.parse(await fs.readFile("./lamp.td.json", "utf-8"));
  td.base = `http://localhost:${PORT}`; 

  const thing = await WoT.produce(td);

  
  thing.setPropertyReadHandler("powerState", async () => {
    return lampState.powerState;
  });

  // ✅ WRITE handler
  thing.setPropertyWriteHandler("powerState", async (io) => {
    const next = normalizePowerState(await io.value());
    lampState.powerState = next;
    console.log("Writing powerState:", next);

    // ✅ important: envoyer la valeur
    thing.emitPropertyChange("powerState", lampState.powerState);
  });

  // ✅ ACTION handler
  thing.setActionHandler("setPowerState", async (input) => {
    const body = await input.value(); // { powerState: "on" }
    const next = normalizePowerState(body?.powerState);

    lampState.powerState = next;
    console.log("Action setPowerState:", next);

    thing.emitPropertyChange("powerState", lampState.powerState);
    return { success: true, powerState: lampState.powerState };
  });

  await thing.expose();
  console.log(`✅ Lamp exposed on port ${PORT}`);
  console.log(`➡️ Read:   http://localhost:${PORT}/lamp/properties/powerState`);
  console.log(`➡️ Observe:http://localhost:${PORT}/lamp/properties/powerState/observe`);
  console.log(`➡️ Action: http://localhost:${PORT}/lamp/actions/setPowerState`);
}

async function main() {
  const WoT = await servient.start();
  console.log(`🚀 WoT Server started on port ${PORT}`);
  await webOfThingsHandler(WoT);
}

main().catch((e) => {
  console.error("Fatal WoT error:", e?.message || e);
  process.exit(1);
});
