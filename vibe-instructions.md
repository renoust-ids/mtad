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
1. **Branche** : Crée et place-toi sur une nouvelle branche : `git checkout -b feat/join-csv`.
2. **Commits Atomiques** : Tu dois faire un commit *après chaque étape validée*. Utilise la convention *Conventional Commits* (ex: `feat(reltab): add JoinCsv AST node`).
3. Ne fais jamais de commit global (`git commit -am "wip"`). Ne groupe pas le backend et l'UI dans le même commit.

# MISSION ACTUELLE
Intégrer une fonctionnalité de "Jointure de CSV" (Merge/Join CSV). Cette fonction doit permettre à l'utilisateur de charger un second CSV, de définir les clés de jointure, le type de jointure (INNER, LEFT, etc.), et de générer une nouvelle table affichée dans l'UI.

# PROTOCOLE DE RELEASE (MTad)

## Informations sur le projet
- **Nom du produit** : MTad (application Electron)
- **App ID** : `com.mtad.app`
- **Version actuelle** : `0.0.1`
- **Dépôt** : https://github.com/renoust-ids/tad
- **Branche principale** : `main`
- **Auteur** : Benjamin Renoust (from Antony Courtney)

## Plateformes cibles
| Plateforme | Format | Architecture | Commande electron-builder |
|------------|--------|--------------|---------------------------|
| macOS | DMG + ZIP | arm64 (Apple Silicon) | `--mac --arm64` |
| macOS | DMG + ZIP | x64 (Intel) | `--mac --x64` |
| Windows | EXE (NSIS) | x64 | `--win --x64` |
| Linux | DEB | x64 | `--linux deb` |
| Linux | RPM | x64 | `--linux rpm` |
| Linux | TAR.BZ2 | x64 | `--linux tar.bz2` |

## Workflow de release

### 1. Préparation
```bash
# S'assurer d'être sur la dernière version de la branche
git checkout main
git pull origin main

# Vérifier que les tests passent
npx lerna bootstrap --force-local --hoist --no-ci
cd packages/reltab && npm test
```

### 2. Mise à jour des versions
```bash
# Mettre à jour les versions dans tous les package.json
# (utiliser le script ou éditer manuellement)
python3 << 'EOF'
import json, glob
for f in ["package.json"] + glob.glob("packages/*/package.json"):
    with open(f) as fh:
        data = json.load(fh)
    data["version"] = "0.0.1"  # Version cible
    with open(f, "w") as fh:
        json.dump(data, fh, indent=2)
        fh.write("\n")
EOF
```

### 3. Build local (test avant release)
```bash
# Build complet pour toutes les plateformes
./build-dist.sh

# Ou build spécifique
cd packages/tad-app
npx webpack --mode production
npx electron-builder --mac --arm64 --x64 --publish=never
```

### 4. Publication GitHub (via CI)
```bash
# Créer et pusher un tag pour déclencher le CI
git tag v0.0.1
git push origin v0.0.1

# Le workflow .github/workflows/build.yml se déclenchera automatiquement
# et créera les artefacts pour toutes les plateformes
```

### 5. Téléchargement des artefacts
1. Aller sur https://github.com/renoust-ids/tad/actions
2. Cliquer sur le workflow "Build & Release" correspondant au tag
3. Télécharger les artefacts dans la section "Artifacts" de chaque job

## Fichiers de configuration
- **electron-builder config** : `packages/tad-app/package.json` (section "build")
- **Workflow CI** : `.github/workflows/build.yml`
- **Script de build local** : `build-dist.sh`

## Notes importantes
- **Signature Apple** : Désactivée pour les builds internes (pas de certificat Developer ID)
- **Notarization** : Ignorée si la variable `APPLEID` n'est pas définie
- **Modules natifs** : DuckDB est compilé nativement pour chaque plateforme via le CI
- **Taille des DMG** : ~1-2 GB (inclut DuckDB + node_modules)

