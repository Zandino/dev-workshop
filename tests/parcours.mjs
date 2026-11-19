// Parcours complet par WebSocket : refus sans jeton, ouverture, saisie, flux, permission, compteurs.
// Usage : DEVWORKSHOP_PORT=5331 node tests/parcours.mjs <projet>   (le serveur doit tourner sur ce port)
// Un seul tour sur le petit modèle, pour ménager les crédits.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const projet = process.argv[2] || 'essai';
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const url = `ws://127.0.0.1:${PORT}/ws`;
const origine = `http://127.0.0.1:${PORT}`;
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(ok);
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};

function fermeture(options, premier) {
  return new Promise((resoudre) => {
    const ws = new WebSocket(url, options);
    ws.on('open', () => premier && ws.send(JSON.stringify(premier)));
    ws.on('close', (code) => resoudre(code));
    ws.on('error', () => resoudre('refus'));
    ws.on('unexpected-response', (_q, r) => resoudre(r.statusCode));
    setTimeout(() => resoudre('ouvert'), 3000);
  });
}

noter('origine étrangère refusée', (await fermeture({ origin: 'http://exemple.invalid' })) === 403);
noter('sans origine refusé', (await fermeture({})) === 403);
noter('mauvais jeton refusé', (await fermeture({ origin: origine }, { t: 'bonjour', jeton: 'faux' })) === 4401);
noter('ordre avant jeton refusé', (await fermeture({ origin: origine }, { t: 'general' })) === 4401);

const ws = new WebSocket(url, { origin: origine });
const vus = {};
let sessionId = null;
let fini;
const termine = new Promise((r) => (fini = r));
const dire = (o) => ws.send(JSON.stringify(o));

ws.on('open', () => dire({ t: 'bonjour', jeton }));
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  vus[m.t] = (vus[m.t] || 0) + 1;
  if (m.t === 'general' && !sessionId && vus.general === 1) {
    noter('état général reçu', m.projets.includes(projet), `${m.projets.length} projet(s)`);
    dire({ t: 'ouvrir', projet: '../..', modele: 'haiku' });
    dire({ t: 'ouvrir', projet, modele: 'haiku', mode: 'default' });
  }
  if (m.t === 'refus' && m.ordre === 'ouvrir') noter('dossier hors racine refusé', m.code === 'dossier_hors_racine', m.code);
  if (m.t === 'rejouer') {
    sessionId = m.session;
    dire({ t: 'mode', session: sessionId, mode: 'bypassPermissions' });
    dire({ t: 'envoyer', session: sessionId, texte: 'Crée le fichier essai.txt contenant le mot bonjour, puis réponds « fait ».' });
  }
  if (m.t === 'refus' && m.ordre === 'mode') noter('mode sans garde-fou refusé', m.code === 'mode_refuse');
  if (m.t === 'capacites') noter('modèles et commandes reçus', m.modeles.length > 0 && m.commandes.length > 0, `${m.modeles.length} modèles, ${m.commandes.length} commandes`);
  if (m.t === 'permission') {
    noter('demande de permission reçue', Boolean(m.outil), `${m.outil}, « toujours » proposé : ${m.toujours}`);
    dire({ t: 'permission', session: sessionId, id: m.id, decision: 'autoriser' });
  }
  if (m.t === 'tour') {
    const u = m.modeles[0] || {};
    noter('fin de tour avec compteurs', m.ok && u.sortie > 0 && m.coutSession !== null, `entrée ${u.entree}, sortie ${u.sortie}, cache lu ${u.cacheLu}, fenêtre ${u.fenetre}`);
    setTimeout(fini, 2500);
  }
  if (m.t === 'erreur') noter('erreur du fournisseur', false, m.message);
});
setTimeout(fini, 150000);
await termine;

noter('flux en direct', vus.delta > 0, `${vus.delta || 0} fragments`);
noter('résultat d’outil relayé', vus.resultat_outil > 0);
noter('usage du contexte reçu', vus.contexte > 0);

// Reconnexion : le journal doit se rejouer sans les fragments.
const rejoue = await new Promise((resoudre) => {
  const b = new WebSocket(url, { origin: origine });
  b.on('open', () => b.send(JSON.stringify({ t: 'bonjour', jeton })));
  b.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.t === 'general') b.send(JSON.stringify({ t: 'attacher', session: sessionId }));
    if (m.t === 'rejouer') { resoudre(m); b.close(); }
  });
  setTimeout(() => resoudre(null), 5000);
});
noter('journal rejoué à la reconnexion', Boolean(rejoue?.evenements.some((e) => e.t === 'assistant')) && !rejoue.evenements.some((e) => e.t === 'delta'), `${rejoue?.evenements.length} événements`);

dire({ t: 'fermer', session: sessionId });
setTimeout(() => {
  console.log('Événements vus :', JSON.stringify(vus));
  process.exit(bilan.every(Boolean) ? 0 : 1);
}, 800);
