// Onglet « IA » du panneau des terminaux : les commandes que lancent les IA de la discussion affichée, écrites comme
// dans un terminal. Lecture seule : ces commandes tournent dans l'outil de l'IA, pas dans un terminal de l'écran.
// Limite (vérifiée le 25/11/2026) : Claude ne transmet la sortie d'une commande qu'une fois celle-ci finie (pendant,
// seulement le temps écoulé) ; la sortie arrive donc d'un bloc, coupée au-delà de 20 000 caractères comme dans le fil.
// Pas de DOM ici : `ecrire(texte)` reçoit du texte de terminal (séquences ANSI, fins de ligne « \r\n »).

const GRIS = '\x1b[90m';
const CYAN = '\x1b[1;36m';
const ROUGE = '\x1b[31m';
const FIN = '\x1b[0m';

/** Fins de ligne de terminal ; les séquences de contrôle venues de la sortie passent telles quelles (couleurs). */
const lignes = (texte) => String(texte ?? '').replace(/\r?\n/g, '\r\n');

/** La commande d'un appel d'outil, s'il en lance une (Claude « Bash », Codex, outils d'autres IA), sinon null. */
export function commandeDe(bloc) {
  const c = bloc?.entree?.command ?? bloc?.entree?.cmd;
  if (Array.isArray(c)) return c.join(' ');
  return typeof c === 'string' && c.trim() ? c : null;
}

/**
 * Suit les événements d'une discussion (rejeu puis direct) et écrit ses commandes. `evenement(e)` pour chacun ;
 * `vider()` quand une autre discussion s'affiche.
 */
export function journalCommandes(ecrire, { echec = 'échec' } = {}) {
  const enCours = new Map(); // id d'appel -> { commande, auteur }
  let derniere = null; // id de la dernière commande écrite : sa sortie la suit sans rappel
  let rien = true;

  const enTete = (commande, auteur, suite = false) => {
    const qui = auteur ? `${GRIS}${auteur} ${FIN}` : '';
    ecrire(`${rien ? '' : '\r\n'}${qui}${CYAN}$ ${FIN}${lignes(commande)}${suite ? `${GRIS} (suite)${FIN}` : ''}\r\n`);
    rien = false;
  };

  return {
    evenement(e) {
      if (e?.t === 'assistant') {
        for (const b of e.blocs || []) {
          const commande = b.type === 'outil' ? commandeDe(b) : null;
          if (!commande) continue;
          const auteur = e.auteur?.nom || null;
          enCours.set(b.id, { commande, auteur });
          enTete(commande, auteur);
          derniere = b.id;
        }
      } else if (e?.t === 'resultat_outil' && enCours.has(e.id)) {
        const { commande, auteur } = enCours.get(e.id);
        enCours.delete(e.id);
        // Plusieurs commandes en même temps : la sortie rappelle de quelle commande elle vient.
        if (derniere !== e.id) enTete(commande, auteur, true);
        const sortie = String(e.contenu ?? '');
        if (sortie) ecrire(lignes(sortie) + (sortie.endsWith('\n') ? '' : '\r\n'));
        if (e.erreur) ecrire(`${ROUGE}✗ ${echec}${FIN}\r\n`);
        derniere = null;
      }
    },
    vider() {
      enCours.clear();
      derniere = null;
      rien = true;
    },
  };
}
