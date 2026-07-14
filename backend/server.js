// SOMMET — backend : API de persistance (SQLite) + intégration Strava (OAuth2)
// Node 22.5+ requis (fetch global + module SQLite intégré node:sqlite). Lancer : npm install && node server.js
import express from "express";
import cors from "cors";
import Database from "./db.js";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { buildMealPlanWorkbook } from "./mealplanXlsx.js";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 8787;
const CLIENT_ID = process.env.STRAVA_CLIENT_ID;
const CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET;
const REDIRECT_URI = process.env.STRAVA_REDIRECT_URI || `http://localhost:${PORT}/api/strava/callback`;

/* --------------------------- Base de données --------------------------- */
const db = new Database(path.join(__dirname, "sommet.db"));
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    day_id TEXT, title TEXT, subtitle TEXT, date TEXT,
    duration_sec INTEGER, data TEXT NOT NULL, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS strava_tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT, refresh_token TEXT, expires_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS metrics (
    date TEXT PRIMARY KEY,
    weight REAL, sleep_hours REAL, sleep_score INTEGER, fat REAL, muscle REAL, updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS mealplans (
    start TEXT PRIMARY KEY, label TEXT, data TEXT, updated_at INTEGER
  );
`);
// Migration douce : ajoute fat/muscle aux bases créées avant cette version
for (const col of ["fat REAL", "muscle REAL"]) {
  try { db.exec(`ALTER TABLE metrics ADD COLUMN ${col}`); } catch (e) { /* colonne déjà présente */ }
}

// Réglages par défaut (dérivés du profil / de la cible ~4 W/kg)
const DEFAULT_SETTINGS = {
  firstName: "Julien",
  goalWeight: 85,
  wkgTarget: 4.0,
  event: { name: "Trail des Braconniers", detail: "60 km · 3 000 m D+ · Collobrières", date: "2027-05-15" },
  nearEvent: { name: "Étape du Tour", date: "2026-07-19" },
  sleep: { hours: "7 h 25", score: 79 },
  weekPlan: {}, // choix HT/dehors + "fait" par séance endurance
  // valeurs de repli si Strava non connecté
  weight: 88.1, ftp: 300, ftpEstimated: false,
};
function getSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key='app'").get();
  return row ? { ...DEFAULT_SETTINGS, ...JSON.parse(row.value) } : DEFAULT_SETTINGS;
}
function setSettings(obj) {
  db.prepare("INSERT INTO settings(key,value) VALUES('app',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(JSON.stringify(obj));
}

/* ------------------------------ Strava --------------------------------- */
function saveTokens(t) {
  db.prepare(`INSERT INTO strava_tokens(id,access_token,refresh_token,expires_at) VALUES(1,?,?,?)
    ON CONFLICT(id) DO UPDATE SET access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at`)
    .run(t.access_token, t.refresh_token, t.expires_at);
}
function getTokens() { return db.prepare("SELECT * FROM strava_tokens WHERE id=1").get(); }

async function getValidAccessToken() {
  const t = getTokens();
  if (!t) return null;
  const now = Math.floor(Date.now() / 1000);
  if (t.expires_at > now + 60) return t.access_token;
  // rafraîchir
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "refresh_token", refresh_token: t.refresh_token }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  saveTokens({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at });
  return j.access_token;
}

async function stravaGet(pathname) {
  const token = await getValidAccessToken();
  if (!token) return null;
  const res = await fetch(`https://www.strava.com/api/v3${pathname}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  return res.json();
}

/* ------------------------------- App ----------------------------------- */
const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Config : réglages + snapshot Strava (poids, FTP) si connecté
app.get("/api/config", async (req, res) => {
  const s = getSettings();
  const connected = !!getTokens();
  let out = { ...s, stravaConnected: connected };
  if (connected) {
    const ath = await stravaGet("/athlete");
    if (ath) {
      if (typeof ath.weight === "number" && ath.weight > 0) out.weight = ath.weight;
      if (typeof ath.ftp === "number" && ath.ftp > 0) { out.ftp = ath.ftp; out.ftpEstimated = false; }
      if (ath.firstname) out.firstName = ath.firstname;
    }
  }
  res.json(out);
});

