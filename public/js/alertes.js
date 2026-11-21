// Alertes : une discussion qui a besoin de toi (✋ un accord à donner), qui a fini ou qui a échoué te prévient
// même si tu en regardes une autre. Fenêtre au premier plan : une bulle cliquable qui ouvre la discussion ;
// en arrière-plan : une notification du système. Le titre de la page compte les discussions qui attendent
// (« ✋ 2 · Dev Workshop ») : le logiciel de bureau en fait une main levée sur son icône (bureau/src/main-levee.js).
import { notifier } from './dom.js';
import { t, ajouterTextes } from './i18n.js';
import { ecouter } from './canal.js';

ajouterTextes({
  fr: {
    notif_accord: '✋ {nom} a besoin de ton accord', notif_fini: 'Discussion terminée · {projet}', notif_echec: 'Tour interrompu · {projet}',
    notif_ouvrir: 'clique pour l’ouvrir', notif_memoire: '⚠ Mémoire du serveur presque pleine · travail arrêté · {projet}',
  },
  en: {
    notif_accord: '✋ {nom} needs your approval', notif_fini: 'Conversation finished · {projet}', notif_echec: 'Turn interrupted · {projet}',
    notif_ouvrir: 'click to open it', notif_memoire: '⚠ Server memory almost full · work stopped · {projet}',
  },
});

let lire = null; // { ecran, libelle(compte), rejoindre(id) }

function textes(a) {
  const titre = a.titre ? `« ${a.titre} »` : t('sans_titre');
  if (a.genre === 'accord') {
    const c = lire.ecran.general?.comptes.find((x) => x.id === a.compte);
    const nom = a.auteur || (c ? lire.libelle(c) : 'IA');
    return [t('notif_accord', { nom }), [a.projet, titre, a.outil].filter(Boolean).join(' · ')];
  }
  if (a.genre === 'fini') return [t('notif_fini', { projet: a.projet }), titre];
  if (a.genre === 'memoire') return [t('notif_memoire', { projet: a.projet }), `${titre} · ${a.message}`];
  return [t('notif_echec', { projet: a.projet }), a.message ? `${titre} · ${a.message}` : titre];
}

function alerter(a) {
  const ici = a.id === lire.ecran.session;
  const auPremierPlan = document.hasFocus();
  if (ici && auPremierPlan) return; // tu la regardes déjà
  const [titre, corps] = textes(a);
  const ouvrir = () => {
    window.focus();
    if (a.id !== lire.ecran.session) lire.rejoindre(a.id);
  };
  if (auPremierPlan) {
    notifier(`${titre} — ${corps} (${t('notif_ouvrir')})`, { echec: a.genre === 'echec', surClic: ouvrir, duree: a.genre === 'accord' ? 20000 : 10000 });
    return;
  }
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(titre, { body: String(corps).slice(0, 180), tag: 'dev-workshop-' + a.id });
    n.onclick = () => {
      n.close();
      ouvrir();
    };
  } catch { /* notifications indisponibles */ }
}

/** Le nombre de discussions qui attendent ton accord, en tête du titre de la page. */
function titreDeLaPage(vivantes) {
  const n = (vivantes || []).filter((s) => s.attente).length;
  return n ? `✋ ${n} · ${t('titre')}` : t('titre');
}

export function initAlertes(lecteurs) {
  lire = lecteurs;
  ecouter((m) => {
    if (m.t === 'alerte') alerter(m);
    else if (m.t === 'general' || m.t === 'vivantes') document.title = titreDeLaPage(m.vivantes);
  });
  // Autorisation des notifications : demandée au premier clic (un navigateur la refuse sans geste de la personne).
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    document.addEventListener('click', () => Notification.requestPermission().catch(() => {}), { once: true });
  }
}
