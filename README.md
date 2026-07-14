# SOMMET — Suivi Force & Prévention (full-stack)

Application de journal de musculation bâtie sur ton plan 3 séances/semaine, avec :
- **persistance réelle** (base SQLite côté serveur — tes séances ne disparaissent plus au rechargement) ;
- **données Strava réelles** (poids, FTP → W/kg, activités récentes) via OAuth ;
- **temps de repos par exercice** + minuteur de repos intégré.

```
suivi-force-app/
├── backend/        Express + SQLite + OAuth Strava   (l'API + la base)
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── frontend/       React + Vite + Tailwind           (l'interface)
    ├── src/App.jsx  ← toute l'app
    └── ...
```

---

## Ce que TU dois faire (je ne peux pas le faire à ta place)

Je ne crée pas de comptes et je ne manipule jamais tes identifiants/secrets : tu les saisis toi-même, ils restent sur ta machine. Voici la checklist.

### 1. Installer Node.js 22.5 ou plus (idéalement la dernière LTS ou v24)
Vérifie : `node -v` (doit afficher **v22.5+**, de préférence v22.13+/v24). Sinon : https://nodejs.org

> **Aucun outil de compilation requis** (pas de Python ni de Visual Studio). La base de données utilise le module **SQLite intégré à Node.js** (`node:sqlite`), donc `npm install` n'a rien à compiler. Au démarrage du backend, Node affiche un avertissement jaune « ExperimentalWarning: SQLite is an experimental feature » : **c'est normal, tu peux l'ignorer**, l'app fonctionne.

### 2. Créer une application Strava (pour l'accès à tes vraies données)
1. Va sur **https://www.strava.com/settings/api**
2. Crée une application. Champs importants :
   - **Authorization Callback Domain** : `localhost`
3. Note ton **Client ID** et ton **Client Secret**.

### 3. Renseigner le backend
Dans `backend/`, copie `.env.example` en `.env` et remplis :
```
STRAVA_CLIENT_ID=xxxxx
STRAVA_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
STRAVA_REDIRECT_URI=http://localhost:8787/api/strava/callback
PORT=8787
```
> Le secret ne quitte jamais ta machine. Ne le commite pas sur un dépôt public.

### 4. Installer et lancer

**Mode développement (2 terminaux) :**
```bash
# terminal 1 — backend
cd backend
npm install
npm start            # → http://localhost:8787

# terminal 2 — frontend
cd frontend
npm install
npm run dev          # → http://localhost:5173  (à ouvrir)
```

**Mode simple (1 seul serveur, après build) :**
```bash
cd frontend && npm install && npm run build
cd ../backend && npm install && npm start
# tout est servi sur http://localhost:8787
```

### 5. Connecter Strava
Ouvre l'app → tableau de bord → **« Connecter mon compte Strava »** → autorise.
Ton poids, ta FTP et tes activités récentes se synchronisent alors automatiquement.

---

## Ce qui est réel, ce qui ne l'est pas

| Donnée | Source | Remarque |
|---|---|---|
| Poids actuel | Strava (profil) | 88,1 kg au 11/07/2026 |
| FTP · W/kg | Strava (zones) | 300 W → 3,40 W/kg ; cible 4,0 |
| Activités vélo/trail | Strava (activités) | 5 dernières affichées |
| Séances de force (séries, reps, charges, PR) | **Base SQLite locale** | Strava ne stocke PAS ce détail : c'est le rôle de cette app |
| Sommeil | Manuel (repli 7 h 25 · 79/100) | Non disponible via Strava (Garmin/Whoop → évolution possible) |

**Note importante :** sur Strava, tes séances « Musculation / Half body » n'existent que comme *durée + effort* — aucun détail série/reps/charge n'y est enregistré. C'est pour ça que le suivi fin de la force vit dans cette base de données, pas dans Strava.

---

## Suivi poids & sommeil (tableau de bord)

