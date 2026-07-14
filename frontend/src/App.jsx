import { useState, useEffect, useMemo } from "react";

/* =========================================================================
   SOMMET — Suivi Force & Prévention  (v2, données réelles + persistance)
   • Se branche sur l'API locale (/api/*) quand elle répond : profil + FTP
     depuis Strava, séances de force persistées en base SQLite.
   • Si l'API n'est pas joignable (ex. aperçu dans Claude), bascule en mode
     démonstration en mémoire, avec les vrais chiffres relevés le 11/07/2026.
   • Ajout : temps de repos prescrit par exercice + minuteur de repos.
   ========================================================================= */

/* ----------------------------- Thème ----------------------------------- */
const C = {
  bg: "#0A0E15", bg2: "#0C1119", card: "#111A26", cardHi: "#152234",
  line: "#20303F", line2: "#2B3F53", text: "#EAF2FA", mut: "#8598AD", mut2: "#5D7086",
  blue: "#2F7BFF", blueHi: "#5FA3FF", blueGlow: "rgba(47,123,255,0.30)",
  green: "#22D07A", greenBg: "rgba(34,208,122,0.13)", greenLine: "rgba(34,208,122,0.45)",
  gold: "#FFB43D", goldBg: "rgba(255,180,61,0.14)", red: "#FF5E6C",
  orange: "#FF8A3D",
};
const FD = "'Barlow Condensed','Oswald','Arial Narrow',system-ui,sans-serif";
const FB = "'Barlow',system-ui,-apple-system,sans-serif";

/* ---------- Valeurs par défaut = vraies données Strava (11/07/2026) ------ */
const DEFAULTS = {
  firstName: "Julien",
  weight: 87.9,          // dernière pesée réelle (Garmin, 12/07/2026)
  ftp: 300,              // Strava zones (réglé manuellement, non estimé)
  ftpEstimated: false,
  goalWeight: 85,        // dérivé de la cible ~4 W/kg
  wkgTarget: 4.0,
  event: { name: "Trail des Braconniers", detail: "60 km · 3 000 m D+ · Collobrières", date: "2027-05-15" },
  nearEvent: { name: "Étape du Tour", date: "2026-07-19" }, // focus Strava en cours
  sleep: { hours: "7 h 25", score: 79 },
  stravaConnected: false, // vrai uniquement via l'API
};

const DEMO_ACTIVITIES = [
  { id: "a1", type: "Ride", name: "Séance endurance", date: "2026-07-11", dist: 86.0, elev: 1100, dur: 12885 },
  { id: "a2", type: "Ride", name: "Vélo taf (Z2)", date: "2026-07-09", dist: 40.1, elev: 399, dur: 5480 },
  { id: "a3", type: "WeightTraining", name: "Musculation · Half body", date: "2026-07-08", dist: 0, elev: 0, dur: 2596 },
  { id: "a4", type: "WeightTraining", name: "Musculation · Half body", date: "2026-07-06", dist: 0, elev: 0, dur: 3347 },
  { id: "a5", type: "Ride", name: "Séance spécifique", date: "2026-07-04", dist: 96.1, elev: 1306, dur: 11974 },
];

/* ----------------------- Groupes musculaires --------------------------- */
const MUSCLES = ["Jambes", "Fessiers", "Ischios", "Dos", "Pectoraux", "Épaules", "Coiffe", "Tronc", "Mollets"];

/* --------------------------- Le plan (3 jours) ------------------------- */
/* rest = temps de repos prescrit ENTRE LES SÉRIES, en secondes */
const DAYS = [
  {
    id: "j1", title: "Jour 1", subtitle: "Bas du corps",
    focus: "Force jambes · prévention genou (ITB)",
    exercises: [
      { n: "Squat barre", m: "Jambes", sets: 4, reps: 8, base: 72.5, step: 2.5, rest: 150 },
      { n: "Soulevé de terre roumain", m: "Ischios", sets: 3, reps: 10, base: 60, step: 2.5, rest: 120 },
      { n: "Split squat bulgare", m: "Fessiers", sets: 3, reps: 10, base: 16, step: 2, rest: 90 },
      { n: "Abduction de hanche", m: "Fessiers", sets: 3, reps: 15, base: 12, step: 1, rest: 45 },
      { n: "Mollets debout", m: "Mollets", sets: 4, reps: 15, base: 50, step: 2.5, rest: 60 },
      { n: "Pallof press (anti-rotation)", m: "Tronc", sets: 3, reps: 12, base: 12, step: 1, rest: 45 },
    ],
    cooldown: [
      "Étirement quadriceps — 2×30 s/côté",
      "Étirement ischio-jambiers — 2×30 s",
      "Rouleau bandelette / TFL (face latérale cuisse) — 60 s/côté",
      "Étirement fléchisseurs de hanche — 2×30 s",
    ],
  },
  {
    id: "j2", title: "Jour 2", subtitle: "Haut du corps",
    focus: "Tirer / pousser · prévention épaule (coiffe)",
    exercises: [
      { n: "Rowing haltère", m: "Dos", sets: 4, reps: 10, base: 26, step: 2, rest: 90 },
      { n: "Développé militaire haltères", m: "Épaules", sets: 3, reps: 10, base: 20, step: 1, rest: 120 },
      { n: "Tirage vertical", m: "Dos", sets: 4, reps: 10, base: 50, step: 2.5, rest: 90 },
      { n: "Développé couché haltères", m: "Pectoraux", sets: 4, reps: 8, base: 28, step: 2, rest: 120 },
      { n: "Rotation externe élastique", m: "Coiffe", sets: 3, reps: 15, base: 5, step: 0.5, rest: 45 },
      { n: "Scapular punch (serratus)", m: "Coiffe", sets: 3, reps: 12, base: 8, step: 1, rest: 45 },
    ],
    cooldown: [
      "Étirement pectoraux (cadre de porte) — 2×30 s",
      "Étirement grand dorsal — 2×30 s",
      "Étirement capsule postérieure (cross-body) — 2×30 s",
      "Pendulaire épaule (relâchement) — 30 s/côté",
    ],
  },
  {
    id: "j3", title: "Jour 3", subtitle: "Full body · puissance",
    focus: "Chaîne postérieure · spécifique descente trail",
    exercises: [
      { n: "Soulevé de terre (trap bar)", m: "Ischios", sets: 4, reps: 5, base: 100, step: 5, rest: 180 },
      { n: "Hip thrust", m: "Fessiers", sets: 3, reps: 10, base: 80, step: 5, rest: 120 },
      { n: "Step-up lesté (contrôle descente)", m: "Jambes", sets: 3, reps: 10, base: 20, step: 2, rest: 90 },
      { n: "Tirage horizontal poulie", m: "Dos", sets: 4, reps: 10, base: 48, step: 2.5, rest: 90 },
      { n: "Développé incliné haltères", m: "Pectoraux", sets: 3, reps: 10, base: 24, step: 2, rest: 120 },
      { n: "Face pull", m: "Épaules", sets: 3, reps: 15, base: 18, step: 1, rest: 45 },
      { n: "Gainage latéral (gilet lesté)", m: "Tronc", sets: 3, reps: 40, base: 0, step: 2, rest: 60, iso: true },
    ],
    cooldown: [
      "Mobilité hanche 90/90 — 60 s/côté",
      "Étirement fessier / piriforme — 2×30 s",
      "Étirement chaîne postérieure — 2×30 s",
      "Cohérence cardiaque — 5 min",
    ],
  },
];

const EXTRA_EXERCISES = [
  { n: "Presse à cuisses", m: "Jambes", rest: 120 }, { n: "Leg curl", m: "Ischios", rest: 90 },
  { n: "Fentes marchées", m: "Fessiers", rest: 90 }, { n: "Soulevé jambes tendues", m: "Ischios", rest: 120 },
  { n: "Tractions assistées", m: "Dos", rest: 120 }, { n: "Oiseau (rear delt)", m: "Épaules", rest: 45 },
  { n: "Développé couché barre", m: "Pectoraux", rest: 150 }, { n: "Curl biceps", m: "Dos", rest: 60 },
  { n: "Extension triceps corde", m: "Pectoraux", rest: 60 }, { n: "YTW à plat", m: "Coiffe", rest: 45 },
  { n: "Gainage ventral", m: "Tronc", rest: 60 }, { n: "Dead bug", m: "Tronc", rest: 45 },
  { n: "Mollets assis", m: "Mollets", rest: 60 }, { n: "Copenhagen (adducteurs)", m: "Fessiers", rest: 60 },
];

/* ==================== PROGRAMME ENDURANCE (vélo + CAP) =================== */
/* Bloc courant + cibles calées sur les vraies zones Strava (FTP 300 W).    */
const BLOCK = {
  name: "Bloc développement FTP",
  phase: "post-Étape · fin d'été 2026",
  note: "Pousser la FTP vers 4 W/kg pendant que le volume de course reste bas. Distribution polarisée : ~80 % facile / ~20 % intensité.",
  counts: { velo: 3, cap: 2, muscu: 3 },
};

// Zones de puissance (Coggan, FTP = 300 W) telles que renvoyées par Strava
const ZONES_W = [
  { z: "Z1", l: "Récup", r: "< 165 W" }, { z: "Z2", l: "Endurance", r: "166–225" },
  { z: "Z3", l: "Tempo", r: "226–270" }, { z: "Z4", l: "Seuil", r: "271–315" },
  { z: "Z5", l: "VO2 / PMA", r: "316–360" }, { z: "Z6", l: "Anaéro.", r: "361–450" },
];

// Allures cibles course (dérivées des prédictions Strava, tenues volontairement prudentes)
const PACES = [
  { k: "Footing facile", v: "6:15–6:45 /km", n: "conversation possible — la priorité" },
  { k: "Endurance active", v: "5:45–6:05 /km", n: "avec parcimonie, plus tard" },
  { k: "Seuil (à venir)", v: "5:10–5:25 /km", n: "introduit à l'automne" },
  { k: "Côtes / descente", v: "à l'effort", n: "marcher les raidillons, descentes en petites foulées" },
];

const BIKE = [
  {
    id: "b1", name: "Seuil", tag: "SPÉCIFIQUE", dur: "1 h 05", defaultMode: "ht",
    goal: "Élever la puissance soutenable (FTP)",
    ht: [
      { t: "15 min", w: "150 → 210 W", d: "Échauffement progressif Z1→Z2, puis 3×(30 s à 300 W / 30 s à 150 W)" },
      { t: "3 × 10 min", w: "285–300 W · Z4", d: "Seuil. Récup 5 min à 155 W entre les blocs" },
      { t: "10 min", w: "140 W · Z1", d: "Retour au calme" },
    ],
    out: [
      { t: "15 min", w: "échauffement", d: "Montée progressive + 3 accélérations courtes" },
      { t: "3 × 10 min", w: "285–300 W · RPE 7–8", d: "Sur une bosse régulière (Maures) ; récup en descente/plat" },
      { t: "10 min", w: "roue libre", d: "Retour au calme" },
    ],
  },
  {
    id: "b2", name: "VO2max / PMA", tag: "SPÉCIFIQUE", dur: "1 h 05", defaultMode: "ht",
    goal: "Élever le plafond aérobie (VO2max / PMA)",
    ht: [
      { t: "15 min", w: "échauffement", d: "Z1→Z2 puis 3×1 min montées progressives" },
      { t: "5 × 3 min", w: "330–345 W · Z5", d: "Récup 3 min à 150 W. Puissance régulière" },
      { t: "10 min", w: "140 W · Z1", d: "Retour au calme" },
    ],
    out: [
      { t: "15 min", w: "échauffement", d: "Montée en douceur + accélérations" },
      { t: "5 × 3 min", w: "à bloc maîtrisé · RPE 9", d: "Sur une bosse de 3–5 min ; récup en descente" },
      { t: "10 min", w: "roue libre", d: "Retour au calme" },
    ],
    variant: "Variante : 4 × 4 min à 325–340 W, ou 2 blocs de 6×(30 s 360 W / 30 s 150 W).",
  },
  {
    id: "b3", name: "Sortie longue", tag: "LONGUE", dur: "2 h 30 – 3 h 30", defaultMode: "out",
    goal: "Base aérobie + endurance spécifique (D+)",
    out: [
      { t: "corps", w: "195–220 W · Z2", d: "Endurance continue, cadence souple" },
      { t: "2–3 bosses", w: "240–290 W · Z3–Z4", d: "Selon terrain (cols des Maures), en tempo/seuil" },
      { t: "nutrition", w: "60–90 g glucides/h", d: "Dès 2 h de sortie" },
    ],
    ht: [
      { t: "1 h 45", w: "200–215 W · Z2", d: "Endurance continue" },
      { t: "2 × 15 min", w: "250–260 W · tempo", d: "Récup 5 min entre. 2 h max sur HT" },
    ],
  },
];

const RUN = [
  {
    id: "r1", name: "Footing facile + lignes droites", tag: "BASE", dur: "35–45 min",
    goal: "Base aérobie de course · faible impact",
    steps: [
      { t: "30–40 min", p: "6:15–6:45 /km", d: "Allure conversation, terrain plat/roulant" },
      { t: "4–6 × 20 s", p: "accélérations (strides)", d: "Lignes droites sur plat, récup marche complète" },
    ],
  },
  {
    id: "r2", name: "Découverte trail / côtes", tag: "SPÉCIFIQUE", dur: "40–50 min",
    goal: "Spécificité trail (D+, descente) · prudence ITB",
    steps: [
      { t: "40–50 min", p: "6:20–7:00 /km", d: "Sentier vallonné (Maures), allure facile" },
      { t: "montées raides", p: "marche rapide", d: "Power hiking : geste spécifique 60 km, économise le genou" },
      { t: "descentes", p: "petites foulées", d: "Contrôlées : protège la bandelette (genou D.)" },
    ],
  },
];

// Jours par défaut (0 = Lundi … 6 = Dimanche) — modifiables ensuite dans l'app
const DEFAULT_DAYS = { j2: 0, r1: 0, b1: 1, j1: 2, b2: 3, r2: 4, j3: 4, b3: 6 };
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const ALL_SESSIONS = [
  { id: "b1", label: "Vélo · Seuil", short: "Vélo Seuil", kind: "velo" },
  { id: "b2", label: "Vélo · VO2/PMA", short: "Vélo VO2", kind: "velo" },
  { id: "b3", label: "Vélo · Sortie longue", short: "Vélo Longue", kind: "velo" },
  { id: "r1", label: "Course · Footing", short: "Run Footing", kind: "cap" },
  { id: "r2", label: "Course · Trail/côtes", short: "Run Trail", kind: "cap" },
  { id: "j1", label: "Muscu · Bas", short: "Muscu Bas", kind: "muscu" },
  { id: "j2", label: "Muscu · Haut", short: "Muscu Haut", kind: "muscu" },
  { id: "j3", label: "Muscu · Full", short: "Muscu Full", kind: "muscu" },
];
// Durées proposées (minutes) pour le vélo en extérieur, selon le type de séance
const BIKE_DUR = { specific: [75, 90, 105, 120], long: [120, 150, 180, 210, 240] };
const bikeDurDefault = (id) => (id === "b3" ? 180 : 90);

/* --------------------------- Utilitaires ------------------------------- */
const r05 = (x) => Math.round(x * 2) / 2;
const fmtNum = (n) => {
  if (n == null || isNaN(n)) return "—";
  return Math.abs(n) >= 1000 ? Math.round(n).toLocaleString("fr-FR") : String(n).replace(".", ",");
};
const fmtDur = (s) => {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const p = (x) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
};
const fmtDurShort = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
const restLabel = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`);
const fmtHM = (mins) => { mins = Math.round(mins); if (mins < 60) return `${mins} min`; const h = Math.floor(mins / 60), m = mins % 60; return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`; };
const DOW = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];
const MON = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const fmtDate = (iso) => { const d = new Date(iso); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const startOfWeek = (d) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - day); return x; };
const TODAY = new Date();
const daysBetween = (iso) => Math.max(0, Math.round((new Date(iso) - TODAY) / 86400000));
const todayISO = () => new Date().toISOString().slice(0, 10);

/* ============================================================
   FORME & FATIGUE (modèle PMC / impulse-response)
   - Charge cardio quotidienne = somme de la Charge relative Strava
     (suffer score, basé sur la FC) des activités NON-muscu.
   - Charge muscu = STRENGTH_LOAD par séance loguée dans l'app
     (estimation : la Charge relative Strava sous-évalue la muscu,
     score FC 4–11 seulement ; valeur assumée et ajustable).
   - Forme = CTL (moyenne exp. 42 j) ; Fatigue = ATL (7 j) ;
     Fraîcheur = TSB = CTL(veille) − ATL(veille).
   - ACWR = charge aiguë 7 j / charge chronique 28 j (zone 0,8–1,3).
   Réf. : Banister (1975/1991) ; Coggan/TrainingPeaks PMC ;
   Gabbett 2016 (ACWR & risque de blessure).
   ============================================================ */
const STRENGTH_LOAD = 25;
// Charge relative cardio réelle par jour (Strava, 2026, hors WeightTraining)
const CARDIO_DAILY = [
  { date: "2026-01-03", re: 61 }, { date: "2026-01-04", re: 46 }, { date: "2026-01-05", re: 11 }, { date: "2026-01-06", re: 34 }, { date: "2026-01-08", re: 33 }, { date: "2026-01-09", re: 23 },
  { date: "2026-01-10", re: 29 }, { date: "2026-01-11", re: 71 }, { date: "2026-01-13", re: 14 }, { date: "2026-01-16", re: 31 }, { date: "2026-01-17", re: 200 }, { date: "2026-01-18", re: 34 },
  { date: "2026-01-21", re: 13 }, { date: "2026-01-22", re: 34 }, { date: "2026-01-23", re: 35 }, { date: "2026-01-24", re: 56 }, { date: "2026-01-25", re: 140 }, { date: "2026-01-26", re: 7 },
  { date: "2026-01-27", re: 16 }, { date: "2026-01-28", re: 52 }, { date: "2026-01-30", re: 47 }, { date: "2026-01-31", re: 54 }, { date: "2026-02-01", re: 10 }, { date: "2026-02-02", re: 7 },
  { date: "2026-02-04", re: 15 }, { date: "2026-02-05", re: 62 }, { date: "2026-02-06", re: 45 }, { date: "2026-02-07", re: 86 }, { date: "2026-02-08", re: 39 }, { date: "2026-02-09", re: 10 },
  { date: "2026-02-10", re: 12 }, { date: "2026-02-11", re: 25 }, { date: "2026-02-13", re: 25 }, { date: "2026-02-14", re: 35 }, { date: "2026-02-15", re: 29 }, { date: "2026-02-16", re: 36 },
  { date: "2026-02-17", re: 61 }, { date: "2026-02-19", re: 13 }, { date: "2026-02-21", re: 108 }, { date: "2026-02-22", re: 78 }, { date: "2026-02-23", re: 27 }, { date: "2026-02-25", re: 42 },
  { date: "2026-02-26", re: 107 }, { date: "2026-02-27", re: 43 }, { date: "2026-02-28", re: 132 }, { date: "2026-03-01", re: 83 }, { date: "2026-03-03", re: 9 }, { date: "2026-03-04", re: 46 },
  { date: "2026-03-06", re: 77 }, { date: "2026-03-07", re: 25 }, { date: "2026-03-08", re: 34 }, { date: "2026-03-09", re: 6 }, { date: "2026-03-10", re: 22 }, { date: "2026-03-13", re: 19 },
  { date: "2026-03-14", re: 56 }, { date: "2026-03-15", re: 71 }, { date: "2026-03-16", re: 16 }, { date: "2026-03-17", re: 24 }, { date: "2026-03-18", re: 40 }, { date: "2026-03-20", re: 41 },
  { date: "2026-03-21", re: 192 }, { date: "2026-03-22", re: 32 }, { date: "2026-03-23", re: 11 }, { date: "2026-03-24", re: 19 }, { date: "2026-03-25", re: 125 }, { date: "2026-03-27", re: 34 },
  { date: "2026-03-28", re: 20 }, { date: "2026-03-29", re: 59 }, { date: "2026-03-30", re: 20 }, { date: "2026-03-31", re: 79 }, { date: "2026-04-03", re: 28 }, { date: "2026-04-04", re: 127 },
  { date: "2026-04-07", re: 21 }, { date: "2026-04-08", re: 21 }, { date: "2026-04-10", re: 32 }, { date: "2026-04-11", re: 147 }, { date: "2026-04-12", re: 98 }, { date: "2026-04-14", re: 208 },
  { date: "2026-04-15", re: 12 }, { date: "2026-04-16", re: 123 }, { date: "2026-04-18", re: 66 }, { date: "2026-04-19", re: 58 }, { date: "2026-04-21", re: 16 }, { date: "2026-04-22", re: 54 },
  { date: "2026-04-23", re: 29 }, { date: "2026-04-25", re: 57 }, { date: "2026-04-26", re: 123 }, { date: "2026-04-28", re: 20 }, { date: "2026-04-29", re: 69 }, { date: "2026-05-01", re: 36 },
  { date: "2026-05-02", re: 170 }, { date: "2026-05-03", re: 99 }, { date: "2026-05-05", re: 23 }, { date: "2026-05-06", re: 25 }, { date: "2026-05-07", re: 78 }, { date: "2026-05-08", re: 146 },
  { date: "2026-05-09", re: 49 }, { date: "2026-05-10", re: 54 }, { date: "2026-05-14", re: 41 }, { date: "2026-05-15", re: 69 }, { date: "2026-05-16", re: 42 }, { date: "2026-05-19", re: 21 },
  { date: "2026-05-20", re: 46 }, { date: "2026-05-22", re: 114 }, { date: "2026-05-23", re: 143 }, { date: "2026-05-24", re: 65 }, { date: "2026-05-25", re: 80 }, { date: "2026-05-26", re: 205 },
  { date: "2026-05-29", re: 17 }, { date: "2026-05-30", re: 56 }, { date: "2026-05-31", re: 210 }, { date: "2026-06-01", re: 64 }, { date: "2026-06-03", re: 31 }, { date: "2026-06-04", re: 36 },
  { date: "2026-06-06", re: 235 }, { date: "2026-06-08", re: 31 }, { date: "2026-06-10", re: 22 }, { date: "2026-06-13", re: 111 }, { date: "2026-06-14", re: 200 }, { date: "2026-06-19", re: 147 },
  { date: "2026-06-20", re: 39 }, { date: "2026-06-22", re: 16 }, { date: "2026-06-23", re: 49 }, { date: "2026-06-25", re: 71 }, { date: "2026-06-26", re: 385 }, { date: "2026-06-28", re: 181 },
  { date: "2026-06-29", re: 16 }, { date: "2026-06-30", re: 42 }, { date: "2026-07-02", re: 25 }, { date: "2026-07-04", re: 333 }, { date: "2026-07-05", re: 27 }, { date: "2026-07-09", re: 47 },
  { date: "2026-07-11", re: 78 }, { date: "2026-07-12", re: 46 },
];
// Jours de muscu réels (Strava WeightTraining) — sert de démo pour la charge muscu
const MUSCU_DAYS = [
  "2026-01-06", "2026-01-07", "2026-01-12", "2026-01-14", "2026-01-15", "2026-01-27", "2026-01-28", "2026-02-03", "2026-02-04", "2026-02-10", "2026-02-12", "2026-02-17", "2026-02-18", "2026-03-04",
  "2026-03-05", "2026-03-11", "2026-03-13", "2026-03-18", "2026-03-19", "2026-03-24", "2026-03-26", "2026-04-01", "2026-04-03", "2026-04-21", "2026-04-22", "2026-04-24", "2026-04-27", "2026-04-28",
  "2026-04-30", "2026-05-04", "2026-05-12", "2026-05-13", "2026-05-18", "2026-05-19", "2026-05-21", "2026-06-02", "2026-06-03", "2026-06-05", "2026-06-09", "2026-06-10", "2026-06-12", "2026-06-15",
  "2026-06-24", "2026-06-29", "2026-07-01", "2026-07-06", "2026-07-08",
];

