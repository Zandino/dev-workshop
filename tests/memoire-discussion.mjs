// Essai de la mémoire de chaque discussion (serveur/memoire-discussion.mjs), avec de fausses IA (tests/faux/ia.mjs) :
// consigne au démarrage, modification par l'écran redonnée avec le message suivant (sans s'afficher dans le fil), outils
// de l'IA (noter, réécrire, trop long), instructions proposées puis acceptées ou refusées, clé qui suit la discussion
// (Claude du serveur, sauvegarde et reprise, changement d'équipe, discussion à plusieurs).
//   node tests/memoire-discussion.mjs   (réglages et projets dans des dossiers temporaires à lui)
import { register } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Toujours ses propres dossiers : il laisse une discussion « interrompue » (reprise), qui fausserait les essais suivants.
process.env.DEVWORKSHOP_CONFIG = mkdtempSync(path.join(tmpdir(), 'dw-memoire-'));
process.env.DEVWORKSHOP_ROOT = mkdtempSync(path.join(tmpdir(), 'dw-projets-'));
const dossier = path.join(process.env.DEVWORKSHOP_ROOT, 'essai');
mkdirSync(dossier, { recursive: true });
register('./faux/crochet.mjs', import.meta.url);
const faux = await import('./faux/ia.mjs');
const { ouvrirSession, fermerSession, changerEquipe } = await import('../serveur/sessions.mjs');
const memoire = await import('../serveur/memoire-discussion.mjs');
const { appelerOutil, NOMS_OUTILS } = await import('../serveur/outils-discussions.mjs');
const { ecrireSession } = await import('../serveur/sauvegarde-sessions.mjs');

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const derniereConsigne = (c) => faux.ouvertures.filter((o) => o.compte === c).at(-1)?.consigne || '';
const dernierEnvoi = (c) => faux.envois.filter((e) => e.compte === c).at(-1)?.texte || '';
const outil = (s, nom, args, auteur = null) => appelerOutil({ session: s.id, auteur, questions: false }, nom, args).then((r) => r.texte || r.erreur);
faux.comportements.gpt = faux.repondre('Bien reçu.');
faux.comportements.perso = faux.repondre('Bien reçu.');
faux.faux.echoUtilisateur = true;

noter('trois outils de mémoire, pour toutes les IA à outils', ['memoire_lire', 'memoire_retenir', 'memoire_proposer_instructions'].every((n) => NOMS_OUTILS.includes(n)));

// --- 1. Une discussion neuve : la mémoire (vide) et son mode d'emploi sont dans la consigne.
const s = await ouvrirSession({ compte: faux.compte('gpt'), dossier, mode: 'default' });
noter('au démarrage, l’IA reçoit la mémoire et son mode d’emploi', derniereConsigne('gpt').includes('Cette discussion a une mémoire') && derniereConsigne('gpt').includes('(aucune)'));

// --- 2. Modifiée à l'écran : redonnée avec le message suivant, une seule fois, et le fil ne montre que le message.
const m1 = memoire.ecrireDepuisEcran(s, { instructions: 'Réponds en français.', retenu: '', version: 0 });
noter('enregistrée depuis l’écran (version 1), le fil le note', m1.version === 1 && s.journal.some((e) => e.t === 'memoire' && e.mode === 'ecran'));
let refus = null;
try { memoire.ecrireDepuisEcran(s, { instructions: 'x', retenu: '', version: 0 }); } catch (e) { refus = e.message; }
noter('écran resté sur une ancienne version : refusé (pas d’écrasement silencieux)', refus === 'memoire_changee');
memoire.envoyerAvecMemoire(s, 'Bonjour');
await pause(30);
noter('message suivant : la mémoire à jour part en tête', dernierEnvoi('gpt').startsWith('[Mémoire de la discussion mise à jour') && dernierEnvoi('gpt').includes('Réponds en français.') && dernierEnvoi('gpt').endsWith('Bonjour'));
const affiche = s.journal.filter((e) => e.t === 'utilisateur').at(-1);
noter('… mais le fil ne montre que le message (et le signale)', affiche?.texte === 'Bonjour' && affiche.memoireRedonnee === true, JSON.stringify(affiche?.texte));
memoire.envoyerAvecMemoire(s, 'Encore');
await pause(30);
noter('le message d’après part seul', dernierEnvoi('gpt') === 'Encore');

