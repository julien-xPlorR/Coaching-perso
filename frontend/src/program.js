/* =========================================================================
   SOMMET — LE PROGRAMME D'ENTRAÎNEMENT EST UNE DONNÉE, PLUS DU CODE.
   -------------------------------------------------------------------------
   Comme les plans de repas : un programme = UNE SEMAINE, clé = `start`
   (le lundi, au format ISO "AAAA-MM-JJ"). Stocké en base (table `programs`),
   récupéré via GET /api/program, enregistré via POST /api/program.

   DEFAULT_PROGRAM ci-dessous = le programme actuel, EMBARQUÉ dans l'app.
   Il sert uniquement de SECOURS : il s'affiche si la base est vide ou si
   l'API n'est pas joignable (mode aperçu). Dès qu'un programme est en base,
   c'est lui qui prime.

   ⚠️ CE QUI N'EST VOLONTAIREMENT *PAS* DANS LE JSON :
   les zones de puissance et la FTP. Elles continuent de venir de Strava
   (/api/config -> ftp + powerZones) et sont recalculées à l'affichage par
   buildZones(). Figer des watts dans le JSON les rendrait faux dès que la
   FTP bouge. Les watts écrits dans les séances (« 285–300 W · Z4 ») restent
   des PRESCRIPTIONS de séance : ils sont, eux, dans le JSON, et c'est à moi
   de te les recalculer quand ta FTP change.
   ========================================================================= */

/* -------------------- Zones de puissance (jamais dans le JSON) ----------- */
// Libellés des zones (7 max : Strava expose jusqu'à 7 zones de puissance).
const ZONE_LABELS = ["Récup", "Endurance", "Tempo", "Seuil", "VO2 / PMA", "Anaéro.", "Neuro."];

// Bornes hautes en % de la FTP — modèle de Coggan & Allen (Training and Racing
// with a Power Meter, 3e éd., 2019, tableau des niveaux d'entraînement) :
// Z1 ≤55 %, Z2 56–75 %, Z3 76–90 %, Z4 91–105 %, Z5 106–120 %, Z6 121–150 %.
const COGGAN_TOP = [0.55, 0.75, 0.9, 1.05, 1.2, 1.5];

/**
 * Construit le tableau de zones affiché dans l'onglet Programme.
 * @param {number} ftp        FTP en watts (vient de Strava via /api/config).
 * @param {Array}  powerZones Zones renvoyées par Strava (/athlete/zones), optionnel.
 *                            Format Strava : [{ min, max }, …], max = -1 = zone ouverte.
 * @returns {{z:string,l:string,r:string,src:string}[]}
 */
export function buildZones(ftp, powerZones) {
  // 1) Priorité : les zones réellement configurées dans Strava.
  if (Array.isArray(powerZones) && powerZones.length >= 3) {
    return powerZones.map((z, i) => ({
      z: "Z" + (i + 1),
      l: ZONE_LABELS[i] || "Z" + (i + 1),
      r: !(z.max > 0)
        ? `> ${z.min} W`
        : i === 0
          ? `< ${z.max} W`
          : `${z.min}–${z.max}`,
      src: "strava",
    }));
  }
  // 2) Repli : recalcul Coggan sur la FTP Strava.
  const f = Number(ftp) > 0 ? Number(ftp) : 300;
  const b = COGGAN_TOP.map((c) => Math.round(c * f));
  return [
    { z: "Z1", l: "Récup", r: `< ${b[0]} W`, src: "ftp" },
    { z: "Z2", l: "Endurance", r: `${b[0] + 1}–${b[1]}`, src: "ftp" },
    { z: "Z3", l: "Tempo", r: `${b[1] + 1}–${b[2]}`, src: "ftp" },
    { z: "Z4", l: "Seuil", r: `${b[2] + 1}–${b[3]}`, src: "ftp" },
    { z: "Z5", l: "VO2 / PMA", r: `${b[3] + 1}–${b[4]}`, src: "ftp" },
    { z: "Z6", l: "Anaéro.", r: `${b[4] + 1}–${b[5]}`, src: "ftp" },
  ];
}