function buildPMC(cardioDaily, muscuDates) {
  const load = {};
  for (const c of cardioDaily || []) { if (c && c.date) load[c.date] = (load[c.date] || 0) + (c.re != null ? c.re : c.load || 0); }
  for (const d of muscuDates || []) { const k = String(d).slice(0, 10); if (k) load[k] = (load[k] || 0) + STRENGTH_LOAD; }
  const keys = Object.keys(load).sort();
  if (!keys.length) return { series: [], current: null, acwr: 0, acute: 0, chronic: 0 };
  const start = new Date(keys[0] + "T00:00:00");
  const lastData = new Date(keys[keys.length - 1] + "T00:00:00");
  const today = new Date(todayISO() + "T00:00:00");
  const end = today > lastData ? today : lastData;
  const days = [];
  for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) { const iso = dt.toISOString().slice(0, 10); days.push({ date: iso, load: load[iso] || 0 }); }
  const aC = 1 - Math.exp(-1 / 42), aA = 1 - Math.exp(-1 / 7);
  let ctl = 0, atl = 0; const series = [];
  for (const x of days) { const tsb = ctl - atl; ctl += (x.load - ctl) * aC; atl += (x.load - atl) * aA; series.push({ date: x.date, load: x.load, ctl: +ctl.toFixed(1), atl: +atl.toFixed(1), tsb: +tsb.toFixed(1) }); }
  const n = days.length;
  const meanLast = (k) => days.slice(Math.max(0, n - k)).reduce((a, b) => a + b.load, 0) / k;
  const acute = meanLast(7), chronic = meanLast(28);
  return { series, current: series[series.length - 1], acwr: chronic > 0 ? acute / chronic : 0, acute, chronic };
}

/* ============================================================
   NUTRITION — cibles + plan de repas hebdomadaire
   Cadre : méditerranéen / Anthony Berthou (aliments bruts,
   faible charge glycémique, bons gras, protéines à chaque repas,
   800 g–1 kg de fruits & légumes/jour). Cibles chiffrées :
   protéines ~2,0 g/kg (ISSN : 1,4–2,0 g/kg suffisent, jusqu'à
   2,3–3,1 g/kg pour préserver le muscle en déficit) ; glucides
   suffisants pour l'endurance ; déficit léger (Berthou : ≤300–500
   kcal/j) calibré sur la tendance de poids.
   Plan reçu chaque jeudi → semaine vendredi→jeudi.
   ============================================================ */
const MEAL_TARGETS = { kcal: 3000, protein: 175, carbs: 350, fat: 95 };
const CAT_LABELS = { FL: "Fruits & légumes", PR: "Viandes · poissons · œufs", CR: "Crémerie", BO: "Boulangerie", EP: "Épicerie" };
const CAT_ORDER = ["FL", "PR", "CR", "BO", "EP"];

const MEAL_PLAN = {
  weekLabel: "Ven. 17 → jeu. 23 juil. 2026",
  start: "2026-07-17",
  targets: { kcal: 3000, protein: 175, carbs: 350, fat: 95 },
  days: [
    { day: "Vendredi", date: "2026-07-17", meals: [
      { slot: "Petit-déjeuner", name: "Bowl skyr brebis, avoine, fruits rouges & noix", kcal: 580, p: 38, c: 62, f: 20, ing: [{ n: "Yaourt de brebis", q: 300, u: "g", c: "CR" }, { n: "Flocons d'avoine", q: 80, u: "g", c: "EP" }, { n: "Fruits rouges", q: 150, u: "g", c: "FL" }, { n: "Cerneaux de noix", q: 30, u: "g", c: "EP" }, { n: "Graines de chia", q: 15, u: "g", c: "EP" }, { n: "Miel", q: 15, u: "g", c: "EP" }] },
      { slot: "Déjeuner", name: "Bowl quinoa, pois chiches & légumes grillés, feta", kcal: 988, p: 54, c: 121, f: 32, ing: [{ n: "Quinoa", q: 100, u: "g", c: "EP" }, { n: "Pois chiches cuits", q: 150, u: "g", c: "EP" }, { n: "Courgette", q: 1, u: "pièce", c: "FL" }, { n: "Poivron", q: 1, u: "pièce", c: "FL" }, { n: "Tomates", q: 2, u: "pièce", c: "FL" }, { n: "Feta de brebis", q: 60, u: "g", c: "CR" }, { n: "Huile d'olive", q: 2, u: "c.à.s", c: "EP" }] },
      { slot: "Dîner", name: "Maquereaux grillés, riz complet & haricots verts", kcal: 902, p: 54, c: 104, f: 30, ing: [{ n: "Filets de maquereau", q: 220, u: "g", c: "PR" }, { n: "Riz complet", q: 90, u: "g", c: "EP" }, { n: "Haricots verts", q: 200, u: "g", c: "FL" }, { n: "Salade verte", q: 80, u: "g", c: "FL" }, { n: "Citron", q: 1, u: "pièce", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }] },
      { slot: "Collation", name: "Fromage blanc de chèvre, banane & amandes", kcal: 476, p: 32, c: 60, f: 12, ing: [{ n: "Fromage blanc de chèvre", q: 250, u: "g", c: "CR" }, { n: "Banane", q: 1, u: "pièce", c: "FL" }, { n: "Amandes", q: 30, u: "g", c: "EP" }, { n: "Miel", q: 10, u: "g", c: "EP" }] },
    ] },
    { day: "Samedi", date: "2026-07-18", meals: [
      { slot: "Petit-déjeuner", name: "Œufs brouillés, pain au levain, avocat & tomates", kcal: 614, p: 36, c: 59, f: 26, ing: [{ n: "Œufs", q: 3, u: "pièce", c: "PR" }, { n: "Pain complet au levain", q: 100, u: "g", c: "BO" }, { n: "Avocat", q: 1, u: "pièce", c: "FL" }, { n: "Tomates", q: 1, u: "pièce", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }, { n: "Pêche", q: 1, u: "pièce", c: "FL" }] },
      { slot: "Déjeuner", name: "Salade de lentilles, thon, œuf & crudités", kcal: 946, p: 56, c: 113, f: 30, ing: [{ n: "Lentilles cuites", q: 180, u: "g", c: "EP" }, { n: "Thon au naturel", q: 140, u: "g", c: "PR" }, { n: "Œufs", q: 1, u: "pièce", c: "PR" }, { n: "Concombre", q: 1, u: "pièce", c: "FL" }, { n: "Tomates", q: 2, u: "pièce", c: "FL" }, { n: "Oignon rouge", q: 1, u: "pièce", c: "FL" }, { n: "Huile d'olive", q: 2, u: "c.à.s", c: "EP" }] },
      { slot: "Dîner", name: "Poulet rôti aux herbes, semoule complète & ratatouille", kcal: 906, p: 59, c: 109, f: 26, ing: [{ n: "Filet de poulet", q: 200, u: "g", c: "PR" }, { n: "Semoule complète", q: 90, u: "g", c: "EP" }, { n: "Aubergine", q: 1, u: "pièce", c: "FL" }, { n: "Courgette", q: 1, u: "pièce", c: "FL" }, { n: "Poivron", q: 1, u: "pièce", c: "FL" }, { n: "Tomates", q: 2, u: "pièce", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }] },
      { slot: "Collation", name: "Yaourt de brebis, abricots & amandes", kcal: 456, p: 30, c: 57, f: 12, ing: [{ n: "Yaourt de brebis", q: 300, u: "g", c: "CR" }, { n: "Abricots", q: 3, u: "pièce", c: "FL" }, { n: "Amandes", q: 25, u: "g", c: "EP" }, { n: "Flocons d'avoine", q: 30, u: "g", c: "EP" }] },
    ] },
    { day: "Dimanche", date: "2026-07-19", meals: [
      { slot: "Petit-déjeuner", name: "Porridge avoine, lait, banane, beurre de cacahuète", kcal: 596, p: 35, c: 69, f: 20, ing: [{ n: "Flocons d'avoine", q: 90, u: "g", c: "EP" }, { n: "Lait", q: 250, u: "ml", c: "CR" }, { n: "Banane", q: 1, u: "pièce", c: "FL" }, { n: "Beurre de cacahuète", q: 20, u: "g", c: "EP" }, { n: "Graines de chia", q: 15, u: "g", c: "EP" }] },
      { slot: "Déjeuner", name: "Pâtes complètes, sardines, tomates & basilic", kcal: 990, p: 52, c: 128, f: 30, ing: [{ n: "Pâtes complètes", q: 110, u: "g", c: "EP" }, { n: "Sardines à l'huile d'olive", q: 120, u: "g", c: "PR" }, { n: "Tomates", q: 2, u: "pièce", c: "FL" }, { n: "Ail", q: 1, u: "gousse", c: "FL" }, { n: "Basilic", q: 1, u: "botte", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }] },
      { slot: "Dîner", name: "Omelette aux courgettes & chèvre, pain au levain, salade", kcal: 880, p: 49, c: 99, f: 32, ing: [{ n: "Œufs", q: 3, u: "pièce", c: "PR" }, { n: "Courgette", q: 1, u: "pièce", c: "FL" }, { n: "Fromage de chèvre", q: 50, u: "g", c: "CR" }, { n: "Pain complet au levain", q: 100, u: "g", c: "BO" }, { n: "Salade verte", q: 80, u: "g", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }] },
      { slot: "Collation", name: "Melon, jambon de qualité & noisettes", kcal: 452, p: 32, c: 54, f: 12, ing: [{ n: "Melon", q: 1, u: "pièce", c: "FL" }, { n: "Jambon blanc supérieur", q: 80, u: "g", c: "PR" }, { n: "Noisettes", q: 25, u: "g", c: "EP" }, { n: "Fromage blanc de chèvre", q: 100, u: "g", c: "CR" }] },
    ] },
    { day: "Lundi", date: "2026-07-20", meals: [
      { slot: "Petit-déjeuner", name: "Bowl skyr brebis, avoine, pêche & noix", kcal: 580, p: 38, c: 62, f: 20, ing: [{ n: "Yaourt de brebis", q: 300, u: "g", c: "CR" }, { n: "Flocons d'avoine", q: 80, u: "g", c: "EP" }, { n: "Pêche", q: 1, u: "pièce", c: "FL" }, { n: "Cerneaux de noix", q: 30, u: "g", c: "EP" }, { n: "Graines de chia", q: 15, u: "g", c: "EP" }, { n: "Miel", q: 15, u: "g", c: "EP" }] },
      { slot: "Déjeuner", name: "Bowl riz complet, poulet, pois chiches & légumes", kcal: 962, p: 59, c: 123, f: 26, ing: [{ n: "Riz complet", q: 90, u: "g", c: "EP" }, { n: "Filet de poulet", q: 200, u: "g", c: "PR" }, { n: "Pois chiches cuits", q: 120, u: "g", c: "EP" }, { n: "Poivron", q: 1, u: "pièce", c: "FL" }, { n: "Tomates", q: 2, u: "pièce", c: "FL" }, { n: "Huile d'olive", q: 2, u: "c.à.s", c: "EP" }] },
      { slot: "Dîner", name: "Daurade au four, pommes de terre & courgettes", kcal: 858, p: 52, c: 104, f: 26, ing: [{ n: "Filet de daurade", q: 220, u: "g", c: "PR" }, { n: "Pommes de terre", q: 250, u: "g", c: "FL" }, { n: "Courgette", q: 1, u: "pièce", c: "FL" }, { n: "Citron", q: 1, u: "pièce", c: "FL" }, { n: "Ail", q: 1, u: "gousse", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }] },
      { slot: "Collation", name: "Fromage blanc de chèvre, figues & amandes", kcal: 468, p: 32, c: 58, f: 12, ing: [{ n: "Fromage blanc de chèvre", q: 250, u: "g", c: "CR" }, { n: "Figues", q: 3, u: "pièce", c: "FL" }, { n: "Amandes", q: 30, u: "g", c: "EP" }, { n: "Miel", q: 10, u: "g", c: "EP" }] },
    ] },
    { day: "Mardi", date: "2026-07-21", meals: [
      { slot: "Petit-déjeuner", name: "Œufs à la coque, pain au levain, avocat & melon", kcal: 605, p: 36, c: 59, f: 25, ing: [{ n: "Œufs", q: 3, u: "pièce", c: "PR" }, { n: "Pain complet au levain", q: 100, u: "g", c: "BO" }, { n: "Avocat", q: 1, u: "pièce", c: "FL" }, { n: "Melon", q: 1, u: "pièce", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }] },
      { slot: "Déjeuner", name: "Taboulé de quinoa, pois chiches, feta & crudités", kcal: 962, p: 52, c: 121, f: 30, ing: [{ n: "Quinoa", q: 100, u: "g", c: "EP" }, { n: "Pois chiches cuits", q: 150, u: "g", c: "EP" }, { n: "Feta de brebis", q: 60, u: "g", c: "CR" }, { n: "Concombre", q: 1, u: "pièce", c: "FL" }, { n: "Tomates", q: 2, u: "pièce", c: "FL" }, { n: "Menthe", q: 1, u: "botte", c: "FL" }, { n: "Huile d'olive", q: 2, u: "c.à.s", c: "EP" }] },
      { slot: "Dîner", name: "Steak haché 5%, boulgour & ratatouille", kcal: 856, p: 56, c: 104, f: 24, ing: [{ n: "Steak haché 5%", q: 200, u: "g", c: "PR" }, { n: "Boulgour", q: 90, u: "g", c: "EP" }, { n: "Aubergine", q: 1, u: "pièce", c: "FL" }, { n: "Courgette", q: 1, u: "pièce", c: "FL" }, { n: "Tomates", q: 2, u: "pièce", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }] },
      { slot: "Collation", name: "Yaourt de brebis, fruits rouges & noix", kcal: 452, p: 32, c: 54, f: 12, ing: [{ n: "Yaourt de brebis", q: 300, u: "g", c: "CR" }, { n: "Fruits rouges", q: 150, u: "g", c: "FL" }, { n: "Cerneaux de noix", q: 25, u: "g", c: "EP" }, { n: "Flocons d'avoine", q: 30, u: "g", c: "EP" }] },
    ] },
    { day: "Mercredi", date: "2026-07-22", meals: [
      { slot: "Petit-déjeuner", name: "Porridge avoine, lait, poire & beurre d'amande", kcal: 592, p: 35, c: 68, f: 20, ing: [{ n: "Flocons d'avoine", q: 90, u: "g", c: "EP" }, { n: "Lait", q: 250, u: "ml", c: "CR" }, { n: "Poire", q: 1, u: "pièce", c: "FL" }, { n: "Beurre d'amande", q: 20, u: "g", c: "EP" }, { n: "Graines de chia", q: 15, u: "g", c: "EP" }] },
      { slot: "Déjeuner", name: "Salade niçoise (thon, œuf, haricots, olives)", kcal: 936, p: 54, c: 108, f: 32, ing: [{ n: "Thon au naturel", q: 140, u: "g", c: "PR" }, { n: "Œufs", q: 2, u: "pièce", c: "PR" }, { n: "Haricots verts", q: 150, u: "g", c: "FL" }, { n: "Pommes de terre", q: 200, u: "g", c: "FL" }, { n: "Tomates", q: 2, u: "pièce", c: "FL" }, { n: "Olives noires", q: 40, u: "g", c: "EP" }, { n: "Huile d'olive", q: 2, u: "c.à.s", c: "EP" }] },
      { slot: "Dîner", name: "Dahl de lentilles corail, riz complet & épinards", kcal: 862, p: 42, c: 124, f: 22, ing: [{ n: "Lentilles corail", q: 100, u: "g", c: "EP" }, { n: "Riz complet", q: 80, u: "g", c: "EP" }, { n: "Épinards frais", q: 150, u: "g", c: "FL" }, { n: "Lait de coco", q: 80, u: "ml", c: "EP" }, { n: "Oignon", q: 1, u: "pièce", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }] },
      { slot: "Collation", name: "Fromage blanc de chèvre, banane & beurre de cacahuète", kcal: 502, p: 34, c: 60, f: 14, ing: [{ n: "Fromage blanc de chèvre", q: 250, u: "g", c: "CR" }, { n: "Banane", q: 1, u: "pièce", c: "FL" }, { n: "Beurre de cacahuète", q: 20, u: "g", c: "EP" }, { n: "Miel", q: 10, u: "g", c: "EP" }] },
    ] },
    { day: "Jeudi", date: "2026-07-23", meals: [
      { slot: "Petit-déjeuner", name: "Bowl skyr brebis, avoine, figues & noisettes", kcal: 580, p: 38, c: 62, f: 20, ing: [{ n: "Yaourt de brebis", q: 300, u: "g", c: "CR" }, { n: "Flocons d'avoine", q: 80, u: "g", c: "EP" }, { n: "Figues", q: 2, u: "pièce", c: "FL" }, { n: "Noisettes", q: 30, u: "g", c: "EP" }, { n: "Graines de chia", q: 15, u: "g", c: "EP" }, { n: "Miel", q: 15, u: "g", c: "EP" }] },
      { slot: "Déjeuner", name: "Wrap complet poulet, houmous & crudités", kcal: 940, p: 54, c: 118, f: 28, ing: [{ n: "Galette complète (blé)", q: 2, u: "pièce", c: "BO" }, { n: "Filet de poulet", q: 200, u: "g", c: "PR" }, { n: "Houmous", q: 80, u: "g", c: "EP" }, { n: "Salade verte", q: 60, u: "g", c: "FL" }, { n: "Tomates", q: 1, u: "pièce", c: "FL" }, { n: "Concombre", q: 1, u: "pièce", c: "FL" }] },
      { slot: "Dîner", name: "Sardines grillées, pommes de terre & salade de tomates", kcal: 882, p: 49, c: 104, f: 30, ing: [{ n: "Sardines fraîches", q: 220, u: "g", c: "PR" }, { n: "Pommes de terre", q: 250, u: "g", c: "FL" }, { n: "Tomates", q: 2, u: "pièce", c: "FL" }, { n: "Oignon rouge", q: 1, u: "pièce", c: "FL" }, { n: "Basilic", q: 1, u: "botte", c: "FL" }, { n: "Huile d'olive", q: 1, u: "c.à.s", c: "EP" }] },
      { slot: "Collation", name: "Yaourt de brebis, pêche & amandes", kcal: 452, p: 30, c: 56, f: 12, ing: [{ n: "Yaourt de brebis", q: 300, u: "g", c: "CR" }, { n: "Pêche", q: 1, u: "pièce", c: "FL" }, { n: "Amandes", q: 30, u: "g", c: "EP" }, { n: "Flocons d'avoine", q: 30, u: "g", c: "EP" }] },
    ] },
  ],
};

