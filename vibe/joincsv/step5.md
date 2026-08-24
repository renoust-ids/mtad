Étape 5 : Build, Debug et Déploiement
Donne ces instructions à ton agent pour qu'il sache exactement quelles commandes exécuter dans son terminal intégré pour tester et valider ton code.

5.1. Installation et Bootstrap du Monorepo
Avant toute chose, ou après avoir ajouté de nouvelles dépendances, il faut s'assurer que Lerna et Yarn ont bien lié (symlink) les packages locaux entre eux.

Bash


# SCRIPT TERMINAL POUR TON AGENT :
# À exécuter à la racine du projet

# Installer toutes les dépendances et lier les workspaces
yarn install
5.2. Compilation des modifications métiers
Si ton agent modifie reltab, reltab-duckdb ou tadviewer, il doit recompiler ces packages en TypeScript vers du JavaScript compréhensible par l'application finale.

Bash


# SCRIPT TERMINAL POUR TON AGENT :
# Compiler tous les sous-packages modifiés

# Depuis la racine, on demande à Lerna/Yarn de lancer le script de build partout
yarn build
# OU si la commande racine n'est pas configurée :
npx lerna run build
5.3. Lancement en Mode Développement (Debug)
Pour tester l'interface React et le menu Electron en direct sans avoir à générer un installeur lourd à chaque fois.

Bash


# SCRIPT TERMINAL POUR TON AGENT :
# Démarrer Tad en mode développeur

# Se placer dans le package de l'application desktop
cd packages/tad-app

# Lancer l'application Electron en mode dev
yarn start
Note pour toi (le développeur) : En mode développement, Electron ouvre souvent automatiquement les "Developer Tools" (la console Chrome). C'est là que tu pourras voir si tes console.log dans React s'affichent, ou s'il y a des erreurs SQL générées par DuckDB ! Les logs du processus Main (le menu, la lecture de fichiers) apparaîtront eux directement dans le terminal de ton agent.

5.4. Création de l'exécutable (Release / Dist)
Une fois que tu as testé la fonctionnalité et que la jointure fonctionne parfaitement, il est temps de créer le .exe (Windows), .dmg (Mac) ou .AppImage (Linux) pour l'utiliser au quotidien. Tad utilise electron-builder sous le capot.

Bash


# SCRIPT TERMINAL POUR TON AGENT :
# Empaqueter l'application pour la production

# Toujours depuis le dossier tad-app
cd packages/tad-app

# Lancer la commande de distribution
yarn dist
# (Parfois configurée sous le nom 'yarn package' ou 'yarn build:release' selon le package.json)
Le résultat généré se trouvera dans un dossier packages/tad-app/dist/ (ou release/). Tu y trouveras ton binaire prêt à être installé avec ta nouvelle fonctionnalité "Join CSV" intégrée