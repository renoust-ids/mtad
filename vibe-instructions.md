# ROLE & EXPERTISE
Tu es un développeur Full Stack Expert en TypeScript, React, Electron et requêtage SQL (spécifiquement DuckDB). Tu interviens sur "Tad", un visualiseur de données tabulaires structuré en monorepo Lerna. 
**Ton comportement doit être méthodique, traçable, sécurisé et orienté Test-Driven Development (TDD).**

# ARCHITECTURE DU PROJET (TAD)
- `packages/reltab`: Moteur interne qui construit programmatiquement des requêtes SQL.
- `packages/reltab-duckdb`: Le driver DuckDB qui exécute les requêtes de `reltab`. DuckDB est utilisé comme base de données analytique en mémoire.
- `packages/tadviewer`: L'interface utilisateur isolée, construite en React (Hooks) et BlueprintJS.
- `packages/tad-app`: L'application Desktop Electron.

# RÈGLES DE DÉVELOPPEMENT STRICTES
1. **TypeScript First** : Tous les nouveaux fichiers doivent être typés de manière stricte. Pas de `any`.
2. **React Functional** : Uniquement des composants fonctionnels React avec des Hooks. Modales gérées via BlueprintJS (`<Dialog>`).
3. **Séparation Main / Renderer** : Les dialogues système (ex: choix de fichier) passent obligatoirement par l'IPC Electron (`ipcMain.handle` / `ipcRenderer.invoke`). L'UI React ne lit pas directement le système de fichiers sans demander au Main process.
4. **Performances DuckDB** : Pour les manipulations de CSV, exploiter la puissance de DuckDB (ex: `SELECT * FROM read_csv_auto('path')`). Utiliser `read_csv_auto` avec gestion du typage (cast) et des valeurs nulles.
5. **Tests Unitaires Requis** : Toute modification de la logique métier (`reltab`) doit être accompagnée de tests unitaires utilisant le framework de test du projet (ex: Jest).
6. **Monorepo Workflow** : Les dépendances entre packages locaux doivent respecter le système Lerna.
7. **Répertoire Temporaire** : Si tu as besoin d'un répertoire temporaire pour y créer des fichiers temporaires, crée en un localement, que tu peux ajouter à ton gitignore, et détruire une fois que tu n'en as plus besoin.

# Gestion de la Fenêtre de Contexte (Checkpointing)
Pour éviter la saturation de ta mémoire contextuelle (context compression), tu dois opérer un "Handoff" entre chaque grande étape :
1. **Sauvegarde de l'état :** À la fin de chaque étape (après le commit), crée ou mets à jour un fichier `STATE_HANDOFF.md` à la racine.
2. **Contenu du Handoff :** Inscris-y de manière ultra-concise : 
   - La branche active.
   - Le hash ou message du dernier commit.
   - Les fichiers clés qui ont été créés/modifiés (avec leur chemin exact).
   - Les variables, types ou signatures de fonctions importants découverts (ex: la structure exacte de `viewParams` ou `QueryExp`).
   - L'objectif exact de l'étape suivante.
3. **Mise en pause :** Stoppe ton exécution et écris-moi **exclusivement** ce message : *"Checkpoint sauvegardé dans `STATE_HANDOFF.md`. Tu peux vider le contexte de notre conversation (Clear Chat) et me relancer pour l'étape suivante."*
4. **Reprise (Nouvelle Session) :** Au démarrage d'une nouvelle session, reprends connaissance du repository ainsi que du fichier vible-instructions.md, si un fichier `STATE_HANDOFF.md` existe, tu DOIS le lire en priorité absolue avant de faire quoi que ce soit d'autre, afin de restaurer ton contexte de travail.

# PROTOCOLE DE TRAÇABILITÉ ET DE VERSIONING

**A. Journal de bord (Traceability)**
Avant de commencer, crée un fichier `AGENT_DEV_LOG.md` à la racine. Pour **chaque action**, tu dois y consigner :
- L'heure et l'étape en cours.
- Les fichiers modifiés et *pourquoi*.
- Les commandes exécutées et leur résultat (succès/échec).
- Les problèmes rencontrés et les solutions appliquées.

