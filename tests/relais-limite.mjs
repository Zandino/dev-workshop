// Essai des relais quand une IA atteint sa limite d'utilisation (abonnement, quota), sans aucune vraie IA (fausses IA
// de tests/faux/ia.mjs) : discussion à plusieurs (sa part passe à un autre, pas de nouvel essai avant la remise à zéro,
// renfort venu de l'extérieur quand tous sont à leur limite) et orchestre (une autre cheffe prend la main).
//   node tests/relais-limite.mjs   (réglages dans un dossier temporaire à lui)
import { register } from 'node:module';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DEVWORKSHOP_CONFIG = mkdtempSync(path.join(tmpdir(), 'dw-relais-')); // ses propres réglages, toujours
process.env.DEVWORKSHOP_ROOT ||= mkdtempSync(path.join(tmpdir(), 'dw-projets-'));
register('./faux/crochet.mjs', import.meta.url);
const faux = await import('./faux/ia.mjs');
const { ouvrirSalon } = await import('../serveur/salon.mjs');
const { ouvrirOrchestre } = await import('../serveur/orchestre.mjs');
const { heureDe } = await import('../serveur/relais.mjs');

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function attendre(test, ms = 3000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (test()) return true;
    await pause(10);
  }
  return false;
}
const envoisA = (c) => faux.envois.filter((e) => e.compte === c);
const participant = (id, nom) => ({ compte: faux.compte(id), nom, externe: id !== 'defaut' && id !== 'perso' });
// En concertation chacun propose et tombe d'accord ; en exécution chacun fait sa part.
const travailleur = (part) => (texte, recevoir) => faux.repondre(/Phase d'exécution|Reprends-la/.test(texte) ? `Fait : ${part}.` : `${part} pour moi. ACCORD_VALIDE`)(texte, recevoir);
const dans1h = Math.floor(Date.now() / 1000) + 3600;

// --- 1. Salon : Claude atteint sa limite pendant l'exécution, Perso (même genre d'IA) reprend sa part.
{
  const evts = [];
  faux.comportements.defaut = (texte, recevoir) => (/Phase d'exécution/.test(texte) ? faux.limite(dans1h) : faux.repondre('Le back-end pour moi. ACCORD_VALIDE'))(texte, recevoir);
  faux.comportements.perso = travailleur('Les tests');
  faux.comportements.gpt = travailleur('La base');
  const salon = ouvrirSalon({ session: 's1', participants: [participant('defaut', 'Claude'), participant('perso', 'Perso'), participant('gpt', 'GPT')], dossier: process.env.DEVWORKSHOP_CONFIG }, (e) => evts.push(e));
  salon.envoyer('Ajoute le paiement.');
  await attendre(() => evts.some((e) => e.t === 'etat' && e.occupe === false));
  const info = evts.find((e) => e.code === 'participant_quota');
  noter('limite en exécution : « Perso reprend sa part », avec l’heure de retour', info?.auteur?.nom === 'Claude' && info.vers === 'Perso' && info.jusqua === heureDe(dans1h * 1000), JSON.stringify(info));
  const note = envoisA('perso').find((e) => e.texte.includes('a atteint sa limite'));
  noter('Perso reçoit la part de Claude à reprendre, et la fait', note?.texte.includes('Reprends-la') && evts.some((e) => e.t === 'assistant' && e.auteur?.nom === 'Perso' && e.blocs[0].texte.includes('Fait')));
  noter('ce n’est pas « ne répond pas »', !evts.some((e) => e.code === 'participant_ecarte'));
  noter('la limite n’est pas un échec de la discussion (pas de « aucun relais »)', !evts.some((e) => e.code === 'relais_aucun'));
  const avant = envoisA('defaut').length;
  evts.length = 0;
  salon.envoyer('Et la facture ?');
  await attendre(() => evts.some((e) => e.t === 'etat' && e.occupe === false));
  noter('message suivant : Claude n’est pas relancé avant sa remise à zéro', envoisA('defaut').length === avant);
  noter('… et le fil le dit (« de retour vers … »)', evts.some((e) => e.code === 'participant_quota_attente' && e.auteur.nom === 'Claude' && e.jusqua === heureDe(dans1h * 1000)));
  noter('les autres continuent', envoisA('perso').some((e) => e.texte.includes('Et la facture')));
  salon.fermer();
}

// --- 2. Salon : sans heure de remise à zéro (autre IA), en concertation : les autres se répartissent le travail sans elle.
{
  const evts = [];
  faux.comportements.gpt = faux.limite(null);
  faux.comportements.perso = travailleur('Tout');
  const salon = ouvrirSalon({ session: 's2', participants: [participant('gpt', 'GPT'), participant('perso', 'Perso')], dossier: process.env.DEVWORKSHOP_CONFIG }, (e) => evts.push(e));
  const t0 = Date.now();
  salon.envoyer('Corrige le bug.');
  await attendre(() => evts.some((e) => e.t === 'etat' && e.occupe === false));
  const info = evts.find((e) => e.code === 'participant_quota_sans_lui');
  const attendu = heureDe(t0 + 30 * 60 * 1000);
  noter('limite en concertation : les autres se répartissent le travail sans elle', info?.auteur?.nom === 'GPT');
  noter('sans heure annoncée : retour dans 30 min', info && (info.jusqua === attendu || info.jusqua === heureDe(t0 + 30 * 60 * 1000 + 60_000)), `${info?.jusqua} / ${attendu}`);
  noter('Perso est prévenu', envoisA('perso').some((e) => e.texte.includes('répartissez le travail entre vous, sans lui')));
  salon.fermer();
}

// --- 3. Salon : tous à leur limite : une IA connectée hors du salon vient en renfort.
{
  const evts = [];
  faux.comportements.defaut = faux.limite(dans1h);
  faux.comportements.gpt = faux.limite(dans1h);
  faux.comportements.perso = travailleur('Tout');
  const ouverts = faux.ouvertures.length;
  const salon = ouvrirSalon({ session: 's3', participants: [participant('defaut', 'Claude'), participant('gpt', 'GPT')], dossier: process.env.DEVWORKSHOP_CONFIG }, (e) => evts.push(e));
  salon.envoyer('Ajoute un export CSV.');
  await attendre(() => evts.some((e) => e.t === 'etat' && e.occupe === false));
  const renfort = evts.find((e) => e.code === 'participant_renfort');
  noter('tous à leur limite : Perso (connecté, hors du salon) vient en renfort', renfort?.auteur?.nom === 'Perso', JSON.stringify(renfort));
  const ouverture = faux.ouvertures.slice(ouverts).find((o) => o.compte === 'perso');
  noter('le renfort reçoit la discussion (la demande) en arrivant', ouverture?.consigne.includes('Ajoute un export CSV'));
  noter('… et travaille', evts.some((e) => e.t === 'assistant' && e.auteur?.nom === 'Perso'));
  salon.fermer();
}

// --- 4. Salon : tous à leur limite et personne d'autre : la personne est prévenue (alerte d'échec).
{
  const evts = [];
  faux.definirComptes(faux.COMPTES.filter((c) => c.id === 'defaut'));
  faux.comportements.defaut = faux.limite(dans1h);
  const salon = ouvrirSalon({ session: 's4', participants: [participant('defaut', 'Claude')], dossier: process.env.DEVWORKSHOP_CONFIG }, (e) => evts.push(e));
  salon.envoyer('Bonjour');
  await attendre(() => evts.some((e) => e.t === 'etat' && e.occupe === false));
  noter('personne pour reprendre : « aucun relais » (la veille en fait une alerte)', evts.some((e) => e.code === 'participant_quota_seul') && evts.some((e) => e.code === 'relais_aucun'));
  faux.definirComptes(faux.COMPTES);
  salon.fermer();
}

// --- 5. Orchestre : la cheffe atteint sa limite, un autre compte Claude prend sa place et reprend la demande.
{
  const evts = [];
  const journal = [{ t: 'utilisateur', texte: 'Refais la page d’accueil.' }, { t: 'assistant', blocs: [{ type: 'texte', texte: 'Je commence par le menu.' }] }];
  let nouveauCompte = null;
  faux.comportements.defaut = faux.limite(dans1h);
  faux.comportements.perso = faux.repondre('Je reprends : menu fait.');
  const ouverts = faux.ouvertures.length;
  const o = ouvrirOrchestre({ session: 'o1', compte: faux.compte('defaut'), dossier: process.env.DEVWORKSHOP_CONFIG, journal: () => journal, surRelais: (c) => { nouveauCompte = c.id; } }, (e) => evts.push(e));
  o.envoyer('Refais la page d’accueil.');
  await attendre(() => evts.some((e) => e.t === 'tour' && e.ok));
  const tourLimite = evts.find((e) => e.t === 'tour' && !e.ok);
  noter('cheffe à sa limite : tour marqué « relayé » (pas un échec)', tourLimite?.limite && tourLimite.relaye);
  noter('Perso (Claude) prend la place de cheffe', evts.some((e) => e.t === 'relais' && e.de === 'defaut' && e.vers === 'perso') && nouveauCompte === 'perso');
  const ouverture = faux.ouvertures.slice(ouverts).find((x) => x.compte === 'perso');
  noter('… avec l’historique et les consignes de cheffe', ouverture?.consigne.includes('Tu prends le relais') && ouverture.consigne.includes('Je commence par le menu') && ouverture.consigne.includes('cheffe d’orchestre'));
  noter('… et reprend la dernière demande', envoisA('perso').at(-1)?.texte === 'Refais la page d’accueil.' && evts.some((e) => e.t === 'assistant' && e.blocs[0].texte.includes('Je reprends')));
  noter('jamais une IA sans les outils de Claude Code comme cheffe', !faux.ouvertures.slice(ouverts).some((x) => ['gpt', 'gemini'].includes(x.compte)));
  // La deuxième cheffe à sa limite aussi : plus aucun compte Claude, la personne est prévenue.
  faux.comportements.perso = faux.limite(dans1h);
  evts.length = 0;
  o.envoyer('Continue.');
  await attendre(() => evts.some((e) => e.code === 'relais_aucun'));
  noter('plus aucune cheffe possible : « aucun relais »', evts.some((e) => e.code === 'relais_aucun'));
  o.fermer();
}

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
