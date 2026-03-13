const fs = require("fs/promises");
const { Servient } = require("@node-wot/core");
const { HttpServer } = require("@node-wot/binding-http");
const Database = require("better-sqlite3");
const http = require("http");
const ejs = require("ejs");

const PORT = 5555;


const db = new Database("lamp-history.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS state_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    powerState TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

function saveStateToDb(powerState) {
  const stmt = db.prepare("INSERT INTO state_history (powerState) VALUES (?)");
  stmt.run(powerState);
}

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

const historyServer = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Afficher le dashboard EJS sur la page d'accueil
  if (req.url === "/" || req.url === "") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    try {
      const history = db.prepare(
        "SELECT * FROM state_history ORDER BY timestamp DESC"
      ).all();
      
      const onCount = db.prepare(
        "SELECT COUNT(*) as count FROM state_history WHERE powerState = 'on'"
      ).get().count;
      
      const offCount = db.prepare(
        "SELECT COUNT(*) as count FROM state_history WHERE powerState = 'off'"
      ).get().count;
      
      const html = await ejs.renderFile("./views/dashboard.ejs", {
        history: history,
        onCount: onCount,
        offCount: offCount
      });
      
      res.writeHead(500);
      res.end(html);
    } catch (err) {
      res.writeHead(500);
      res.end(`<h1>Erreur 500</h1><p>${err.message}</p>`);
    }
  } 
  // API JSON pour récupérer l'historique
  else if (req.url === "/history" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    const rows = db.prepare(
      "SELECT * FROM state_history ORDER BY timestamp DESC LIMIT 50"
    ).all();
    res.writeHead(200);
    res.end(JSON.stringify(rows));
  } 
  else {
    res.setHeader("Content-Type", "application/json");
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
});

historyServer.listen(5556, () => {
  console.log("📊 History API on http://localhost:5556/history");
});

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

    // ✅ Enregistrer dans la DB
    saveStateToDb(next);

    // ✅ important: envoyer la valeur
    thing.emitPropertyChange("powerState", lampState.powerState);
  });

  // ✅ ACTION handler
  thing.setActionHandler("setPowerState", async (input) => {
    const body = await input.value(); // { powerState: "on" }
    const next = normalizePowerState(body?.powerState);

    lampState.powerState = next;
    console.log("Action setPowerState:", next);

    // ✅ Enregistrer dans la DB
    saveStateToDb(next);

    thing.emitPropertyChange("powerState", lampState.powerState);
    return { success: true, powerState: lampState.powerState };
  });

  await thing.expose();
  console.log(`✅ Lamp exposed on port ${PORT}`);
  console.log(`➡️ Read:   http://localhost:${PORT}/lamp/properties/powerState`);
  console.log(`➡️ Observe:http://localhost:${PORT}/lamp/properties/powerState/observe`);
  console.log(`➡️ Action: http://localhost:${PORT}/lamp/actions/setPowerState`);

  // ✅ Afficher l'historique au démarrage
  const history = db.prepare("SELECT * FROM state_history ORDER BY timestamp DESC LIMIT 5").all();
  if (history.length > 0) {
    console.log("\n📜 Derniers changements d'état:");
    history.forEach((row) => {
      console.log(`   ${row.timestamp} -> ${row.powerState}`);
    });
  }
}

async function main() {
  const WoT = await servient.start();
  console.log(`🚀 WoT Server started on port ${PORT}`);
  await webOfThingsHandler(WoT);
}

main().catch((e) => {
  console.error("Fatal WoT error:", e?.message || e);
  db.close();
  process.exit(1);
});

// ✅ Fermer la DB proprement à l'arrêt
process.on("SIGINT", () => {
  console.log("\n👋 Arrêt du serveur...");
  db.close();
  process.exit(0);
});
