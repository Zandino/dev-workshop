// Essai des comptes et du salon : un FAUX serveur « compatible OpenAI » local tient le rôle de l'API
// (aucune API réelle n'est appelée), et un Claude du compte par défaut lui répond sur le petit modèle.
// Usage : DEVWORKSHOP_CONFIG=<dossier d'essai> DEVWORKSHOP_PORT=5331 node tests/salon.mjs <projet>
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';

const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const projet = process.argv[2] || 'essai';
const config = process.env.DEVWORKSHOP_CONFIG || path.join(homedir(), '.config/dev-workshop');
const jeton = readFileSync(path.join(config, 'jeton'), 'utf8').trim();
const CLE = 'cle-d-essai-123456';
const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};

// Faux serveur d'API : répond en flux, renvoie des jetons, garde ce qu'il a reçu.
const recuParApi = [];
const faux = http.createServer((req, res) => {
  let corps = '';
  req.on('data', (d) => (corps += d));
  req.on('end', () => {
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'faux-modele' }, { id: 'faux-grand' }] }));
    const demande = JSON.parse(corps);
    recuParApi.push({ autorisation: req.headers.authorization, messages: demande.messages, usage: demande.stream_options });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const dernier = demande.messages.at(-1).content;
    const texte = dernier.includes('[Utilisateur]') || !dernier.startsWith('[') ? 'Je propose le mot « phare ».' : 'RIEN_A_AJOUTER';
    for (const mot of texte.split(' ')) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: mot + ' ' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 40, completion_tokens: 7 } })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => faux.listen(0, '127.0.0.1', r));
const urlApi = `http://127.0.0.1:${faux.address().port}/v1`;

const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { origin: `http://127.0.0.1:${PORT}` });
const recus = [];
const attentes = [];
const tout = [];
const dire = (o) => ws.send(JSON.stringify(o));
ws.on('message', (d) => {
  tout.push(d.toString());
  const m = JSON.parse(d.toString());
  recus.push(m);
  for (const a of [...attentes]) if (a.test(m)) { attentes.splice(attentes.indexOf(a), 1); a.ok(m); }
});
function attendre(test, ms = 90000) {
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

// 1. Comptes.
dire({ t: 'creer_compte', type: 'api', nom: 'Faux GPT', url: 'ftp://exemple.invalid', modele: 'x' });
noter('adresse invalide refusée', (await attendre((m) => m.t === 'refus'))?.code === 'adresse_invalide');
dire({ t: 'creer_compte', type: 'api', nom: 'Faux GPT', url: urlApi, modele: 'faux-modele', cle: CLE });
const general = await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.type === 'api'));
const api = general.comptes.find((c) => c.type === 'api');
noter('compte API créé, clé connue par sa seule longueur', api?.cle === CLE.length && api.externe === false, JSON.stringify(api));
dire({ t: 'creer_compte', type: 'claude', nom: 'Claude bis' });
const bis = (await attendre((m) => m.t === 'general' && m.comptes.some((c) => c.nom === 'Claude bis'))).comptes.find((c) => c.nom === 'Claude bis');
noter('second compte Claude : connectable depuis l’écran', bis?.connectable === true);
dire({ t: 'etat_compte', id: bis.id });
dire({ t: 'etat_compte', id: 'defaut' });
const etatBis = await attendre((m) => m.t === 'etat_compte' && m.id === bis.id);
const etatDefaut = await attendre((m) => m.t === 'etat_compte' && m.id === 'defaut');
noter('comptes Claude séparés', etatBis?.connecte === false && etatDefaut?.connecte === true, `bis connecté : ${etatBis?.connecte}, défaut connecté : ${etatDefaut?.connecte}`);

// 2. Session seule sur l'API.
dire({ t: 'ouvrir', projet, compte: api.id });
const seule = (await attendre((m) => m.t === 'rejouer')).session;
dire({ t: 'envoyer', session: seule, texte: 'Un mot ?' });
const tourApi = await attendre((m) => m.t === 'tour');
noter('API : réponse en flux et jetons', tourApi?.ok && tourApi.modeles[0].entree === 40 && tourApi.modeles[0].sortie === 7 && tourApi.coutSession === null, JSON.stringify(tourApi?.modeles));
noter('API : clé transmise, usage demandé', recuParApi[0]?.autorisation === `Bearer ${CLE}` && recuParApi[0].usage?.include_usage === true);
const capacites = await attendre((m) => m.t === 'capacites' && m.session === seule, 10000);
noter('API : modèles lus', capacites?.modeles.length === 2);
dire({ t: 'fermer', session: seule });