En attendant Strava — ou en complément, car Strava n'a pas le sommeil — le tableau de bord a une carte **Suivi du jour** :
- **Saisie manuelle** rapide : poids, sommeil (h) et score du jour → « OK ». Le « poids actuel » et le calcul W/kg utilisent alors ta dernière pesée.
- **Tendance de poids** (sparkline, 30 derniers jours) + moyennes de sommeil sur 7 jours.
- **Import CSV** (bouton « Importer un CSV ») : dépose directement tes exports **Garmin** — c'est calibré sur tes fichiers réels.
  - **Poids** (`Poids.csv`) : format Garmin à deux lignes par mesure (date `" 12 Juil 2026"`, puis `07:13,87.9 kg,…`). Lecture du poids quotidien, **plus la masse grasse (%) et la masse musculaire squelettique (kg)** — affichées dans la carte Suivi du jour avec leur variation (grasse en baisse = vert, muscle en hausse = vert). Utile pour vérifier que tu perds du gras sans perdre de muscle vers 85 kg.
  - **Sommeil** (`Sommeil.csv`) : c'est un **résumé hebdomadaire** (`6-12 Juil,76,…,6h 36min.`). La moyenne de la semaine est **répliquée sur chaque jour** — donc « Sommeil 7 j » = moyenne hebdo Garmin, pas nuit par nuit.
  - **Sommeil — nuit détaillée** (`Score de sommeil 1 jour`) : rapport vertical d'**une seule nuit** (date + durée + score). Déposé dans l'app, il **corrige précisément cette nuit-là** (ex. 12/07 : 7 h 52 · 87, qui remplace la moyenne hebdo pour ce jour). Attention : chaque export ne contient qu'une nuit — pour un historique nuit par nuit complet, il faudrait un fichier par nuit (fastidieux) ; le résumé hebdo reste donc la base de la tendance.
  - Format simple aussi accepté (`modele-suivi.csv` fourni) : `date;poids;sommeil_h;score`.
  - Détection auto du type de fichier, mois FR (Juil/Août/…), années présentes ou déduites, décimales `,`/`.`, durées `6h 36min.`/`7:20`/`7,5`.

Tout est **persisté** en base (`metrics`). Recommandation : export Garmin (poids + sommeil) → import une fois par semaine, saisie manuelle pour les jours ponctuels.

---

## Temps de repos (ajout demandé)

Chaque exercice affiche désormais son **repos prescrit entre les séries**, et cocher une série lance un **minuteur de repos** (avec « +30 s » et « Passer »). Barème appliqué :
- gros mouvements de force (squat, trap bar, développés, hip thrust) : **2 à 3 min** ;
- exercices accessoires (rowing, tirages, split squat, step-up) : **~90 s** ;
- prévention / isolation / gainage (coiffe, face pull, abduction, Pallof) : **45–60 s**.

Base : position stand ACSM (2–3 min entre séries multiples), et 3–5 min pour la force lourde vs 60–90 s pour l'accessoire.

---

## Programme vélo & course (onglet « Programme »)