/* ======================= PROGRAMME EMBARQUÉ (SECOURS) ==================== */
export const DEFAULT_PROGRAM = {
  start: "2026-07-13",
  weekLabel: "Semaine du 13 juil. 2026",

  /* --------------------------- Bandeau du bloc -------------------------- */
  block: {
    name: "Bloc développement FTP",
    phase: "post-Étape · fin d'été 2026",
    note: "Pousser la FTP vers 4 W/kg pendant que le volume de course reste bas. Distribution polarisée : ~80 % facile / ~20 % intensité.",
    counts: { velo: 3, cap: 2, muscu: 3 },
  },

  /* ----------------------- Musculation (ex-DAYS) ------------------------ */
  /* rest = temps de repos prescrit ENTRE LES SÉRIES, en secondes */
  strength: [
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
  ],

  /* -------------------------- Vélo (ex-BIKE) ---------------------------- */
  /* `ht` = déroulé home trainer (fixe). `out` = déroulé dehors par défaut.  */
  /* `outAuto` = règle de recomposition du déroulé dehors selon la durée     */
  /* choisie dans l'app (avant, c'était codé en dur dans outdoorSteps).      */
  bike: [
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
      outAuto: {
        mode: "intervals",
        warmup: { min: 15, w: "échauffement", d: "Montée progressive + accélérations" },
        core: { t: "3 × 10 min", min: 40, w: "285–300 W · RPE 7–8", d: "Bosse régulière ; récup 5 min en descente" },
        filler: { w: "195–220 W · Z2", d: "Endurance pour compléter la sortie", minMin: 10 },
        cooldown: { min: 10, w: "roue libre", d: "Retour au calme" },
      },
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
      outAuto: {
        mode: "intervals",
        warmup: { min: 15, w: "échauffement", d: "Montée progressive + accélérations" },
        core: { t: "5 × 3 min", min: 27, w: "à bloc maîtrisé · RPE 9", d: "Bosse de 3–5 min ; récup 3 min en descente" },
        filler: { w: "195–220 W · Z2", d: "Endurance pour compléter la sortie", minMin: 10 },
        cooldown: { min: 10, w: "roue libre", d: "Retour au calme" },
      },
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
      outAuto: {
        mode: "long",
        body: { w: "195–220 W · Z2", d: "Endurance continue, cadence souple" },
        hills: { w: "240–290 W · Z3–Z4", d: "Réparties sur le parcours, en tempo/seuil", perHour: 1, min: 2, max: 5 },
        tail: { t: "sur > 2 h", w: "60–90 g glucides/h", d: "Ravitaillement régulier" },
      },
      ht: [
        { t: "1 h 45", w: "200–215 W · Z2", d: "Endurance continue" },
        { t: "2 × 15 min", w: "250–260 W · tempo", d: "Récup 5 min entre. 2 h max sur HT" },
      ],
    },
  ],

  /* -------------------------- Course (ex-RUN) --------------------------- */
  run: [
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
  ],

  /* --------------- Allures cibles course (ex-PACES) --------------------- */
  paces: [
    { k: "Footing facile", v: "6:15–6:45 /km", n: "conversation possible — la priorité" },
    { k: "Endurance active", v: "5:45–6:05 /km", n: "avec parcimonie, plus tard" },
    { k: "Seuil (à venir)", v: "5:10–5:25 /km", n: "introduit à l'automne" },
    { k: "Côtes / descente", v: "à l'effort", n: "marcher les raidillons, descentes en petites foulées" },
  ],

  /* ------- Jours par défaut (0 = Lundi … 6 = Dimanche) — ex-DEFAULT_DAYS -- */
  defaultDays: { j2: 0, r1: 0, b1: 1, j1: 2, b2: 3, r2: 4, j3: 4, b3: 6 },

  /* ---------------- Vignettes du planning (ex-ALL_SESSIONS) ------------- */
  sessions: [
    { id: "b1", label: "Vélo · Seuil", short: "Vélo Seuil", kind: "velo" },
    { id: "b2", label: "Vélo · VO2/PMA", short: "Vélo VO2", kind: "velo" },
    { id: "b3", label: "Vélo · Sortie longue", short: "Vélo Longue", kind: "velo" },
    { id: "r1", label: "Course · Footing", short: "Run Footing", kind: "cap" },
    { id: "r2", label: "Course · Trail/côtes", short: "Run Trail", kind: "cap" },
    { id: "j1", label: "Muscu · Bas", short: "Muscu Bas", kind: "muscu" },
    { id: "j2", label: "Muscu · Haut", short: "Muscu Haut", kind: "muscu" },
    { id: "j3", label: "Muscu · Full", short: "Muscu Full", kind: "muscu" },
  ],

  /* -------- Durées proposées dehors, en minutes (ex-BIKE_DUR) ----------- */
  // `defaults` : durée présélectionnée par séance ; `fallback` : pour les autres.
  bikeDur: { specific: [75, 90, 105, 120], long: [120, 150, 180, 210, 240], defaults: { b3: 180 }, fallback: 90 },
};