// Agrège la liste de courses en appliquant le multiplicateur par repas (clé "jour:slot")
function buildShoppingList(plan, mult) {
  const agg = {};
  plan.days.forEach((d, di) => d.meals.forEach((m) => {
    const k = `${di}:${m.slot}`; const factor = mult[k] || 1;
    m.ing.forEach((g) => {
      const key = `${g.c}|${g.n}|${g.u}`;
      if (!agg[key]) agg[key] = { n: g.n, u: g.u, c: g.c, q: 0 };
      agg[key].q += g.q * factor;
    });
  }));
  const byCat = {};
  Object.values(agg).forEach((it) => { (byCat[it.c] = byCat[it.c] || []).push(it); });
  Object.values(byCat).forEach((arr) => arr.sort((a, b) => a.n.localeCompare(b.n)));
  return byCat;
}
const fmtQty = (q) => (Math.round(q) === q ? String(q) : String(Math.round(q * 10) / 10));

// Classification fine des ingrédients par rayon (pour la feuille Courses, façon modèle)
const FINE_CAT = {
  "Filets de maquereau": "VIANDE", "Filet de poulet": "VIANDE", "Filet de daurade": "VIANDE", "Steak haché 5%": "VIANDE", "Sardines fraîches": "VIANDE", "Sardines à l'huile d'olive": "VIANDE", "Thon au naturel": "VIANDE", "Jambon blanc supérieur": "VIANDE",
  "Œufs": "LAIT", "Yaourt de brebis": "LAIT", "Feta de brebis": "LAIT", "Fromage blanc de chèvre": "LAIT", "Fromage de chèvre": "LAIT", "Lait": "LAIT",
  "Flocons d'avoine": "CEREAL", "Quinoa": "CEREAL", "Riz complet": "CEREAL", "Semoule complète": "CEREAL", "Boulgour": "CEREAL", "Pâtes complètes": "CEREAL",
  "Pois chiches cuits": "LEGUM", "Lentilles cuites": "LEGUM", "Lentilles corail": "LEGUM",
  "Courgette": "LEG", "Poivron": "LEG", "Tomates": "LEG", "Haricots verts": "LEG", "Salade verte": "LEG", "Concombre": "LEG", "Oignon rouge": "LEG", "Aubergine": "LEG", "Ail": "LEG", "Pommes de terre": "LEG", "Épinards frais": "LEG", "Oignon": "LEG", "Avocat": "LEG",
  "Fruits rouges": "FRUIT", "Citron": "FRUIT", "Banane": "FRUIT", "Pêche": "FRUIT", "Abricots": "FRUIT", "Melon": "FRUIT", "Figues": "FRUIT", "Poire": "FRUIT",
  "Basilic": "HERB", "Menthe": "HERB",
  "Pain complet au levain": "BOUL", "Galette complète (blé)": "BOUL",
  "Cerneaux de noix": "EPI", "Graines de chia": "EPI", "Miel": "EPI", "Huile d'olive": "EPI", "Amandes": "EPI", "Beurre de cacahuète": "EPI", "Noisettes": "EPI", "Olives noires": "EPI", "Lait de coco": "EPI", "Houmous": "EPI", "Beurre d'amande": "EPI",
};
const COURSE_GROUPS = [
  ["VIANDE", "🥩 Viandes & poissons"], ["LAIT", "🥚 Œufs & produits laitiers"], ["CEREAL", "🌾 Féculents & céréales"],
  ["LEGUM", "🫘 Légumineuses"], ["LEG", "🥦 Légumes frais"], ["FRUIT", "🍑 Fruits frais"],
  ["EPI", "🫙 Épicerie & conserves"], ["HERB", "🌿 Herbes & épices"], ["BOUL", "🥖 Boulangerie"],
];
const fmtCourseQty = (q, u) => {
  if ((u === "g" || u === "ml") && q >= 1000) return (q / 1000).toFixed(1).replace(".", ",") + " " + (u === "g" ? "kg" : "l");
  if (u === "pièce") return q + (q > 1 ? " pièces" : " pièce");
  return fmtQty(q) + " " + u;
};
const shortWeek = (iso) => { const d = new Date(iso + "T00:00:00"); return "S. " + d.getDate() + " " + MON[d.getMonth()]; };

// Construit le payload complet (menu + courses) envoyé au backend pour l'Excel
function buildMenuPayload(plan, mult) {
  const targets = plan.targets || MEAL_TARGETS;
  const days = plan.days.map((d) => ({
    day: d.day,
    weekend: d.day === "Samedi" || d.day === "Dimanche",
    total: d.meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }), { kcal: 0, p: 0, c: 0, f: 0 }),
    meals: d.meals.map((m) => ({ slot: m.slot, name: m.name, items: m.ing.map((g) => `${g.n} : ${fmtQty(g.q)} ${g.u}`) })),
  }));
  const sectionAvg = {};
  ["Petit-déjeuner", "Déjeuner", "Collation", "Dîner"].forEach((slot) => {
    const meals = plan.days.map((d) => d.meals.find((m) => m.slot === slot)).filter(Boolean);
    const n = meals.length || 1;
    sectionAvg[slot] = { kcal: Math.round(meals.reduce((s, m) => s + m.kcal, 0) / n), p: Math.round(meals.reduce((s, m) => s + m.p, 0) / n), c: Math.round(meals.reduce((s, m) => s + m.c, 0) / n), f: Math.round(meals.reduce((s, m) => s + m.f, 0) / n) };
  });
  const byCat = buildShoppingList(plan, mult);
  const grouped = {};
  Object.values(byCat).flat().forEach((it) => { const g = FINE_CAT[it.n] || "EPI"; (grouped[g] = grouped[g] || []).push(it); });
  const anyMult = Object.values(mult).some((v) => v > 1);
  const courses = COURSE_GROUPS.filter(([g]) => grouped[g] && grouped[g].length).map(([g, label]) => ({
    group: g, label,
    items: grouped[g].sort((a, b) => a.n.localeCompare(b.n)).map((it) => ({ article: it.n, qty: fmtCourseQty(it.q, it.u), remark: "" })),
  }));
  return {
    filename: "menu-sommet-" + plan.start,
    weekShort: shortWeek(plan.start),
    menuTitle: `MENU — ${plan.weekLabel}  ·  ~${targets.kcal} kcal / ${targets.protein}g P / ${targets.fat}g L / ${targets.carbs}g G`,
    menuSubtitle: "Méditerranéen · de saison (Var) · non ultra-transformé · approche Berthou · cible moyenne à moduler selon le volume",
    menuLegend: "★ Bons gras (oméga-3) / approche Berthou   |   Macros par repas = estimations (±10 %)   |   week-end 🌴",
    sectionAvg, days,
    coursesTitle: `LISTE DE COURSES — ${plan.weekLabel}`,
    coursesSubtitle: "Semaine complète · 4 repas/jour" + (anyMult ? "  ·  portions ajustées" : ""),
    courses,
  };
}
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const numFR = (v) => { if (v == null || v === "") return null; const n = parseFloat(String(v).replace(",", ".")); return isNaN(n) ? null : n; };
const intFR = (v) => { const n = numFR(v); return n == null ? null : Math.round(n); };
const fmtSleep = (h) => { if (h == null) return "—"; const m = Math.round(h * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };

function normDate(s) {
  if (!s) return null; s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
  const dt = new Date(s); return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
}
function parseSleepHours(s) {
  if (s == null || s === "") return null; s = String(s).trim().replace(",", ".");
  const m = s.match(/^(\d+)\s*[h:]\s*(\d+)/); if (m) return +m[1] + (+m[2]) / 60;
  const v = parseFloat(s); return isNaN(v) ? null : v;
}
function parseCSV(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const h0 = (clean.split(/\r?\n/)[0] || "").toLowerCase();
  if (/poids/.test(h0) && /(imc|masse)/.test(h0)) return parseGarminWeight(clean);
  if (/1 jour/.test(h0)) return parseGarminNightDetail(clean);
  if (/score/.test(h0) && /moyenne/.test(h0)) return parseGarminSleepWeekly(clean);
  return parseSimpleCSV(clean);
}

// Export Garmin « Score de sommeil 1 jour » : rapport détaillé d'UNE nuit (clé/valeur vertical)
function parseGarminNightDetail(text) {
  const kv = {};
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(","); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(); const v = line.slice(i + 1).trim();
    if (v && !(k in kv)) kv[k] = v; // première occurrence
  }
  const dv = kv["date"];
  const date = dv && /^\d{4}-\d{2}-\d{2}/.test(dv) ? dv.slice(0, 10) : null;
  if (!date) return [];
  let hours = null; const dur = kv["durée du sommeil"];
  if (dur) { const m = dur.match(/(\d+)\s*h\s*(\d+)?\s*m/i); if (m) hours = +m[1] + (m[2] ? +m[2] : 0) / 60; }
  const score = kv["score de sommeil"] != null ? parseInt(kv["score de sommeil"], 10) : null;
  const row = { date };
  if (hours != null) row.sleep_hours = Math.round(hours * 10) / 10;
  if (score != null && !isNaN(score)) row.sleep_score = score;
  return [row];
}

// Format simple recommandé : date;poids;sommeil_h;score
function parseSimpleCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const header = lines[0].split(delim).map((h) => h.trim().toLowerCase());
  const find = (names) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const di = find(["date", "jour", "day"]), wi = find(["poids", "weight", "masse", "kg"]);
  const shi = find(["sommeil", "sleep", "durée", "duration", "heures", "hours"]), sci = find(["score", "qualité", "quality"]);
  if (di < 0) return [];
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(delim); const date = normDate(c[di]); if (!date) continue;
    rows.push({ date, weight: wi >= 0 ? numFR(c[wi]) : null, sleep_hours: shi >= 0 ? parseSleepHours(c[shi]) : null, sleep_score: sci >= 0 ? intFR(c[sci]) : null });
  }
  return rows;
}

// Mois FR (accents/points tolérés)
const stripTok = (t) => (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\./g, "").trim();
function monthNum(tok) {
  tok = stripTok(tok);
  if (tok.startsWith("janv") || tok === "jan") return 1;
  if (tok.startsWith("fev")) return 2;
  if (tok.startsWith("mars") || tok === "mar") return 3;
  if (tok.startsWith("avr")) return 4;
  if (tok === "mai") return 5;
  if (tok.startsWith("juil")) return 7;
  if (tok.startsWith("juin")) return 6;
  if (tok.startsWith("aou")) return 8;
  if (tok.startsWith("sep")) return 9;
  if (tok.startsWith("oct")) return 10;
  if (tok.startsWith("nov")) return 11;
  if (tok.startsWith("dec")) return 12;
  return null;
}
const isoYMD = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Export Garmin « Poids » : date entre guillemets sur une ligne, mesure sur la suivante
function parseGarminWeight(text) {
  const lines = text.split(/\r?\n/);
  const hdr = (lines[0] || "").toLowerCase().split(",");
  const wi = hdr.findIndex((h) => h.includes("poids"));
  const fi = hdr.findIndex((h) => h.includes("grasse"));
  const mi = hdr.findIndex((h) => h.includes("musculaire"));
  let pending = null; const rows = [];
  for (const line of lines.slice(1)) {
    const dm = line.match(/(\d{1,2})\s+([A-Za-zÀ-ÿ.]+)\s+(\d{4})/);
    if (dm) { const mo = monthNum(dm[2]); if (mo) pending = { y: +dm[3], m: mo, d: +dm[1] }; continue; }
    if (/kg/i.test(line)) {
      const c = line.split(",");
      let w = wi >= 0 ? numFR(c[wi]) : null;
      if (w == null) { for (const cell of c) { if (/kg/i.test(cell)) { const n = numFR(cell); if (n != null) { w = n; break; } } } }
      if (pending && w != null) {
        rows.push({ date: isoYMD(pending.y, pending.m, pending.d), weight: w, fat: fi >= 0 ? numFR(c[fi]) : null, muscle: mi >= 0 ? numFR(c[mi]) : null });
        pending = null;
      }
    }
  }
  return rows;
}

// Export Garmin « Sommeil » : résumé hebdomadaire → moyenne répliquée sur chaque jour de la semaine
function parseGarminSleepWeekly(text) {
  const CUR = new Date().getFullYear();
  const lines = text.split(/\r?\n/).filter((l) => l.trim()); const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(","); if (cols.length < 4) continue;
    let range = cols[0].trim(); const score = parseInt(cols[1], 10);
    const dm = cols[3].match(/(\d+)\s*h\s*(\d+)?\s*min/i);
    const hours = dm ? +dm[1] + (dm[2] ? +dm[2] : 0) / 60 : null;
    if (isNaN(score) || hours == null) continue;
    let year = CUR; const ym = range.match(/(\d{4})\s*$/); if (ym) { year = +ym[1]; range = range.replace(/(\d{4})\s*$/, "").trim(); }
    range = range.replace(/\s+-\s+/, "-");
    const parts = range.split("-").map((s) => s.trim()); if (parts.length < 2) continue;
    const rp = parts[1].match(/(\d+)\s+([A-Za-zÀ-ÿ.]+)/); if (!rp) continue;
    const endD = +rp[1], endM = monthNum(rp[2]);
    const lp = parts[0].match(/(\d+)\s+([A-Za-zÀ-ÿ.]+)/);
    let startD, startM;
    if (lp) { startD = +lp[1]; startM = monthNum(lp[2]); } else { const nm = parts[0].match(/\d+/); if (!nm) continue; startD = +nm[0]; startM = endM; }
    if (!endM || !startM) continue;
    const sy = startM > endM ? year - 1 : year;
    const start = new Date(sy, startM - 1, startD), end = new Date(year, endM - 1, endD);
    const hr = Math.round(hours * 10) / 10;
    for (let dt = new Date(start); dt <= end; dt.setDate(dt.getDate() + 1)) rows.push({ date: dt.toISOString().slice(0, 10), sleep_hours: hr, sleep_score: score });
  }
  return rows;
}

// Données réelles de Julien (exports Garmin : poids/masse grasse/masse musculaire + sommeil hebdo)
function seedMetrics() {
  return [
    { date: "2026-06-03", weight: 88.1, fat: 22.1, muscle: 35.6, sleep_hours: 7.6, sleep_score: 89 },
    { date: "2026-06-04", weight: 87.7, fat: 22.2, muscle: 35.5, sleep_hours: 7.6, sleep_score: 89 },
    { date: "2026-06-05", weight: 87.7, fat: 22.3, muscle: 35.5, sleep_hours: 7.6, sleep_score: 89 },
    { date: "2026-06-06", weight: 88.1, fat: 22.5, muscle: 35.6, sleep_hours: 7.6, sleep_score: 89 },
    { date: "2026-06-07", weight: 88.8, fat: 22, muscle: 35.8, sleep_hours: 7.6, sleep_score: 89 },
    { date: "2026-06-08", weight: 88.9, fat: 21.8, muscle: 35.8, sleep_hours: 7.2, sleep_score: 86 },
    { date: "2026-06-09", weight: 88.5, fat: 22, muscle: 35.7, sleep_hours: 7.2, sleep_score: 86 },
    { date: "2026-06-10", weight: 88.2, fat: 22.1, muscle: 35.7, sleep_hours: 7.2, sleep_score: 86 },
    { date: "2026-06-11", weight: 88.1, fat: 22.4, muscle: 35.6, sleep_hours: 7.2, sleep_score: 86 },
    { date: "2026-06-12", weight: 89.4, fat: 22.3, muscle: 36, sleep_hours: 7.2, sleep_score: 86 },
    { date: "2026-06-13", weight: 88.6, fat: 22.2, muscle: 35.8, sleep_hours: 7.2, sleep_score: 86 },
    { date: "2026-06-14", weight: 88.5, fat: 21.9, muscle: 35.7, sleep_hours: 7.2, sleep_score: 86 },
    { date: "2026-06-15", weight: 89.1, fat: 22.1, muscle: 35.9, sleep_hours: 7.3, sleep_score: 71 },
    { date: "2026-06-16", weight: 88.3, fat: 21.8, muscle: 35.7, sleep_hours: 7.3, sleep_score: 71 },
    { date: "2026-06-17", sleep_hours: 7.3, sleep_score: 71 },
    { date: "2026-06-18", sleep_hours: 7.3, sleep_score: 71 },
    { date: "2026-06-19", weight: 88.7, fat: 22.7, muscle: 35.8, sleep_hours: 7.3, sleep_score: 71 },
    { date: "2026-06-20", weight: 87.6, fat: 22.3, muscle: 35.5, sleep_hours: 7.3, sleep_score: 71 },
    { date: "2026-06-21", weight: 88.6, fat: 22.6, muscle: 35.8, sleep_hours: 7.3, sleep_score: 71 },
    { date: "2026-06-22", weight: 89.4, fat: 22.3, muscle: 36, sleep_hours: 7.2, sleep_score: 82 },
    { date: "2026-06-23", weight: 89.1, fat: 22, muscle: 35.9, sleep_hours: 7.2, sleep_score: 82 },
    { date: "2026-06-24", weight: 88.2, fat: 22.1, muscle: 35.7, sleep_hours: 7.2, sleep_score: 82 },
    { date: "2026-06-25", sleep_hours: 7.2, sleep_score: 82 },
    { date: "2026-06-26", weight: 88.2, fat: 22.5, muscle: 35.7, sleep_hours: 7.2, sleep_score: 82 },
    { date: "2026-06-27", weight: 88.3, fat: 21.8, muscle: 35.7, sleep_hours: 7.2, sleep_score: 82 },
    { date: "2026-06-28", weight: 89.6, fat: 22, muscle: 36, sleep_hours: 7.2, sleep_score: 82 },
    { date: "2026-06-29", weight: 89.7, fat: 22, muscle: 36, sleep_hours: 7.2, sleep_score: 84 },
    { date: "2026-06-30", weight: 88.2, fat: 22.2, muscle: 35.7, sleep_hours: 7.2, sleep_score: 84 },
    { date: "2026-07-01", sleep_hours: 7.2, sleep_score: 84 },
    { date: "2026-07-02", weight: 87.4, fat: 21.8, muscle: 35.5, sleep_hours: 7.2, sleep_score: 84 },
    { date: "2026-07-03", weight: 87.9, fat: 21.9, muscle: 35.6, sleep_hours: 7.2, sleep_score: 84 },
    { date: "2026-07-04", weight: 87.8, fat: 21.9, muscle: 35.6, sleep_hours: 7.2, sleep_score: 84 },
    { date: "2026-07-05", weight: 87.6, fat: 22.2, muscle: 35.5, sleep_hours: 7.2, sleep_score: 84 },
    { date: "2026-07-06", weight: 88.3, fat: 21.8, muscle: 35.7, sleep_hours: 6.6, sleep_score: 76 },
    { date: "2026-07-07", sleep_hours: 6.6, sleep_score: 76 },
    { date: "2026-07-08", weight: 87.4, fat: 21.8, muscle: 35.5, sleep_hours: 6.6, sleep_score: 76 },
    { date: "2026-07-09", sleep_hours: 6.6, sleep_score: 76 },
    { date: "2026-07-10", weight: 86.8, fat: 21.9, muscle: 35.3, sleep_hours: 6.6, sleep_score: 76 },
    { date: "2026-07-11", weight: 87.5, fat: 21.7, muscle: 35.5, sleep_hours: 6.6, sleep_score: 76 },
    { date: "2026-07-12", weight: 87.9, fat: 21.9, muscle: 35.6, sleep_hours: 7.9, sleep_score: 87 },
  ];
}

