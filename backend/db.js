// Couche base de données SANS compilation native.
// Utilise le module SQLite intégré à Node.js (node:sqlite), disponible dès Node 22.5+
// (sans option depuis Node 23.4 / 22.13). Aucune dépendance à installer, aucun outil
// de build (fini les erreurs Python / Visual Studio de better-sqlite3).
//
// Expose la même interface que better-sqlite3 pour que server.js reste inchangé :
//   const db = new Database(fichier)
//   db.exec(sql)
//   db.prepare(sql).run(...) / .get(...) / .all(...)
//   db.transaction(fn)
import { DatabaseSync } from "node:sqlite";

// Remplace les éventuels `undefined` par `null` (node:sqlite refuse undefined)
const fix = (args) => args.map((a) => (a === undefined ? null : a));

function wrapStmt(stmt) {
  return {
    run: (...a) => stmt.run(...fix(a)),
    get: (...a) => stmt.get(...fix(a)),
    all: (...a) => stmt.all(...fix(a)),
  };
}

class Database {
  constructor(file) {
    this.raw = new DatabaseSync(file);
  }
  exec(sql) {
    this.raw.exec(sql);
    return this;
  }
  // Compat better-sqlite3 : applique un PRAGMA (ex. "journal_mode = WAL")
  pragma(str) {
    this.raw.exec("PRAGMA " + str);
    return this;
  }
  prepare(sql) {
    return wrapStmt(this.raw.prepare(sql));
  }
  // Reproduit better-sqlite3 : renvoie une fonction qui exécute fn dans une transaction
  transaction(fn) {
    return (arg) => {
      this.raw.exec("BEGIN");
      try {
        const result = fn(arg);
        this.raw.exec("COMMIT");
        return result;
      } catch (e) {
        try { this.raw.exec("ROLLBACK"); } catch (_) {}
        throw e;
      }
    };
  }
}

export default Database;
