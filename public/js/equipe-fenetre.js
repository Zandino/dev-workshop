// Fenêtre détachée de l'équipe en direct (equipe.html) : sa propre liaison au serveur (même jeton, rangé par la
// fenêtre principale dans le stockage commun), elle suit la discussion que la fenêtre principale affiche (message
// « session » de equipe.js) et en rejoue l'histoire, puis le direct. C'est elle qui parle tant qu'elle est ouverte.
// Elle se ferme avec la fenêtre principale.
import { jetonInitial, connecter, ecouter, dire } from './canal.js';
import { t } from './i18n.js';
import { initEquipe, nouvelleEquipe, surEvenementEquipe, definirSkins } from './equipe.js';
import { definirEtatVoix } from './voix-equipe.js';

let suivie = null; // la discussion montrée
let signature = null;
let connecte = false;
let attachee = false;

function attacher() {
  if (!suivie || !connecte || attachee) return;
  dire({ t: 'attacher', session: suivie });
  attachee = true;
}

/** La fenêtre principale a changé de discussion (ou n'en affiche plus). */
function suivre(session, sig) {
  const nouvelle = session || null;
  if (nouvelle === suivie) return;
  if (suivie && connecte) dire({ t: 'detacher', session: suivie });
  suivie = nouvelle;
  signature = sig || null;
  attachee = false;
  nouvelleEquipe(signature, suivie || '');
  attacher();
}

ecouter((m) => {
  if (m.t === 'canal') {
    if (m.etat === 'perdu') connecte = attachee = false;
    return;
  }
  if (m.t === 'general') {
    connecte = true;
    definirSkins(m.skins);
    definirEtatVoix(m.voix);
    attacher(); // première connexion, ou retour après une coupure : on rejoint la discussion suivie
    return;
  }
  if (m.t === 'rejouer') {
    if (m.session !== suivie) return;
    nouvelleEquipe(signature, suivie);
    for (const e of m.evenements) surEvenementEquipe({ ...e, session: m.session }, true);
    return;
  }
  if (m.session && m.session === suivie) surEvenementEquipe(m);
});

document.title = `${t('equipe')} · Dev Workshop`;
if (jetonInitial()) {
  initEquipe({ fenetre: true, suivre });
  connecter();
} else {
  document.getElementById('equipe').replaceChildren(Object.assign(document.createElement('p'), { className: 'vide-appel', textContent: t('fenetre_sans_jeton') }));
}
// La fenêtre principale fermée, celle-ci n'a plus de raison d'être (rechargée, elle reste : même fenêtre).
if (window.opener) {
  setInterval(() => {
    if (window.opener?.closed) window.close();
  }, 2000);
}
