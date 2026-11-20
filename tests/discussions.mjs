// Essai des discussions : liste de tous les projets, « Ranger » (déplacement d'un projet à l'autre, avec ses
// refus) et « Retenir pour le projet » (ajout à la fiche). Aucun appel au modèle.
// Les discussions sont fabriquées ici, sans contenu réel. L'essai écrit dans le dossier de Claude Code du HOME :
// il refuse donc de tourner si HOME n'est pas un dossier jetable sous le dossier temporaire.
// Usage (serveur lancé avec les mêmes HOME, DEVWORKSHOP_CONFIG, DEVWORKSHOP_ROOT et DEVWORKSHOP_PORT) :
//   HOME=/tmp/x/home DEVWORKSHOP_CONFIG=… DEVWORKSHOP_ROOT=/tmp/x/projets DEVWORKSHOP_PORT=5338 node tests/discussions.mjs prepare
//   … puis, une fois le serveur démarré : node tests/discussions.mjs
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, utimesSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import WebSocket from 'ws';

const HOME = homedir();
const tmp = realpathSync(tmpdir());
if (!realpathSync(HOME).startsWith(tmp + path.sep) && !HOME.startsWith('/tmp/')) {
  console.error(`Refus : HOME (${HOME}) doit être un dossier jetable sous ${tmp}.`);
  process.exit(2);
}
const RACINE = process.env.DEVWORKSHOP_ROOT;
if (!RACINE) {
  console.error('DEVWORKSHOP_ROOT manque.');
  process.exit(2);
}
const CLAUDE = path.join(HOME, '.claude', 'projects');
const encoder = (d) => d.replace(/[^a-zA-Z0-9]/g, '-');
const ETAT = path.join(HOME, 'essai-discussions.json');