## Checklist de release
- [ ] Version bumpée dans tous les package.json
- [ ] Tests unitaires passent (`npm test` dans reltab)
- [ ] Build production réussit (`npx webpack --mode production`)
- [ ] Tag créé et pushé (`git tag v0.0.1 && git push origin v0.0.1`)
- [ ] CI green sur GitHub Actions
- [ ] Artefacts téléchargés et testés
- [ ] Release draft créée sur GitHub

# MISSION : JOINTURE DE CSV (Plan d'exécution pas à pas)

L'objectif est d'ajouter un menu "File > Join CSV" permettant de fusionner un CSV externe avec la vue courante.
**Tu dois valider chaque étape selon les "Instructions de test" avant de passer à la suivante.**

### ÉTAPE 1 : Le Moteur de Données (Backend) & Tests Unitaires
- **Action 1 (Implémentation)** : Ajoute l'opération `JoinCsv` dans l'AST de `packages/reltab` et sa traduction en SQL dans `packages/reltab-duckdb` (gérer `joinType`, `leftCol`, `rightCol`, le forçage en VARCHAR, et `nullString`).
- **Action 2 (Tests)** : Localise le dossier de tests de `reltab` et `reltab-duckdb`. Rédige les tests unitaires pour valider : 
  1. Que la fonction `joinCsv()` construit correctement le nœud AST.
  2. Que le dialecte DuckDB génère le SQL exact attendu, incluant les clauses `read_csv_auto`, le casting `VARCHAR` et la gestion de `nullstr`.
- **Instruction de test** : 
  1. Exécute `yarn install && yarn build` à la racine.
  2. Lance les tests unitaires sur les packages modifiés (ex: `cd packages/reltab-duckdb && yarn test`). **Les tests doivent passer à 100% avant de continuer.**
- **Validation** : Mets à jour le log, puis `git commit -m "feat(reltab): implement and test JoinCsv AST node and DuckDB dialect"`.

### ÉTAPE 2 : IPC et Menu (Electron Main)
- **Action** : Dans `packages/tad-app`, ajoute le gestionnaire `ipcMain.handle('dialog:selectCsvForJoin')` pour ouvrir l'explorateur natif, et ajoute l'entrée "Join CSV..." dans le menu natif qui envoie `start-csv-join` à l'UI.
- **Instruction de test** : Exécute `cd packages/tad-app && yarn start`. Vérifie dans le terminal qu'il n'y a pas d'erreur au lancement.
- **Validation** : Mets à jour le log, puis `git commit -m "feat(tad-app): add native menu and IPC handler for CSV selection"`.

### ÉTAPE 3 : Interface Utilisateur (React)
- **Action** : Dans `packages/tadviewer`, crée le composant `<JoinCsvDialog />` avec BlueprintJS. Il doit écouter `start-csv-join`, déclencher l'IPC pour choisir le fichier, et capturer les paramètres utilisateur (colonnes -- faire un appel IPC complexe pour lire les headers, type de jointure, options de robustesse).
- **Instruction de test** : Exécute `yarn build` sur `tadviewer`.
- **Validation** : Mets à jour le log, puis `git commit -m "feat(tadviewer): add JoinCsvDialog React component"`.

### ÉTAPE 4 : Intégration et Test E2E
- **Action** : Câble la modale pour qu'elle appelle `viewParams.query.joinCsv()` et mette à jour la vue via les actions Tad.
- **Instruction de test** : 
  1. Lance l'application (`yarn start` dans `tad-app`).
  2. Pause ton exécution, affiche un message clair (par exemple "ouvre un CSV, clique sur Join CSV, choisis un autre CSV, valide") et attends que je te confirme que le test manuel est réussi avant de rédiger le commit final.
  3. Vérifie les logs de la console dev tools (Ctrl+Shift+I) pour s'assurer de l'absence d'erreurs SQL.
- **Validation finale** : Mets à jour le log complet, puis `git commit -m "feat(core): wire Join CSV flow to UI state"`.