// Essai de la connexion par compte : chaque flux officiel est lancé jusqu'à l'apparition du lien, puis annulé.
// Aucune connexion n'est menée à son terme ici (il faut une personne et son compte) ; aucun appel au modèle.
// Le lien et le code ne sont jamais affichés par cet essai : seulement l'hôte et la longueur.
// Usage : DEVWORKSHOP_CONFIG=<dossier d'essai> DEVWORKSHOP_PORT=5331 node tests/connexion.mjs <projet>
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const projet = process.argv[2] || 'essai';
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop'), 'jeton'), 'utf8').trim();
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { origin: `http://127.0.0.1:${PORT}` });
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const recus = [];
const attentes = [];
const dire = (o) => ws.send(JSON.stringify(o));
ws.on('message', (d) => {
  const m = JSON.parse(d.toString());
  recus.push(m);
  for (const a of [...attentes]) if (a.test(m)) { attentes.splice(attentes.indexOf(a), 1); a.ok(m); }
});
function attendre(test, ms = 40000) {
  const i = recus.findIndex(test);
  if (i >= 0) return Promise.resolve(recus.splice(i, 1)[0]);
  return new Promise((ok) => {
    const a = { test, ok: (m) => { recus.splice(recus.indexOf(m), 1); ok(m); } };
    attentes.push(a);
    setTimeout(() => ok(null), ms);
  });
}

await new Promise((r) => ws.on('open', r));
dire({ t: 'bonjour', jeton });
await attendre((m) => m.t === 'general');

dire({ t: 'connecter_compte', id: 'defaut' });
noter('compte du serveur : connexion refusée', (await attendre((m) => m.t === 'refus'))?.code === 'connexion_refusee');

const HOTES = { claude: /claude\.(ai|com)$|anthropic\.com$/, codex: /openai\.com$/, gemini: /^accounts\.google\.com$/ };
const comptes = {};
for (const type of ['claude', 'codex', 'gemini']) {
  dire({ t: 'creer_compte', type, nom: `Essai ${type}` });
  const g = await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === `Essai ${type}`));
  const c = (comptes[type] = g.comptes.find((x) => x.nom === `Essai ${type}`));
  noter(`${type} : compte créé, connectable`, c.connectable === true && !JSON.stringify(c).includes('/'));

  dire({ t: 'etat_compte', id: c.id });
  const etat = await attendre((m) => m.t === 'etat_compte' && m.id === c.id, 60000);
  noter(`${type} : vu comme non connecté`, etat?.connecte === false);

  dire({ t: 'connecter_compte', id: c.id });
  const lien = await attendre((m) => m.t === 'connexion' && m.id === c.id, 45000);
  let hote = '';
  try { hote = new URL(lien?.url).hostname; } catch { /* pas de lien */ }
  const detail = `hôte ${hote || '?'}, lien de ${lien?.url?.length || 0} caractères, code ${lien?.code ? 'fourni (' + lien.code.length + ' car.)' : 'non'}, saisie attendue : ${lien?.saisie}`;
  noter(`${type} : lien de connexion reçu`, lien?.etape === 'lien' && HOTES[type].test(hote) && lien.url.length > 20, detail);
  if (type === 'codex') noter('codex : code à saisir sur la page fourni', /^[A-Z0-9]{4}-[A-Z0-9]{4,5}$/.test(lien?.code || ''));

  if (type !== 'codex') {
    // Un faux code collé doit atteindre l'outil et finir en échec, jamais en réussite ni en silence.
    dire({ t: 'code_connexion', id: c.id, code: 'faux-code-000' });
    const refus = await attendre((m) => m.t === 'connexion' && m.id === c.id, 45000);
    noter(`${type} : faux code refusé par l’outil, redemandé à l’écran`, refus?.etape === 'lien' && refus.refuse === true, refus ? `${refus.etape}, refus signalé : ${refus.refuse}` : 'aucune réponse');
    if (type === 'claude') {
      // Un code bien formé mais faux : l'outil termine en échec, jamais en réussite.
      dire({ t: 'code_connexion', id: c.id, code: 'abcdefgh#ijklmnop' });
      const fin = await attendre((m) => m.t === 'connexion' && m.id === c.id && m.etape !== 'lien', 45000);
      noter('claude : code faux mais bien formé → échec', fin?.etape === 'echec');
      dire({ t: 'connecter_compte', id: c.id });
      await attendre((m) => m.t === 'connexion' && m.id === c.id && m.etape === 'lien', 45000);
    }
  }
  dire({ t: 'annuler_connexion', id: c.id });
  const fin = await attendre((m) => m.t === 'connexion' && m.id === c.id && m.etape !== 'lien', 15000);
  noter(`${type} : annulation`, fin?.etape === 'echec' && fin.motif === 'annulee');
}

// Une session sur un compte non connecté le dit clairement, sans rester bloquée.
for (const type of ['codex', 'gemini']) {
  recus.splice(0);
  dire({ t: 'ouvrir', projet, compte: comptes[type].id });
  const session = (await attendre((m) => m.t === 'rejouer')).session;
  dire({ t: 'envoyer', session, texte: 'Bonjour' });
  const tour = await attendre((m) => m.t === 'tour', 60000);
  noter(`${type} : session sans connexion refusée proprement`, tour && tour.ok === false, tour?.message);
  noter(`${type} : session libre ensuite`, await attendre((m) => m.t === 'etat' && m.occupe === false, 8000));
  // Second envoi, bien après l'échec du démarrage : même réponse, jamais de session figée.
  recus.splice(0);
  dire({ t: 'envoyer', session, texte: 'Encore' });
  const second = await attendre((m) => m.t === 'tour', 15000);
  noter(`${type} : second envoi refusé aussi, sans blocage`, second?.ok === false && (await attendre((m) => m.t === 'etat' && m.occupe === false, 8000)));
  dire({ t: 'fermer', session });
}

// Discussion à plusieurs avec un participant non connecté : elle s'arrête sans attendre indéfiniment.
recus.splice(0);
noter('codex et gemini marqués externes', comptes.codex.externe === true && comptes.gemini.externe === true);
dire({ t: 'ouvrir', projet, echanges: 1, participants: [{ compte: comptes.codex.id, nom: 'GPT' }, { compte: comptes.gemini.id, nom: 'Gemini' }] });
const salon = (await attendre((m) => m.t === 'rejouer')).session;
dire({ t: 'envoyer', session: salon, texte: 'Bonjour à tous' });
const pause = await attendre((m) => m.t === 'salon_pause', 60000);
noter('salon avec participant non connecté : arrêt propre', pause && (await attendre((m) => m.t === 'etat' && m.occupe === false, 8000)), `${pause?.prises} prise(s) de parole`);
dire({ t: 'fermer', session: salon });

// LM Studio sur un poste du réseau local : http accepté, non marqué « externe ».
dire({ t: 'creer_compte', type: 'api', nom: 'LM Studio', url: 'http://192.168.1.50:1234/v1', modele: 'modele-local' });
const lm = (await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === 'LM Studio')))?.comptes.find((c) => c.nom === 'LM Studio');
noter('LM Studio sur le réseau local accepté', lm && lm.externe === false);

for (const c of [...Object.values(comptes), lm]) dire({ t: 'supprimer_compte', id: c.id });
setTimeout(() => process.exit(bilan.every(Boolean) ? 0 : 1), 800);
