// Pont de la petite fenêtre « Aperçu d'un port » : une seule fonction, envoyer le port choisi.
const { contextBridge, ipcRenderer } = require('electron');

const parametres = new URLSearchParams(location.search);
contextBridge.exposeInMainWorld('apercuPort', {
  textes: () => JSON.parse(parametres.get('textes') || '{}'),
  ouvrir: (port) => ipcRenderer.invoke(parametres.get('canal'), port),
});
