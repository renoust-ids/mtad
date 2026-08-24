Étape 1 : Le cœur de donnée (Backend reltab & reltab-duckdb)
Dans Tad, le package reltab construit un "Arbre de Syntaxe Abstraite" (AST) des requêtes, qui est ensuite traduit en SQL par reltab-duckdb.

1.1. Étendre l'AST de reltab pour supporter le JOIN
Demande à ton agent de modifier le constructeur de requêtes dans packages/reltab.

Fichier cible approximatif : packages/reltab/src/QueryExp.ts (ou fichier gérant l'algèbre relationnelle)


// SCRIPT À DONNER À TON AGENT :
// Ajout de la définition d'une opération de jointure dans reltab.

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'OUTER';

export interface JoinArgs {
  rightTablePath: string; // Le chemin du 2ème CSV
  joinType: JoinType;
  leftCol: string;        // Colonne du 1er CSV
  rightCol: string;       // Colonne du 2ème CSV
  forceStringCast: boolean; // TRUE pour forcer la conversion en texte et éviter les crashs de typage
  nullString?: string;    // ex: "N/A", "NULL", ou "" pour préciser les valeurs nulles
}

// Dans la classe QueryExp ou équivalent :
export class QueryExp {
  // ... code existant ...

  // Nouvelle méthode pour ajouter l'étape de jointure à la requête courante
  joinCsv(args: JoinArgs): QueryExp {
    return new QueryExp({
      expType: 'JoinCsv',
      args,
      parent: this
    });
  }
}



1.2. Traduire cette opération en SQL DuckDB
Maintenant, il faut dire au driver DuckDB comment interpréter cette nouvelle étape et générer le SQL, en prenant en compte ta remarque sur le typage et les valeurs nulles.

Fichier cible approximatif : packages/reltab-duckdb/src/DuckDBDialect.ts (ou le générateur SQL)

// SCRIPT À DONNER À TON AGENT :
// Traduction du noeud JoinCsv en SQL natif DuckDB

function generateJoinSql(leftSql: string, args: JoinArgs): string {
  // 1. Préparation de la lecture du 2ème CSV avec gestion des NULL
  let readCsvOptions = "header=True";
  if (args.nullString) {
    // Si l'utilisateur précise ce qu'est une valeur nulle
    readCsvOptions += `, nullstr='${args.nullString}'`;
  }
  const rightTableSql = `read_csv_auto('${args.rightTablePath}', ${readCsvOptions})`;

  // 2. Gestion du typage (ta remarque pertinente !)
  // On cast systématiquement en VARCHAR (chaîne) si forceStringCast est vrai
  const leftColRef = args.forceStringCast ? `CAST(t1."${args.leftCol}" AS VARCHAR)` : `t1."${args.leftCol}"`;
  const rightColRef = args.forceStringCast ? `CAST(t2."${args.rightCol}" AS VARCHAR)` : `t2."${args.rightCol}"`;

  // 3. Construction de la requête SQL finale
  // On wrap la requête précédente (leftSql) dans une CTE ou une sous-requête
  const sql = `
    SELECT * 
    FROM (${leftSql}) AS t1
    ${args.joinType} JOIN ${rightTableSql} AS t2
    ON ${leftColRef} = ${rightColRef}
  `;

  return sql;
}