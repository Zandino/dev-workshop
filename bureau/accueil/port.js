// Petite fenêtre « Aperçu d'un port du serveur » : le port saisi part au logiciel, qui ouvre tunnel et fenêtre.
'use strict';
const textes = window.apercuPort.textes();
const $ = (id) => document.getElementById(id);
$('titre').textContent = textes.port_titre || '';
$('aide').textContent = textes.port_aide || '';
$('ouvrir').textContent = textes.port_ouvrir || 'OK';
$('formulaire').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('ouvrir').disabled = true;
  $('erreur').hidden = true;
  const r = await window.apercuPort.ouvrir($('port').value.trim());
  $('ouvrir').disabled = false;
  if (!r.ok) {
    $('erreur').textContent = r.erreur || '';
    $('erreur').hidden = false;
  }
});