/* --------------------- Historique de démonstration --------------------- */
function seedHistory() {
  const schedule = {
    j1: ["2026-06-08", "2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06"],
    j2: ["2026-06-10", "2026-06-17", "2026-06-24", "2026-07-01", "2026-07-09"],
    j3: ["2026-06-12", "2026-06-19", "2026-06-26", "2026-07-03"],
  };
  const rows = [];
  DAYS.forEach((day) => {
    schedule[day.id].forEach((date, level) => {
      const sets = [];
      day.exercises.forEach((ex) => {
        const w = r05(ex.base + ex.step * level);
        for (let i = 0; i < ex.sets; i++) sets.push({ ex: ex.n, muscle: ex.m, weight: w, reps: ex.reps, iso: !!ex.iso });
      });
      rows.push({ id: `${day.id}-${date}`, dayId: day.id, title: day.title, subtitle: day.subtitle, date, durationSec: 2760 + ((level * 97 + day.id.charCodeAt(1)) % 9) * 45, sets });
    });
  });
  rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  const best = {};
  rows.forEach((s) => {
    const tops = {}; s.sets.forEach((st) => { tops[st.ex] = Math.max(tops[st.ex] || 0, st.weight); });
    const prs = []; Object.entries(tops).forEach(([ex, w]) => { if (w > (best[ex] || 0)) { prs.push(ex); best[ex] = w; } });
    s.prExercises = prs; s.volumeByMuscle = volumeByMuscle(s.sets);
  });
  return rows;
}
function volumeByMuscle(sets) { const v = {}; sets.forEach((st) => { v[st.muscle] = (v[st.muscle] || 0) + st.weight * st.reps; }); return v; }

/* --------------------------- Couche API -------------------------------- */
const API = ""; // même origine ; proxifié vers le backend en dev
async function apiGet(path) { const r = await fetch(API + path, { headers: { Accept: "application/json" } }); if (!r.ok) throw new Error(path); return r.json(); }
async function apiPost(path, body) { const r = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(path); return r.json(); }

/* ============================ COMPOSANT ================================= */
export default function App() {
  const [tab, setTab] = useState("dash");
  const [cfg, setCfg] = useState(DEFAULTS);
  const [history, setHistory] = useState([]);
  const [activities, setActivities] = useState(DEMO_ACTIVITIES);
  const [active, setActive] = useState(null);
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(false); // true = API branchée
  const [weekPlan, setWeekPlan] = useState({}); // choix HT/dehors + "fait" par séance endurance
  const [metrics, setMetrics] = useState([]); // suivi quotidien poids + sommeil
  const [cardioDaily, setCardioDaily] = useState(CARDIO_DAILY); // charge cardio/jour (Strava)
  const [mealPlans, setMealPlans] = useState([]); // plans de repas stockés en base (vide = plan par défaut)

  // Police
  useEffect(() => {
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Barlow:wght@400;500;600&display=swap";
    document.head.appendChild(l); return () => { try { document.head.removeChild(l); } catch (e) {} };
  }, []);

  // Chargement : API si dispo, sinon démo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await apiGet("/api/config");
        const sess = await apiGet("/api/sessions");
        const mt = await apiGet("/api/metrics");
        if (cancelled) return;
        setCfg({ ...DEFAULTS, ...config });
        setHistory(sess.sessions || []);
        setWeekPlan(config.weekPlan || {});
        setMetrics(mt.metrics || []);
        setLive(true);
        try { const a = await apiGet("/api/strava/activities"); if (!cancelled && a.activities) setActivities(a.activities); } catch (e) {}
        try { const L = await apiGet("/api/strava/load"); if (!cancelled && L.daily) setCardioDaily(L.daily.map((x) => ({ date: x.date, re: x.load }))); } catch (e) {}
        try { const mp = await apiGet("/api/mealplan"); if (!cancelled && mp.plans) setMealPlans(mp.plans); } catch (e) {}
      } catch (e) {
        if (!cancelled) { setHistory(seedHistory()); setMetrics(seedMetrics()); setLive(false); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Minuteur (séance + repos)
  useEffect(() => { if (!active) return; const id = setInterval(() => setTick((t) => t + 1), 1000); return () => clearInterval(id); }, [active]);

  /* ---- Dérivés historique ---- */
  const lastTopFor = (exName) => {
    for (let i = history.length - 1; i >= 0; i--) {
      const rel = history[i].sets.filter((x) => x.ex === exName);
      if (rel.length) { const top = rel.reduce((a, b) => (b.weight > a.weight ? b : a)); return { weight: top.weight, reps: top.reps, iso: top.iso }; }
    } return null;
  };
  const prFor = (exName) => { let m = 0; history.forEach((s) => s.sets.forEach((x) => { if (x.ex === exName) m = Math.max(m, x.weight); })); return m; };
  const seriesFor = (exName) => {
    const pts = []; history.forEach((s) => { const rel = s.sets.filter((x) => x.ex === exName); if (rel.length) pts.push({ date: s.date, weight: Math.max(...rel.map((x) => x.weight)) }); }); return pts;
  };

  /* ---- Séance ---- */
  const startSession = (day) => {
    if (active) { setTab("session"); return; }
    const exercises = day.exercises.map((ex) => {
      const prev = lastTopFor(ex.n);
      return {
        name: ex.n, muscle: ex.m, iso: !!ex.iso, rest: ex.rest,
        prevLabel: prev ? (ex.iso ? `${prev.reps} s` : `${fmtNum(prev.weight)}×${prev.reps}`) : "1ʳᵉ fois",
        prevWeight: prev ? prev.weight : ex.base,
        sets: Array.from({ length: ex.sets }, () => ({ weight: "", reps: String(ex.reps), done: false })),
      };
    });
    setActive({ dayId: day.id, title: day.title, subtitle: day.subtitle, startTs: Date.now(), date: TODAY.toISOString(), exercises, cooldown: day.cooldown.map((t) => ({ text: t, done: false })), addOpen: false, rest: null });
    setTab("session");
  };
  const upd = (fn) => setActive((a) => { const c = structuredClone(a); fn(c); return c; });

  const finishSession = () => {
    const a = active;
    if (a) {
      const sets = [];
      a.exercises.forEach((ex) => ex.sets.forEach((st) => {
        const w = parseFloat(String(st.weight).replace(",", ".")); const rp = parseInt(st.reps, 10);
        if (st.done && !isNaN(rp)) sets.push({ ex: ex.name, muscle: ex.muscle, weight: isNaN(w) ? 0 : w, reps: rp, iso: ex.iso });
      }));
      if (sets.length) {
        const durationSec = Math.round((Date.now() - a.startTs) / 1000);
        const tops = {}; sets.forEach((st) => { tops[st.ex] = Math.max(tops[st.ex] || 0, st.weight); });
        const prs = []; Object.entries(tops).forEach(([ex, w]) => { if (w > prFor(ex)) prs.push(ex); });
        const rec = { id: `${a.dayId}-${Date.now()}`, dayId: a.dayId, title: a.title, subtitle: a.subtitle, date: a.date, durationSec, sets, prExercises: prs, volumeByMuscle: volumeByMuscle(sets) };
        setHistory((h) => [...h, rec].sort((x, y) => new Date(x.date) - new Date(y.date)));
        if (live) { apiPost("/api/sessions", rec).catch(() => {}); }
      }
    }
    setActive(null); setTab("history");
  };
  const cancelSession = () => { setActive(null); setTab("dash"); };

  /* ---- Programme endurance (choix HT/dehors + fait) ---- */
  const savePlan = (next) => { setWeekPlan(next); if (live) apiPut("/api/settings", { weekPlan: next }).catch(() => {}); };
  const setBikeMode = (id, mode) => savePlan({ ...weekPlan, [id]: { ...(weekPlan[id] || {}), mode } });
  const setBikeHours = (id, hours) => savePlan({ ...weekPlan, [id]: { ...(weekPlan[id] || {}), hours } });
  const setSessionDay = (id, day) => savePlan({ ...weekPlan, [id]: { ...(weekPlan[id] || {}), day } });
  const toggleEnduranceDone = (id) => savePlan({ ...weekPlan, [id]: { ...(weekPlan[id] || {}), done: !(weekPlan[id]?.done) } });
  const resetSchedule = () => { const next = structuredClone(weekPlan); Object.keys(DEFAULT_DAYS).forEach((id) => { next[id] = { ...(next[id] || {}), day: DEFAULT_DAYS[id] }; }); savePlan(next); };

  /* ---- Suivi quotidien poids + sommeil ---- */
  const saveMetric = (date, patch) => {
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v != null));
    setMetrics((arr) => {
      const i = arr.findIndex((m) => m.date === date);
      const merged = i >= 0 ? { ...arr[i], ...clean } : { date, ...clean };
      const next = i >= 0 ? arr.map((m, j) => (j === i ? merged : m)) : [...arr, merged];
      return next.sort((a, b) => new Date(a.date) - new Date(b.date));
    });
    if (live) apiPost("/api/metrics", { date, ...patch }).catch(() => {});
  };
  const importMetrics = (rows) => {
    setMetrics((arr) => {
      const map = new Map(arr.map((m) => [m.date, m]));
      rows.forEach((r) => { const ex = map.get(r.date) || { date: r.date }; const clean = Object.fromEntries(Object.entries(r).filter(([k, v]) => k === "date" || v != null)); map.set(r.date, { ...ex, ...clean }); });
      return [...map.values()].sort((a, b) => new Date(a.date) - new Date(b.date));
    });
    if (live) apiPost("/api/metrics/import", rows).catch(() => {});
  };
  const saveMealPlan = async (plan) => {
    // maj optimiste de l'état local (remplace la semaine de même start)
    setMealPlans((arr) => [plan, ...arr.filter((p) => p.start !== plan.start)]);
    if (live) { try { await apiPost("/api/mealplan", { plan }); return true; } catch (e) { return false; } }
    return true; // démo : conservé en mémoire (non persisté sans backend)
  };
  const deleteMealPlan = async (start) => {
    setMealPlans((arr) => arr.filter((p) => p.start !== start));
    if (live) { try { await apiPost("/api/mealplan/delete", { start }); } catch (e) {} }
  };

  /* ---- Stats ---- */
  const wkStart = startOfWeek(TODAY);
  const weekSessions = history.filter((s) => startOfWeek(new Date(s.date)).getTime() === wkStart.getTime());
  const weekTonnage = weekSessions.reduce((t, s) => t + s.sets.reduce((a, b) => a + b.weight * b.reps, 0), 0);
  const monthStart = new Date(TODAY); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const monthPRs = history.filter((s) => new Date(s.date) >= monthStart).reduce((a, s) => a + (s.prExercises?.length || 0), 0);
  const latestWeight = [...metrics].reverse().find((m) => m.weight != null)?.weight;
  const effWeight = latestWeight != null ? latestWeight : cfg.weight;
  const wkg = effWeight ? cfg.ftp / effWeight : 0;

  const pmc = useMemo(() => {
    const muscuDates = live ? history.map((s) => String(s.date).slice(0, 10)) : MUSCU_DAYS;
    return buildPMC(cardioDaily, muscuDates);
  }, [cardioDaily, history, live]);

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: FB, minHeight: "100vh" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", display: "flex", flexDirection: "column", background: C.bg, borderLeft: `1px solid ${C.line}`, borderRight: `1px solid ${C.line}` }}>
        <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 8 }}>
          {tab === "dash" && (
            <Dashboard cfg={cfg} weight={effWeight} wkg={wkg} live={live} activities={activities} metrics={metrics}
              onSaveMetric={saveMetric} onImportMetrics={importMetrics}
              weekCount={weekSessions.length} totalCount={history.length} weekTonnage={weekTonnage} monthPRs={monthPRs}
              active={active} onStart={startSession} onResume={() => setTab("session")} />
          )}
          {tab === "session" && (
            <Session active={active} upd={upd} onStartAny={startSession} onFinish={finishSession} onCancel={cancelSession} />
          )}
          {tab === "history" && <History history={history} />}
          {tab === "progress" && <Progress history={history} weekSessions={weekSessions} seriesFor={seriesFor} prFor={prFor} />}
          {tab === "programme" && <Programme weekPlan={weekPlan} onSetMode={setBikeMode} onSetHours={setBikeHours} onToggleDone={toggleEnduranceDone} onSetDay={setSessionDay} onResetDays={resetSchedule} onStart={startSession} />}
          {tab === "fitness" && <Fitness pmc={pmc} live={live} />}
          {tab === "nutri" && <Nutri plans={mealPlans} live={live} onSavePlan={saveMealPlan} onDeletePlan={deleteMealPlan} />}
        </main>
        <BottomNav tab={tab} setTab={setTab} activeBadge={!!active} />
      </div>
    </div>
  );
}

