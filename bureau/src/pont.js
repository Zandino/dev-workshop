// Pont de la page d'accueil (page locale du logiciel) : quelques fonctions, rien d'autre.
// La page du serveur, elle, n'a pas de pont du tout.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bureau', {
  textes: () => ipcRenderer.invoke('textes'),
  lister: () => ipcRenderer.invoke('serveurs:lister'),
  enregistrer: (saisie) => ipcRenderer.invoke('serveurs:enregistrer', saisie),
  supprimer: (id) => ipcRenderer.invoke('serveurs:supprimer', id),
  connecter: (id) => ipcRenderer.invoke('connecter', id),
  installer: (id, auto) => ipcRenderer.invoke('installer', id, auto === true),
  guide: {
    cle: () => ipcRenderer.invoke('guide:cle'),
    creerCle: () => ipcRenderer.invoke('guide:creer_cle'),
    commande: (acces) => ipcRenderer.invoke('guide:commande', acces),
    deposer: (acces) => ipcRenderer.invoke('guide:deposer', acces),
    tester: (acces) => ipcRenderer.invoke('guide:tester', acces),
  },
  codeSource: () => ipcRenderer.invoke('code-source'),
  majAuto: () => ipcRenderer.invoke('majs:lire'),
  definirMajAuto: (oui) => ipcRenderer.invoke('majs:definir', oui === true),
  confidentialite: () => ipcRenderer.invoke('confidentialite'),
  surAvancement: (rappel) => {
    ipcRenderer.removeAllListeners('avancement');
    ipcRenderer.on('avancement', (_e, m) => rappel(m));
  },
});