// --- 3. L'IA tient sa partie à jour elle-même.
noter('outil « noter » : ajouté', (await outil(s, 'memoire_retenir', { texte: 'Base choisie : SQLite.' }, { nom: 'GPT' })) === 'Noté dans la mémoire.' && memoire.lireMemoire(s.cleMemoire).retenu === 'Base choisie : SQLite.');
noter('… le fil dit qui a noté quoi', s.journal.some((e) => e.t === 'memoire' && e.mode === 'ajouter' && e.par === 'GPT' && e.texte === 'Base choisie : SQLite.'));
await outil(s, 'memoire_retenir', { texte: 'Reste : écrire les tests.' });
noter('ajouts successifs, une ligne chacun', memoire.lireMemoire(s.cleMemoire).retenu === 'Base choisie : SQLite.\nReste : écrire les tests.');
memoire.envoyerAvecMemoire(s, 'Suite');
await pause(30);
noter('ce que l’IA a écrit ne lui est pas redonné (elle le sait)', dernierEnvoi('gpt') === 'Suite');
noter('outil « lire » : instructions et retenu', (await outil(s, 'memoire_lire', {})).includes('Réponds en français.') && (await outil(s, 'memoire_lire', {})).includes('SQLite'));
const trop = await outil(s, 'memoire_retenir', { texte: 'x'.repeat(11_990) });
noter('trop long : refusé, avec la façon de faire', trop.startsWith('Trop long') && trop.includes('remplacer') && memoire.lireMemoire(s.cleMemoire).retenu.length < 100);
await outil(s, 'memoire_retenir', { texte: 'Base : SQLite. Tests écrits.', mode: 'remplacer' });
noter('mode « remplacer » : la partie est réécrite', memoire.lireMemoire(s.cleMemoire).retenu === 'Base : SQLite. Tests écrits.');

// --- 4. Instructions : l'IA propose, la personne décide.
const avant = memoire.lireMemoire(s.cleMemoire).instructions;
await outil(s, 'memoire_proposer_instructions', { instructions: 'Réponds en français. Pas de dépendance nouvelle sans accord.', raison: 'Tu l’as demandé deux fois.' }, { nom: 'GPT' });
const carte = s.journal.filter((e) => e.t === 'permission').at(-1);
noter('proposition : carte d’accord à l’écran (raison, avant, après), instructions inchangées', carte?.outil === 'MemoireInstructions' && carte.entree.raison.includes('deux fois') && carte.entree.avant === avant && s.attente.has(carte.id) && memoire.lireMemoire(s.cleMemoire).instructions === avant);
noter('une seule proposition à la fois', (await outil(s, 'memoire_proposer_instructions', { instructions: 'y', raison: 'z' })).includes('attend déjà'));
noter('une demande d’accord d’une IA n’est pas prise pour la nôtre', memoire.repondreDemandeMemoire(s.id, 'autre-id', { decision: 'autoriser' }) === false);
memoire.repondreDemandeMemoire(s.id, carte.id, { decision: 'autoriser' });
noter('acceptée : instructions changées, carte retirée, le fil le dit', memoire.lireMemoire(s.cleMemoire).instructions.includes('Pas de dépendance nouvelle') && !s.attente.has(carte.id) && s.journal.some((e) => e.t === 'memoire' && e.mode === 'instructions' && e.proposePar === 'GPT'));
memoire.envoyerAvecMemoire(s, 'Merci');
await pause(30);
noter('… et redonnées à l’IA avec le message suivant', dernierEnvoi('gpt').includes('Pas de dépendance nouvelle') && dernierEnvoi('gpt').endsWith('Merci'));
await outil(s, 'memoire_proposer_instructions', { instructions: 'Tout en anglais.', raison: 'Essai.' });
const carte2 = s.journal.filter((e) => e.t === 'permission').at(-1);
memoire.repondreDemandeMemoire(s.id, carte2.id, { decision: 'refuser' });
noter('refusée : rien ne change, le fil le dit', !memoire.lireMemoire(s.cleMemoire).instructions.includes('anglais') && s.journal.some((e) => e.t === 'memoire' && e.mode === 'instructions_refusees'));

