// Veille : chaque connexion suit l'état de TOUTES les discussions ouvertes, pas seulement de celle qu'elle
// affiche. Une discussion qui attend un accord (✋), qui finit ou qui échoue prévient tout le monde (pastilles
// de la barre, notifications), et celle qui finit sans que personne ne la regarde reste marquée « pas encore
// lue » jusqu'à ce qu'on la rouvre.
const veilleurs = new Set();

/** `rappel(alerte)` à chaque changement : `alerte` vaut null quand seul l'état de la barre a bougé. */
export function veiller(rappel) {
  veilleurs.add(rappel);
  return () => veilleurs.delete(rappel);
}

export function signaler(alerte = null) {
  for (const f of veilleurs) {
    try { f(alerte); } catch (e) { console.error('[dev-workshop] veille :', e.message); }
  }
}

/** Les événements qui changent ce que la barre montre d'une discussion (pastille, titre). */
export const changeLaBarre = (e) => e.t === 'utilisateur' || e.t === 'permission_fin' || (e.t === 'etat' && ('occupe' in e || Boolean(e.ferme)));

/**
 * L'alerte qu'un événement de la session `s` mérite, ou null. Note au passage la fin de tour que personne n'a
 * vue (`s.nonLu`). Appelée après l'envoi de l'événement aux abonnés de la session.
 */
export function alerteDe(s, e, projet) {
  const fin = finDe(s, e);
  if (fin && !s.abonnes.size) s.nonLu = fin.ok ? 'fini' : 'echec';
  if (e.t !== 'permission' && !fin) return null;
  return {
    id: s.id,
    projet,
    titre: s.titre,
    compte: s.compte,
    genre: e.t === 'permission' ? 'accord' : fin.ok ? 'fini' : 'echec',
    auteur: e.auteur?.nom || null,
    outil: e.t === 'permission' ? e.outil || null : null,
    message: fin && !fin.ok ? String(fin.message || '').slice(0, 300) : null,
  };
}

/** La fin du travail demandé ({ ok, message }), ou null si l'événement n'en est pas une. */
function finDe(s, e) {
  // Limite atteinte : une autre IA prend le relais (relais.mjs, salon.mjs, orchestre.mjs), le travail continue ;
  // sinon, c'est un échec, à toutes les sortes de discussions.
  if (e.t === 'info' && e.code === 'relais_aucun') return { ok: false, message: 'limite atteinte, aucune autre IA pour prendre le relais' };
  // Salon : chaque participant finit son tour (il a un « auteur ») ; la discussion rend la main en se libérant.
  if (s.participants) return e.t === 'etat' && e.occupe === false && !e.auteur ? { ok: true } : null;
  if (e.t !== 'tour' || e.auteur || e.sousAgent || e.limite) return null; // sous-agents de l'orchestre : auteur
  return { ok: Boolean(e.ok), message: e.message || e.motif };
}
