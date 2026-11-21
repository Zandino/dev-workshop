// Jauge de contexte et détail de la consommation : uniquement les chiffres renvoyés par chaque IA.
// Dans une discussion à plusieurs, chaque participant a ses propres lignes.
import { h, jetons, nombre, dollars, dateCourte } from './dom.js';
import { t, aTexte, ajouterTextes } from './i18n.js';

ajouterTextes({
  fr: {
    tour_reprise: 'premier tour après la reprise : son coût propre est inconnu',
    cumul_reprise: 'Cumul de la discussion depuis son début (avant la reprise ici, et ce premier tour compris)',
    cout_titre: 'Coût estimé au tarif de l’API depuis l’ouverture ici. Avec un abonnement, ce n’est pas une facture.', total_ici: 'Depuis l’ouverture ici',
  },
  en: {
    tour_reprise: 'first turn after resuming: its own cost is unknown',
    cumul_reprise: 'Conversation total since its start (before resuming here, this first turn included)',
    cout_titre: 'Cost estimated at API list price since this was opened here. On a subscription, this is not an invoice.', total_ici: 'Since opened here',
  },
});

const COLONNES = ['entree', 'sortie', 'cacheLu', 'cacheEcrit'];
const CLES = { entree: 'entree', sortie: 'sortie', cacheLu: 'cache_lu', cacheEcrit: 'cache_ecrit' };
let conso = null;

export function razJauge() {
  conso = { contexte: null, limite: null, tours: new Map(), dernier: null };
  dessiner();
}

/** Reçoit les événements « contexte », « tour » et « limite ». */
export function majJauge(e) {
  if (!conso) razJauge();
  const qui = e.auteur?.nom || '';
  if (e.t === 'contexte') conso.contexte = e;
  if (e.t === 'limite') conso.limite = e;
  if (e.t === 'tour') {
    const ancien = conso.tours.get(qui);
    // Discussion reprise : son premier tour porte le cumul de toute la discussion, depuis son tout début
    // (« anterieur », voir claude.mjs). Ce cumul devient le point de départ ; le coût de ce tour-là reste inconnu.
    // Compteur reparti de zéro (relais, changement d'équipe : une autre session derrière) ou session reprise
    // en route : ce qui avait été dépensé jusque-là est mis de côté (« acquis »), sans quoi le total deviendrait
    // négatif.
    const neuf = ancien && (e.anterieur || (e.coutSession != null && ancien.tour.coutSession != null && e.coutSession < ancien.tour.coutSession));
    const acquis = (ancien?.acquis || 0) + (neuf ? depense(ancien) : 0);
    conso.tours.set(qui, neuf
      ? { tour: e, precedent: null, base: e.anterieur ? e : null, acquis }
      : { tour: e, precedent: ancien?.tour || null, base: e.anterieur ? e : ancien?.base || null, acquis });
    conso.dernier = qui;
  }
  dessiner();
}

function somme(tour) {
  const s = { entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0 };
  for (const m of tour?.modeles || []) for (const k of COLONNES) s[k] += m[k] || 0;
  return s;
}

/** Les chiffres d'un modèle depuis le point de départ (rien à retirer hors reprise). */
function depuisBase(m, base) {
  const b = base?.modeles.find((x) => x.modele === m.modele);
  const r = { modele: m.modele, cout: m.cout == null ? null : m.cout - (b?.cout || 0) };
  for (const c of COLONNES) r[c] = Math.max(0, (m[c] || 0) - (b?.[c] || 0));
  return r;
}

/**
 * Coût depuis l'ouverture ici : la somme des coûts connus ; rien si aucune IA n'en fournit. Une discussion
 * reprise ne compte qu'à partir de son deuxième tour (le premier n'a pas de coût propre connu).
 */
function coutTotal() {
  const connus = [...conso.tours.values()]
    .filter((x) => (x.tour.coutSession != null && !x.tour.anterieur) || x.acquis)
    .map((x) => x.acquis + depense(x));
  return connus.length ? connus.reduce((a, b) => a + b, 0) : null;
}

/** Ce qu'une IA a dépensé depuis son point de départ, avec son compteur actuel (0 si encore inconnu). */
function depense(x) {
  return x.tour.anterieur || x.tour.coutSession == null ? 0 : x.tour.coutSession - (x.base?.coutSession || 0);
}

function ligne(libelle, valeurs) {
  return h('tr', {}, h('th', { scope: 'row' }, libelle), valeurs.map((v) => h('td', {}, v)));
}

