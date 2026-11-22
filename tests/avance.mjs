// Essais avancés par WebSocket : question de Claude, arrêt en cours de tour, cumul des compteurs, reprise.
// Usage : DEVWORKSHOP_PORT=5331 node tests/avance.mjs <projet>   (trois tours courts sur le petit modèle)
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
function attendre(test, ms = 90000) {
  const deja = recus.find(test);
  if (deja) { recus.splice(recus.indexOf(deja), 1); return Promise.resolve(deja); }
  return new Promise((ok) => {
    const a = { test, ok };
    attentes.push(a);
    setTimeout(() => ok(null), ms);
  });
}
const vider = () => recus.splice(0);

await new Promise((r) => ws.on('open', r));
dire({ t: 'bonjour', jeton });
await attendre((m) => m.t === 'general');
dire({ t: 'ouvrir', projet, modele: 'haiku' });
const session = (await attendre((m) => m.t === 'rejouer')).session;

// 1. Question de Claude.
vider();
dire({ t: 'envoyer', session, texte: 'Utilise l’outil AskUserQuestion pour me demander ma couleur préférée (options : Rouge, Bleu). Ensuite réponds seulement : « Couleur : » suivi de ma réponse.' });
const question = await attendre((m) => m.t === 'permission');
noter('question de Claude reçue', question?.outil === 'AskUserQuestion', question?.entree?.questions?.[0]?.question);
dire({ t: 'permission', session, id: question.id, decision: 'autoriser', reponses: { [question.entree.questions[0].question]: 'Bleu' } });
const tour1 = await attendre((m) => m.t === 'tour');
const textes = recus.filter((m) => m.t === 'assistant').flatMap((m) => m.blocs).filter((b) => b.type === 'texte').map((b) => b.texte).join(' ');
noter('réponse transmise au modèle', /bleu/i.test(textes), textes.slice(0, 80));
const limite = recus.find((m) => m.t === 'limite');
console.log('     limite reçue :', JSON.stringify(limite || null));

// 2. Arrêt en cours de tour.
vider();
dire({ t: 'envoyer', session, texte: 'Écris un texte d’au moins 1500 mots sur l’histoire des ports normands.' });
const flux = await attendre((m) => m.t === 'delta');
await new Promise((r) => setTimeout(r, 1500));
noter('arrêt : le tour était bien en cours', flux && !recus.some((m) => m.t === 'tour'));
const debut = Date.now();
dire({ t: 'interrompre', session });
const tour2 = await attendre((m) => m.t === 'tour', 30000);
const libre = await attendre((m) => m.t === 'etat' && m.occupe === false, 5000);
noter('arrêt : le tour se termine', tour2 && Date.now() - debut < 20000, `${Date.now() - debut} ms, motif ${tour2?.motif}`);
noter('arrêt : la session redevient libre', libre);

// 3. Cumul des compteurs sur un troisième tour.
vider();
dire({ t: 'envoyer', session, texte: 'Réponds seulement : ok' });
const tour3 = await attendre((m) => m.t === 'tour');
const sortie = (t) => t.modeles.reduce((s, m) => s + m.sortie, 0);
noter('coût cumulé d’un tour à l’autre', tour3.coutSession > tour1.coutSession, `${tour1.coutSession} → ${tour2?.coutSession} → ${tour3.coutSession}`);
noter('jetons cumulés d’un tour à l’autre', sortie(tour3) > sortie(tour1), `sortie ${sortie(tour1)} → ${sortie(tour3)}`);

// 4. Reprise depuis la liste « Discussions » du projet.
dire({ t: 'fermer', session });
await new Promise((r) => setTimeout(r, 1500));
vider();
dire({ t: 'historique', projet });
const historique = await attendre((m) => m.t === 'historique');
noter('session listée dans l’historique', historique.sessions.length > 0, historique.sessions[0]?.titre.slice(0, 60));
dire({ t: 'ouvrir', projet, modele: 'haiku', reprise: historique.sessions[0].id });
const rejoue = await attendre((m) => m.t === 'rejouer');
const types = rejoue.evenements.reduce((c, e) => ((c[e.t] = (c[e.t] || 0) + 1), c), {});
const saisies = rejoue.evenements.filter((e) => e.t === 'utilisateur').map((e) => e.texte.slice(0, 50));
noter('fil rejoué à la reprise', types.utilisateur >= 3 && types.assistant >= 3 && types.resultat_outil >= 1, JSON.stringify(types));
console.log('     saisies rejouées :', JSON.stringify(saisies));
noter('pas de message parasite', saisies.every((s) => !s.startsWith('<') && !s.startsWith('[')));
dire({ t: 'fermer', session: rejoue.session });
setTimeout(() => process.exit(bilan.every(Boolean) ? 0 : 1), 800);
