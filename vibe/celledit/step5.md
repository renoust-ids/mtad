# Étape 5 : Build et validation E2E

## Objectif
Effectuer le build complet de production, tester dans l'application packaged, et valider tous les cas d'usage de la fonctionnalité d'édition de cellule.

## 5.1 Build complet

```bash
# Rebuild des packages modifiés
cd packages/reltab && npx tsc -p tsconfig-build.json
cd ../../packages/tadviewer && npx webpack --mode production
cd ../tad-app && npm run build-assets && npx webpack --mode production
```

## 5.2 Test local avec run.sh

```bash
./run.sh
```

### Scénarios de test

#### Test 1 : Double-clic basique
1. Ouvrir `customers.csv`
2. Double-cliquer sur la cellule "Alice" (colonne name)
3. → La modale s'ouvre avec "Alice" pré-rempli
4. Modifier en "Alice Modified"
5. Cliquer Save → console log "Would commit: ...", modale se ferme

#### Test 2 : Validation type integer
1. Double-cliquer sur une cellule numérique (ex: age)
2. Saisir "abc" → message d'erreur "Must be an integer", Save désactivé
3. Saisir "42" → erreur disparaît, Save activé
4. Saisir "3.14" → erreur (pas un entier)

#### Test 3 : Validation type boolean
1. Double-cliquer sur une colonne booléenne (si disponible)
2. Saisir "maybe" → erreur "Must be true/false, 1/0, or yes/no"
3. Saisir "true" → OK

#### Test 4 : Cancel
1. Double-cliquer, modifier la valeur
2. Cliquer Cancel → la modale se ferme, la valeur originale est préservée

#### Test 5 : Colonne système
1. Double-cliquer sur la colonne `_pivot` → rien ne se passe
2. Double-cliquer sur une en-tête de colonne → rien ne se passe

#### Test 6 : Ligne d'agrégat (avec pivot)
1. Ajouter un pivot (ex: grouper par une colonne)
2. Double-cliquer sur une ligne d'agrégat (ligne parent)
3. → Message "Aggregated value" + Save désactivé

#### Test 7 : Ligne feuille sous pivot
1. Avec un pivot actif, double-cliquer sur une ligne feuille
2. → Message "Pivoted view active" + Save activé (simulation)

## 5.3 Test du packaged app

```bash
cd packages/tad-app
npx electron-builder --mac dir --arm64 --publish=never
```

Lancer le `.app` généré et répéter les tests 1-4.

## 5.4 Checklist de validation

- [ ] Double-clic ouvre la modale sur cellule data
- [ ] Double-clic ne fait rien sur colonnes système
- [ ] Double-clic ne fait rien sur lignes d'agrégat (modale fermée ou Save désactivé)
- [ ] Validation integer fonctionne
- [ ] Validation real fonctionne
- [ ] Validation boolean fonctionne
- [ ] Validation date fonctionne
- [ ] Validation timestamp fonctionne
- [ ] Validation string (pas de restriction)
- [ ] Message d'erreur affiché sous le champ
- [ ] Save désactivé si valeur invalide
- [ ] Cancel ferme la modale sans modifier
- [ ] Save log la simulation et ferme la modale
- [ ] Avertissement pivot affiché pour lignes feuille
- [ ] Message "Aggregated value" pour lignes agrégat
- [ ] Pas d'erreur console

## Validation finale
Commit : `feat(tadviewer): E2E validation of cell editing UI`
