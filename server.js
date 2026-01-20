const fs = require("fs/promises");
const nodeWotBindingHttp = require("@node-wot/binding-http");
const nodeWotCore = require("@node-wot/core");

const servient = new nodeWotCore.Servient();
const httpServer = new nodeWotBindingHttp.HttpServer({ port: 5555 });
servient.addServer(httpServer);

const exposingThings = {};
let lampState = {
  powerState: "off"
};

async function webOfThingsHandler(WoT) {
  const thingDescription = JSON.parse(await fs.readFile("./lamp.td.json"));
  thingDescription.base = "http://localhost:5555";

  const exposingThing = await WoT.produce(thingDescription);
  exposingThings["lamp"] = exposingThing;

  exposingThing.setPropertyWriteHandler("powerState", async (powerStateInteractionOutput) => {
    try {
      const powerState = await powerStateInteractionOutput.value();
      lampState.powerState = powerState;
      console.log("Writing powerState:", powerState);
      exposingThing.emitPropertyChange("powerState");
    } catch (err) {
      console.error("Error writing powerState:", err?.message || err);
      throw err;
    }
  });

  exposingThing.setActionHandler("setPowerState", async (input) => {
    try {
      const powerState = await input.value();
      lampState.powerState = powerState.powerState;
      console.log("Action setPowerState called with:", powerState.powerState);
      exposingThing.emitPropertyChange("powerState");
      return { success: true, powerState: lampState.powerState };
    } catch (err) {
      console.error("Error in setPowerState action:", err?.message || err);
      throw err;
    }
  });

  exposingThing.expose();
  console.log("Lamp exposed successfully!");
}

async function main() {
  servient.start().then(webOfThingsHandler);
  console.log("WoT Server started on port 5555");
}

main();
