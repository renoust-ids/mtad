2. Plan de réalisation pour la fonctionnalité "Join CSV"
Pour ajouter cette fonctionnalité de bout en bout proprement, nous allons devoir toucher à presque toutes les couches du monorepo. Voici le plan d'action séquentiel :

Étape 1 (step1.md): Le cœur de donnée (Backend / reltab)

Objectif : Étendre le système de requêtage pour supporter une opération JOIN. Actuellement, reltab gère très bien le filtrage et les agrégations. Il faut lui apprendre à lier deux sources (la table courante et un nouveau chemin de fichier CSV lu par DuckDB) avec un type de jointure et une condition (colA = colB).

Étape 2 (step2.md): Le menu et le système de fichiers (Electron Main / tad-app)

Objectif : Ajouter une entrée File > Join CSV... dans le menu natif d'Electron.

Câbler ce menu pour déclencher une demande vers l'interface React, en y incluant éventuellement un appel à la fenêtre de dialogue native (dialog.showOpenDialog) pour que l'utilisateur choisisse le second CSV.

Étape 3 (step3.md): L'interface utilisateur et la Modale (React / tadviewer)

Objectif : Créer un composant <JoinCsvDialog/> en React.

Il affichera :

Le chemin du 2ème CSV.

Un menu déroulant pour la colonne du 1er CSV (déjà ouvert).

Un menu déroulant pour la colonne du 2ème CSV (nécessite de lire brièvement les headers de ce CSV via DuckDB).

Un choix de méthode : Left Join, Inner Join, Full Join.

Étape 4 (step4.md): L'orchestration et le Rendu (State Management)

Objectif : Une fois la modale validée, envoyer la nouvelle requête de structure de jointure au driver DuckDB.

Recevoir la nouvelle vue, créer un nouvel onglet ou rafraîchir la vue principale de Tad avec ce nouveau résultat virtuel.

Étape 5 (step5.md): Le Build et Déploiement

Objectif : Recompiler les packages Lerna modifiés (reltab, tadviewer, tad-app) et lancer le processus d'empaquetage (electron-builder) pour générer le binaire de test.