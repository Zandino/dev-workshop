// Essai des échanges entre discussions (entre-discussions.mjs) par l'adresse locale /mcp, comme les appelle Codex ou
// Gemini : jetons, liste et lecture des discussions, message remis à une discussion libre (elle le traite d'elle-même)
// ou mis en attente si elle travaille, réponse renvoyée à l'envoyeuse, limite d'allers-retours, questions.
// Les discussions sont simulées (pilotes factices) : pas d'IA, pas de serveur complet.
//   node tests/entre-discussions.mjs
import http from 'node:http';
import { brancherDiscussions, outilsPour, suivreEvenement, repondreQuestion, oublierJetons } from '../serveur/entre-discussions.mjs';
import { servirMcp } from '../serveur/mcp-http.mjs';

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Discussions factices : un pilote qui « répond » après 50 ms, ou qui reste occupé tant qu'on ne le libère pas.
const sessions = new Map();
function discussion(id, titre, projet) {
  const s = { id, titre, projet, compte: 'faux', participants: null, etat: { occupe: false, ferme: false }, attente: new Set(), journal: [], recus: [] };
  s.emettre = (e) => {
    suivreEvenement(s, e);
    if (e.t === 'etat') Object.assign(s.etat, { ...e, t: undefined });
    if (e.t === 'permission') s.attente.add(e.id);
    if (e.t === 'permission_fin') s.attente.delete(e.id);
    s.journal.push(e);
  };
  s.retenir = false;
  s.finir = () => {
    s.emettre({ t: 'assistant', blocs: [{ type: 'texte', texte: `Réponse de ${titre}` }] });
    s.emettre({ t: 'etat', occupe: false });
  };
  s.pilote = {
    envoyer(texte) {
      s.recus.push(texte);
      s.emettre({ t: 'utilisateur', texte });
      s.emettre({ t: 'etat', occupe: true });
      if (!s.retenir) setTimeout(s.finir, 50);
    },
  };
  sessions.set(id, s);
  return s;
}
brancherDiscussions({ session: (id) => sessions.get(id) || null, toutes: () => [...sessions.values()], projetDe: (s) => s.projet, equipeDe: () => 'Faux' });

const A = discussion('aaaaaaaa-1111-4111-8111-111111111111', 'Alpha', 'projet-a');
const B = discussion('bbbbbbbb-2222-4222-8222-222222222222', 'Bêta', 'projet-b');