/* ============================ TABLEAU DE BORD =========================== */
function Dashboard({ cfg, weight, wkg, live, activities, metrics, onSaveMetric, onImportMetrics, weekCount, totalCount, weekTonnage, monthPRs, active, onStart, onResume }) {
  const dGoal = daysBetween(cfg.event.date);
  const dNear = daysBetween(cfg.nearEvent.date);
  const kgToGoal = r05(weight - cfg.goalWeight);
  const wattsToTarget = Math.round(cfg.wkgTarget * weight - cfg.ftp);
  const wkgPct = Math.min(100, (wkg / cfg.wkgTarget) * 100);
  const last7d = metrics.slice(-7);
  const sleep7 = avg(last7d.map((m) => m.sleep_hours).filter((x) => x != null));
  const score7 = avg(last7d.map((m) => m.sleep_score).filter((x) => x != null));

  return (
    <div className="px-4 pt-5">
      {/* Wordmark */}
      <div className="flex items-center justify-between">
        <div>
          <div style={{ fontFamily: FD, fontWeight: 700, fontSize: 30, letterSpacing: "0.14em", lineHeight: 1 }}>SOMMET</div>
          <div style={{ fontFamily: FD, color: C.mut, letterSpacing: "0.26em", fontSize: 11, marginTop: 3 }}>SALUT {cfg.firstName?.toUpperCase()} · FORCE & PRÉVENTION</div>
        </div>
        <StatusPill live={live} />
      </div>

      {/* Bandeau objectif */}
      <div className="mt-4" style={{ background: `linear-gradient(180deg, ${C.cardHi}, ${C.card})`, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.blue}, transparent)` }} />
        <div className="flex items-center justify-between">
          <div style={{ fontFamily: FD, letterSpacing: "0.22em", fontSize: 11, color: C.blueHi }}>OBJECTIF PRINCIPAL</div>
          <div style={{ fontFamily: FD, fontSize: 11, color: C.mut, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 999, padding: "2px 9px" }}>
            {cfg.nearEvent.name.toUpperCase()} · J-{dNear}
          </div>
        </div>
        <div className="flex items-end justify-between mt-1">
          <div>
            <div style={{ fontFamily: FD, fontSize: 24, fontWeight: 600, lineHeight: 1.05 }}>{cfg.event.name}</div>
            <div style={{ color: C.mut, fontSize: 13 }}>{cfg.event.detail}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FD, fontSize: 34, fontWeight: 700, color: C.blueHi, lineHeight: 1 }}>{dGoal}</div>
            <div style={{ fontFamily: FD, letterSpacing: "0.18em", fontSize: 10, color: C.mut }}>JOURS · ~MAI 2027</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-3">
          <MiniStat label="POIDS ACTUEL" value={fmtNum(weight)} unit="kg" />
          <MiniStat label="OBJECTIF" value={fmtNum(cfg.goalWeight)} unit="kg" accent />
          <MiniStat label="ÉCART" value={`-${fmtNum(kgToGoal)}`} unit="kg" />
        </div>
      </div>

      {/* Perf vélo (Strava) */}
      <div className="mt-3" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
        <div className="flex items-center justify-between">
          <div style={{ fontFamily: FD, letterSpacing: "0.18em", fontSize: 11, color: C.orange }}>PUISSANCE VÉLO · STRAVA</div>
          <div style={{ fontFamily: FD, fontSize: 11, color: C.mut }}>{live ? "SYNCHRONISÉ" : "APERÇU · 11/07"}</div>
        </div>
        <div className="flex items-end justify-between mt-1.5">
          <div style={{ display: "flex", gap: 16 }}>
            <div><div style={{ fontFamily: FD, fontSize: 28, fontWeight: 700, lineHeight: 1 }}>{fmtNum(cfg.ftp)}<span style={{ fontSize: 13, color: C.mut }}> W</span></div><div style={{ fontFamily: FD, fontSize: 10, letterSpacing: "0.12em", color: C.mut2 }}>FTP{cfg.ftpEstimated ? " (est.)" : ""}</div></div>
            <div><div style={{ fontFamily: FD, fontSize: 28, fontWeight: 700, color: C.blueHi, lineHeight: 1 }}>{wkg.toFixed(2).replace(".", ",")}</div><div style={{ fontFamily: FD, fontSize: 10, letterSpacing: "0.12em", color: C.mut2 }}>W/KG</div></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FD, fontSize: 12, color: C.mut }}>Cible {cfg.wkgTarget.toFixed(1).replace(".", ",")} W/kg</div>
            <div style={{ fontFamily: FD, fontSize: 14, color: C.orange }}>+{wattsToTarget} W à trouver</div>
          </div>
        </div>
        <div style={{ height: 8, background: C.bg2, borderRadius: 6, marginTop: 10, overflow: "hidden", border: `1px solid ${C.line}` }}>
          <div style={{ height: "100%", width: `${wkgPct}%`, background: `linear-gradient(90deg,${C.orange},${C.gold})`, borderRadius: 6 }} />
        </div>
      </div>

      {/* Suivi du jour : poids + sommeil (manuel / import) */}
      <TodayCard metrics={metrics} live={live} onSave={onSaveMetric} onImport={onImportMetrics} />

      {/* Cartes statistiques */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <StatCard label="SÉANCES CETTE SEMAINE" value={`${weekCount}`} sub="/ 3 prévues" tone="blue" />
        <StatCard label="SÉANCES AU TOTAL" value={`${totalCount}`} sub="force enregistrées" tone="plain" />
        <StatCard label="TONNAGE — SEMAINE" value={fmtNum(Math.round(weekTonnage))} sub="kg soulevés" tone="plain" />
        <StatCard label="RECORDS CE MOIS" value={`${monthPRs}`} sub="PR battus" tone="gold" />
      </div>

      {active && (
        <button onClick={onResume} className="w-full mt-4" style={btnPrimary()}>
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Dot /> REPRENDRE — {active.subtitle.toUpperCase()}</span>
        </button>
      )}

      {/* Lancement rapide */}
      <SectionTitle>Lancement rapide</SectionTitle>
      <div className="flex flex-col gap-3">
        {DAYS.map((d) => (
          <button key={d.id} onClick={() => onStart(d)} className="w-full text-left" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 14px 13px 16px", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: C.blue }} />
            <div className="flex items-center justify-between">
              <div>
                <div style={{ fontFamily: FD, letterSpacing: "0.16em", fontSize: 11, color: C.mut }}>{d.title.toUpperCase()}</div>
                <div style={{ fontFamily: FD, fontSize: 21, fontWeight: 600, lineHeight: 1.05 }}>{d.subtitle}</div>
                <div style={{ color: C.mut2, fontSize: 12, marginTop: 2 }}>{d.focus}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontFamily: FD, color: C.mut, fontSize: 13 }}>{d.exercises.length} ex.</span>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: C.blue, display: "grid", placeItems: "center", boxShadow: `0 6px 16px ${C.blueGlow}` }}><Play /></div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Séances récentes Strava */}
      <SectionTitle>Activité récente · Strava</SectionTitle>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 6 }}>
        {activities.slice(0, 5).map((a, i) => (
          <div key={a.id || i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderBottom: i < 4 ? `1px solid ${C.line}` : "none" }}>
            <SportIcon type={a.type} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
              <div style={{ color: C.mut, fontSize: 11.5 }}>{fmtDate(a.date)}</div>
            </div>
            <div style={{ textAlign: "right", fontFamily: FD }}>
              {a.type === "WeightTraining"
                ? <div style={{ fontSize: 14, color: C.mut }}>{fmtDurShort(a.dur)}</div>
                : <><div style={{ fontSize: 14 }}>{fmtNum(Math.round(a.dist))} km</div><div style={{ fontSize: 11, color: C.orange }}>{fmtNum(Math.round(a.elev))} m D+</div></>}
            </div>
          </div>
        ))}
      </div>
      {live && !cfg.stravaConnected && (
        <a href="/api/strava/login" className="block text-center mt-3" style={{ ...btnGhost(), textDecoration: "none" }}>Connecter mon compte Strava</a>
      )}

      {/* Prévention */}
      <div className="mt-4 mb-2" style={{ background: C.bg2, border: `1px dashed ${C.line2}`, borderRadius: 12, padding: "11px 13px" }}>
        <div style={{ fontFamily: FD, letterSpacing: "0.2em", fontSize: 10, color: C.gold }}>PRIORITÉ N°1 · NE PAS SE BLESSER</div>
        <div style={{ color: C.mut, fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>
          Épaule G. : coiffe + gainage scapulaire, éviter les dips. Genou D. : charge progressive, contrôle en descente. Coude D. (juil.) à surveiller. Sommeil moy. 7 j {sleep7 != null ? fmtSleep(sleep7) : cfg.sleep.hours} · {score7 != null ? Math.round(score7) : cfg.sleep.score}/100.
        </div>
      </div>
    </div>
  );
}

function TodayCard({ metrics, live, onSave, onImport }) {
  const [w, setW] = useState("");
  const [sh, setSh] = useState("");
  const [sc, setSc] = useState("");
  const [msg, setMsg] = useState("");
  const tISO = todayISO();
  const todayRec = metrics.find((m) => m.date === tISO);
  const wSeries = metrics.filter((m) => m.weight != null).slice(-30).map((m) => ({ date: m.date, weight: m.weight }));
  const last7 = metrics.slice(-7);
  const sleepAvg = avg(last7.map((m) => m.sleep_hours).filter((x) => x != null));
  const scoreAvg = avg(last7.map((m) => m.sleep_score).filter((x) => x != null));
  const fatS = metrics.filter((m) => m.fat != null).slice(-30);
  const muS = metrics.filter((m) => m.muscle != null).slice(-30);
  const lastFat = fatS.length ? fatS[fatS.length - 1].fat : null;
  const lastMuscle = muS.length ? muS[muS.length - 1].muscle : null;
  const fatDelta = fatS.length >= 2 ? Math.round((lastFat - fatS[0].fat) * 10) / 10 : null;
  const muscleDelta = muS.length >= 2 ? Math.round((lastMuscle - muS[0].muscle) * 10) / 10 : null;
  const save = () => {
    const patch = { weight: numFR(w), sleep_hours: parseSleepHours(sh), sleep_score: intFR(sc) };
    if (patch.weight == null && patch.sleep_hours == null && patch.sleep_score == null) return;
    onSave(tISO, patch); setW(""); setSh(""); setSc("");
    setMsg("Enregistré ✓"); setTimeout(() => setMsg(""), 1800);
  };
  const onFile = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { const rows = parseCSV(String(r.result || "")); if (rows.length) { onImport(rows); setMsg(`Importé ${rows.length} jours ✓`); } else { setMsg("CSV non reconnu — vérifie l'entête"); } setTimeout(() => setMsg(""), 2800); };
    r.readAsText(f); e.target.value = "";
  };
  return (
    <div className="mt-3" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
      <div className="flex items-center justify-between">
        <div style={{ fontFamily: FD, letterSpacing: "0.18em", fontSize: 11, color: C.green }}>SUIVI DU JOUR · POIDS · SOMMEIL · COMPO</div>
        {msg && <div style={{ fontFamily: FD, fontSize: 12, color: C.green }}>{msg}</div>}
      </div>

      {wSeries.length >= 2 ? <div className="mt-2"><Sparkline series={wSeries} /></div> : <div style={{ color: C.mut2, fontSize: 12, marginTop: 8 }}>Ajoute quelques pesées pour voir la tendance de poids.</div>}
      <div className="flex gap-4 mt-1.5">
        <Metric k="DERNIER POIDS" v={wSeries.length ? `${fmtNum(wSeries[wSeries.length - 1].weight)} kg` : "—"} />
        <Metric k="SOMMEIL 7 J" v={sleepAvg != null ? fmtSleep(sleepAvg) : "—"} />
        <Metric k="SCORE 7 J" v={scoreAvg != null ? String(Math.round(scoreAvg)) : "—"} />
      </div>
      {(lastFat != null || lastMuscle != null) && (
        <div className="flex gap-2 mt-2">
          <CompTile label="MASSE GRASSE" value={lastFat != null ? fmtNum(lastFat) + " %" : "—"} delta={fatDelta} good="down" />
          <CompTile label="MASSE MUSCULAIRE" value={lastMuscle != null ? fmtNum(lastMuscle) + " kg" : "—"} delta={muscleDelta} good="up" />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end", marginTop: 12 }}>
        <Field label="POIDS (kg)"><NumInput value={w} onChange={setW} placeholder={todayRec?.weight != null ? String(todayRec.weight).replace(".", ",") : "kg"} /></Field>
        <Field label="SOMMEIL (h)"><NumInput value={sh} onChange={setSh} placeholder={todayRec?.sleep_hours != null ? "h" : "7,5"} /></Field>
        <Field label="SCORE"><NumInput value={sc} onChange={setSc} placeholder={todayRec?.sleep_score != null ? String(todayRec.sleep_score) : "/100"} /></Field>
        <button onClick={save} style={{ ...btnPrimary(), padding: "10px 15px", fontSize: 14 }}>OK</button>
      </div>
      {todayRec && <div style={{ color: C.mut2, fontSize: 11.5, marginTop: 6 }}>Aujourd'hui : {todayRec.weight != null ? fmtNum(todayRec.weight) + " kg" : "—"} · {todayRec.sleep_hours != null ? fmtSleep(todayRec.sleep_hours) : "—"}{todayRec.sleep_score != null ? " · score " + todayRec.sleep_score : ""}</div>}

      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12, cursor: "pointer", ...btnGhost() }}>
        <UploadIcon /> Importer un CSV (export Garmin)
        <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
      </label>
      <div style={{ color: C.mut2, fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
        Colonnes attendues : <span style={{ fontFamily: FD, color: C.mut }}>date, poids, sommeil_h, score</span> — une ligne par jour. Détection par nom de colonne ; décimales «, » ou «. » acceptées.
      </div>
    </div>
  );
}
function Field({ label, children }) { return (<div><div style={{ fontFamily: FD, letterSpacing: "0.1em", fontSize: 9.5, color: C.mut2, marginBottom: 4 }}>{label}</div>{children}</div>); }
function CompTile({ label, value, delta, good }) {
  const show = delta != null && Math.abs(delta) >= 0.05;
  let col = C.mut;
  if (show) { const favorable = good === "down" ? delta < 0 : delta > 0; col = favorable ? C.green : C.red; }
  return (
    <div style={{ flex: 1, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontFamily: FD, letterSpacing: "0.1em", fontSize: 9.5, color: C.mut2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontFamily: FD, fontSize: 20, fontWeight: 700 }}>{value}</span>
        {show && <span style={{ fontFamily: FD, fontSize: 12, color: col }}>{delta > 0 ? "▲ +" : "▼ "}{fmtNum(Math.abs(delta))}</span>}
      </div>
    </div>
  );
}
function UploadIcon() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 16V4M7 9l5-5 5 5M5 20h14" stroke={C.blueHi} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

/* ============================== SÉANCE ================================= */
function Session({ active, upd, onStartAny, onFinish, onCancel }) {
  if (!active) {
    return (
      <div className="px-4 pt-5">
        <ScreenHead title="Séance" sub="Aucune séance active" />
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, textAlign: "center" }}>
          <div style={{ color: C.mut, fontSize: 13.5, lineHeight: 1.5 }}>Lance un jour d'entraînement pour démarrer le journal, le minuteur et le suivi des séries.</div>
        </div>
        <SectionTitle>Démarrer</SectionTitle>
        <div className="flex flex-col gap-3">
          {DAYS.map((d) => (
            <button key={d.id} onClick={() => onStartAny(d)} className="w-full text-left" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontFamily: FD, fontSize: 19, fontWeight: 600 }}>{d.title} · {d.subtitle}</div><div style={{ color: C.mut2, fontSize: 12 }}>{d.focus}</div></div>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: C.blue, display: "grid", placeItems: "center" }}><Play /></div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const elapsed = Math.floor((Date.now() - active.startTs) / 1000);
  const doneCount = active.exercises.reduce((a, ex) => a + ex.sets.filter((s) => s.done).length, 0);
  const totalCount = active.exercises.reduce((a, ex) => a + ex.sets.length, 0);
  const restLeft = active.rest ? Math.ceil((active.rest.endTs - Date.now()) / 1000) : 0;

  const setField = (ei, si, f, v) => upd((c) => { c.exercises[ei].sets[si][f] = v; });
  const toggle = (ei, si) => upd((c) => {
    const st = c.exercises[ei].sets[si]; st.done = !st.done;
    if (st.done) {
      if (st.weight === "") st.weight = String(c.exercises[ei].prevWeight);
      const rest = c.exercises[ei].rest || 60;
      c.rest = { ei, endTs: Date.now() + rest * 1000, total: rest };
    }
  });
  const addSet = (ei) => upd((c) => { const s = c.exercises[ei].sets; const last = s[s.length - 1] || { reps: "" }; s.push({ weight: "", reps: last.reps || "", done: false }); });
  const addExercise = (ex) => upd((c) => { c.exercises.push({ name: ex.n, muscle: ex.m, iso: false, rest: ex.rest || 90, prevLabel: "1ʳᵉ fois", prevWeight: 0, sets: [{ weight: "", reps: "", done: false }] }); c.addOpen = false; });
  const toggleAdd = () => upd((c) => { c.addOpen = !c.addOpen; });
  const toggleCool = (i) => upd((c) => { c.cooldown[i].done = !c.cooldown[i].done; });
  const skipRest = () => upd((c) => { c.rest = null; });
  const addRest = (s) => upd((c) => { if (c.rest) c.rest.endTs += s * 1000; c.rest && (c.rest.total += s); });

  return (
    <div className="pt-4" style={{ position: "relative" }}>
      {/* Barre d'état collante */}
      <div className="px-4" style={{ position: "sticky", top: 0, zIndex: 20, background: C.bg, paddingBottom: 10, borderBottom: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontFamily: FD, letterSpacing: "0.16em", fontSize: 11, color: C.mut }}>{fmtDate(active.date).toUpperCase()}</div>
            <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, lineHeight: 1.05 }}>{active.title} · {active.subtitle}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FD, fontSize: 34, fontWeight: 700, color: C.blueHi, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmtDur(elapsed)}</div>
            <div style={{ fontFamily: FD, letterSpacing: "0.14em", fontSize: 10, color: C.mut }}>{doneCount}/{totalCount} SÉRIES</div>
          </div>
        </div>
        <div style={{ height: 4, background: C.line, borderRadius: 4, marginTop: 8, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${totalCount ? (doneCount / totalCount) * 100 : 0}%`, background: `linear-gradient(90deg,${C.blue},${C.blueHi})`, transition: "width .25s" }} />
        </div>
      </div>

      <div className="px-4 pt-4">
        {active.exercises.map((ex, ei) => (
          <ExerciseCard key={ei} ex={ex} ei={ei} setField={setField} toggle={toggle} addSet={addSet}
            rest={active.rest && active.rest.ei === ei ? { left: restLeft, total: active.rest.total } : null}
            onSkip={skipRest} onAdd={addRest} />
        ))}

        <button onClick={toggleAdd} className="w-full mt-1 mb-2" style={btnGhost()}>
          <Plus /> <span style={{ marginLeft: 6 }}>{active.addOpen ? "Fermer le sélecteur" : "Ajouter un exercice"}</span>
        </button>

        {/* Retour au calme */}
        <div className="mt-3" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
          <div style={{ fontFamily: FD, letterSpacing: "0.18em", fontSize: 12, color: C.green }}>RETOUR AU CALME · ÉTIREMENTS</div>
          <div className="mt-2 flex flex-col gap-1.5">
            {active.cooldown.map((c, i) => (
              <button key={i} onClick={() => toggleCool(i)} className="w-full text-left" style={{ display: "flex", alignItems: "center", gap: 10, background: c.done ? C.greenBg : "transparent", border: `1px solid ${c.done ? C.greenLine : C.line}`, borderRadius: 10, padding: "9px 10px" }}>
                <CheckBox on={c.done} /><span style={{ fontSize: 13.5, color: c.done ? C.green : C.text, textDecoration: c.done ? "line-through" : "none" }}>{c.text}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4 mb-3">
          <button onClick={onCancel} style={{ ...btnDanger(), gridColumn: "span 1" }}>Annuler</button>
          <button onClick={onFinish} style={{ ...btnPrimary(), gridColumn: "span 2" }}>Terminer la séance</button>
        </div>
      </div>

      {/* Sélecteur d'exercice — en bas d'écran (inline) */}
      {active.addOpen && (
        <div style={{ position: "sticky", bottom: 0, zIndex: 30 }}>
          <div style={{ background: C.cardHi, borderTop: `1px solid ${C.line2}`, borderTopLeftRadius: 18, borderTopRightRadius: 18, boxShadow: "0 -18px 40px rgba(0,0,0,0.55)", padding: "12px 14px 16px" }}>
            <div style={{ width: 40, height: 4, background: C.line2, borderRadius: 4, margin: "0 auto 10px" }} />
            <div style={{ fontFamily: FD, letterSpacing: "0.18em", fontSize: 12, color: C.blueHi, marginBottom: 8 }}>AJOUTER UN EXERCICE</div>
            <div style={{ maxHeight: 230, overflowY: "auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {EXTRA_EXERCISES.map((ex, i) => (
                <button key={i} onClick={() => addExercise(ex)} className="text-left" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 10px" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2 }}>{ex.n}</div>
                  <div style={{ color: C.mut, fontSize: 11, marginTop: 2 }}>{ex.m} · repos {restLabel(ex.rest)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExerciseCard({ ex, ei, setField, toggle, addSet, rest, onSkip, onAdd }) {
  const GRID = "26px 1fr 62px 54px 40px";
  return (
    <div className="mb-3" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 12 }}>
      <div className="flex items-center justify-between">
        <div style={{ fontFamily: FD, fontSize: 19, fontWeight: 600, lineHeight: 1.1, flex: 1, minWidth: 0, paddingRight: 8 }}>{ex.name}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <RestChip s={ex.rest} />
          <MuscleChip m={ex.muscle} />
        </div>
      </div>

      {/* Minuteur de repos actif */}
      {rest && rest.left > 0 && (
        <div style={{ marginTop: 10, background: "rgba(255,138,61,0.10)", border: `1px solid rgba(255,138,61,0.4)`, borderRadius: 10, padding: "8px 10px" }}>
          <div className="flex items-center justify-between">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <RestIcon />
              <span style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: C.orange, fontVariantNumeric: "tabular-nums" }}>{fmtDur(rest.left)}</span>
              <span style={{ fontFamily: FD, letterSpacing: "0.12em", fontSize: 10, color: C.mut }}>REPOS</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onAdd(30)} style={pillBtn()}>+30 s</button>
              <button onClick={onSkip} style={pillBtn()}>Passer</button>
            </div>
          </div>
          <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4, marginTop: 7, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(rest.left / rest.total) * 100}%`, background: C.orange, borderRadius: 4, transition: "width 1s linear" }} />
          </div>
        </div>
      )}

      {/* En-têtes */}
      <div style={{ display: "grid", gridTemplateColumns: GRID, gap: 6, marginTop: 10, padding: "0 2px" }}>
        {["SET", "PRÉC.", "POIDS", "REPS", "✓"].map((h, i) => (
          <div key={i} style={{ fontFamily: FD, letterSpacing: "0.12em", fontSize: 10, color: C.mut2, textAlign: i >= 2 ? "center" : "left" }}>{h}</div>
        ))}
      </div>
      {ex.sets.map((st, si) => (
        <div key={si} style={{ display: "grid", gridTemplateColumns: GRID, gap: 6, alignItems: "center", marginTop: 6, background: st.done ? C.greenBg : "transparent", border: `1px solid ${st.done ? C.greenLine : "transparent"}`, borderRadius: 10, padding: "4px 2px" }}>
          <div style={{ fontFamily: FD, fontWeight: 600, fontSize: 15, textAlign: "center", color: st.done ? C.green : C.mut }}>{si + 1}</div>
          <div style={{ fontSize: 12, color: C.mut2, fontFamily: FD }}>{si === 0 ? ex.prevLabel : "—"}</div>
          <NumInput value={st.weight} onChange={(v) => setField(ei, si, "weight", v)} placeholder={ex.iso ? "gilet" : "kg"} done={st.done} />
          <NumInput value={st.reps} onChange={(v) => setField(ei, si, "reps", v)} placeholder={ex.iso ? "sec" : "rep"} done={st.done} />
          <div style={{ display: "grid", placeItems: "center" }}><button onClick={() => toggle(ei, si)}><CheckBox on={st.done} /></button></div>
        </div>
      ))}
      <button onClick={() => addSet(ei)} className="mt-2" style={{ fontFamily: FD, letterSpacing: "0.08em", fontSize: 12.5, color: C.blueHi, background: "transparent", border: `1px dashed ${C.line2}`, borderRadius: 9, padding: "7px 10px", width: "100%" }}>+ AJOUTER UNE SÉRIE</button>
    </div>
  );
}

function NumInput({ value, onChange, placeholder, done }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" placeholder={placeholder}
      style={{ width: "100%", textAlign: "center", background: done ? "rgba(34,208,122,0.10)" : C.bg2, border: `1px solid ${done ? C.greenLine : C.line2}`, borderRadius: 8, color: C.text, fontFamily: FD, fontSize: 15, fontWeight: 600, padding: "7px 2px", outline: "none" }} />
  );
}

/* ============================= HISTORIQUE ============================== */
function History({ history }) {
  const rows = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));
  return (
    <div className="px-4 pt-5">
      <ScreenHead title="Historique" sub={`${history.length} séances enregistrées`} />
      {rows.length === 0 && <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 18, color: C.mut, fontSize: 13.5 }}>Aucune séance enregistrée pour l'instant. Termine une séance pour la voir apparaître ici.</div>}
      <div className="flex flex-col gap-3">
        {rows.map((s) => {
          const exNames = [...new Set(s.sets.map((x) => x.ex))];
          const prSet = new Set(s.prExercises || []);
          return (
            <div key={s.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
              <div className="flex items-start justify-between">
                <div><div style={{ fontFamily: FD, fontSize: 20, fontWeight: 600, lineHeight: 1.05 }}>{s.title} · {s.subtitle}</div><div style={{ color: C.mut, fontSize: 12.5, marginTop: 2 }}>{fmtDate(s.date)}</div></div>
                {prSet.size > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, background: C.goldBg, border: `1px solid rgba(255,180,61,0.4)`, borderRadius: 999, padding: "3px 9px" }}>
                    <Trophy small /> <span style={{ fontFamily: FD, fontSize: 12, color: C.gold, fontWeight: 600 }}>{prSet.size} PR</span>
                  </div>
                )}
              </div>
              <div className="flex gap-4 mt-2.5">
                <Metric k="DURÉE" v={fmtDurShort(s.durationSec)} />
                <Metric k="SÉRIES" v={String(s.sets.length)} />
                <Metric k="TONNAGE" v={`${fmtNum(Math.round(s.sets.reduce((a, b) => a + b.weight * b.reps, 0)))} kg`} />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {exNames.map((n, i) => (
                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: prSet.has(n) ? C.goldBg : C.bg2, border: `1px solid ${prSet.has(n) ? "rgba(255,180,61,0.35)" : C.line}`, borderRadius: 8, padding: "3px 8px", fontSize: 12, color: prSet.has(n) ? C.gold : C.mut }}>
                    {prSet.has(n) && <Trophy small />}{n}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================= PROGRESSION ============================= */
function Progress({ history, weekSessions, seriesFor, prFor }) {
  const source = weekSessions.length ? weekSessions : history.slice(-3);
  const vol = {}; source.forEach((s) => Object.entries(s.volumeByMuscle || {}).forEach(([m, v]) => { vol[m] = (vol[m] || 0) + v; }));
  const volRows = MUSCLES.map((m) => ({ m, v: Math.round(vol[m] || 0) })).filter((r) => r.v > 0).sort((a, b) => b.v - a.v);
  const maxVol = Math.max(1, ...volRows.map((r) => r.v));
  const allEx = [...new Set(history.flatMap((s) => s.sets.map((x) => x.ex)))];
  const cards = allEx.map((n) => ({ n, muscle: (history.flatMap((s) => s.sets).find((x) => x.ex === n) || {}).muscle, series: seriesFor(n), pr: prFor(n) })).filter((c) => c.series.length >= 2).sort((a, b) => b.pr - a.pr);

  return (
    <div className="px-4 pt-5">
      <ScreenHead title="Progression" sub="Volume & tendances de charge" />
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
        <div className="flex items-center justify-between">
          <div style={{ fontFamily: FD, letterSpacing: "0.16em", fontSize: 12, color: C.blueHi }}>VOLUME PAR GROUPE MUSCULAIRE</div>
          <div style={{ fontFamily: FD, fontSize: 11, color: C.mut }}>{weekSessions.length ? "CETTE SEMAINE" : "DERNIÈRES SÉANCES"}</div>
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          {volRows.map((r) => (
            <div key={r.m}>
              <div className="flex items-center justify-between" style={{ marginBottom: 3 }}>
                <span style={{ fontFamily: FD, fontSize: 14, letterSpacing: "0.04em" }}>{r.m}</span>
                <span style={{ fontFamily: FD, fontSize: 13, color: C.mut }}>{fmtNum(r.v)} <span style={{ fontSize: 10 }}>kg·rép</span></span>
              </div>
              <div style={{ height: 12, background: C.bg2, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
                <div style={{ height: "100%", width: `${(r.v / maxVol) * 100}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.blueHi})`, borderRadius: 6, boxShadow: `0 0 12px ${C.blueGlow}` }} />
              </div>
            </div>
          ))}
          {volRows.length === 0 && <div style={{ color: C.mut, fontSize: 13 }}>Aucune séance récente à agréger.</div>}
        </div>
      </div>

      <SectionTitle>Tendance de charge par exercice</SectionTitle>
      <div className="grid grid-cols-1 gap-3 pb-2">
        {cards.map((c) => {
          const first = c.series[0].weight; const delta = r05(c.pr - first);
          return (
            <div key={c.n} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
              <div className="flex items-start justify-between">
                <div style={{ maxWidth: "58%" }}><div style={{ fontFamily: FD, fontSize: 17, fontWeight: 600, lineHeight: 1.1 }}>{c.n}</div><div className="mt-1"><MuscleChip m={c.muscle} /></div></div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}><Trophy small /> <span style={{ fontFamily: FD, letterSpacing: "0.14em", fontSize: 10, color: C.gold }}>RECORD</span></div>
                  <div style={{ fontFamily: FD, fontSize: 30, fontWeight: 700, color: C.gold, lineHeight: 1 }}>{fmtNum(c.pr)}<span style={{ fontSize: 14, color: C.mut }}> kg</span></div>
                </div>
              </div>
              <div className="mt-2"><Sparkline series={c.series} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: 11.5, color: C.mut }}>{c.series.length} séances</span>
                <span style={{ fontFamily: FD, fontSize: 12.5, color: delta >= 0 ? C.green : C.red }}>{delta >= 0 ? "▲ +" : "▼ "}{fmtNum(delta)} kg</span>
              </div>
            </div>
          );
        })}
        {cards.length === 0 && <div style={{ color: C.mut, fontSize: 13 }}>Enregistre au moins deux séances d'un même exercice pour voir sa tendance.</div>}
      </div>
    </div>
  );
}

function Sparkline({ series }) {
  const W = 300, H = 46, pad = 4;
  const ws = series.map((p) => p.weight); const min = Math.min(...ws), max = Math.max(...ws); const span = max - min || 1; const n = series.length;
  const x = (i) => pad + (i / (n - 1)) * (W - pad * 2); const y = (w) => H - pad - ((w - min) / span) * (H - pad * 2);
  const pts = series.map((p, i) => `${x(i)},${y(p.weight)}`).join(" ");
  const area = `${pad},${H - pad} ${pts} ${W - pad},${H - pad}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs><linearGradient id="spark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.blue} stopOpacity="0.35" /><stop offset="100%" stopColor={C.blue} stopOpacity="0" /></linearGradient></defs>
      <polygon points={area} fill="url(#spark)" />
      <polyline points={pts} fill="none" stroke={C.blueHi} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {series.map((p, i) => (<circle key={i} cx={x(i)} cy={y(p.weight)} r={i === n - 1 ? 3.6 : 2} fill={i === n - 1 ? C.gold : C.blueHi} />))}
    </svg>
  );
}

/* ============================= PROGRAMME =============================== */
/* ---- Recompose une séance vélo dehors selon la durée choisie ---- */
function outdoorSteps(b, mins) {
  if (b.id === "b3") {
    const bosses = Math.min(5, Math.max(2, Math.round(mins / 60)));
    return [
      { t: fmtHM(mins), w: "195–220 W · Z2", d: "Endurance continue, cadence souple" },
      { t: `${bosses} bosses`, w: "240–290 W · Z3–Z4", d: "Réparties sur le parcours, en tempo/seuil" },
      { t: "sur > 2 h", w: "60–90 g glucides/h", d: "Ravitaillement régulier" },
    ];
  }
  const wu = 15, cd = 10;
  const core = b.id === "b1"
    ? { t: "3 × 10 min", w: "285–300 W · RPE 7–8", d: "Bosse régulière ; récup 5 min en descente", used: 40 }
    : { t: "5 × 3 min", w: "à bloc maîtrisé · RPE 9", d: "Bosse de 3–5 min ; récup 3 min en descente", used: 27 };
  const filler = Math.max(0, mins - wu - cd - core.used);
  const steps = [
    { t: `${wu} min`, w: "échauffement", d: "Montée progressive + accélérations" },
    { t: core.t, w: core.w, d: core.d },
  ];
  if (filler >= 10) steps.push({ t: fmtHM(filler), w: "195–220 W · Z2", d: "Endurance pour compléter la sortie" });
  steps.push({ t: `${cd} min`, w: "roue libre", d: "Retour au calme" });
  return steps;
}

function WeekBoard({ getDay, isDone, moving, setMoving, onMove, onReset }) {
  const movingLabel = moving ? (ALL_SESSIONS.find((s) => s.id === moving)?.label || "") : "";
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 8 }}>
      {moving && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(47,123,255,0.12)", border: `1px solid rgba(47,123,255,0.4)`, borderRadius: 10, padding: "8px 10px", marginBottom: 6 }}>
          <span style={{ fontSize: 12.5, color: C.blueHi }}>Déplacer « {movingLabel} » → touche un jour</span>
          <button onClick={() => setMoving(null)} style={{ fontFamily: FD, fontSize: 12, color: C.mut }}>Annuler</button>
        </div>
      )}
      {DAY_LABELS.map((d, di) => {
        const items = ALL_SESSIONS.filter((s) => getDay(s.id) === di);
        return (
          <div key={d} onClick={() => moving && onMove(moving, di)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, borderBottom: di < 6 ? `1px solid ${C.line}` : "none", borderRadius: 8, background: moving ? "rgba(47,123,255,0.06)" : "transparent", cursor: moving ? "pointer" : "default" }}>
            <div style={{ fontFamily: FD, fontSize: 13, letterSpacing: "0.08em", color: C.mut, width: 32 }}>{d.toUpperCase()}</div>
            <div className="flex flex-wrap gap-1.5" style={{ flex: 1 }}>
              {items.length === 0 && <span style={{ color: C.mut2, fontSize: 12 }}>repos</span>}
              {items.map((s) => {
                const col = s.kind === "velo" ? C.orange : s.kind === "cap" ? C.green : C.blueHi;
                const sel = moving === s.id, dn = isDone(s.id);
                return (
                  <button key={s.id} onClick={(e) => { e.stopPropagation(); setMoving(sel ? null : s.id); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, background: sel ? col : "rgba(255,255,255,0.04)", borderRadius: 7, padding: "3px 8px", border: `1px solid ${sel ? col : C.line2}`, opacity: dn ? 0.6 : 1 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 6, background: sel ? "#fff" : col }} />
                    <span style={{ color: sel ? "#fff" : dn ? C.mut2 : C.text, textDecoration: dn ? "line-through" : "none" }}>{s.short}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <button onClick={onReset} className="w-full" style={{ fontFamily: FD, letterSpacing: "0.06em", fontSize: 12, color: C.mut, padding: "9px 0 4px" }}>RÉINITIALISER LA SEMAINE</button>
    </div>
  );
}

function DurChips({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
      {options.map((m) => {
        const on = value === m;
        return (
          <button key={m} onClick={() => onChange(m)} style={{ fontFamily: FD, fontSize: 13, padding: "6px 12px", borderRadius: 8, color: on ? "#fff" : C.mut, background: on ? C.orange : C.bg2, border: `1px solid ${on ? C.orange : C.line2}` }}>{fmtHM(m)}</button>
        );
      })}
    </div>
  );
}

function DayBadge({ day }) { return <span style={{ fontFamily: FD, letterSpacing: "0.08em", fontSize: 10, color: C.mut, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 6, padding: "2px 6px" }}>{day.toUpperCase()}</span>; }

function Programme({ weekPlan, onSetMode, onSetHours, onToggleDone, onSetDay, onResetDays, onStart }) {
  const [open, setOpen] = useState({ b1: true });
  const [moving, setMoving] = useState(null);
  const tog = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const getDay = (id) => (weekPlan[id]?.day != null ? weekPlan[id].day : DEFAULT_DAYS[id]);
  const isDone = (id) => !!weekPlan[id]?.done;
  const move = (id, day) => { onSetDay(id, day); setMoving(null); };
  return (
    <div className="px-4 pt-5">
      <ScreenHead title="Programme" sub={`Semaine · ${BLOCK.phase}`} />

      {/* Bandeau bloc */}
      <div style={{ background: `linear-gradient(180deg, ${C.cardHi}, ${C.card})`, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.blue}, transparent)` }} />
        <div style={{ fontFamily: FD, letterSpacing: "0.2em", fontSize: 11, color: C.blueHi }}>BLOC EN COURS</div>
        <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, lineHeight: 1.05 }}>{BLOCK.name}</div>
        <div style={{ color: C.mut, fontSize: 12.5, marginTop: 4, lineHeight: 1.45 }}>{BLOCK.note}</div>
        <div className="flex gap-2 mt-3">
          <CountChip n={BLOCK.counts.velo} l="VÉLO" c={C.orange} />
          <CountChip n={BLOCK.counts.cap} l="COURSE" c={C.green} />
          <CountChip n={BLOCK.counts.muscu} l="MUSCU" c={C.blueHi} />
        </div>
      </div>

      {/* Planning déplaçable */}
      <SectionTitle>Ma semaine · déplace les séances</SectionTitle>
      <WeekBoard getDay={getDay} isDone={isDone} moving={moving} setMoving={setMoving} onMove={move} onReset={onResetDays} />
      <div style={{ color: C.mut2, fontSize: 11.5, marginTop: 6, lineHeight: 1.4 }}>
        Touche une séance puis un jour pour la déplacer. Dense mais modulable : si la fatigue monte, allège la course d'abord (le vélo reste prioritaire dans ce bloc).
      </div>

      {/* VÉLO */}
      <SectionTitle>Vélo · développement FTP</SectionTitle>
      <ZonesRef />
      {BIKE.map((b) => (
        <BikeCard key={b.id} b={b} mode={weekPlan[b.id]?.mode || b.defaultMode} done={isDone(b.id)} day={DAY_LABELS[getDay(b.id)]}
          hours={weekPlan[b.id]?.hours || bikeDurDefault(b.id)}
          onSetMode={(m) => onSetMode(b.id, m)} onSetHours={(h) => onSetHours(b.id, h)} onToggleDone={() => onToggleDone(b.id)}
          open={!!open[b.id]} onToggle={() => tog(b.id)} />
      ))}

      {/* COURSE */}
      <SectionTitle>Course à pied · allures cibles</SectionTitle>
      <PacesRef />
      {RUN.map((r) => (
        <RunCard key={r.id} r={r} done={isDone(r.id)} day={DAY_LABELS[getDay(r.id)]} onToggleDone={() => onToggleDone(r.id)} open={!!open[r.id]} onToggle={() => tog(r.id)} />
      ))}

      {/* MUSCU */}
      <SectionTitle>Musculation</SectionTitle>
      <div className="flex flex-col gap-3 pb-2">
        {DAYS.map((d) => (
          <button key={d.id} onClick={() => onStart(d)} className="w-full text-left" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "11px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: C.blue }} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontFamily: FD, fontSize: 18, fontWeight: 600, lineHeight: 1.05 }}>{d.title} · {d.subtitle}</div>
                <DayBadge day={DAY_LABELS[getDay(d.id)]} />
              </div>
              <div style={{ color: C.mut2, fontSize: 12 }}>{d.focus}</div>
            </div>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: C.blue, display: "grid", placeItems: "center" }}><Play /></div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BikeCard({ b, mode, done, day, hours, onSetMode, onSetHours, onToggleDone, open, onToggle }) {
  const out = mode === "out";
  const steps = out ? outdoorSteps(b, hours) : b.ht;
  const durText = out ? fmtHM(hours) : b.dur;
  const durOptions = b.tag === "LONGUE" ? BIKE_DUR.long : BIKE_DUR.specific;
  return (
    <div className="mb-3" style={{ background: C.card, border: `1px solid ${done ? C.greenLine : C.line}`, borderRadius: 14, padding: 13, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: C.orange }} />
      <div className="flex items-start justify-between">
        <div style={{ paddingLeft: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 600, lineHeight: 1 }}>{b.name}</div>
            <TagChip t={b.tag} c={C.orange} />
            <DayBadge day={day} />
          </div>
          <div style={{ color: C.mut, fontSize: 12.5, marginTop: 3 }}>{b.goal} · {durText}</div>
        </div>
        <button onClick={onToggleDone}><CheckBox on={done} /></button>
      </div>

      {/* Segmenté HT / dehors */}
      <div style={{ display: "flex", gap: 4, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 10, padding: 3, marginTop: 10 }}>
        <SegBtn active={!out} onClick={() => onSetMode("ht")} label="Home trainer" />
        <SegBtn active={out} onClick={() => onSetMode("out")} label="Dehors" />
      </div>

      {/* Durée réglable en extérieur */}
      {out && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: FD, letterSpacing: "0.14em", fontSize: 10, color: C.orange }}>DURÉE VISÉE DEHORS</div>
          <DurChips options={durOptions} value={hours} onChange={onSetHours} />
        </div>
      )}

      <button onClick={onToggle} className="w-full" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10, color: C.blueHi, fontFamily: FD, letterSpacing: "0.06em", fontSize: 13 }}>
        <span>{open ? "MASQUER LA SÉANCE" : "VOIR LA SÉANCE"}</span><Chevron open={open} />
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2">
          {steps.map((s, i) => <StepRow key={i} time={s.t} target={s.w} desc={s.d} color={C.orange} />)}
          {!out && b.variant && <div style={{ color: C.mut2, fontSize: 11.5, fontStyle: "italic", marginTop: 2 }}>{b.variant}</div>}
        </div>
      )}
    </div>
  );
}

function RunCard({ r, done, day, onToggleDone, open, onToggle }) {
  return (
    <div className="mb-3" style={{ background: C.card, border: `1px solid ${done ? C.greenLine : C.line}`, borderRadius: 14, padding: 13, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: C.green }} />
      <div className="flex items-start justify-between">
        <div style={{ paddingLeft: 4, flex: 1, minWidth: 0, paddingRight: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 600, lineHeight: 1.05 }}>{r.name}</div>
            <TagChip t={r.tag} c={C.green} />
            <DayBadge day={day} />
          </div>
          <div style={{ color: C.mut, fontSize: 12.5, marginTop: 3 }}>{r.goal} · {r.dur}</div>
        </div>
        <button onClick={onToggleDone}><CheckBox on={done} /></button>
      </div>
      <button onClick={onToggle} className="w-full" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, color: C.blueHi, fontFamily: FD, letterSpacing: "0.06em", fontSize: 13 }}>
        <span>{open ? "MASQUER LA SÉANCE" : "VOIR LA SÉANCE"}</span><Chevron open={open} />
      </button>
      {open && <div className="mt-2 flex flex-col gap-2">{r.steps.map((s, i) => <StepRow key={i} time={s.t} target={s.p} desc={s.d} color={C.green} />)}</div>}
    </div>
  );
}

function StepRow({ time, target, desc, color }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "78px 1fr", gap: 10, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 10px" }}>
      <div style={{ fontFamily: FD, fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.15 }}>{time}</div>
      <div>
        <div style={{ fontFamily: FD, fontSize: 14.5, fontWeight: 600, color, lineHeight: 1.1 }}>{target}</div>
        <div style={{ color: C.mut, fontSize: 12, marginTop: 2, lineHeight: 1.35 }}>{desc}</div>
      </div>
    </div>
  );
}

function SegBtn({ active, onClick, label }) {
  return <button onClick={onClick} style={{ flex: 1, fontFamily: FD, letterSpacing: "0.04em", fontSize: 13, padding: "7px 0", borderRadius: 8, color: active ? "#fff" : C.mut, background: active ? C.orange : "transparent", boxShadow: active ? `0 4px 12px rgba(255,138,61,0.3)` : "none" }}>{label}</button>;
}
function ZonesRef() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, marginBottom: 12 }}>
      {ZONES_W.map((z) => (
        <div key={z.z} style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 9, padding: "6px 8px" }}>
          <div style={{ fontFamily: FD, fontSize: 12, fontWeight: 600, color: C.orange }}>{z.z} <span style={{ color: C.mut, fontWeight: 400 }}>{z.l}</span></div>
          <div style={{ fontFamily: FD, fontSize: 13, color: C.text }}>{z.r}</div>
        </div>
      ))}
    </div>
  );
}
function PacesRef() {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 6, marginBottom: 12 }}>
      {PACES.map((p, i) => (
        <div key={p.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 8px", borderBottom: i < PACES.length - 1 ? `1px solid ${C.line}` : "none" }}>
          <div style={{ minWidth: 0, paddingRight: 8 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{p.k}</div><div style={{ color: C.mut2, fontSize: 11.5 }}>{p.n}</div></div>
          <div style={{ fontFamily: FD, fontSize: 16, fontWeight: 600, color: C.green, whiteSpace: "nowrap" }}>{p.v}</div>
        </div>
      ))}
    </div>
  );
}
function CountChip({ n, l, c }) {
  return <div style={{ display: "flex", alignItems: "baseline", gap: 5, background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 9, padding: "5px 10px" }}><span style={{ fontFamily: FD, fontSize: 18, fontWeight: 700, color: c }}>{n}</span><span style={{ fontFamily: FD, fontSize: 10, letterSpacing: "0.12em", color: C.mut }}>{l}</span></div>;
}
function TagChip({ t, c }) { return <span style={{ fontFamily: FD, letterSpacing: "0.1em", fontSize: 9.5, color: c, background: "rgba(255,255,255,0.05)", border: `1px solid ${C.line2}`, borderRadius: 6, padding: "2px 6px" }}>{t}</span>; }
function Chevron({ open }) { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}><path d="M6 9l6 6 6-6" stroke={C.blueHi} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>; }

/* ============================ FORME & FATIGUE ========================= */
function tsbInfo(tsb) {
  if (tsb >= 15) return { label: "Très frais · pointe (désentraînement si prolongé)", color: C.blueHi };
  if (tsb >= 5) return { label: "Frais · prêt à performer", color: C.green };
  if (tsb >= -10) return { label: "Équilibré", color: C.blueHi };
  if (tsb >= -30) return { label: "En charge · zone productive", color: C.orange };
  return { label: "Fatigue marquée · vigilance", color: C.red };
}
function acwrInfo(r) {
  if (r < 0.8) return { label: "Charge faible · décharge", color: C.blueHi };
  if (r <= 1.3) return { label: "Optimal · zone la plus sûre", color: C.green };
  if (r <= 1.5) return { label: "Élevé · prudence", color: C.orange };
  return { label: "Risque de blessure accru", color: C.red };
}

function Fitness({ pmc, live }) {
  const s = pmc && pmc.series ? pmc.series : [];
  const cur = pmc && pmc.current ? pmc.current : null;
  return (
    <div className="px-4 pt-5">
      <ScreenHead title="FORME & FATIGUE" sub={`Modèle de charge · ${live ? "données Strava en direct" : "démo · tes données réelles"}`} />
      {!cur ? (
        <div style={{ color: C.mut, fontSize: 13 }}>Pas encore assez de données d'activité pour établir la forme.</div>
      ) : (
        <>
          <FitStateCards cur={cur} acwr={pmc.acwr} />
          <SectionTitle>Courbe de charge</SectionTitle>
          <PMCChart series={s} />
          <SectionTitle>Ratio charge aiguë / chronique</SectionTitle>
          <AcwrBar acwr={pmc.acwr} acute={pmc.acute} chronic={pmc.chronic} />
          <SectionTitle>Charge par semaine</SectionTitle>
          <WeeklyLoad series={s} />
          <FitCaveats />
        </>
      )}
    </div>
  );
}

function FitStateCards({ cur, acwr }) {
  const tsb = tsbInfo(cur.tsb);
  const ac = acwrInfo(acwr);
  const cards = [
    { k: "FORME", sub: "CTL · 42 j", val: Math.round(cur.ctl), tone: C.blueHi, note: "capacité de fond installée" },
    { k: "FATIGUE", sub: "ATL · 7 j", val: Math.round(cur.atl), tone: C.orange, note: "charge récente accumulée" },
    { k: "FRAÎCHEUR", sub: "TSB · forme − fatigue", val: (cur.tsb > 0 ? "+" : "") + Math.round(cur.tsb), tone: tsb.color, note: tsb.label },
    { k: "ACWR", sub: "aiguë / chronique", val: acwr.toFixed(2), tone: ac.color, note: ac.label },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      {cards.map((c) => (
        <div key={c.k} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 13, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: c.tone }} />
          <div style={{ fontFamily: FD, letterSpacing: "0.14em", fontSize: 11, color: C.mut }}>{c.k}</div>
          <div style={{ fontFamily: FD, fontSize: 34, fontWeight: 700, lineHeight: 1.05, color: c.tone }}>{c.val}</div>
          <div style={{ fontFamily: FD, letterSpacing: "0.06em", fontSize: 10, color: C.mut2 }}>{c.sub}</div>
          <div style={{ fontSize: 11, color: C.mut, marginTop: 5, lineHeight: 1.25 }}>{c.note}</div>
        </div>
      ))}
    </div>
  );
}

function PMCChart({ series }) {
  if (series.length < 2) return <div style={{ color: C.mut2, fontSize: 12 }}>Pas assez d'historique.</div>;
  const W = 460, padL = 8, padR = 8, top = 12, mainH = 150, gap = 16, tsbH = 46;
  const plotW = W - padL - padR, n = series.length;
  const bottom = top + mainH, tsbTop = bottom + gap, tsbMid = tsbTop + tsbH / 2, tsbBot = tsbTop + tsbH;
  const H = tsbBot + 26;
  const maxV = Math.max(10, ...series.map((p) => Math.max(p.ctl, p.atl))) * 1.08;
  const maxTsb = Math.max(20, ...series.map((p) => Math.abs(p.tsb)));
  const x = (i) => padL + (i / (n - 1)) * plotW;
  const y = (v) => top + (1 - v / maxV) * mainH;
  const ctlLine = series.map((p, i) => `${x(i).toFixed(1)},${y(p.ctl).toFixed(1)}`).join(" ");
  const atlLine = series.map((p, i) => `${x(i).toFixed(1)},${y(p.atl).toFixed(1)}`).join(" ");
  const ctlArea = `${padL},${bottom} ${ctlLine} ${(padL + plotW)},${bottom}`;
  // repères de mois
  const ticks = [];
  let lastM = -1;
  series.forEach((p, i) => { const m = +p.date.slice(5, 7); if (m !== lastM) { ticks.push({ i, label: MON[m - 1] }); lastM = m; } });
  const last = series[n - 1];
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "12px 10px 8px" }}>
      <div style={{ display: "flex", gap: 16, marginBottom: 6, paddingLeft: 4 }}>
        <Legend color={C.blue} text="Forme (CTL)" fill />
        <Legend color={C.orange} text="Fatigue (ATL)" />
        <Legend color={C.green} text="Fraîcheur (TSB)" square />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={padL} y1={top + f * mainH} x2={padL + plotW} y2={top + f * mainH} stroke={C.line} strokeWidth="1" />)}
        <polygon points={ctlArea} fill={C.blueGlow} />
        <polyline points={ctlLine} fill="none" stroke={C.blue} strokeWidth="2" strokeLinejoin="round" />
        <polyline points={atlLine} fill="none" stroke={C.orange} strokeWidth="1.6" strokeLinejoin="round" opacity="0.95" />
        <circle cx={x(n - 1)} cy={y(last.ctl)} r="3.2" fill={C.blueHi} />
        <circle cx={x(n - 1)} cy={y(last.atl)} r="3" fill={C.orange} />
        {/* échelle Y (0 et max) */}
        <text x={padL + 2} y={top + 9} fontSize="9" fill={C.mut2} fontFamily={FD}>{Math.round(maxV)}</text>
        <text x={padL + 2} y={bottom - 2} fontSize="9" fill={C.mut2} fontFamily={FD}>0</text>
        {/* bande TSB */}
        <line x1={padL} y1={tsbMid} x2={padL + plotW} y2={tsbMid} stroke={C.line2} strokeWidth="1" />
        {series.map((p, i) => {
          const h = (Math.abs(p.tsb) / maxTsb) * (tsbH / 2 - 2);
          const up = p.tsb >= 0;
          return <rect key={i} x={x(i) - 1} y={up ? tsbMid - h : tsbMid} width="2" height={Math.max(0.5, h)} fill={up ? C.green : C.red} opacity="0.85" />;
        })}
        <text x={padL + 2} y={tsbTop + 9} fontSize="9" fill={C.mut2} fontFamily={FD}>TSB</text>
        {/* repères mois */}
        {ticks.map((t) => (<g key={t.i}><line x1={x(t.i)} y1={tsbBot} x2={x(t.i)} y2={tsbBot + 4} stroke={C.mut2} strokeWidth="1" /><text x={x(t.i)} y={tsbBot + 16} fontSize="9.5" fill={C.mut} fontFamily={FD} textAnchor="middle">{t.label}</text></g>))}
      </svg>
    </div>
  );
}
function Legend({ color, text, fill, square }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      {square ? <span style={{ width: 9, height: 9, background: color, borderRadius: 2, display: "inline-block" }} /> : <span style={{ width: 14, height: 3, background: color, borderRadius: 3, display: "inline-block", opacity: fill ? 1 : 0.95 }} />}
      <span style={{ fontFamily: FD, fontSize: 11, letterSpacing: "0.03em", color: C.mut }}>{text}</span>
    </span>
  );
}

function AcwrBar({ acwr, acute, chronic }) {
  const info = acwrInfo(acwr);
  const scaleMax = 2;
  const pct = (v) => Math.min(100, (v / scaleMax) * 100);
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
      <div style={{ position: "relative", height: 16, borderRadius: 8, overflow: "hidden", background: C.bg2 }}>
        <div style={{ position: "absolute", left: 0, width: `${pct(0.8)}%`, top: 0, bottom: 0, background: "rgba(95,163,255,0.25)" }} />
        <div style={{ position: "absolute", left: `${pct(0.8)}%`, width: `${pct(1.3) - pct(0.8)}%`, top: 0, bottom: 0, background: C.greenBg }} />
        <div style={{ position: "absolute", left: `${pct(1.3)}%`, width: `${pct(1.5) - pct(1.3)}%`, top: 0, bottom: 0, background: "rgba(255,138,61,0.22)" }} />
        <div style={{ position: "absolute", left: `${pct(1.5)}%`, right: 0, top: 0, bottom: 0, background: "rgba(255,94,108,0.20)" }} />
        <div style={{ position: "absolute", left: `calc(${pct(acwr)}% - 1.5px)`, top: -2, bottom: -2, width: 3, background: C.text, boxShadow: "0 0 6px rgba(0,0,0,0.6)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: FD, fontSize: 10, color: C.mut2, marginTop: 4 }}>
        <span>0</span><span>0,8</span><span>1,3</span><span>1,5</span><span>2,0</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 }}>
        <span style={{ fontFamily: FD, fontSize: 26, fontWeight: 700, color: info.color }}>{acwr.toFixed(2)}</span>
        <span style={{ fontSize: 12, color: info.color, fontFamily: FD, letterSpacing: "0.04em" }}>{info.label}</span>
      </div>
      <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>Charge 7 j : {Math.round(acute)} / jour · charge 28 j : {Math.round(chronic)} / jour. La zone 0,8–1,3 est associée au plus faible risque de blessure.</div>
    </div>
  );
}

function WeeklyLoad({ series }) {
  const weeks = {};
  for (const p of series) {
    const d = new Date(p.date + "T00:00:00");
    const dow = (d.getDay() + 6) % 7; // lundi = 0
    d.setDate(d.getDate() - dow);
    const key = d.toISOString().slice(0, 10);
    weeks[key] = (weeks[key] || 0) + p.load;
  }
  const arr = Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b)).slice(-9);
  const max = Math.max(1, ...arr.map(([, v]) => v));
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
      {arr.map(([wk, v]) => {
        const d = new Date(wk + "T00:00:00");
        const lbl = `${String(d.getDate()).padStart(2, "0")} ${MON[d.getMonth()]}`;
        return (
          <div key={wk} style={{ display: "flex", alignItems: "center", gap: 8, margin: "5px 0" }}>
            <span style={{ fontFamily: FD, fontSize: 11, color: C.mut2, width: 52, flexShrink: 0 }}>{lbl}</span>
            <div style={{ flex: 1, height: 12, background: C.bg2, borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${(v / max) * 100}%`, height: "100%", background: C.blue, borderRadius: 6 }} />
            </div>
            <span style={{ fontFamily: FD, fontSize: 12, color: C.text, width: 34, textAlign: "right", flexShrink: 0 }}>{Math.round(v)}</span>
          </div>
        );
      })}
      <div style={{ fontSize: 10.5, color: C.mut2, marginTop: 6 }}>Charge hebdomadaire cumulée (semaines du lundi). Une progression &gt; ~10 %/semaine augmente le risque de blessure.</div>
    </div>
  );
}