app.put("/api/settings", (req, res) => {
  const merged = { ...getSettings(), ...(req.body || {}) };
  setSettings(merged);
  res.json(merged);
});

// Séances de force (persistées)
app.get("/api/sessions", (req, res) => {
  const rows = db.prepare("SELECT data FROM sessions ORDER BY date ASC").all();
  res.json({ sessions: rows.map((r) => JSON.parse(r.data)) });
});
app.post("/api/sessions", (req, res) => {
  const rec = req.body;
  if (!rec || !rec.id || !Array.isArray(rec.sets)) return res.status(400).json({ error: "payload invalide" });
  db.prepare(`INSERT INTO sessions(id,day_id,title,subtitle,date,duration_sec,data,created_at) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data`)
    .run(rec.id, rec.dayId, rec.title, rec.subtitle, rec.date, rec.durationSec || 0, JSON.stringify(rec), Date.now());
  res.json({ ok: true, id: rec.id });
});
app.delete("/api/sessions/:id", (req, res) => {
  db.prepare("DELETE FROM sessions WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Suivi quotidien : poids + sommeil (saisie manuelle ou import CSV)
const upsertMetric = db.prepare(`INSERT INTO metrics(date,weight,sleep_hours,sleep_score,fat,muscle,updated_at) VALUES(?,?,?,?,?,?,?)
  ON CONFLICT(date) DO UPDATE SET
    weight=COALESCE(excluded.weight, metrics.weight),
    sleep_hours=COALESCE(excluded.sleep_hours, metrics.sleep_hours),
    sleep_score=COALESCE(excluded.sleep_score, metrics.sleep_score),
    fat=COALESCE(excluded.fat, metrics.fat),
    muscle=COALESCE(excluded.muscle, metrics.muscle),
    updated_at=excluded.updated_at`);
const cleanNum = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));
app.get("/api/metrics", (req, res) => {
  const rows = db.prepare("SELECT date, weight, sleep_hours, sleep_score, fat, muscle FROM metrics ORDER BY date ASC").all();
  res.json({ metrics: rows });
});
app.post("/api/metrics", (req, res) => {
  const m = req.body || {};
  if (!m.date) return res.status(400).json({ error: "date requise" });
  upsertMetric.run(m.date, cleanNum(m.weight), cleanNum(m.sleep_hours), cleanNum(m.sleep_score), cleanNum(m.fat), cleanNum(m.muscle), Date.now());
  res.json({ ok: true });
});
app.post("/api/metrics/import", (req, res) => {
  const rows = Array.isArray(req.body) ? req.body : req.body?.rows;
  if (!Array.isArray(rows)) return res.status(400).json({ error: "tableau de lignes attendu" });
  const now = Date.now();
  const tx = db.transaction((list) => { list.forEach((m) => { if (m.date) upsertMetric.run(m.date, cleanNum(m.weight), cleanNum(m.sleep_hours), cleanNum(m.sleep_score), cleanNum(m.fat), cleanNum(m.muscle), now); }); });
  tx(rows);
  res.json({ ok: true, imported: rows.filter((m) => m.date).length });
});

// Plans de repas : stockés en base (données, plus dans le code). Une semaine = un plan (clé = start).
app.get("/api/mealplan", (req, res) => {
  const rows = db.prepare("SELECT data FROM mealplans ORDER BY start DESC").all();
  const plans = [];
  for (const r of rows) { try { plans.push(JSON.parse(r.data)); } catch (e) { /* ignore ligne corrompue */ } }
  res.json({ plans });
});
app.post("/api/mealplan", (req, res) => {
  const plan = req.body?.plan || req.body;
  if (!plan || !plan.start || !Array.isArray(plan.days) || !plan.days.length) return res.status(400).json({ error: "plan invalide (start, days requis)" });
  db.prepare(`INSERT INTO mealplans(start,label,data,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(start) DO UPDATE SET label=excluded.label, data=excluded.data, updated_at=excluded.updated_at`)
    .run(plan.start, plan.weekLabel || plan.start, JSON.stringify(plan), Date.now());
  res.json({ ok: true, start: plan.start });
});
app.post("/api/mealplan/delete", (req, res) => {
  const start = req.body?.start;
  if (!start) return res.status(400).json({ error: "start requis" });
  const info = db.prepare("DELETE FROM mealplans WHERE start=?").run(start);
  res.json({ ok: true, deleted: info.changes });
});

// OAuth Strava
app.get("/api/strava/status", (req, res) => res.json({ connected: !!getTokens() }));
app.get("/api/strava/login", (req, res) => {
  if (!CLIENT_ID) return res.status(500).send("STRAVA_CLIENT_ID manquant dans .env");
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("approval_prompt", "auto");
  url.searchParams.set("scope", "read,profile:read_all,activity:read_all");
  res.redirect(url.toString());
});
app.get("/api/strava/callback", async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect("/?strava=error");
  const r = await fetch("https://www.strava.com/oauth/token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: "authorization_code" }),
  });
  if (!r.ok) return res.redirect("/?strava=error");
  const j = await r.json();
  saveTokens({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at });
  res.redirect("/?strava=ok");
});
app.get("/api/strava/load", async (req, res) => {
  const days = Math.min(400, Math.max(30, parseInt(req.query.days, 10) || 180));
  const after = Math.floor(Date.now() / 1000) - days * 86400;
  const daily = {};
  let page = 1, got = 0;
  // pagination Strava (max 200/page), plafonnée à 5 pages
  while (page <= 5) {
    const acts = await stravaGet(`/athlete/activities?after=${after}&per_page=200&page=${page}`);
    if (!acts || !acts.length) break;
    for (const a of acts) {
      const type = a.sport_type || a.type || "";
      if (type === "WeightTraining") continue; // la muscu vient des séances de l'app
      const re = a.suffer_score;
      if (re == null) continue;
      const d = (a.start_date_local || a.start_date || "").slice(0, 10);
      if (d) daily[d] = (daily[d] || 0) + re;
    }
    got = acts.length;
    if (got < 200) break;
    page++;
  }
  res.json({ daily: Object.entries(daily).map(([date, load]) => ({ date, load })).sort((x, y) => x.date.localeCompare(y.date)) });
});

