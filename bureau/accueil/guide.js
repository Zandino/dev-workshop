// Guide de premier branchement : clé SSH, dépôt de la clé sur le serveur, essai de connexion, puis ajout du
// serveur. Chargé avant accueil.js, dont il utilise $, t et ouvrirFormulaire (appelés seulement plus tard).
'use strict';

function accesGuide() {
  return { hote: $('guide-hote').value.trim(), portSsh: $('guide-port').value.trim() };
}

function messageGuide(id, texte, erreur = false) {
  const el = $(id);
  el.hidden = !texte;
  el.textContent = texte || '';
  el.classList.toggle('erreur', erreur);
}

async function guideCommande() {
  const a = accesGuide();
  if (!a.hote) {
    $('guide-commande').textContent = '…';
    return;
  }
  const r = await window.bureau.guide.commande(a);
  $('guide-commande').textContent = r.ok ? r.valeur : t(r.cle);
}

async function guideCle() {
  const r = await window.bureau.guide.cle();
  const etat = r.ok ? r.valeur : { existe: false, terminal: false };
  $('guide-cle').textContent = etat.existe ? t('guide_cle_trouvee', { chemin: etat.affichage }) : t('guide_cle_aucune');
  $('guide-creer-cle').hidden = etat.existe;
  $('guide-deposer').hidden = !etat.terminal;
  $('guide-aide-terminal').hidden = !etat.terminal;
  await guideCommande();
}

/** Ouvre le guide, éventuellement prérempli avec un serveur enregistré (adresse et port SSH). */
function ouvrirGuide(prerempli = {}) {
  $('guide-hote').value = prerempli.hote || '';
  $('guide-port').value = prerempli.portSsh || '';
  messageGuide('guide-depot', '');
  messageGuide('guide-test', '');
  $('guide').showModal();
  guideCle();
}

async function guideCreerCle(e) {
  e.target.disabled = true;
  const r = await window.bureau.guide.creerCle();
  e.target.disabled = false;
  await guideCle();
  if (!r.ok) $('guide-cle').textContent = t(r.cle);
}

async function guideTester() {
  const a = accesGuide();
  $('guide-tester').disabled = true;
  messageGuide('guide-test', t('guide_test_encours'));
  const r = await window.bureau.guide.tester(a);
  $('guide-tester').disabled = false;
  messageGuide('guide-test', r.ok ? t('guide_test_ok') : t(r.cle, { hote: a.hote }), !r.ok);
}

async function guideDeposer(e) {
  const a = accesGuide();
  e.target.disabled = true;
  messageGuide('guide-depot', t('guide_depot_attente'));
  const r = await window.bureau.guide.deposer(a);
  e.target.disabled = false;
  if (!r.ok) return messageGuide('guide-depot', t(r.cle, { hote: a.hote }), true);
  messageGuide('guide-depot', '');
  await guideTester();
}

async function guideCopier(e) {
  const bouton = e.target;
  try {
    await navigator.clipboard.writeText($('guide-commande').textContent);
    bouton.textContent = t('copie');
    setTimeout(() => { bouton.textContent = t('copier'); }, 1500);
  } catch {
    // Presse-papiers refusé : on sélectionne la commande pour une copie à la main.
    const plage = document.createRange();
    plage.selectNodeContents($('guide-commande'));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(plage);
  }
}

function guideAjouter() {
  const a = accesGuide();
  $('guide').close();
  ouvrirFormulaire(null, { nom: a.hote.split('@').pop().slice(0, 40), hote: a.hote, portSsh: a.portSsh });
}

function brancherGuide() {
  $('ouvrir-guide').addEventListener('click', () => ouvrirGuide());
  $('guide-fermer').addEventListener('click', () => $('guide').close());
  $('guide-creer-cle').addEventListener('click', guideCreerCle);
  $('guide-deposer').addEventListener('click', guideDeposer);
  $('guide-tester').addEventListener('click', guideTester);
  $('guide-copier').addEventListener('click', guideCopier);
  $('guide-ajouter').addEventListener('click', guideAjouter);
  let minuterie = null;
  for (const id of ['guide-hote', 'guide-port']) {
    $(id).addEventListener('input', () => {
      clearTimeout(minuterie);
      minuterie = setTimeout(guideCommande, 250);
    });
  }
}