function FitCaveats() {
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, margin: "16px 0 8px" }}>
      <div style={{ fontFamily: FD, letterSpacing: "0.14em", fontSize: 11, color: C.gold, marginBottom: 6 }}>À LIRE — CE QUE CE MODÈLE EST ET N'EST PAS</div>
      <ul style={{ margin: 0, paddingLeft: 16, color: C.mut, fontSize: 12, lineHeight: 1.5 }}>
        <li>La charge cardio vient de la <b>Charge relative Strava</b> (basée sur ta fréquence cardiaque). Elle est cohérente entre vélo, course et cardio, mais dépend de la FC : sans capteur, un jour sera sous-évalué.</li>
        <li>La muscu compte pour <b>{STRENGTH_LOAD} points par séance</b> loguée dans l'app. C'est une <b>estimation assumée</b> : Strava n'attribue que 4–11 à la FC pour une séance de force, ce qui sous-évalue sa charge réelle. Valeur volontairement simple et ajustable.</li>
        <li>CTL/ATL/TSB suivent le modèle <b>impulse-response</b> (Banister ; PMC TrainingPeaks). Le <b>TSB positif</b> avant un objectif = affûté ; <b>négatif</b> = en charge (normal et productif en bloc dur).</li>
        <li>L'<b>ACWR</b> (Gabbett) est un <b>indicateur</b> de risque, pas une garantie : il complète tes signaux réels (genou, épaule, sommeil, RPE), il ne les remplace pas.</li>
      </ul>
    </div>
  );
}