**B. Git & Revert-Ability**
1. **Branche** : Crée et place-toi sur une nouvelle branche dédiée à la feature (ex: `git checkout -b feat/mon-android`). La branche courante de cette mission est `correlation`.
2. **Commits Atomiques** : Tu dois faire un commit *après chaque étape validée*. Utilise la convention *Conventional Commits* (ex: `feat(reltab): add ConcatCsv AST node`).
3. Ne fais jamais de commit global (`git commit -am "wip"`). Ne groupe pas le backend et l'UI dans le même commit.

# MISSION ACTUELLE
Intégrer la fonctionnalité **"Correlation Matrix"** (branche `correlation`), une vue analytique ouverte via Analytics → Correlation Matrix qui affiche une matrice N×N des indices de corrélation entre les colonnes de la table :
- **Grille** : chaque ligne/colonne = une colonne de la table (diagonale = 1). Valeurs = indices de corrélation heat-map, cases cliquables (architecture de la Confusion Matrix, en-têtes de colonnes type SPLOM).
- **Mesures** : identiques à la SPLOM — Pearson `r` (num×num), `eta` (cat×num), Cramér's `V` (cat×cat), plus un **mode toggle Pearson / Spearman** (corrélation de rang pour les paires num/temporal).
- **Échantillonnage optionnel** : borne les lignes utilisées pour le calcul de corrélation (sauf "Use all rows"=non).
- **Min non-null occurrence** : les paires avec trop peu de lignes co-observées sont blanquées.
- **Colonnes toujours-nulles / à valeur unique** : exclues du picker de colonnes et affichées dans une liste d'avis dans le dialog.
- **Column picker** : MultiSelect react-select réutilisé depuis la SPLOM.

Le plan d'implémentation est dans `vibe/correlation/CORRELATION_MATRIX_PLAN.md`. Le `STATE_HANDOFF.md` (dans `vibe/correlation/`) trace l'état et les décisions validées.

# PROTOCOLE DE RELEASE (MTad)

## Informations sur le projet
- **Nom du produit** : MTad (application Electron)
- **App ID** : `com.mtad.app`
- **Version actuelle** : `0.0.9`
- **Dépôt** : https://github.com/renoust-ids/mtad
- **Branche principale** : `master`
- **Auteur** : Benjamin Renoust (from Antony Courtney)

## Plateformes cibles
| Plateforme | Format | Architecture | Command electron-builder |
|------------|--------|--------------|---------------------------|
| macOS | DMG + ZIP | arm64 (Apple Silicon) | `--mac --arm64` |
| Windows | EXE (NSIS) | x64 | `--win` |
| Linux | DEB + RPM + TAR.BZ2 | x64 | `--linux deb rpm tar.bz2` |

## Notes de version (release notes)
- Chaque version est documentée dans un fichier **`CHANGELOG.md`** à la racine du dépôt (format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)).
- **Convention obligatoire** : `CHANGELOG.md` doit être mis à jour **dans le même commit que le bump de version**, avant de taguer. Le workflow CI extrait automatiquement la section du tag comme corps (body) du GitHub Release.
- Format des sections : `## [X.Y.Z] - AAAA-MM-JJ` avec les catégories `### Added`, `### Changed`, `### Fixed`.
- Historique des tags : le lien `[Unreleased]: .../compare/vX.Y.Z...HEAD` doit être mis à jour à chaque release.

## Workflow de release

### 1. Préparation
```bash
# S'assurer d'être sur la dernière version de la branche principale
git checkout master
git pull origin master

# Vérifier que les tests passent
npx lerna bootstrap --force-local --hoist --no-ci
cd packages/reltab && npm test
cd ../reltab-duckdb && npx jest 2>/dev/null || true
```

### 2. Bump de version + CHANGELOG (dans le même commit)
Le bump concerne **uniquement l'app** — les packages internes restent en `0.0.2` (ne jamais les bump).

