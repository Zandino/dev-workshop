// Une discussion enregistrée rouverte affiche ses messages passés, seule ou en équipe (orchestre), sans les doubler
// après un redémarrage (journal sauvegardé déjà là). Avant le 22/11, rouverte en équipe, elle s'affichait vide.
// Sans aucune vraie IA (tests/faux/ia.mjs).
//   node tests/reprise-historique.mjs   (réglages dans un dossier temporaire à lui)
import { register } from 'node:module';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DEVWORKSHOP_CONFIG = mkdtempSync(path.join(tmpdir(), 'dw-reprise-')); // ses propres réglages, toujours
process.env.DEVWORKSHOP_ROOT ||= mkdtempSync(path.join(tmpdir(), 'dw-projets-'));
register('./faux/crochet.mjs', import.meta.url);
const faux = await import('./faux/ia.mjs');
const { ouvrirSession, fermerSession } = await import('../serveur/sessions.mjs');

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const dossier = path.join(process.env.DEVWORKSHOP_ROOT, 'chantier');
mkdirSync(dossier, { recursive: true });
const passe = [
  { t: 'utilisateur', texte: 'Ajoute la page des devis.' },
  { t: 'assistant', blocs: [{ type: 'texte', texte: 'Page des devis ajoutée.' }] },
];
const textes = (s) => s.journal.filter((e) => e.t === 'utilisateur' || e.t === 'assistant');
faux.historiques['11111111-1111-4111-8111-111111111111'] = passe;

// 1. Rouverte seule : comme avant, ses messages s'affichent.
{
  const s = await ouvrirSession({ compte: faux.compte('defaut'), dossier, mode: 'default', reprise: '11111111-1111-4111-8111-111111111111' });
  noter('rouverte seule : les messages passés s’affichent', textes(s).length === 2, JSON.stringify(textes(s)));
  fermerSession(s.id);
}

// 2. Rouverte en équipe : la cheffe reprend la session, et le fil n'est plus vide.
{
  const s = await ouvrirSession({ compte: faux.compte('defaut'), dossier, mode: 'default', orchestre: true, reprise: '11111111-1111-4111-8111-111111111111' });
  noter('rouverte en équipe : les messages passés s’affichent', textes(s).length === 2, JSON.stringify(textes(s)));
  noter('… la cheffe reprend bien la session enregistrée', s.etat.sessionId === '11111111-1111-4111-8111-111111111111');
  fermerSession(s.id);
}

// 3. Après un redémarrage (journal sauvegardé redonné) : rien n'est doublé.
{
  const sauve = [...passe, { t: 'info', code: 'membre_fini', texte: 'Fait.' }];
  const s = await ouvrirSession({ compte: faux.compte('defaut'), dossier, mode: 'default', orchestre: true, reprise: '11111111-1111-4111-8111-111111111111', journalInitial: sauve });
  noter('redémarrage en équipe : le journal sauvegardé, sans doublon', s.journal.length === 3 && textes(s).length === 2, `${s.journal.length} événements`);
  fermerSession(s.id);
}

// 3 bis. Redémarrage d'une discussion d'équipe restée vide (rouverte avant le correctif : journal sans message) :
// le fil est réparé, les messages passés viennent en tête.
{
  const s = await ouvrirSession({ compte: faux.compte('defaut'), dossier, mode: 'default', orchestre: true, reprise: '11111111-1111-4111-8111-111111111111', journalInitial: [{ t: 'capacites' }, { t: 'contexte' }] });
  noter('fil d’équipe resté vide : réparé au redémarrage, messages en tête', s.journal.length === 4 && s.journal[0].t === 'utilisateur' && s.journal[2].t === 'capacites', JSON.stringify(s.journal.map((e) => e.t)));
  fermerSession(s.id);
}

// 4. Session inconnue ou nouvelle discussion : fil vide, sans erreur.
{
  const s = await ouvrirSession({ compte: faux.compte('defaut'), dossier, mode: 'default', orchestre: true });
  noter('nouvelle discussion en équipe : fil vide', textes(s).length === 0);
  fermerSession(s.id);
  const t = await ouvrirSession({ compte: faux.compte('defaut'), dossier, mode: 'default', orchestre: true, reprise: '22222222-2222-4222-8222-222222222222' });
  noter('session sans historique : fil vide, ouverture normale', textes(t).length === 0 && !t.etat.ferme);
  fermerSession(t.id);
}

const echecs = bilan.filter((x) => !x).length;
console.log(`${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs);