/* ============================== NUTRITION ============================= */
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
async function downloadShoppingWord(byCat, weekLabel) {
  const cats = CAT_ORDER.filter((c) => byCat[c] && byCat[c].length);
  const title = "Liste de courses";
  try {
    const docx = await import("docx");
    const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docx;
    const children = [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: title })] }),
      new Paragraph({ children: [new TextRun({ text: `SOMMET · ${weekLabel}`, italics: true, color: "666666" })] }),
      new Paragraph({ text: "" }),
    ];
    for (const c of cats) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: CAT_LABELS[c] })] }));
      for (const it of byCat[c]) children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: `${it.n} — ${fmtQty(it.q)} ${it.u}` })] }));
      children.push(new Paragraph({ text: "" }));
    }
    const doc = new Document({ sections: [{ children }] });
    const blob = await Packer.toBlob(doc);
    saveBlob(blob, "liste-de-courses.docx");
    return "docx";
  } catch (e) {
    // Repli sans dépendance : HTML ouvrable par Word
    let html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word'><head><meta charset='utf-8'><style>body{font-family:Calibri,Arial,sans-serif}h1{font-size:20pt}h2{font-size:14pt;color:#1F4E79;margin-bottom:4px}li{margin:2px 0}</style></head><body>`;
    html += `<h1>${title}</h1><p><i>SOMMET · ${weekLabel}</i></p>`;
    for (const c of cats) { html += `<h2>${CAT_LABELS[c]}</h2><ul>`; for (const it of byCat[c]) html += `<li>${it.n} — ${fmtQty(it.q)} ${it.u}</li>`; html += `</ul>`; }
    html += `</body></html>`;
    const blob = new Blob(["\ufeff" + html], { type: "application/msword" });
    saveBlob(blob, "liste-de-courses.doc");
    return "doc";
  }
}

