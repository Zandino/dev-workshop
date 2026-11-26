// Outil « montrer_fichier » des IA (serveur/ouvrir-fichier.mjs) dans une vraie discussion, sans vraie IA
// (tests/faux/ia.mjs) : le fichier s'ouvre chez les écrans qui affichent la discussion, et seulement chez eux ; les
// refus et « personne ne regarde » reviennent à l'IA en clair.
//   node tests/montrer-fichier.mjs   (dossiers jetables à lui)
import { register } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const B = mkdtempSync(path.join(tmpdir(), 'dw-montrer-'));
process.env.HOME = path.join(B, 'home');
process.env.DEVWORKSHOP_CONFIG = path.join(B, 'config');
process.env.DEVWORKSHOP_ROOT = path.join(B, 'projets');
const P = path.join(B, 'projets', 'essai');
for (const d of [path.join(B, 'home', 'maquettes'), path.join(B, 'home', '.ssh'), path.join(P, 'docs')]) mkdirSync(d, { recursive: true });
writeFileSync(path.join(B, 'home', 'maquettes', 'page.html'), '<p>maquette</p>');
writeFileSync(path.join(B, 'home', '.ssh', 'cle'), 'CLE');
writeFileSync(path.join(P, 'docs', 'guide.md'), '# Guide');

register('./faux/crochet.mjs', import.meta.url);
const faux = await import('./faux/ia.mjs');
const { ouvrirSession, attacher, fermerSession } = await import('../serveur/sessions.mjs');
const { outilsDe, NOMS_OUTILS } = await import('../serveur/outils-discussions.mjs');

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};

const outil = outilsDe({ session: 'x', questions: false }).find((o) => o.nom === 'montrer_fichier');
noter('outil donné aux IA, sans demande d’accord', Boolean(outil) && NOMS_OUTILS.includes('montrer_fichier'));

const s = await ouvrirSession({ compte: faux.compte('defaut'), dossier: P, mode: 'default' });
const autre = await ouvrirSession({ compte: faux.compte('defaut'), dossier: P, mode: 'default' });
const ctx = { session: s.id };

// Personne ne regarde : rien ne s'ouvre, l'IA le sait.
const seul = await outil.faire(ctx, { chemin: '~/maquettes/page.html' });
noter('personne n’affiche la discussion : dit à l’IA', seul.startsWith('Personne'), seul);

// Un écran sur la discussion, un autre sur une autre discussion.
const ici = [];
const ailleurs = [];
attacher(s.id, (m) => ici.push(m));
attacher(autre.id, (m) => ailleurs.push(m));
const r1 = await outil.faire(ctx, { chemin: '~/maquettes/page.html' });
const ouvert = ici.find((m) => m.t === 'fichier_ouvert');
noter('ouvert chez l’écran de la discussion', r1.startsWith('Ouvert') && ouvert?.parIa === true && ouvert.nom === 'page.html' && /^[A-Za-z0-9_-]{24}$/.test(ouvert.ticket), r1);
noter('… et pas chez l’écran d’une autre discussion', !ailleurs.some((m) => m.t === 'fichier_ouvert'));

const r2 = await outil.faire(ctx, { chemin: 'docs/guide.md' });
noter('chemin relatif : depuis le dossier du projet de la discussion', r2.includes(path.join('docs', 'guide.md')) && ici.filter((m) => m.t === 'fichier_ouvert').at(-1).nom === 'guide.md', r2);

const r3 = await outil.faire(ctx, { chemin: '~/maquettes' });
noter('dossier : sa liste', r3.includes('liste du dossier') && ici.filter((m) => m.t === 'fichier_ouvert').at(-1).entrees?.[0]?.nom === 'page.html', r3);

const avant = ici.length;
const r4 = await outil.faire(ctx, { chemin: '~/.ssh/cle' });
noter('fichier caché : refusé, rien envoyé à l’écran', r4.startsWith('Pas ouvert : refusé') && ici.length === avant, r4);
const r5 = await outil.faire(ctx, { chemin: '~/maquettes/absente.png' });
noter('absent : dit à l’IA', r5 === 'Pas ouvert : fichier introuvable sur le serveur.', r5);

fermerSession(s.id);
fermerSession(autre.id);
const echecs = bilan.filter((x) => !x).length;
console.log(`${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs);
