Étape 3 : L'interface utilisateur et la Modale (React / tadviewer)
Tad utilise BlueprintJS pour son interface. Nous allons créer un composant de boîte de dialogue (Dialog) qui va écouter le signal d'Electron pour s'ouvrir, demander le fichier, et configurer les options de jointure (incluant tes excellentes idées sur le typage et les valeurs nulles).

3.1. Le composant React JoinCsvDialog
Demande à ton agent de créer un nouveau composant dans le package tadviewer.

Fichier cible approximatif : packages/tadviewer/src/components/JoinCsvDialog.tsx

TypeScript

// SCRIPT À DONNER À TON AGENT :
// Composant React / BlueprintJS pour la modale de jointure.

import React, { useState, useEffect } from 'react';
import { Dialog, Button, FormGroup, HTMLSelect, Checkbox, InputGroup, Classes } from '@blueprintjs/core';
// Import pour communiquer avec le process Main d'Electron
const { ipcRenderer } = window.require('electron'); 

interface JoinCsvDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyJoin: (joinConfig: any) => void;
  leftColumns: string[]; // Les colonnes du CSV actuellement ouvert dans Tad
}

export const JoinCsvDialog: React.FC<JoinCsvDialogProps> = ({ isOpen, onClose, onApplyJoin, leftColumns }) => {
  const [rightFilePath, setRightFilePath] = useState<string>('');
  const [joinType, setJoinType] = useState<string>('LEFT');
  const [leftCol, setLeftCol] = useState<string>('');
  const [rightCol, setRightCol] = useState<string>('');
  
  // Tes ajouts pour la robustesse !
  const [forceStringCast, setForceStringCast] = useState<boolean>(true); // Vrai par défaut, plus sûr
  const [nullString, setNullString] = useState<string>('');
  
  // Optionnel mais recommandé : Un état pour stocker les colonnes lues depuis le 2ème CSV
  const [rightColumns, setRightColumns] = useState<string[]>([]);

  const handleBrowse = async () => {
    // Appel IPC pour ouvrir la fenêtre de sélection native (Étape 2)
    const filePath = await ipcRenderer.invoke('dialog:selectCsvForJoin');
    if (filePath) {
      setRightFilePath(filePath);
      // NOTE POUR L'AGENT : Ici, il faudrait idéalement faire un appel IPC/reltab 
      // pour lire la première ligne (headers) du fichier filePath et populer setRightColumns.
      // Pour l'instant on laisse l'utilisateur l'écrire si on ne fait pas l'appel.
    }
  };

  const handleSubmit = () => {
    onApplyJoin({
      rightTablePath: rightFilePath,
      joinType,
      leftCol,
      rightCol: rightCol || leftCol, // Par défaut, même nom de colonne
      forceStringCast,
      nullString: nullString.trim() !== '' ? nullString : undefined
    });
    onClose();
  };

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Join CSV Data" className="join-csv-dialog">
      <div className={Classes.DIALOG_BODY}>
        {/* Sélection du fichier */}
        <FormGroup label="Second CSV File">
          <div style={{ display: 'flex', gap: '10px' }}>
            <InputGroup readOnly value={rightFilePath} placeholder="Select file..." flex="1" />
            <Button text="Browse..." onClick={handleBrowse} />
          </div>
        </FormGroup>

        {/* Configuration des colonnes */}
        <FormGroup label="Match Column (Current File)">
          <HTMLSelect value={leftCol} onChange={e => setLeftCol(e.target.value)} fill>
             <option value="">Select a column...</option>
             {leftColumns.map(c => <option key={c} value={c}>{c}</option>)}
          </HTMLSelect>
        </FormGroup>
        
        <FormGroup label="Match Column (New CSV File)">
           <InputGroup 
             value={rightCol} 
             onChange={e => setRightCol(e.target.value)} 
             placeholder="Type column name (e.g. id)" 
           />
        </FormGroup>

        {/* Type de Jointure */}
        <FormGroup label="Join Type">
          <HTMLSelect value={joinType} onChange={e => setJoinType(e.target.value)} fill>
            <option value="INNER">INNER JOIN (Match both)</option>
            <option value="LEFT">LEFT JOIN (Keep all from current)</option>
            <option value="RIGHT">RIGHT JOIN (Keep all from new)</option>
            <option value="FULL">FULL OUTER JOIN</option>
          </HTMLSelect>
        </FormGroup>

        {/* Options Avancées (Robustesse) */}
        <FormGroup label="Advanced Options (Data Integrity)">
          <Checkbox 
            checked={forceStringCast} 
            onChange={e => setForceStringCast(e.target.checked)}
            label="Force cast keys to Text/String (prevents type mismatch crashes)"
          />
          <InputGroup 
            value={nullString} 
            onChange={e => setNullString(e.target.value)} 
            placeholder="Consider this string as NULL (e.g. N/A, Null, -)" 
          />
        </FormGroup>
      </div>
      <div className={Classes.DIALOG_FOOTER}>
        <div className={Classes.DIALOG_FOOTER_ACTIONS}>
          <Button onClick={onClose}>Cancel</Button>
          <Button intent="primary" onClick={handleSubmit} disabled={!rightFilePath || !leftCol}>Join Data</Button>
        </div>
      </div>
    </Dialog>
  );
};