/** Une discussion factice au format de Claude Code, avec un titre et un dossier voisin (sous-agent). */
function fabriquer(projet, titre, lignesEnPlus = 0) {
  const dossier = path.join(realpathSync(RACINE), projet);
  const id = randomUUID();
  const base = { sessionId: id, cwd: dossier, isSidechain: false, userType: 'external', version: '2.1.0', gitBranch: '' };
  const lignes = [
    { ...base, type: 'user', uuid: 'u1', parentUuid: null, timestamp: '2026-10-01T10:00:00.000Z', message: { role: 'user', content: `Bonjour, essai ${titre}` } },
    { ...base, type: 'assistant', uuid: 'a1', parentUuid: 'u1', timestamp: '2026-10-01T10:00:05.000Z', message: { id: 'm1', type: 'message', role: 'assistant', model: 'essai', content: [{ type: 'text', text: 'Bonjour.' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } },
  ];
  // Du volume, pour vérifier la recopie ligne à ligne (le cwd est réécrit partout).
  for (let i = 0; i < lignesEnPlus; i++) {
    lignes.push({ ...base, type: 'user', uuid: `p${i}`, parentUuid: i ? `q${i - 1}` : 'a1', timestamp: '2026-10-01T10:01:00.000Z', message: { role: 'user', content: 'x'.repeat(2000) } });
    lignes.push({ ...base, type: 'assistant', uuid: `q${i}`, parentUuid: `p${i}`, timestamp: '2026-10-01T10:01:01.000Z', message: { id: `r${i}`, type: 'message', role: 'assistant', model: 'essai', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } });
  }
  lignes.push({ type: 'custom-title', customTitle: titre, sessionId: id });
  const ici = path.join(CLAUDE, encoder(dossier));
  mkdirSync(path.join(ici, id, 'subagents'), { recursive: true });
  writeFileSync(path.join(ici, `${id}.jsonl`), lignes.map((l) => JSON.stringify(l)).join('\n') + '\n');
  writeFileSync(path.join(ici, id, 'subagents', 'agent-essai.jsonl'), JSON.stringify({ ...base, isSidechain: true, type: 'user', message: { role: 'user', content: 'sous-agent' } }) + '\n');
  const date = new Date('2026-10-01T10:02:00Z');
  utimesSync(path.join(ici, `${id}.jsonl`), date, date);
  return id;
}

/**
 * Discussion reprise après un résumé automatique, disposée comme les vraies : elle s'ouvre sur le résumé, puis des
 * messages sans texte simple ; sa ligne de titre est au milieu. Le SDK, qui ne lit que le début et la fin d'un
 * fichier, ne lui trouve ni titre ni premier message, et ne la liste pas.
 */
function fabriquerReprise(projet, titre) {
  const dossier = path.join(realpathSync(RACINE), projet);
  const id = randomUUID();
  const base = { sessionId: id, cwd: dossier, isSidechain: false, userType: 'external', version: '2.1.0', gitBranch: '' };
  const reponse = (i, texte) => ({ ...base, type: 'assistant', uuid: `c${i + 1}`, parentUuid: `c${i}`, timestamp: '2026-10-02T09:00:05.000Z', message: { id: `n${i}`, type: 'message', role: 'assistant', model: 'essai', content: [{ type: 'text', text: texte }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } });
  const remplissage = (de, n) => Array.from({ length: n }, (_, k) => reponse(de + k, 'y'.repeat(2000)));
  const lignes = [
    { ...base, type: 'user', uuid: 'c1', parentUuid: null, isCompactSummary: true, timestamp: '2026-10-02T09:00:00.000Z', message: { role: 'user', content: 'This session is being continued from a previous conversation. Summary: essai.' } },
    ...remplissage(1, 1000),
    { type: 'summary', summary: titre, leafUuid: 'c2' },
    ...remplissage(1001, 1000),
  ];
  const ici = path.join(CLAUDE, encoder(dossier));
  mkdirSync(ici, { recursive: true });
  writeFileSync(path.join(ici, `${id}.jsonl`), lignes.map((l) => JSON.stringify(l)).join('\n') + '\n');
  const date = new Date('2026-10-02T09:01:00Z');
  utimesSync(path.join(ici, `${id}.jsonl`), date, date);
  return id;
}

if (process.argv[2] === 'prepare') {
  for (const p of ['alpha', 'beta']) mkdirSync(path.join(RACINE, p), { recursive: true });
  const ids = { grande: fabriquer('alpha', 'proxmox essai', 3000), petite: fabriquer('alpha', 'intervizio essai'), autre: fabriquer('beta', 'beta essai'), reprise: fabriquerReprise('beta', 'reprise essai') };
  writeFileSync(ETAT, JSON.stringify(ids));
  console.log('Discussions fabriquées :', Object.keys(ids).join(', '));
  process.exit(0);
}

const ids = JSON.parse(readFileSync(ETAT, 'utf8'));
const PORT = Number(process.env.DEVWORKSHOP_PORT) || 5330;
const jeton = readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG || path.join(HOME, '.config/dev-workshop'), 'jeton'), 'utf8').trim();
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
function attendre(test, ms = 20000) {
  const i = recus.findIndex(test);
  if (i >= 0) return Promise.resolve(recus.splice(i, 1)[0]);
  return new Promise((ok) => {
    const a = { test, ok: (m) => { recus.splice(recus.indexOf(m), 1); ok(m); } };
    attentes.push(a);
    setTimeout(() => ok(null), ms);
  });
}
const historique = async (projet) => {
  recus.splice(0);
  dire({ t: 'historique', projet });
  return (await attendre((m) => m.t === 'historique' && m.projet === projet))?.sessions || [];
};
const refus = async (ordre) => {
  recus.splice(0);
  dire(ordre);
  return (await attendre((m) => m.t === 'refus' || m.t === 'discussion_deplacee'))?.code || 'accepte';
};

await new Promise((r) => ws.on('open', r));
dire({ t: 'bonjour', jeton });
await attendre((m) => m.t === 'general');

// Liste du projet et vue « Toutes les discussions ».
const alpha = await historique('alpha');
noter('liste du projet : titres et dates', alpha.length === 2 && alpha.some((s) => s.titre === 'proxmox essai') && alpha.every((s) => s.modifieLe === Date.parse('2026-10-01T10:02:00Z')));
recus.splice(0);
dire({ t: 'toutes_discussions' });
const toutes = (await attendre((m) => m.t === 'discussions'))?.liste || [];
noter('toutes les discussions, avec leur projet', toutes.length === 4 && toutes.find((d) => d.id === ids.autre)?.projet === 'beta');

// Une discussion reprise après un résumé automatique : le SDK ne la liste pas, Dev Workshop la retrouve.
const { getSessionInfo } = await import('@anthropic-ai/claude-agent-sdk');
const inconnueDuSdk = !(await getSessionInfo(ids.reprise, { dir: path.join(realpathSync(RACINE), 'beta') }));
noter('discussion reprise : listée avec son titre (le SDK, lui, ne la voit pas)', inconnueDuSdk && toutes.find((d) => d.id === ids.reprise)?.titre === 'reprise essai');
noter('discussion reprise : rangée comme les autres', await refus({ t: 'deplacer_discussion', projet: 'beta', id: ids.reprise, vers: 'alpha' }) === 'accepte'
  && (await historique('alpha')).some((s) => s.id === ids.reprise && s.titre === 'reprise essai'));

// Ranger dans un nouveau projet (créé au passage).
const racine = realpathSync(RACINE);
const avant = statSync(path.join(CLAUDE, encoder(path.join(racine, 'alpha')), `${ids.grande}.jsonl`));
noter('ranger dans un nouveau projet', await refus({ t: 'deplacer_discussion', projet: 'alpha', id: ids.grande, vers: 'gamma', creer: true }) === 'accepte');
const fichier = path.join(CLAUDE, encoder(path.join(racine, 'gamma')), `${ids.grande}.jsonl`);
const lignes = readFileSync(fichier, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const avecCwd = lignes.filter((l) => l.cwd);
noter('dossier de travail réécrit partout', lignes.length === 6003 && avecCwd.length === 6002 && avecCwd.every((l) => l.cwd === path.join(racine, 'gamma')), `${lignes.length} lignes`);
noter('date et sous-agent conservés', statSync(fichier).mtimeMs === avant.mtimeMs && existsSync(path.join(path.dirname(fichier), ids.grande, 'subagents', 'agent-essai.jsonl')));
noter('original retiré', !existsSync(path.join(CLAUDE, encoder(path.join(racine, 'alpha')), `${ids.grande}.jsonl`)) && !existsSync(path.join(CLAUDE, encoder(path.join(racine, 'alpha')), ids.grande)));
noter('listes à jour', (await historique('gamma')).some((s) => s.id === ids.grande && s.titre === 'proxmox essai') && !(await historique('alpha')).some((s) => s.id === ids.grande));

// Deux ordres coup sur coup pour la même discussion (double clic) : un seul passe, rien n'est perdu.
recus.splice(0);
dire({ t: 'deplacer_discussion', projet: 'gamma', id: ids.grande, vers: 'beta' });
dire({ t: 'deplacer_discussion', projet: 'gamma', id: ids.grande, vers: 'alpha' });
const reponses = [await attendre((m) => m.t === 'refus' || m.t === 'discussion_deplacee'), await attendre((m) => m.t === 'refus' || m.t === 'discussion_deplacee')];
const fichierBeta = path.join(CLAUDE, encoder(path.join(racine, 'beta')), `${ids.grande}.jsonl`);
noter('double ordre : un seul rangement, l’autre refusé', reponses.filter((r) => r?.t === 'discussion_deplacee').length === 1 && reponses.some((r) => r?.code === 'discussion_occupee'), reponses.map((r) => r?.code || r?.t).join(', '));
noter('double ordre : la discussion existe toujours, une seule fois', existsSync(fichierBeta) && !existsSync(fichier) && !existsSync(path.join(CLAUDE, encoder(path.join(racine, 'alpha')), `${ids.grande}.jsonl`)));
recus.splice(0);
dire({ t: 'deplacer_discussion', projet: 'beta', id: ids.grande, vers: 'gamma' }); // la grande revient dans gamma
await attendre((m) => m.t === 'discussion_deplacee');

// Refus.
noter('refus : déjà dans ce projet', await refus({ t: 'deplacer_discussion', projet: 'gamma', id: ids.grande, vers: 'gamma' }) === 'meme_projet');
noter('refus : n’est plus là', await refus({ t: 'deplacer_discussion', projet: 'alpha', id: ids.grande, vers: 'beta' }) === 'session_inconnue');
noter('refus : nom de projet invalide', await refus({ t: 'deplacer_discussion', projet: 'alpha', id: ids.petite, vers: '../dehors', creer: true }) === 'nom_invalide');
noter('refus : projet d’arrivée absent sans création', await refus({ t: 'deplacer_discussion', projet: 'alpha', id: ids.petite, vers: 'delta' }) !== 'accepte' && !existsSync(path.join(RACINE, 'delta')));
recus.splice(0);
dire({ t: 'session_corbeille', projet: 'beta', id: ids.autre, titre: 'beta essai' });
await attendre((m) => m.t === 'historique' && m.projet === 'beta');
noter('refus : discussion à la corbeille', await refus({ t: 'deplacer_discussion', projet: 'beta', id: ids.autre, vers: 'alpha' }) === 'discussion_occupee');
noter('refus : pas de projet vide créé pour rien', await refus({ t: 'deplacer_discussion', projet: 'beta', id: ids.autre, vers: 'epsilon', creer: true }) === 'discussion_occupee' && !existsSync(path.join(RACINE, 'epsilon')));

// Une discussion rangée se rouvre dans son nouveau projet, avec son historique ; ouverte, elle ne se range pas.
recus.splice(0);
dire({ t: 'ouvrir', projet: 'gamma', compte: 'defaut', reprise: ids.grande, titre: 'proxmox essai' });
const rejeu = await attendre((m) => m.t === 'rejouer', 30000);
// L'écran rejoue les 800 derniers événements : ceux de la fin de la discussion, lus dans le nouveau projet.
noter('rouverte dans son nouveau projet, avec son historique', rejeu?.resume.projet === 'gamma' && rejeu.evenements.filter((e) => e.t === 'utilisateur').length >= 300, `${rejeu?.evenements.length} événements`);
noter('refus : discussion ouverte', await refus({ t: 'deplacer_discussion', projet: 'gamma', id: ids.grande, vers: 'alpha' }) === 'discussion_occupee');
if (rejeu) dire({ t: 'fermer', session: rejeu.session });

// « Retenir pour le projet ».
recus.splice(0);
dire({ t: 'projet_retenir', nom: 'gamma', texte: '## Retenu le 1 — « a »\n\n- premier point' });
noter('retenir : ajouté à la fiche', Boolean(await attendre((m) => m.t === 'projet_retenu')));
dire({ t: 'projet_retenir', nom: 'gamma', texte: '## Retenu le 2 — « b »\n\n- second point' });
await attendre((m) => m.t === 'projet_retenu');
recus.splice(0);
dire({ t: 'projet_lire', nom: 'gamma' });
const fiche = (await attendre((m) => m.t === 'projet'))?.contexte || '';
noter('retenir : les ajouts se suivent', fiche === '## Retenu le 1 — « a »\n\n- premier point\n\n## Retenu le 2 — « b »\n\n- second point\n', JSON.stringify(fiche).slice(0, 120));
noter('retenir : texte vide refusé', await (async () => { recus.splice(0); dire({ t: 'projet_retenir', nom: 'gamma', texte: '  ' }); return (await attendre((m) => m.t === 'refus'))?.code; })() === 'rien_a_retenir');

ws.close();
const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
