// Couche base de données unifiée : node:sqlite en local, PostgreSQL (Neon) en ligne.
// ---------------------------------------------------------------------------
// Choix du backend au démarrage :
//   • si la variable d'env DATABASE_URL est définie  -> PostgreSQL (driver "pg")
//   • sinon                                          -> node:sqlite (fichier local)
//
// IMPORTANT — interface ASYNCHRONE.
// node:sqlite est synchrone, mais aucun driver Postgres Node n'est synchrone.
// Pour supporter les deux avec le MÊME code appelant, tout est exposé en async :
//   const db = await createDb({ sqliteFile });
//   await db.exec(sql)
//   await db.prepare(sql).run(...) / .get(...) / .all(...)
//   await db.run(sql, ...) / db.get(sql, ...) / db.all(sql, ...)
//   await db.tx(async (t) => { ... await t.run(sql, ...) ... })
//
// Portabilité SQL (SQLite <-> Postgres) :
//   • Les requêtes utilisent des placeholders "?".
//     Le backend Postgres les traduit en $1, $2, ... (voir toPg).
//     ⚠️ Traduction positionnelle simple : ne pas mettre de "?" LITTÉRAL dans une
//        chaîne SQL. Le code actuel n'en contient pas.
//   • "ON CONFLICT(col) DO UPDATE SET x = excluded.x" est valide dans les deux.
//   • Utiliser BIGINT (et non INTEGER) pour les horodatages en millisecondes
//     (Date.now() ≈ 1,75e12 dépasse la borne INTEGER/int4 de Postgres, mais
//      BIGINT a l'affinité INTEGER en SQLite : DDL commune possible).
//   • .run() renvoie toujours { changes: <nb de lignes affectées> }.
//   • pragma() est un no-op côté Postgres.

const fixArgs = (args) => args.map((a) => (a === undefined ? null : a));

/* ----------------------------- SQLite (local) ---------------------------- */
async function createSqlite(sqliteFile) {
  const { DatabaseSync } = await import("node:sqlite");
  const raw = new DatabaseSync(sqliteFile);

  const runStmt = (stmt, a) => {
    const r = stmt.run(...fixArgs(a));
    return { changes: Number(r.changes ?? 0) };
  };

  const api = {
    dialect: "sqlite",
    async exec(sql) { raw.exec(sql); },
    async pragma(str) { raw.exec("PRAGMA " + str); },
    prepare(sql) {
      const stmt = raw.prepare(sql);
      return {
        run: async (...a) => runStmt(stmt, a),
        get: async (...a) => stmt.get(...fixArgs(a)),
        all: async (...a) => stmt.all(...fixArgs(a)),
      };
    },
    async run(sql, ...a) { return runStmt(raw.prepare(sql), a); },
    async get(sql, ...a) { return raw.prepare(sql).get(...fixArgs(a)); },
    async all(sql, ...a) { return raw.prepare(sql).all(...fixArgs(a)); },
    async tx(fn) {
      raw.exec("BEGIN");
      try {
        const t = {
          run: async (sql, ...a) => runStmt(raw.prepare(sql), a),
          get: async (sql, ...a) => raw.prepare(sql).get(...fixArgs(a)),
          all: async (sql, ...a) => raw.prepare(sql).all(...fixArgs(a)),
        };
        const res = await fn(t);
        raw.exec("COMMIT");
        return res;
      } catch (e) {
        try { raw.exec("ROLLBACK"); } catch (_) { /* ignore */ }
        throw e;
      }
    },
    async close() { try { raw.close(); } catch (_) {} },
  };
  return api;
}

/* --------------------------- PostgreSQL (Neon) --------------------------- */
async function createPostgres(url) {
  const pg = (await import("pg")).default;
  const { Pool, types } = pg;

  // BIGINT (OID 20) est renvoyé en string par défaut (précision). Nos valeurs
  // (timestamps ms ≈ 1,75e12, secondes ≈ 1,75e9) restent < Number.MAX_SAFE_INTEGER
  // (9e15) : on les parse en Number pour coller au comportement de SQLite.
  types.setTypeParser(20, (v) => (v === null ? null : Number(v)));

  // SSL : Neon impose TLS. rejectUnauthorized:false évite les erreurs de chaîne
  // de certificat sur certaines plateformes. Mettre PGSSL_STRICT=true pour
  // vérifier réellement le certificat (plus sûr si l'environnement a les CA).
  // Un Postgres local/self-hosted sans TLS -> ajouter ?sslmode=disable à l'URL.
  const strict = process.env.PGSSL_STRICT === "true";
  const sslDisabled = /sslmode=disable/i.test(url) || process.env.PGSSL === "off";
  const pool = new Pool({
    connectionString: url,
    ssl: sslDisabled ? false : { rejectUnauthorized: strict },
    max: Number(process.env.PG_POOL_MAX || 5),
  });

  // Traduction ? -> $1, $2, ... (positionnelle simple, voir avertissement en tête)
  const toPg = (sql) => { let i = 0; return sql.replace(/\?/g, () => "$" + ++i); };
  const query = (runner, sql, args) => runner.query(toPg(sql), fixArgs(args));

  const api = {
    dialect: "postgres",
    async exec(sql) { await pool.query(sql); },      // multi-instructions OK (protocole simple)
    async pragma() { /* no-op côté Postgres */ },
    prepare(sql) {
      return {
        run: async (...a) => ({ changes: (await query(pool, sql, a)).rowCount }),
        get: async (...a) => (await query(pool, sql, a)).rows[0],
        all: async (...a) => (await query(pool, sql, a)).rows,
      };
    },
    async run(sql, ...a) { return { changes: (await query(pool, sql, a)).rowCount }; },
    async get(sql, ...a) { return (await query(pool, sql, a)).rows[0]; },
    async all(sql, ...a) { return (await query(pool, sql, a)).rows; },
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const t = {
          run: async (sql, ...a) => ({ changes: (await query(client, sql, a)).rowCount }),
          get: async (sql, ...a) => (await query(client, sql, a)).rows[0],
          all: async (sql, ...a) => (await query(client, sql, a)).rows,
        };
        const res = await fn(t);
        await client.query("COMMIT");
        return res;
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    async close() { await pool.end(); },
  };
  return api;
}

/* -------------------------------- Fabrique ------------------------------- */
export async function createDb({ sqliteFile } = {}) {
  const url = process.env.DATABASE_URL;
  if (url) {
    const db = await createPostgres(url);
    console.log("  DB               : PostgreSQL (DATABASE_URL détecté)");
    return db;
  }
  const db = await createSqlite(sqliteFile);
  console.log(`  DB               : SQLite local (${sqliteFile})`);
  return db;
}

export default createDb;
