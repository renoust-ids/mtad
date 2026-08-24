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