const serveur = http.createServer((req, res) => {
  if (!servirMcp(new URL(req.url, 'http://x').pathname, req, res)) res.writeHead(404).end();
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const adresse = `http://127.0.0.1:${serveur.address().port}/mcp`;

async function rpc(jeton, method, params = {}, entetes = {}) {
  const r = await fetch(adresse, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), ...entetes }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  return { statut: r.status, corps: r.status === 200 ? await r.json() : null };
}
const outil = async (jeton, name, args) => (await rpc(jeton, 'tools/call', { name, arguments: args })).corps?.result?.content?.[0]?.text || '';

// 1. Identité
const dwA = outilsPour({ type: 'codex' }, { session: A.id });
const dwB = outilsPour({ type: 'gemini' }, { session: B.id });
noter('une API sans outils n’en reçoit pas', outilsPour({ type: 'api' }, { session: A.id }) === null);
noter('sans jeton : refusé', (await rpc(null, 'tools/list')).statut === 401);
noter('mauvais jeton : refusé', (await rpc('faux', 'tools/list')).statut === 401);
noter('depuis une page web (Origin) : refusé', (await rpc(dwA.jeton, 'tools/list', {}, { Origin: 'http://localhost' })).statut === 403);
const init = await rpc(dwA.jeton, 'initialize', { protocolVersion: '2025-06-18', capabilities: {} });
noter('initialize', init.corps?.result?.serverInfo?.name === 'devworkshop' && init.corps.result.protocolVersion === '2025-06-18');
const noms = (await rpc(dwA.jeton, 'tools/list')).corps?.result?.tools?.map((x) => x.name) || [];
noter('outils listés (avec poser_question hors Claude)', ['discussions', 'lire_discussion', 'envoyer_message', 'poser_question'].every((n) => noms.includes(n)), noms.join(','));
noter('Claude : outils dans le serveur même', typeof outilsPour({ type: 'claude' }, { session: A.id }).claude() === 'object');

// 2. Voir et lire
const liste = await outil(dwA.jeton, 'discussions', {});
noter('A voit B (autre projet), pas elle-même', liste.includes('bbbbbbbb') && liste.includes('projet-b') && !liste.includes('aaaaaaaa'), liste);
B.journal.push({ t: 'utilisateur', texte: 'Le mot de passe du wifi est ailleurs.' });
noter('A lit B', (await outil(dwA.jeton, 'lire_discussion', { id: 'bbbbbbbb' })).includes('wifi'));
noter('id inconnu : message clair', (await outil(dwA.jeton, 'lire_discussion', { id: 'zzzzzzzz' })).includes('introuvable'));
noter('paramètres vérifiés', (await rpc(dwA.jeton, 'tools/call', { name: 'envoyer_message', arguments: { id: 'bbbbbbbb' } })).corps?.result?.isError === true);
noter('pas à soi-même', (await outil(dwA.jeton, 'envoyer_message', { id: 'aaaaaaaa', message: 'x' })).includes('propre'));

// 3. Message à une discussion libre : elle le traite, sa réponse revient à A.
const r1 = await outil(dwA.jeton, 'envoyer_message', { id: 'bbbbbbbb', message: 'Peux-tu vérifier le schéma ?' });
noter('remis et traité tout de suite', r1.includes('le traite maintenant'), r1);
await pause(300);
const vu = B.journal.find((e) => e.t === 'utilisateur' && e.de);
noter('B l’affiche signé de A, sans l’en-tête pour l’IA', vu?.de?.titre === 'Alpha' && vu.texte === 'Peux-tu vérifier le schéma ?');
noter('l’IA de B reçoit l’en-tête', B.recus.at(-1)?.startsWith('[Message d’une autre discussion'));
const retour = A.journal.find((e) => e.t === 'utilisateur' && e.de?.genre === 'reponse');
noter('la réponse de B revient à A et la relance', retour?.texte.includes('Réponse de Bêta') && A.recus.length === 1, JSON.stringify(retour));

// 4. Discussion occupée : en attente, puis remis quand elle se libère.
B.retenir = true;
B.emettre({ t: 'etat', occupe: true });
const r2 = await outil(dwA.jeton, 'envoyer_message', { id: 'bbbbbbbb', message: 'Deuxième demande' });
noter('occupée : mis en attente', r2.includes('occupée') && B.fileDiscussions.length === 1);
B.retenir = false;
B.emettre({ t: 'etat', occupe: false });
await pause(300);
noter('remis dès qu’elle est libre', B.recus.at(-1)?.includes('Deuxième demande') && !B.fileDiscussions.length);

// 5. Limite : une demande de la personne ouvre un échange ; A et B se relancent jusqu'à la limite.
A.emettre({ t: 'utilisateur', texte: 'Demande de la personne' }); // remet le compteur de A à zéro
let dernier = '';
let partis = 0;
for (let i = 0; i < 8; i += 1) {
  // Chaque message part pendant un tour de A causé par la réponse précédente (même échange).
  dernier = await outil(dwA.jeton, 'envoyer_message', { id: 'bbbbbbbb', message: `relance ${i}` });
  await pause(250);
  if (dernier.includes('Limite')) break;
  partis += 1;
}
noter('6 messages passent, le 7e est arrêté', partis === 6 && dernier.includes('Limite') && A.journal.some((e) => e.code === 'echange_limite'), `${partis} partis`);
A.emettre({ t: 'utilisateur', texte: 'La personne relance' });
noter('la personne relance : nouvel échange permis', (await outil(dwA.jeton, 'envoyer_message', { id: 'bbbbbbbb', message: 'reprise' })).includes('Message remis'));
await pause(300);

// 6. Question posée par une IA autre que Claude : fenêtre à l'écran, réponse en message.
const avant = B.recus.length;
const q = await outil(dwB.jeton, 'poser_question', { questions: [{ question: 'Quelle base ?', header: 'Base', options: [{ label: 'Postgres' }, { label: 'SQLite' }] }] });
const carte = B.journal.findLast((e) => e.t === 'permission');
noter('question affichée (carte AskUserQuestion, main levée)', q.includes('Termine ton tour') && carte?.outil === 'AskUserQuestion' && B.attente.has(carte.id));
noter('une autre permission n’est pas prise pour une question', repondreQuestion(B.id, 'autre-id', { decision: 'autoriser', reponses: {} }) === false);
noter('réponse reçue', repondreQuestion(B.id, carte.id, { decision: 'autoriser', reponses: { 'Quelle base ?': 'Postgres' } }) === true);
await pause(300);
noter('la réponse relance l’IA, attente levée', !B.attente.size && B.recus.length === avant + 1 && B.recus.at(-1).includes('Postgres'));

// 7. Discussion fermée : ses jetons ne valent plus.
oublierJetons(B.id);
noter('jetons oubliés à la fermeture', (await rpc(dwB.jeton, 'tools/list')).statut === 401);

serveur.close();
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
