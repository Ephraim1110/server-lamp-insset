const Database = require("better-sqlite3");

const db = new Database("lamp-history.db");

// Créer la table si elle n'existe pas
db.exec(`
  CREATE TABLE IF NOT EXISTS state_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    powerState TEXT NOT NULL,
    consumption REAL DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Ajouter la colonne consumption si elle n'existe pas
try {
  db.exec("ALTER TABLE state_history ADD COLUMN consumption REAL DEFAULT 0");
} catch (e) {
  // La colonne existe déjà, c'est normal
}

// Générer des données réalistes pour les 24 dernières heures
const now = new Date();
let currentDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 heures avant

const stmt = db.prepare(`
  INSERT INTO state_history (powerState, consumption, timestamp) 
  VALUES (?, ?, ?)
`);

let isOn = false;
let currentHour = currentDate.getHours();

console.log("🔄 Remplissage de la base de données...\n");

// Créer 48 entrées réparties sur 24 heures
for (let i = 0; i < 48; i++) {
  // Ajouter 30 minutes à chaque itération
  currentDate = new Date(currentDate.getTime() + 30 * 60 * 1000);
  
  // Alterne entre ON et OFF
  isOn = i % 3 !== 0;
  
  // Consommation générée aléatoirement (50-75 W/h si ON, 2-5 W/h si OFF)
  const consumption = isOn 
    ? Math.floor(Math.random() * (75 - 50 + 1)) + 50
    : Math.floor(Math.random() * (5 - 2 + 1)) + 2;
  
  const powerState = isOn ? "on" : "off";
  const timestamp = currentDate.toISOString().replace('T', ' ').slice(0, 19);
  
  stmt.run(powerState, consumption, timestamp);
  
  console.log(`✅ ${timestamp} -> ${powerState.toUpperCase()} (${consumption} W/h)`);
}

// Afficher les statistiques
const allRecords = db.prepare("SELECT COUNT(*) as count FROM state_history").get();
const onCount = db.prepare("SELECT COUNT(*) as count FROM state_history WHERE powerState = 'on'").get().count;
const offCount = db.prepare("SELECT COUNT(*) as count FROM state_history WHERE powerState = 'off'").get().count;
const totalConsumption = db.prepare("SELECT SUM(consumption) as total FROM state_history").get().total;

console.log("\n📊 Statistiques:");
console.log(`   Total enregistrements: ${allRecords.count}`);
console.log(`   État ON: ${onCount}`);
console.log(`   État OFF: ${offCount}`);
console.log(`   Consommation totale: ${totalConsumption.toFixed(2)} W/h`);

// Afficher les données groupées par heure
const consumptionByHour = db.prepare(`
  SELECT 
    strftime('%Y-%m-%d %H:00', timestamp) as hour,
    SUM(consumption) as totalConsumption,
    COUNT(*) as changes
  FROM state_history
  GROUP BY hour
  ORDER BY hour DESC
`).all();

console.log("\n📈 Consommation par heure:");
consumptionByHour.forEach(row => {
  console.log(`   ${row.hour}: ${row.totalConsumption.toFixed(2)} W/h (${row.changes} changements)`);
});

db.close();
console.log("\n✅ Base de données remplie avec succès!");