// --- 5. La clé suit la discussion : sauvegarde puis reprise après un redémarrage.
ecrireSession(s);
const sauvee = JSON.parse(readFileSync(path.join(process.env.DEVWORKSHOP_CONFIG, 'sessions', `${s.id}.json`), 'utf8'));
noter('la sauvegarde garde la clé de la mémoire', sauvee.cleMemoire === s.cleMemoire);
fermerSession(s.id, { oublier: false });
const reprise = await ouvrirSession({ compte: faux.compte('gpt'), dossier, mode: 'default', cleMemoire: sauvee.cleMemoire });
noter('reprise après redémarrage : la nouvelle IA reçoit la même mémoire', reprise.cleMemoire === s.cleMemoire && derniereConsigne('gpt').includes('Base : SQLite. Tests écrits.'));
// Changement d'équipe : la nouvelle IA la reçoit aussi.
changerEquipe(reprise.id, { compte: faux.compte('perso') });
noter('changement d’équipe : la nouvelle IA reçoit la mémoire', derniereConsigne('perso').includes('Pas de dépendance nouvelle'));
fermerSession(reprise.id);

// --- 6. Le Claude du serveur : la clé devient sa propre session dès qu'il démarre, la mémoire suit.
const c = await ouvrirSession({ compte: faux.compte('defaut'), dossier, mode: 'default' });
const cleAvant = c.cleMemoire;
memoire.ecrireDepuisEcran(c, { instructions: 'Sois bref.', retenu: '', version: 0 });
const sessionClaude = randomUUID();
c.emettre({ t: 'pret', sessionId: sessionClaude, mode: 'default' });
noter('Claude du serveur : la clé devient sa session, la mémoire la suit', c.cleMemoire === sessionClaude && memoire.lireMemoire(sessionClaude).instructions === 'Sois bref.' && !existsSync(path.join(process.env.DEVWORKSHOP_CONFIG, 'memoires', `${cleAvant}.json`)));
fermerSession(c.id);
const rouverte = await ouvrirSession({ compte: faux.compte('defaut'), dossier, mode: 'default', reprise: sessionClaude });
noter('rouverte depuis la liste du projet : même mémoire', rouverte.cleMemoire === sessionClaude && derniereConsigne('defaut').includes('Sois bref.'));
fermerSession(rouverte.id);

// --- 7. Discussion à plusieurs : chaque IA la reçoit en démarrant.
const salon = await ouvrirSession({ participants: [{ compte: faux.compte('gpt'), nom: 'GPT', externe: true }, { compte: faux.compte('perso'), nom: 'Perso', externe: false }], dossier, mode: 'default' });
memoire.ecrireDepuisEcran(salon, { instructions: 'Travaillez en équipe.', retenu: '', version: 0 });
const avantSalon = faux.ouvertures.length;
memoire.envoyerAvecMemoire(salon, 'Commencez.');
await pause(200);
const nouvelles = faux.ouvertures.slice(avantSalon);
noter('à plusieurs : chaque IA qui démarre reçoit la mémoire', nouvelles.length === 2 && nouvelles.every((o) => o.consigne.includes('Travaillez en équipe.')), String(nouvelles.length));
fermerSession(salon.id);

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