const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
async function downloadMenuExcel(payload) {
  try {
    const r = await fetch(API + "/api/mealplan/xlsx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error("backend");
    const blob = await r.blob();
    saveBlob(blob, (payload.filename || "menu-sommet") + ".xlsx");
    return "xlsx";
  } catch (e) {
    const blob = new Blob(["\ufeff" + buildHtmlXls(payload)], { type: "application/vnd.ms-excel" });
    saveBlob(blob, (payload.filename || "menu-sommet") + ".xls");
    return "xls";
  }
}
// Repli sans backend : classeur ouvrable par Excel (HTML), imprimable
function buildHtmlXls(p) {
  const nav = "#2E5090", wkndFill = "#FDF5E0", macroFill = "#F0F4FA";
  const th = `background:${nav};color:#fff;font-weight:bold;text-align:center;padding:4px 6px`;
  let h = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><style>table{border-collapse:collapse;font-family:Arial;font-size:9pt}td,th{border:1px solid #C8D2E0;vertical-align:top}</style></head><body>`;
  // MENU
  h += `<div style="${th};font-size:13pt;padding:8px">${escHtml(p.menuTitle)}</div>`;
  h += `<div style="background:#EEF2FA;color:#555;font-style:italic;padding:4px 6px">${escHtml(p.menuSubtitle)}</div>`;
  h += `<table><tr><td></td>`;
  p.days.forEach((d) => { h += `<td style="${th};background:${d.weekend ? "#8B6914" : "#1A3A6A"}">${escHtml(d.day)}${d.weekend ? " 🌴" : ""}</td>`; });
  h += `</tr>`;
  const macros = [["Calories", "kcal", " kcal", "#D85A30"], ["Protéines", "p", " g", "#1D9E75"], ["Lipides", "f", " g", "#BA7517"], ["Glucides", "c", " g", "#378ADD"]];
  macros.forEach(([lab, key, sfx, col]) => {
    h += `<tr><td style="background:${macroFill};color:${col};font-weight:bold;text-align:right;padding:2px 6px">${lab}</td>`;
    p.days.forEach((d) => { h += `<td style="background:${d.weekend ? wkndFill : macroFill};color:${col};font-weight:bold;text-align:center">${d.total[key === "kcal" ? "kcal" : key]}${sfx}</td>`; });
    h += `</tr>`;
  });
  const secFill = { "Petit-déjeuner": "#FEF0D8", "Déjeuner": "#DFF4EC", "Collation": "#FFF0DC", "Dîner": "#E4EEFA" };
  ["Petit-déjeuner", "Déjeuner", "Collation", "Dîner"].forEach((slot) => {
    const a = p.sectionAvg[slot];
    h += `<tr><td colspan="${p.days.length + 1}" style="background:${secFill[slot]};font-weight:bold;padding:3px 6px">${escHtml(slot.toUpperCase())}${a ? `  —  ~${a.kcal} kcal · ${a.p}g P · ${a.c}g G · ${a.f}g L` : ""}</td></tr>`;
    h += `<tr><td></td>`;
    p.days.forEach((d) => {
      const m = d.meals.find((x) => x.slot === slot);
      const body = m ? `<b>${escHtml(m.name)}</b><br>` + m.items.map(escHtml).join("<br>") : "";
      h += `<td style="background:${d.weekend ? wkndFill : "#fff"};padding:3px 5px">${body}</td>`;
    });
    h += `</tr>`;
  });
  h += `</table>`;
  // COURSES
  h += `<div style="${th};font-size:12pt;padding:8px;page-break-before:always">${escHtml(p.coursesTitle)}</div>`;
  h += `<div style="background:#EEF2FA;color:#555;font-style:italic;padding:4px 6px">${escHtml(p.coursesSubtitle)}</div>`;
  h += `<table style="width:100%">`;
  p.courses.forEach((grp) => {
    h += `<tr><td colspan="3" style="${th};text-align:left;padding:3px 6px">${escHtml(grp.label)}</td></tr>`;
    h += `<tr><td style="background:#D6E4F0;font-weight:bold">Article</td><td style="background:#D6E4F0;font-weight:bold;text-align:center">Quantité</td><td style="background:#D6E4F0;font-weight:bold">Remarque</td></tr>`;
    grp.items.forEach((it, i) => {
      const z = i % 2 ? "#F7F9FC" : "#fff";
      h += `<tr><td style="background:${z}">${escHtml(it.article)}</td><td style="background:${z};color:#1A5FA8;font-weight:bold;text-align:center">${escHtml(it.qty)}</td><td style="background:${z};color:#777;font-style:italic;font-size:8pt">${escHtml(it.remark || "")}</td></tr>`;
    });
  });
  h += `</table></body></html>`;
  return h;
}

function validatePlan(obj) {
  if (!obj || typeof obj !== "object") return "ce n'est pas un objet JSON";
  if (!obj.start || !obj.weekLabel) return "champs « start » et « weekLabel » requis";
  if (!Array.isArray(obj.days) || !obj.days.length) return "« days » doit être une liste non vide";
  for (const d of obj.days) {
    if (!d.day || !Array.isArray(d.meals)) return "chaque jour doit avoir « day » et « meals »";
    for (const m of d.meals) {
      if (!m.slot || !m.name || !Array.isArray(m.ing)) return "chaque repas doit avoir slot, name, ing";
      if (m.kcal == null || m.p == null || m.c == null || m.f == null) return "chaque repas doit avoir kcal, p, c, f";
    }
  }
  if (!obj.targets) obj.targets = MEAL_TARGETS;
  return null;
}

function Nutri({ plans, live, onSavePlan, onDeletePlan }) {
  const list = plans && plans.length ? [...plans].sort((a, b) => (b.start || "").localeCompare(a.start || "")) : [MEAL_PLAN];
  const [activeStart, setActiveStart] = useState(null);
  const [di, setDi] = useState(0);
  const [mult, setMult] = useState({});
  const [showList, setShowList] = useState(false);
  const [msg, setMsg] = useState("");
  const [showPlan, setShowPlan] = useState(false);
  const [planText, setPlanText] = useState("");
  const [planMsg, setPlanMsg] = useState("");
  const plan = list.find((p) => p.start === activeStart) || list[0];
  const targets = plan.targets || MEAL_TARGETS;
  const dIdx = Math.min(di, plan.days.length - 1);
  const day = plan.days[dIdx];
  const setMealMult = (slot, v) => setMult((m) => ({ ...m, [`${dIdx}:${slot}`]: Math.max(1, v) }));
  const getMult = (i, slot) => mult[`${i}:${slot}`] || 1;
  const tot = day.meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.p, c: a.c + m.c, f: a.f + m.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  const byCat = buildShoppingList(plan, mult);
  const nItems = CAT_ORDER.reduce((a, c) => a + (byCat[c] ? byCat[c].length : 0), 0);
  const anyMult = Object.values(mult).some((v) => v > 1);
  const stored = plans && plans.some((p) => p.start === plan.start);
  const onWord = async () => { setMsg("Génération…"); const kind = await downloadShoppingWord(byCat, plan.weekLabel); setMsg(kind === "docx" ? "Liste .docx téléchargée ✓" : "Liste Word (.doc) téléchargée ✓"); setTimeout(() => setMsg(""), 3000); };
  const onMenu = async () => { setMsg("Génération du menu…"); const kind = await downloadMenuExcel(buildMenuPayload(plan, mult)); setMsg(kind === "xlsx" ? "Menu Excel (.xlsx) téléchargé ✓ — prêt à imprimer" : "Menu Excel (.xls) téléchargé ✓ — prêt à imprimer"); setTimeout(() => setMsg(""), 4000); };
  const copyPlan = async () => { try { await navigator.clipboard.writeText(JSON.stringify(plan, null, 2)); setPlanMsg("Plan actuel copié ✓"); } catch (e) { setPlanText(JSON.stringify(plan, null, 2)); setPlanMsg("Copie auto impossible — le JSON est affiché ci-dessous, copie-le à la main."); setShowPlan(true); } setTimeout(() => setPlanMsg(""), 4000); };
  const savePlan = async () => {
    let obj; try { obj = JSON.parse(planText); } catch (e) { setPlanMsg("JSON invalide : " + e.message); return; }
    const err = validatePlan(obj); if (err) { setPlanMsg("Plan refusé : " + err); return; }
    const ok = await onSavePlan(obj); setActiveStart(obj.start); setDi(0); setPlanText("");
    setPlanMsg(ok ? (live ? "Plan enregistré en base ✓" : "Plan chargé (démo — non persisté sans backend)") : "Échec de l'enregistrement backend."); setTimeout(() => setPlanMsg(""), 5000);
  };

  return (
    <div className="px-4 pt-5">
      <ScreenHead title="NUTRITION" sub={`Plan ${plan.weekLabel}`} />

      {list.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: FD, fontSize: 10.5, letterSpacing: "0.1em", color: C.mut2 }}>SEMAINE</span>
          <select value={plan.start} onChange={(e) => { setActiveStart(e.target.value); setDi(0); }} style={{ flex: 1, background: C.card, color: C.text, border: `1px solid ${C.line}`, borderRadius: 9, padding: "7px 10px", fontFamily: FD, fontSize: 13 }}>
            {list.map((p) => <option key={p.start} value={p.start}>{p.weekLabel}</option>)}
          </select>
        </div>
      )}

      {/* Cibles quotidiennes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
        <TargetTile k="CALORIES" v={`~${(targets.kcal / 1000).toFixed(1)}k`} sub="kcal/j" tone={C.blueHi} />
        <TargetTile k="PROTÉINES" v={targets.protein} sub="g · 2 g/kg" tone={C.green} />
        <TargetTile k="GLUCIDES" v={targets.carbs} sub="g" tone={C.gold} />
        <TargetTile k="LIPIDES" v={targets.fat} sub="g" tone={C.orange} />
      </div>
      <div style={{ fontSize: 11.5, color: C.mut, marginTop: 8, lineHeight: 1.4 }}>
        Cible <b>moyenne</b> : déficit léger pour tendre vers 85 kg sans perdre de muscle. Monte les glucides (+50–100 g) les jours de grosse sortie, calibre sur la <b>tendance de poids</b> (onglet Tableau), pas sur une seule journée.
      </div>

      {/* Export menu Excel imprimable */}
      <button onClick={onMenu} style={{ width: "100%", marginTop: 12, padding: "13px 0", borderRadius: 12, background: `linear-gradient(180deg, ${C.blueHi}, ${C.blue})`, color: "#fff", fontFamily: FD, fontSize: 15, letterSpacing: "0.08em", fontWeight: 700, boxShadow: `0 4px 16px ${C.blueGlow}` }}>
        ⤓ EXPORTER LE MENU + COURSES (EXCEL)
      </button>
      <div style={{ fontSize: 10.5, color: C.mut2, marginTop: 5, textAlign: "center" }}>Classeur 2 feuilles au format imprimable (menu en grille + liste de courses par rayon), reprenant ta mise en page.</div>

      {/* Sélecteur de jour */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "16px 0 4px", paddingBottom: 4 }}>
        {plan.days.map((d, i) => {
          const on = i === di;
          return (
            <button key={d.date} onClick={() => setDi(i)} style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 10, border: `1px solid ${on ? C.blue : C.line}`, background: on ? C.blue : C.card, color: on ? "#fff" : C.mut, fontFamily: FD, fontSize: 13, letterSpacing: "0.04em" }}>
              {d.day.slice(0, 3)}
            </button>
          );
        })}
      </div>

      {/* Total du jour vs cible */}
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap", margin: "8px 0 2px" }}>
        <span style={{ fontFamily: FD, fontSize: 22, fontWeight: 700 }}>{tot.kcal} kcal</span>
        <MacroChip label="P" v={tot.p} tone={C.green} />
        <MacroChip label="G" v={tot.c} tone={C.gold} />
        <MacroChip label="L" v={tot.f} tone={C.orange} />
        <span style={{ fontSize: 11, color: C.mut2, marginLeft: "auto" }}>cible ~{targets.kcal} · {targets.protein}P</span>
      </div>

      {/* Repas du jour */}
      {day.meals.map((m) => {
        const q = getMult(dIdx, m.slot);
        return (
          <div key={m.slot} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 13, marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: FD, letterSpacing: "0.12em", fontSize: 11, color: C.blueHi }}>{m.slot.toUpperCase()}</div>
              <div style={{ fontFamily: FD, fontSize: 13, color: C.mut }}>{m.kcal} kcal</div>
            </div>
            <div style={{ fontSize: 14, marginTop: 3, color: C.text, lineHeight: 1.3 }}>{m.name}</div>
            <div style={{ display: "flex", gap: 7, marginTop: 7, alignItems: "center", flexWrap: "wrap" }}>
              <MacroChip label="P" v={m.p} tone={C.green} />
              <MacroChip label="G" v={m.c} tone={C.gold} />
              <MacroChip label="L" v={m.f} tone={C.orange} />
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10.5, color: C.mut2, fontFamily: FD, letterSpacing: "0.04em" }}>PORTIONS</span>
                <Stepper value={q} onChange={(v) => setMealMult(m.slot, v)} />
              </div>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 11, color: C.mut2, marginTop: 8 }}>Le multiplicateur de portions (ex. ×3 pour un repas de famille) n'agit que sur la <b>liste de courses</b> — tes macros affichées restent celles d'<b>une</b> portion.</div>

      {/* Liste de courses */}
      <SectionTitle>Liste de courses</SectionTitle>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 13, color: C.mut }}>{nItems} articles · semaine entière{anyMult ? " · portions ajustées" : ""}</div>
          <button onClick={() => setShowList((s) => !s)} style={{ fontFamily: FD, fontSize: 12, color: C.blueHi, letterSpacing: "0.06em" }}>{showList ? "MASQUER" : "APERÇU"}</button>
        </div>
        {showList && (
          <div style={{ marginTop: 10 }}>
            {CAT_ORDER.filter((c) => byCat[c] && byCat[c].length).map((c) => (
              <div key={c} style={{ marginBottom: 10 }}>
                <div style={{ fontFamily: FD, letterSpacing: "0.1em", fontSize: 10.5, color: C.mut2, marginBottom: 3 }}>{CAT_LABELS[c].toUpperCase()}</div>
                {byCat[c].map((it) => (
                  <div key={it.n} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: C.text, padding: "2px 0", borderBottom: `1px solid ${C.bg2}` }}>
                    <span>{it.n}</span><span style={{ color: C.mut, fontFamily: FD }}>{fmtQty(it.q)} {it.u}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <button onClick={onWord} style={{ width: "100%", marginTop: 12, padding: "12px 0", borderRadius: 11, background: C.blue, color: "#fff", fontFamily: FD, fontSize: 15, letterSpacing: "0.08em", fontWeight: 600, boxShadow: `0 4px 16px ${C.blueGlow}` }}>
          GÉNÉRER LA LISTE (WORD)
        </button>
        {msg && <div style={{ textAlign: "center", fontSize: 12, color: C.green, marginTop: 8, fontFamily: FD }}>{msg}</div>}
      </div>

      {/* Cadre méthodo */}
      <div style={{ background: C.bg2, border: `1px solid ${C.line}`, borderRadius: 12, padding: 12, margin: "16px 0 8px" }}>
        <div style={{ fontFamily: FD, letterSpacing: "0.14em", fontSize: 11, color: C.gold, marginBottom: 6 }}>CADRE & SOURCES</div>
        <ul style={{ margin: 0, paddingLeft: 16, color: C.mut, fontSize: 12, lineHeight: 1.5 }}>
          <li>Méditerranéen / <b>Anthony Berthou</b> : aliments bruts, faible charge glycémique, bons gras (oméga-3), protéines à chaque repas, 800 g–1 kg de fruits & légumes/jour, poisson gras 2–3×/sem.</li>
          <li>Protéines ~<b>2 g/kg</b> (position ISSN 2017 : 1,4–2,0 g/kg suffisent ; jusqu'à 2,3–3,1 g/kg pour préserver le muscle en déficit).</li>
          <li>Les <b>kcal/macros par repas sont des estimations</b> (±10 %). Le vrai juge de paix reste ta tendance de poids et tes sensations.</li>
          <li>Chaque jeudi, envoie-moi tes consignes : je régénère le plan vendredi→jeudi.</li>
        </ul>
      </div>

      {/* Gérer le plan — désormais une donnée, plus du code */}
      <SectionTitle>Gérer le plan de la semaine</SectionTitle>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, marginBottom: 8 }}>
        <div style={{ fontSize: 12, color: C.mut, lineHeight: 1.45 }}>
          Le plan est une <b>donnée</b> {live ? "enregistrée en base (SQLite)" : "— en démo, non persistée sans backend"}. Chaque semaine, colle ici le nouveau plan (le JSON que je te fournis) : plus besoin de modifier le code.
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button onClick={copyPlan} style={{ flex: "1 1 auto", padding: "9px 10px", borderRadius: 9, border: `1px solid ${C.line2}`, background: C.bg2, color: C.blueHi, fontFamily: FD, fontSize: 11.5, letterSpacing: "0.05em" }}>COPIER LE PLAN ACTUEL</button>
          <button onClick={() => setShowPlan((s) => !s)} style={{ flex: "1 1 auto", padding: "9px 10px", borderRadius: 9, border: `1px solid ${C.line2}`, background: C.bg2, color: C.blueHi, fontFamily: FD, fontSize: 11.5, letterSpacing: "0.05em" }}>{showPlan ? "MASQUER" : "CHARGER UN PLAN"}</button>
          {stored && <button onClick={() => onDeletePlan(plan.start)} style={{ flex: "1 1 auto", padding: "9px 10px", borderRadius: 9, border: `1px solid ${C.line2}`, background: C.bg2, color: C.red, fontFamily: FD, fontSize: 11.5, letterSpacing: "0.05em" }}>SUPPRIMER</button>}
        </div>
        {showPlan && (
          <div style={{ marginTop: 10 }}>
            <textarea value={planText} onChange={(e) => setPlanText(e.target.value)} placeholder="Colle ici le plan au format JSON (objet { start, weekLabel, targets, days… })" spellCheck={false}
              style={{ width: "100%", minHeight: 130, boxSizing: "border-box", background: C.bg2, color: C.text, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, fontFamily: "monospace", fontSize: 11.5, resize: "vertical" }} />
            <button onClick={savePlan} style={{ width: "100%", marginTop: 8, padding: "11px 0", borderRadius: 11, background: C.green, color: "#04120C", fontFamily: FD, fontSize: 14, letterSpacing: "0.08em", fontWeight: 700 }}>ENREGISTRER LE PLAN</button>
          </div>
        )}
        {planMsg && <div style={{ textAlign: "center", fontSize: 12, color: /refusé|invalide|Échec|impossible/.test(planMsg) ? C.red : C.green, marginTop: 8, fontFamily: FD }}>{planMsg}</div>}
      </div>
    </div>
  );
}

function TargetTile({ k, v, sub, tone }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 8px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: tone }} />
      <div style={{ fontFamily: FD, letterSpacing: "0.08em", fontSize: 9.5, color: C.mut2 }}>{k}</div>
      <div style={{ fontFamily: FD, fontSize: 24, fontWeight: 700, lineHeight: 1.05, color: tone }}>{v}</div>
      <div style={{ fontFamily: FD, fontSize: 10, color: C.mut2 }}>{sub}</div>
    </div>
  );
}
function MacroChip({ label, v, tone }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 3, padding: "2px 8px", borderRadius: 7, background: C.bg2, border: `1px solid ${C.line}` }}>
      <span style={{ fontFamily: FD, fontSize: 10, color: tone, letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontFamily: FD, fontSize: 13, color: C.text }}>{v}</span>
      <span style={{ fontSize: 9, color: C.mut2 }}>g</span>
    </span>
  );
}
function Stepper({ value, onChange }) {
  const btn = { width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.line2}`, background: C.bg2, color: C.text, fontFamily: FD, fontSize: 16, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button onClick={() => onChange(value - 1)} style={btn}>−</button>
      <span style={{ fontFamily: FD, fontSize: 15, fontWeight: 700, minWidth: 26, textAlign: "center", color: value > 1 ? C.blueHi : C.text }}>×{value}</span>
      <button onClick={() => onChange(value + 1)} style={btn}>+</button>
    </div>
  );
}

/* ============================= NAV & UI ================================ */
function BottomNav({ tab, setTab, activeBadge }) {
  const items = [{ id: "dash", label: "Tableau", icon: IcGrid }, { id: "programme", label: "Prog.", icon: IcCal }, { id: "session", label: "Séance", icon: IcBolt, badge: activeBadge }, { id: "history", label: "Histo.", icon: IcClock }, { id: "progress", label: "Progrès", icon: IcChart }, { id: "fitness", label: "Forme", icon: IcPulse }, { id: "nutri", label: "Nutri", icon: IcApple }];
  return (
    <nav style={{ display: "flex", background: C.bg2, borderTop: `1px solid ${C.line}`, paddingBottom: "env(safe-area-inset-bottom)" }}>
      {items.map((it) => { const on = tab === it.id; const Icon = it.icon; return (
        <button key={it.id} onClick={() => setTab(it.id)} style={{ flex: 1, padding: "8px 0 10px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, position: "relative" }}>
          {on && <div style={{ position: "absolute", top: 0, width: 22, height: 3, background: C.blue, borderRadius: 3, boxShadow: `0 0 10px ${C.blueGlow}` }} />}
          <div style={{ position: "relative" }}><Icon color={on ? C.blueHi : C.mut2} />{it.badge && <span style={{ position: "absolute", top: -3, right: -4, width: 8, height: 8, borderRadius: 9, background: C.green, border: `2px solid ${C.bg2}` }} />}</div>
          <span style={{ fontFamily: FD, fontSize: 9.5, letterSpacing: "0.02em", color: on ? C.text : C.mut2 }}>{it.label}</span>
        </button>
      ); })}
    </nav>
  );
}

function SectionTitle({ children }) { return <div style={{ fontFamily: FD, letterSpacing: "0.2em", fontSize: 12, color: C.mut, margin: "18px 0 10px" }}>{String(children).toUpperCase()}</div>; }
function ScreenHead({ title, sub }) { return (<div className="mb-4"><div style={{ fontFamily: FD, fontSize: 30, fontWeight: 700, letterSpacing: "0.04em", lineHeight: 1 }}>{title}</div><div style={{ color: C.mut, fontSize: 13, marginTop: 3 }}>{sub}</div></div>); }
function StatCard({ label, value, sub, tone }) {
  const color = tone === "blue" ? C.blueHi : tone === "gold" ? C.gold : C.text;
  return (<div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: 13, position: "relative", overflow: "hidden" }}>
    {tone === "blue" && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: C.blue }} />}
    {tone === "gold" && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: C.gold }} />}
    <div style={{ fontFamily: FD, letterSpacing: "0.12em", fontSize: 10.5, color: C.mut }}>{label}</div>
    <div style={{ fontFamily: FD, fontSize: 38, fontWeight: 700, color, lineHeight: 1.05, marginTop: 2 }}>{value}</div>
    <div style={{ color: C.mut2, fontSize: 11.5 }}>{sub}</div>
  </div>);
}
function MiniStat({ label, value, unit, accent }) {
  return (<div style={{ background: C.bg2, border: `1px solid ${accent ? "rgba(47,123,255,0.4)" : C.line}`, borderRadius: 10, padding: "8px 9px" }}>
    <div style={{ fontFamily: FD, letterSpacing: "0.1em", fontSize: 9.5, color: C.mut2 }}>{label}</div>
    <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 700, color: accent ? C.blueHi : C.text, lineHeight: 1.1 }}>{value}<span style={{ fontSize: 12, color: C.mut }}> {unit}</span></div>
  </div>);
}
function Metric({ k, v }) { return (<div><div style={{ fontFamily: FD, letterSpacing: "0.12em", fontSize: 10, color: C.mut2 }}>{k}</div><div style={{ fontFamily: FD, fontSize: 16, fontWeight: 600 }}>{v}</div></div>); }
function MuscleChip({ m }) { return <span style={{ fontFamily: FD, letterSpacing: "0.08em", fontSize: 11, color: C.blueHi, background: "rgba(47,123,255,0.12)", border: `1px solid rgba(47,123,255,0.28)`, borderRadius: 7, padding: "2px 7px" }}>{(m || "").toUpperCase()}</span>; }
function RestChip({ s }) { return <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: FD, letterSpacing: "0.06em", fontSize: 11, color: C.orange, background: "rgba(255,138,61,0.12)", border: `1px solid rgba(255,138,61,0.3)`, borderRadius: 7, padding: "2px 6px" }}><RestIcon small />REPOS {restLabel(s)}</span>; }
function StatusPill({ live }) { return (<div style={{ display: "flex", alignItems: "center", gap: 6, background: C.bg2, border: `1px solid ${C.line2}`, borderRadius: 999, padding: "5px 10px" }}><span style={{ width: 8, height: 8, borderRadius: 9, background: live ? C.green : C.mut2 }} /><span style={{ fontFamily: FD, letterSpacing: "0.1em", fontSize: 10, color: live ? C.green : C.mut }}>{live ? "EN LIGNE" : "APERÇU"}</span></div>); }
function CheckBox({ on }) { return (<div style={{ width: 24, height: 24, borderRadius: 7, border: `1.5px solid ${on ? C.green : C.line2}`, background: on ? C.green : "transparent", display: "grid", placeItems: "center" }}>{on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#08130C" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}</div>); }

const btnPrimary = () => ({ background: C.blue, color: "#fff", fontFamily: FD, fontWeight: 600, letterSpacing: "0.06em", fontSize: 15, padding: "13px 14px", borderRadius: 12, boxShadow: `0 8px 22px ${C.blueGlow}` });
const btnGhost = () => ({ background: "transparent", color: C.blueHi, fontFamily: FD, fontWeight: 600, letterSpacing: "0.04em", fontSize: 14, padding: "11px 14px", borderRadius: 12, border: `1px solid ${C.line2}`, display: "flex", alignItems: "center", justifyContent: "center" });
const btnDanger = () => ({ background: "transparent", color: C.red, fontFamily: FD, fontWeight: 600, letterSpacing: "0.04em", fontSize: 14, padding: "13px 8px", borderRadius: 12, border: `1px solid rgba(255,94,108,0.4)` });
const pillBtn = () => ({ fontFamily: FD, fontSize: 12, color: C.text, background: "rgba(255,255,255,0.06)", border: `1px solid ${C.line2}`, borderRadius: 8, padding: "4px 9px" });

/* -------- Icônes -------- */
function IcGrid({ color }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.8" /><rect x="14" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.8" /><rect x="3" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.8" /><rect x="14" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="1.8" /></svg>; }
function IcBolt({ color }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" stroke={color} strokeWidth="1.8" strokeLinejoin="round" /></svg>; }
function IcClock({ color }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" /><path d="M12 7v5l3.5 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcChart({ color }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke={color} strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcCal({ color }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="2" stroke={color} strokeWidth="1.8" /><path d="M3 9h18M8 3v4M16 3v4" stroke={color} strokeWidth="1.8" strokeLinecap="round" /></svg>; }
function IcPulse({ color }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M2 12h4l2.5-7 4 14 3-9 2 2h4.5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function IcApple({ color }) { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 7c0-2 1.4-3.5 3.2-3.7M15.5 8.5c2.5 0 4 2 4 5s-2 7-4 7c-1 0-1.6-.5-2.7-.5s-1.7.5-2.8.5c-2 0-4.2-4-4.2-7s1.7-5 4.1-5c1.2 0 2 .6 2.9.6s1.4-.6 2.6-.6z" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function Play() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>; }
function Plus() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke={C.blueHi} strokeWidth="2" strokeLinecap="round" /></svg>; }
function Dot() { return <span style={{ width: 8, height: 8, borderRadius: 9, background: "#fff", display: "inline-block" }} />; }
function RestIcon({ small }) { const s = small ? 12 : 16; return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="13" r="8" stroke={C.orange} strokeWidth="1.8" /><path d="M12 9v4l2.5 1.5M9 2h6" stroke={C.orange} strokeWidth="1.8" strokeLinecap="round" /></svg>); }
function Trophy({ small }) { const s = small ? 13 : 16; return (<svg width={s} height={s} viewBox="0 0 24 24" fill="none"><path d="M7 4h10v4a5 5 0 01-10 0V4z" stroke={C.gold} strokeWidth="1.7" strokeLinejoin="round" /><path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 15h6M10 15l-1 4h6l-1-4M8 21h8" stroke={C.gold} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>); }
function SportIcon({ type }) {
  const ride = type === "Ride" || type === "VirtualRide";
  const bg = type === "WeightTraining" ? "rgba(47,123,255,0.14)" : "rgba(255,138,61,0.14)";
  const col = type === "WeightTraining" ? C.blueHi : C.orange;
  return (<div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
    {ride
      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="5.5" cy="17.5" r="3.5" stroke={col} strokeWidth="1.6" /><circle cx="18.5" cy="17.5" r="3.5" stroke={col} strokeWidth="1.6" /><path d="M5.5 17.5l4-8h5l3 8M9 9h6" stroke={col} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 9v6M20 9v6M7 7v10M17 7v10M7 12h10" stroke={col} strokeWidth="1.8" strokeLinecap="round" /></svg>}
  </div>);
}
