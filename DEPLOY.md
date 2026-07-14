# Déploiement SOMMET — Render (gratuit) + Neon (Postgres persistant)

## Architecture retenue et pourquoi

- **Un seul service web Render (plan Free)** qui build le front, puis lance le
  backend Node ; le backend sert aussi `frontend/dist` (le front appelle l'API en
  same-origin, `API = ""` dans `App.jsx`).
- **Base de données sur Neon (externe), pas sur Render.**

Raison, vérifiée sur la doc des deux plateformes :

1. **Le disque d'un service web Render Free est éphémère** : tout fichier écrit
   localement (dont une base **SQLite**) est perdu à chaque redéploiement,
   redémarrage ou mise en veille. Render recommande explicitement une base
   Postgres pour les données relationnelles.
   → Une SQLite hébergée sur Render **ne serait pas persistante**. D'où Postgres.
2. **La base Postgres *gratuite de Render* est supprimée 30 jours après sa
   création** (sans sursis dans certaines sources). Elle ne convient donc pas à
   un usage durable.
   → On utilise **Neon**, dont le plan gratuit est permanent (0,5 Go de stockage
   par projet, 100 CU-heures/mois), la donnée persiste, et la mise en veille
   n'efface rien.

Sources : Render Docs « Deploy for Free » (filesystem éphémère, Postgres Free
supprimée à 30 j) ; Neon Docs/FAQ plan Free (0,5 Go, 100 CU-h, scale-to-zero,
la suspension n'efface pas les données).

## Ce qui change dans le code

| Fichier | Changement |
|---|---|
| `backend/db.js` | Réécrit : couche **asynchrone** qui choisit **node:sqlite** (local) ou **PostgreSQL/`pg`** (si `DATABASE_URL` présent). Traduit `?`→`$n`, uniformise `.run()→{changes}`, gère les transactions et le TLS Neon. |
| `backend/server.js` | Passé en async (tous les appels DB `await`), horodatages en **BIGINT**, wrapper d'erreurs sur les routes. Aucune requête SQL réécrite (placeholders `?` conservés). |
| `backend/package.json` | Ajout de `pg`, champ `engines.node >= 22.5`. |
| `backend/.env.example` | Nouveau : documente `DATABASE_URL`, TLS, Strava. |
| `render.yaml`, `.node-version` | Nouveaux : blueprint Render + version Node. |

En **local**, tu ne définis pas `DATABASE_URL` : rien ne change, tu restes sur
`node:sqlite` (fichier `backend/sommet.db`).

## Étapes

### 1. Créer la base Neon
1. Compte gratuit sur neon.com → **New Project** (région proche, ex.
   *Europe (Frankfurt)*).
2. Récupère la **connection string _pooled_** (l'hôte contient `-pooler`,
   recommandé pour les connexions applicatives). Elle ressemble à :
   `postgresql://user:pwd@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`
   Le schéma (tables) est créé automatiquement au premier démarrage par
   `server.js` (`CREATE TABLE IF NOT EXISTS…`).

### 2. Pousser le code sur GitHub
Copie les fichiers livrés dans ton dépôt `Coaching-perso` (en respectant les
chemins), puis commit/push. `render.yaml` et `.node-version` vont **à la racine**.

### 3. Créer le service sur Render
- **Option A (blueprint)** : sur Render → **New +** → **Blueprint** → sélectionne
  le dépôt. `render.yaml` configure tout.
- **Option B (manuel)** : **New +** → **Web Service** → dépôt → Plan **Free** →
  - Build : `cd frontend && npm install && npm run build && cd ../backend && npm install`
  - Start : `cd backend && npm start`

### 4. Variables d'environnement (Render → Environment)
- `DATABASE_URL` = la chaîne **pooled** Neon (avec `?sslmode=require`).
- `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.
- `STRAVA_REDIRECT_URI` = `https://<ton-service>.onrender.com/api/strava/callback`.

### 5. Strava
Dans les réglages de ton API Strava, ajoute le domaine Render dans
**Authorization Callback Domain** (ex. `sommet.onrender.com`), sinon l'OAuth
sera refusé.

## Limites du gratuit — à connaître (pas de mauvaise surprise)

- **Render Free se met en veille après 15 min d'inactivité** ; la première
  requête suivante subit un **démarrage à froid ≈ 1 min**. Acceptable pour un
  usage perso, gênant pour un usage « temps réel ».
- **Neon Free se met en veille (scale-to-zero) après ~5 min** ; la première
  requête réveille la base avec **~0,3 à 2 s** de latence. La donnée n'est pas
  perdue.
- **Neon Free : 0,5 Go de stockage / projet** et **100 CU-heures/mois** — très
  au-dessus des besoins de cette app (quelques milliers de lignes JSON).
- **Render Free : 750 heures-instance/mois** par workspace (un seul petit service
  reste sous la limite).
- Pour supprimer les démarrages à froid côté serveur : plan Render Starter
  (~7 $/mois). Non nécessaire pour un usage personnel.

## Sauvegarde
La donnée vit sur Neon. Tu as déjà l'export/import JSON des plans de repas dans
l'app ; pour une sauvegarde complète tu peux périodiquement faire un `pg_dump`
de la base Neon (Neon fournit la commande dans son dashboard).

## Notes techniques honnêtes
- La traduction `?`→`$n` est **positionnelle simple** : ne mets jamais de `?`
  *littéral* dans une chaîne SQL. Le code actuel n'en contient aucun.
- `node:sqlite` reste marqué **expérimental** par Node (avertissement au
  démarrage) ; il n'est utilisé qu'en local, la prod tourne sur `pg` (stable).
- `ssl.rejectUnauthorized` est à `false` par défaut (évite les erreurs de chaîne
  de certificat). Le trafic reste **chiffré** ; seule la vérification du
  certificat est relâchée. Passe `PGSSL_STRICT=true` si tu veux la vérification
  stricte.