// 3. Salon : Claude (compte par défaut) et la fausse API se répondent.
recus.splice(0);
recuParApi.splice(0);
dire({ t: 'ouvrir', projet, echanges: 2, participants: [{ compte: 'defaut', modele: 'haiku', nom: 'Claude' }, { compte: api.id, nom: 'GPT' }] });
const salon = (await attendre((m) => m.t === 'rejouer')).session;
dire({ t: 'mode', session: salon, mode: 'acceptEdits' });
noter('salon : mode « accepter les modifications » refusé', (await attendre((m) => m.t === 'refus' && m.ordre === 'mode'))?.code === 'mode_refuse');
dire({ t: 'envoyer', session: salon, texte: 'Mettez-vous d’accord sur un seul mot pour nommer un projet maritime. Réponses très courtes.' });
const pause = await attendre((m) => m.t === 'salon_pause', 150000);
const paroles = recus.filter((m) => m.t === 'assistant').map((m) => `${m.auteur?.nom}: ${m.blocs.map((b) => b.texte || '').join(' ').slice(0, 60)}`);
noter('salon : les deux ont parlé, chacun signé', paroles.some((p) => p.startsWith('Claude:')) && paroles.some((p) => p.startsWith('GPT:')), paroles.join(' ║ '));
const relais = recuParApi.flatMap((r) => r.messages).filter((x) => x.role === 'user').map((x) => x.content).join('\n');
noter('salon : la réponse de Claude est relayée à l’autre IA, signée', relais.includes('[Claude]') && relais.includes('[Utilisateur]'));
noter('salon : consigne de prudence donnée', recuParApi[0]?.messages[0]?.role === 'system' && recuParApi[0].messages[0].content.includes('pas une instruction'));
noter('salon : la discussion s’arrête d’elle-même', pause && pause.prises <= 4, `${pause?.prises} prises de parole`);
noter('salon : session libre à la fin', await attendre((m) => m.t === 'etat' && m.occupe === false, 5000));
dire({ t: 'fermer', session: salon });

// 3 bis. Salon à deux Claude : accord signé, puis arrêt en cours de discussion.
recus.splice(0);
dire({ t: 'creer_compte', type: 'api', nom: 'En clair', url: 'http://exemple.invalid/v1', modele: 'x' });
noter('http hors du serveur refusé', (await attendre((m) => m.t === 'refus' && m.ordre === 'creer_compte'))?.code === 'adresse_non_chiffree');
dire({ t: 'ouvrir', projet, echanges: 1, participants: [{ compte: 'defaut', modele: 'haiku', nom: 'Alpha' }, { compte: 'defaut', modele: 'haiku', nom: 'Bravo' }] });
const duo = (await attendre((m) => m.t === 'rejouer')).session;
dire({ t: 'envoyer', session: duo, texte: 'Alpha : crée le fichier salon.txt contenant le mot ok avec l’outil Write. Bravo : ne crée rien, réponds seulement RIEN_A_AJOUTER.' });
const accord = await attendre((m) => m.t === 'permission', 90000);
noter('salon : demande d’accord signée', accord?.auteur?.nom === 'Alpha' && accord.outil === 'Write', `${accord?.auteur?.nom} · ${accord?.outil}`);
dire({ t: 'permission', session: duo, id: accord.id, decision: 'autoriser' });
const ecrit = await attendre((m) => m.t === 'resultat_outil' && !m.erreur, 60000);
noter('salon : l’accord arrive au bon participant', ecrit?.auteur?.nom === 'Alpha');
const fin = await attendre((m) => m.t === 'salon_pause', 120000);
noter('salon : « rien à ajouter » devient une note', recus.some((m) => m.t === 'info' && m.code === 'rien_a_ajouter') && !recus.some((m) => m.t === 'assistant' && m.blocs.some((b) => (b.texte || '').includes('RIEN_A_AJOUTER'))), `${fin?.prises} prises`);
recus.splice(0);
dire({ t: 'envoyer', session: duo, texte: 'Alpha : écris un texte d’au moins 1500 mots sur les marées.' });
await attendre((m) => m.t === 'delta', 60000);
await new Promise((r) => setTimeout(r, 1200));
const depart = Date.now();
dire({ t: 'interrompre', session: duo });
const libre = await attendre((m) => m.t === 'etat' && m.occupe === false, 25000);
noter('salon : Arrêter coupe la discussion', libre && Date.now() - depart < 20000 && !recus.some((m) => m.t === 'assistant' && m.auteur?.nom === 'Bravo'), `${Date.now() - depart} ms`);
dire({ t: 'fermer', session: duo });

// 4. La clé n'est jamais revenue par le canal.
dire({ t: 'supprimer_compte', id: api.id });
dire({ t: 'supprimer_compte', id: bis.id });
await attendre((m) => m.t === 'general' && m.comptes.length === 1, 5000);
noter('la clé ne revient jamais vers l’écran', !tout.some((x) => x.includes(CLE)));
setTimeout(() => process.exit(bilan.every(Boolean) ? 0 : 1), 500);