L'app contient désormais le programme endurance hebdomadaire, calé sur tes vraies zones Strava (FTP 300 W) :
- **Planning déplaçable** : dans « Ma semaine », touche une séance puis un jour pour la déplacer (course, vélo ou muscu). Un bouton réinitialise la semaine conseillée. Les positions sont **persistées**.
- **Vélo — 3 séances/sem** : 2 spécifiques en semaine (Seuil, VO2/PMA) + 1 sortie longue. Bouton **Home trainer / Dehors** par séance. En **Dehors**, tu choisis la **durée visée** (chips 1 h 15 → 4 h) et la séance se recompose : le bloc clé reste fixe, le reste se remplit en endurance Z2 (et le nombre de bosses de la sortie longue s'ajuste). Durée HT inchangée.
- **Course — 2 séances/sem** : allures cibles plutôt que zones, volontairement prudentes (footing facile 6:15–6:45/km, découverte trail/côtes avec power hiking et descentes contrôlées pour protéger le genou).
- Distribution polarisée **~80 % facile / ~20 % intensité** ; le vélo reste prioritaire dans ce bloc, la course s'allège en premier si la fatigue monte.

---

## Forme & Fatigue (onglet « Forme »)

Visualise l'évolution de ta condition physique et de ta fatigue à partir de tes activités Strava + tes séances de muscu loguées dans l'app. Modèle **impulse-response / PMC** (Banister ; PMC type TrainingPeaks) sur une charge quotidienne unifiée.

- **Charge quotidienne** = Charge relative Strava (suffer score, basé FC) des activités **hors muscu** + `STRENGTH_LOAD` (25) par séance de muscu loguée. La muscu est estimée forfaitairement car Strava ne lui attribue que 4–11 en FC, ce qui sous-évalue sa charge réelle — valeur simple et **ajustable** (constante `STRENGTH_LOAD`).
- **Forme = CTL** (moyenne exponentielle 42 j) · **Fatigue = ATL** (7 j) · **Fraîcheur = TSB** = CTL(veille) − ATL(veille).
- **ACWR** = charge aiguë 7 j / chronique 28 j ; zone **0,8–1,3** = risque de blessure le plus faible (Gabbett 2016). Directement relié à ta priorité n°1.
- **Graphiques** : aire Forme (bleu) + ligne Fatigue (orange), bande Fraîcheur (barres vert/rouge autour de 0), jauge ACWR colorée, charge par semaine.
- **En direct** : le backend expose `GET /api/strava/load` qui pagine tes activités Strava et somme la Charge relative par jour (hors muscu). En démo, la courbe est construite sur tes **vraies données** (185 activités, janv.→juil. 2026) : état au 12/07 → **Forme 59 · Fatigue 54 · Fraîcheur +4 · ACWR 0,54** (décharge d'affûtage, cohérent).
- **Réserves affichées dans l'app** : c'est un indicateur, pas une vérité absolue ; il complète tes signaux réels (genou, épaule, sommeil, RPE), il ne les remplace pas.

---

## Nutrition (onglet « Nutri »)

Coaching nutrition intégré : cibles chiffrées + plan de repas hebdomadaire méditerranéen, avec liste de courses exportable en Word.

- **Cibles quotidiennes** (moyennes) : ~**3000 kcal**, **175 g de protéines** (~2 g/kg), **350 g de glucides**, **95 g de lipides**. Déficit léger pour tendre vers 85 kg sans perdre de muscle ; à moduler selon le volume (plus de glucides les jours de grosse sortie) et à **calibrer sur la tendance de poids**, pas sur une journée.
- **Plan Ven → Jeu** : 7 jours × 4 repas (petit-déjeuner, déjeuner, dîner, collation). Chaque repas affiche **kcal + protéines/glucides/lipides**. Menus **méditerranéens, de saison (juillet, Var), non ultra-transformés**, simples et rapides, alignés sur les principes d'Anthony Berthou (aliments bruts, faible charge glycémique, bons gras/oméga-3, protéines à chaque repas, 800 g–1 kg de fruits & légumes/jour, poisson gras 2–3×/sem, brebis/chèvre pour les laitages).
- **Multiplicateur de portions** par repas (`×1`, `×2`, `×3`…) : pour un repas de famille, il **n'affecte que la liste de courses**, pas tes macros affichées (1 portion).
- **Liste de courses** : agrégée sur toute la semaine, **triée par rayon** (fruits & légumes, viandes/poissons/œufs, crémerie, boulangerie, épicerie), avec aperçu dans l'app et **bouton « Générer la liste (Word) »**.
- **Export Excel imprimable** (bouton « Exporter le menu + courses ») : génère un **classeur `.xlsx` à 2 feuilles** reproduisant ta mise en page (`menu_semaine5.xlsx`) — feuille **Menu** (jours en colonnes, sections de repas, bandeau titre, lignes macros colorées avec tes vrais totaux, week-end doré) + feuille **Courses** (9 rayons à bandeaux, zébrage, colonnes Article/Quantité/Remarque). Mise en page **portrait ajustée à une page**, prête à imprimer. Généré côté backend avec `exceljs` ; si le backend n'est pas lancé, l'app produit un repli **`.xls`** ouvrable par Excel (même mise en page, sans dépendance).
- **Cadence** : chaque **jeudi**, tu envoies tes consignes → je régénère le plan (au format **JSON**) pour le vendredi suivant.
- **Le plan est une donnée, plus du code** : il est stocké en **base (SQLite)**, plus dans une constante. Dans l'onglet Nutri → « Gérer le plan de la semaine », tu peux **copier le plan actuel** (pour me le partager/l'éditer) et **charger un nouveau plan** en collant son JSON — aucune modification de code nécessaire. Plusieurs semaines peuvent coexister (sélecteur de semaine) ; chaque plan porte ses propres cibles. Le plan par défaut embarqué sert de secours si la base est vide (et en mode démo). Endpoints : `GET /api/mealplan`, `POST /api/mealplan` (enregistrer/mettre à jour), `POST /api/mealplan/delete`. Table `mealplans(start, label, data, updated_at)`.
- Sources : position ISSN 2017 sur les protéines (1,4–2,0 g/kg, jusqu'à 2,3–3,1 g/kg pour préserver le muscle en déficit) ; principes Berthou (déficit ≤300–500 kcal/j, IG bas, protéines maintenues). **kcal/macros par repas = estimations (±10 %).**

> **Export Word** : le bouton produit un vrai `.docx` (librairie `docx`). Après cette mise à jour, relance `npm install` dans `frontend/` pour installer la dépendance. Si `docx` est indisponible, l'app bascule automatiquement sur un fichier Word `.doc` (repli sans dépendance) — le bouton fonctionne dans tous les cas.

> **Export Excel du menu** : généré par le backend (`exceljs`). Relance aussi `npm install` dans `backend/` (la dépendance `exceljs` a été ajoutée), puis `node server.js`. Sans backend lancé, le bouton produit un repli `.xls` (HTML ouvrable par Excel) directement depuis le navigateur. Le module de mise en page est `backend/mealplanXlsx.js`.

---

## Pistes d'évolution
- Déploiement en ligne (Render/Railway/Fly.io) — l'archi est prête, il suffira d'ajuster `STRAVA_REDIRECT_URI` et le domaine callback.
- Affiner `STRENGTH_LOAD` (ex. via la durée réelle de séance ou un RPE saisi) pour une charge muscu plus personnalisée.
- Import automatique des séances « WeightTraining » Strava comme entrées à compléter.
- Éditeur de plan repas champ-par-champ dans l'app (en complément du chargement JSON déjà en place).
- Adaptation du plan selon la phase (bloc FTP actuel → bascule spécifique trail).