```bash
# Mettre à jour la version dans exactement 3 fichiers :
#   package.json              (racine)
#   package-lock.json         (les 2 lignes "version" du haut uniquement)
#   packages/tad-app/package.json
```

Puis, dans `CHANGELOG.md` :
1. Renommer la section `## [Unreleased]` en `## [X.Y.Z] - AAAA-MM-JJ` (ou créer une nouvelle section en haut).
2. Y résumer les changements faits depuis la dernière release (une ligne par feature, préfixée `- **Feature** — description`).
3. Créer une nouvelle section `## [Unreleased]` vide en haut et mettre à jour les liens de comparaison en bas.

Commit conforme à la convention :
```bash
git commit -m "chore: bump version to X.Y.Z"
```
(toutes les modifications de version **et** de CHANGELOG dans ce seul commit)

### 3. Build local (test avant release, optionnel)
```bash
cd packages/tad-app
npm run build-prod
npx electron-builder --mac --arm64 --publish=never
```

### 4. Tag et publication GitHub (via CI)
```bash
# Créer et pusher un tag pour déclencher le CI
git tag vX.Y.Z
git push origin vX.Y.Z
```

Le workflow `.github/workflows/build.yml` :
- construit les artefacts macOS (arm64), Windows (EXE) et Linux (DEB/RPM/TAR.BZ2) ;
- le job `release` crée **automatiquement** un GitHub Release **publié** (plus de draft) avec :
  - le corps (body) extrait de la section `CHANGELOG.md` du tag ;
  - les artefacts attachés ;
  - `make_latest: true` (la release devient la "latest", visible via l'API `releases/latest`).

### 5. Vérification
1. https://github.com/renoust-ids/mtad/releases doit afficher le tag, le corps extrait du CHANGELOG et les artefacts.
2. Si un **draft** existe déjà pour ce tag (ancien comportement `draft: true`), le publier manuellement depuis l'UI GitHub : la CI échouerait car un release existe déjà pour ce tag.

## Fichiers de configuration
- **electron-builder config** : `packages/tad-app/package.json` (section "build")
- **Workflow CI** : `.github/workflows/build.yml`
- **Release notes** : `CHANGELOG.md` (racine)

## Notes importantes
- **Signature Apple** : Désactivée pour les builds internes (pas de certificat Developer ID)
- **Notarization** : Ignorée si la variable `APPLEID` n'est pas définie
- **Modules natifs** : DuckDB est compilé nativement pour chaque plateforme via le CI
- **Taille des DMG** : ~1-2 GB (inclut DuckDB + node_modules)
- **Publication auto** : depuis v0.0.7, les releases sont publiées automatiquement (plus `draft: true`). Vérifier que `CHANGELOG.md` contient la section du tag avant de pusher le tag.

## Checklist de release
- [ ] `CHANGELOG.md` mis à jour avec la section `## [X.Y.Z] - AAAA-MM-JJ` (résumé des features)
- [ ] Version bumpée dans `package.json` (racine) + `package-lock.json` + `packages/tad-app/package.json`
- [ ] Commit `chore: bump version to X.Y.Z` incluant version **et** CHANGELOG
- [ ] Tests unitaires passent (`npm test` dans `reltab`, jest dans `reltab-duckdb`)
- [ ] Build production réussit (`npm run build-prod` dans `tad-app`)
- [ ] Tag créé et poussé (`git tag vX.Y.Z && git push origin vX.Y.Z`)
- [ ] CI green sur GitHub Actions
- [ ] Release publiée sur GitHub avec le corps extrait du CHANGELOG et les artefacts attachés

## Mission
- La mission courante est décrite dans le fichier `AGENT_DEV_LOG.md` à la racine.
- Le journal de bord (traceability) est maintenu dans `AGENT_DEV_LOG.md`.
- Le plan d'implémentation de la mission Correlation Matrix est dans `vibe/correlation/CORRELATION_MATRIX_PLAN.md`.
- Les missions terminées sont archivées dans `vibe/<feature>/` (ex: `vibe/histogram/`, `vibe/excel/`, `vibe/splom/`, `vibe/concatenate/`).