app.get("/api/strava/activities", async (req, res) => {
  const acts = await stravaGet("/athlete/activities?per_page=10");
  if (!acts) return res.json({ activities: [] });
  res.json({
    activities: acts.map((a) => ({
      id: String(a.id),
      type: a.sport_type || a.type,
      name: a.name,
      date: a.start_date_local,
      dist: (a.distance || 0) / 1000,
      elev: a.total_elevation_gain || 0,
      dur: a.moving_time || a.elapsed_time || 0,
    })),
  });
});

// Génère le classeur Excel (menu + courses) imprimable, au format du modèle
app.post("/api/mealplan/xlsx", async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.days || !payload.courses) return res.status(400).json({ error: "payload incomplet (days, courses)" });
    const buffer = await buildMealPlanWorkbook(payload);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${(payload.filename || "menu-sommet")}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (e) {
    console.error("xlsx error:", e);
    res.status(500).json({ error: "génération xlsx échouée" });
  }
});

// Sert le frontend compilé (frontend/dist) s'il existe
const dist = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(PORT, () => {
  console.log(`\n  SOMMET backend → http://localhost:${PORT}`);
  console.log(`  Strava configuré : ${CLIENT_ID ? "oui" : "NON (voir .env)"}`);
  console.log(`  Redirect URI     : ${REDIRECT_URI}\n`);
});