/* ============================== HELPERS ================================= */

const KINDS = { j: "muscu", b: "velo", r: "cap" };

/** Reconstruit les vignettes du planning si `sessions` manque dans le JSON. */
function deriveSessions(p) {
  const out = [];
  (p.bike || []).forEach((b) => out.push({ id: b.id, label: `Vélo · ${b.name}`, short: `Vélo ${b.name}`, kind: "velo" }));
  (p.run || []).forEach((r) => out.push({ id: r.id, label: `Course · ${r.name}`, short: `Run ${r.name}`, kind: "cap" }));
  (p.strength || []).forEach((d) => out.push({ id: d.id, label: `Muscu · ${d.subtitle}`, short: `Muscu ${d.subtitle}`, kind: "muscu" }));
  return out;
}

/**
 * Complète un programme partiel pour qu'il ne casse jamais l'affichage :
 * champs optionnels remplis, valeurs par défaut posées. Ne modifie pas l'entrée.
 */
export function normalizeProgram(p) {
  const o = structuredClone(p);
  o.block = { name: "Bloc", phase: "", note: "", counts: { velo: 0, cap: 0, muscu: 0 }, ...(o.block || {}) };
  o.strength = Array.isArray(o.strength) ? o.strength : [];
  o.bike = Array.isArray(o.bike) ? o.bike : [];
  o.run = Array.isArray(o.run) ? o.run : [];
  o.paces = Array.isArray(o.paces) ? o.paces : [];
  o.strength.forEach((d) => {
    d.cooldown = Array.isArray(d.cooldown) ? d.cooldown : [];
    (d.exercises || []).forEach((ex) => {
      if (ex.base == null) ex.base = 0;
      if (ex.step == null) ex.step = 0;
      if (ex.rest == null) ex.rest = 90;
    });
  });
  if (!Array.isArray(o.sessions) || !o.sessions.length) o.sessions = deriveSessions(o);
  o.sessions.forEach((s) => { if (!s.kind) s.kind = KINDS[String(s.id)[0]] || "muscu"; });
  if (!o.defaultDays || typeof o.defaultDays !== "object") o.defaultDays = {};
  o.sessions.forEach((s, i) => { if (o.defaultDays[s.id] == null) o.defaultDays[s.id] = i % 7; });
  o.bikeDur = { specific: [75, 90, 105, 120], long: [120, 150, 180, 210, 240], defaults: {}, fallback: 90, ...(o.bikeDur || {}) };
  return o;
}

/** Durée dehors présélectionnée pour une séance vélo. */
export function bikeDurDefault(program, id) {
  const bd = program.bikeDur || {};
  return (bd.defaults && bd.defaults[id]) || bd.fallback || 90;
}

/** Liste triée du plus récent au plus ancien ; secours = programme embarqué. */
export function programList(programs) {
  return programs && programs.length
    ? [...programs].sort((a, b) => (b.start || "").localeCompare(a.start || ""))
    : [DEFAULT_PROGRAM];
}

