const dotenv = require("dotenv");
const express = require("express");
const fs = require("fs/promises");
const bodyParser = require("body-parser");

const nodeWotBindingHttp = require("@node-wot/binding-http");
const nodeWotCore = require("@node-wot/core");

dotenv.config();

/* =========================
   Web of Things setup
========================= */

const servient = new nodeWotCore.Servient();
const httpServer = new nodeWotBindingHttp.HttpServer({
    port: process.env.WOT_HTTP_SERVER_PORT
});
servient.addServer(httpServer);

/* =========================
   Local streetlights state
========================= */

// Exemple de streetlights locaux
const streetlights = [
    {
        id: "streetlight-001",
        wotServerUrl: `http://localhost:${process.env.WOT_HTTP_SERVER_PORT}`,
        powerState: "off"
    },
];

const exposingThings = {};

const isValidPowerState = (value) => value === "on" || value === "off";

async function webOfThingsHandler(WoT) {
    for (const streetlight of streetlights) {
        const thingDescription = JSON.parse(
            await fs.readFile("./lamp.td.json", "utf8")
        );

        thingDescription.title = streetlight.id;
        thingDescription.base = streetlight.wotServerUrl;

        const exposingThing = await WoT.produce(thingDescription);
        exposingThings[streetlight.id] = exposingThing;

        exposingThing.setPropertyReadHandler("powerState", async () => {
            return streetlight.powerState;
        });

        exposingThing.setPropertyWriteHandler("powerState", async (interactionOutput) => {
            const powerState = await interactionOutput.value();
            if (!isValidPowerState(powerState)) return;

            streetlight.powerState = powerState;
            exposingThing.emitPropertyChange("powerState");
        });

        /* ---- Action: setPowerState ---- */

        exposingThing.setActionHandler("setPowerState", async (interactionOutput) => {
            const { powerState } = await interactionOutput.value();
            if (!isValidPowerState(powerState)) return;

            streetlight.powerState = powerState;
            exposingThing.emitPropertyChange("powerState");
        });

        await exposingThing.expose();
        console.log(`✅ Streetlight exposed: ${streetlight.id}`);
    }
}
/* =========================
   Main
========================= */

async function main() {
    await servient.start();
    await webOfThingsHandler(servient.WoT);

    notificationHttpServer.listen(
        process.env.NOTIFICATION_HTTP_SERVER_PORT,
        () => console.log("🔔 Notification server started")
    );
}

main();