function tableau() {
  if (!conso.tours.size) return null;
  const lignes = [];
  const total = { entree: 0, sortie: 0, cacheLu: 0, cacheEcrit: 0 };
  const avantReprise = [];
  for (const [qui, { tour, base }] of conso.tours) {
    if (base) avantReprise.push(base.coutSession);
    if (tour.anterieur) continue; // rien de propre à cette ouverture n'est encore connu
    for (const brut of tour.modeles) {
      const m = depuisBase(brut, base);
      lignes.push(ligne(qui ? `${qui} · ${m.modele}` : m.modele, [...COLONNES.map((c) => nombre(m[c])), dollars(m.cout)]));
      for (const c of COLONNES) total[c] += m[c] || 0;
    }
  }
  const { tour, precedent } = conso.tours.get(conso.dernier);
  const apres = somme(tour);
  const avant = somme(precedent);
  const inconnu = Boolean(tour.anterieur);
  const ecart = inconnu || tour.coutSession == null ? null : tour.coutSession - (precedent?.coutSession || 0);
  const cumul = avantReprise.filter((c) => c != null);
  return h(
    'table.conso',
    {},
    h('thead', {}, h('tr', {}, h('th', {}, ''), COLONNES.map((c) => h('th', { scope: 'col' }, t(CLES[c]))), h('th', { scope: 'col' }, t('cout')))),
    h(
      'tbody',
      {},
      lignes,
      ligne(t('total_ici'), [...COLONNES.map((c) => nombre(total[c])), dollars(coutTotal())]),
      ligne(t('dernier_tour') + (conso.dernier ? ` (${conso.dernier})` : '') + (inconnu ? ` — ${t('tour_reprise')}` : ''),
        [...COLONNES.map((c) => (inconnu ? '–' : nombre(Math.max(0, apres[c] - avant[c])))), dollars(ecart)]),
      cumul.length ? ligne(t('cumul_reprise'), [...COLONNES.map(() => ''), dollars(cumul.reduce((a, b) => a + b, 0))]) : null,
    ),
  );
}

function blocLimite() {
  const l = conso.limite;
  if (!l || (l.utilisation == null && !l.retablieLe)) return null;
  const periode = aTexte('limite_' + l.type) ? t('limite_' + l.type) : t('limite_autre');
  const morceaux = [periode];
  if (l.utilisation != null) morceaux.push(`${Math.round(l.utilisation * 100)} % ${t('utilise')}`);
  if (l.retablieLe) morceaux.push(t('limite_retablie', { date: dateCourte(l.retablieLe * 1000) }));
  const qui = l.auteur?.nom ? ` (${l.auteur.nom})` : '';
  return h('p.limite' + (l.statut && l.statut !== 'allowed' ? '.alerte' : ''), {}, h('strong', {}, t('limite') + qui + ' : '), morceaux.join(' · '));
}

function dessiner() {
  const pastille = document.getElementById('jauge');
  const panneau = document.getElementById('conso');
  const c = conso?.contexte;
  const pourcent = c ? Math.min(100, c.pourcent) : 0;
  const barre = h('span.barre', {}, h('span.plein'));
  barre.firstChild.style.width = `${pourcent}%`;
  pastille.classList.toggle('haute', pourcent >= 80);
  const cout = conso?.tours.size ? coutTotal() : null;
  const sortis = [...(conso?.tours.values() || [])].reduce((s, x) => s + somme(x.tour).sortie, 0);
  const format = new Intl.NumberFormat(document.documentElement.lang, { maximumFractionDigits: 1 });
  pastille.replaceChildren(
    h('span.libelle', {}, t('contexte') + (c?.auteur?.nom ? ` (${c.auteur.nom})` : '')),
    barre,
    h('span.valeur', {}, c ? `${format.format(pourcent)} % · ${jetons(c.utilises)} / ${jetons(c.max)}` : conso?.tours.size ? `${jetons(sortis)} ${t('sortie').toLowerCase()}` : '–'),
    // replaceChildren écrirait « null » en toutes lettres : sans coût connu, on n'ajoute rien.
    ...(cout != null ? [h('span.cout', { title: t('cout_titre') }, dollars(cout))] : []),
  );
  panneau.replaceChildren(
    h('h2', {}, t('conso_titre')),
    c ? h('p', {}, `${t('contexte')} : ${nombre(c.utilises)} / ${nombre(c.max)} ${t('jetons').toLowerCase()}`) : null,
    tableau(),
    blocLimite(),
    h('p.note', {}, t('conso_note')),
  );
}