/** Programme affiché : celui sélectionné, sinon le plus récent, sinon le défaut. */
export function resolveProgram(programs, start) {
  const list = programList(programs);
  return normalizeProgram(list.find((p) => p.start === start) || list[0]);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Contrôle un JSON collé dans l'app AVANT enregistrement.
 * @returns {string|null} message d'erreur en clair, ou null si le programme est bon.
 */
export function validateProgram(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "ce n'est pas un objet JSON";
  if (!obj.start || !ISO.test(obj.start)) return "« start » requis, au format AAAA-MM-JJ (le lundi de la semaine)";
  if (!obj.weekLabel) return "champ « weekLabel » requis";
  if (!Array.isArray(obj.strength) || !obj.strength.length) return "« strength » doit être une liste non vide (les séances de muscu)";
  if (!Array.isArray(obj.bike)) return "« bike » doit être une liste (éventuellement vide)";
  if (!Array.isArray(obj.run)) return "« run » doit être une liste (éventuellement vide)";

  const ids = new Set();
  const dup = (id) => { if (ids.has(id)) return true; ids.add(id); return false; };

  for (const d of obj.strength) {
    if (!d.id || !d.title || !d.subtitle) return "chaque séance de muscu doit avoir id, title, subtitle";
    if (dup(d.id)) return `identifiant en double : « ${d.id} »`;
    if (!Array.isArray(d.exercises) || !d.exercises.length) return `séance « ${d.id} » : « exercises » manquant ou vide`;
    for (const ex of d.exercises) {
      if (!ex.n || !ex.m) return `séance « ${d.id} » : chaque exercice doit avoir n (nom) et m (muscle)`;
      if (!(Number(ex.sets) > 0) || !(Number(ex.reps) > 0)) return `séance « ${d.id} » · « ${ex.n} » : sets et reps doivent être des nombres > 0`;
    }
    if (d.cooldown != null && !Array.isArray(d.cooldown)) return `séance « ${d.id} » : « cooldown » doit être une liste de textes`;
  }
  for (const b of obj.bike) {
    if (!b.id || !b.name) return "chaque séance vélo doit avoir id et name";
    if (dup(b.id)) return `identifiant en double : « ${b.id} »`;
    if (!Array.isArray(b.ht) && !Array.isArray(b.out)) return `séance vélo « ${b.id} » : il faut au moins « ht » ou « out »`;
  }
  for (const r of obj.run) {
    if (!r.id || !r.name) return "chaque séance de course doit avoir id et name";
    if (dup(r.id)) return `identifiant en double : « ${r.id} »`;
    if (!Array.isArray(r.steps) || !r.steps.length) return `séance course « ${r.id} » : « steps » manquant ou vide`;
  }
  if (obj.sessions != null) {
    if (!Array.isArray(obj.sessions)) return "« sessions » doit être une liste";
    for (const s of obj.sessions) {
      if (!s.id || !s.short) return "chaque vignette de « sessions » doit avoir id et short";
      if (!ids.has(s.id)) return `« sessions » référence « ${s.id} », qui n'existe dans aucune séance`;
    }
  }
  if (obj.defaultDays != null) {
    if (typeof obj.defaultDays !== "object") return "« defaultDays » doit être un objet { id: 0–6 }";
    for (const [id, day] of Object.entries(obj.defaultDays)) {
      if (!ids.has(id)) return `« defaultDays » référence « ${id} », qui n'existe dans aucune séance`;
      if (!Number.isInteger(day) || day < 0 || day > 6) return `« defaultDays.${id} » doit être un entier de 0 (lundi) à 6 (dimanche)`;
    }
  }
  if (obj.paces != null && !Array.isArray(obj.paces)) return "« paces » doit être une liste";
  if (obj.zones || obj.ZONES_W || obj.ftp) return "retire « zones »/« ftp » : ils viennent de Strava, pas du JSON";
  return null;
}
