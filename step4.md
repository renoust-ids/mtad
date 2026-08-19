Étape 4 : L'orchestration et l'Application de la requête
Il faut maintenant écouter le menu Electron (start-csv-join), afficher la modale, et appliquer la requête quand l'utilisateur clique sur "Join Data".
Dans Tad, le composant principal (souvent AppPane ou TadApp) gère la vue actuelle.

4.1. Connecter l'UI et la logique métier
Fichier cible approximatif : packages/tadviewer/src/components/AppPane.tsx (ou composant racine de la vue)

// SCRIPT À DONNER À TON AGENT :
// Câblage de l'évènement menu, de la modale et de l'AST reltab.

import { JoinCsvDialog } from './JoinCsvDialog';
// ... autres imports ...

// Dans le composant principal (React) :

const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);

useEffect(() => {
  // Écouter le signal depuis le menu "File > Join CSV..." (Étape 2)
  const handleStartJoin = () => setIsJoinDialogOpen(true);
  
  ipcRenderer.on('start-csv-join', handleStartJoin);
  return () => {
    ipcRenderer.removeListener('start-csv-join', handleStartJoin);
  };
}, []);

const handleApplyJoin = (joinConfig) => {
  // 1. Récupérer la requête actuelle de la vue (Tad state management)
  // viewParams.query contient l'objet QueryExp courant
  const currentQuery = viewParams.query; 

  // 2. Créer la nouvelle requête en ajoutant l'étape de jointure
  // (Appel de la méthode joinCsv qu'on a créée à l'Étape 1)
  const newQuery = currentQuery.joinCsv(joinConfig);

  // 3. Mettre à jour l'état de l'application. 
  // Tad va automatiquement envoyer cette 'newQuery' à reltab-duckdb,
  // qui va générer le SQL, l'exécuter, et rafraîchir la grille !
  actions.updateQuery(newQuery); // Fonction fictive, utiliser l'équivalent dans le store/contexte de Tad.
};

// Dans le render() / return du composant :
return (
  <>
    {/* Le reste de l'interface Tad (SlickGrid, etc.) */}
    
    <JoinCsvDialog 
      isOpen={isJoinDialogOpen} 
      onClose={() => setIsJoinDialogOpen(false)} 
      onApplyJoin={handleApplyJoin}
      leftColumns={currentSchema.columns.map(c => c.columnId)} // Passer les colonnes de la vue actuelle
    />
  </>
);

