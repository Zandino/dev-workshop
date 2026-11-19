// Pont de la page d'accueil (page locale du logiciel) : quelques fonctions, rien d'autre.
// La page du serveur, elle, n'a pas de pont du tout.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bureau', {
  textes: () => ipcRenderer.invoke('textes'),
  lister: () => ipcRenderer.invoke('serveurs:lister'),
  enregistrer: (saisie) => ipcRenderer.invoke('serveurs:enregistrer', saisie),
  supprimer: (id) => ipcRenderer.invoke('serveurs:supprimer', id),
  connecter: (id) => ipcRenderer.invoke('connecter', id),
  codeSource: () => ipcRenderer.invoke('code-source'),
  surAvancement: (rappel) => {
    ipcRenderer.removeAllListeners('avancement');
    ipcRenderer.on('avancement', (_e, m) => rappel(m));
  },
});
