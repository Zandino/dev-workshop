// Essai des voix de l'équipe (voix-equipe.js) et des annonces (annonces.js) dans un navigateur simulé : voix naturelle accordée au genre et propre à
// chacun, un seul membre parle à la fois (dans l'ordre), relais par la voix du système quand les voix naturelles
// manquent (timbre propre à chacun). Canal, audio et synthèse du système sont factices.
//   node tests/voix-equipe.mjs
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html>', { url: 'http://127.0.0.1/' });
const { window } = dom;
for (const nom of ['document', 'location', 'history', 'localStorage', 'Node', 'Element', 'HTMLElement']) {
  Object.defineProperty(globalThis, nom, { value: window[nom], configurable: true });
}
globalThis.window = window;
globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
const envois = [];
let auMessage = null;
globalThis.WebSocket = class {
  static OPEN = 1;
  readyState = 1;
  addEventListener(type, f) { if (type === 'message') auMessage = f; }
  send(x) { envois.push(JSON.parse(x)); }
};
// Audio factice : on déclenche la fin de lecture à la main.
const lectures = [];
const gains = [];
globalThis.AudioContext = class {
  get destination() { return {}; }
  createBuffer(_, n, taux) { return { n, taux, getChannelData: () => new Float32Array(n) }; }
  createGain() { const g = { gain: { value: 1 }, connect() {} }; gains.push(g); return g; }
  createBufferSource() { const s = { playbackRate: { value: 1 }, connect() {}, start() { lectures.push(s); }, stop() {} }; return s; }
};
const phrasesSysteme = [];
window.speechSynthesis = { getVoices: () => [{ name: 'Microsoft Hortense', lang: 'fr-FR' }, { name: 'Microsoft Paul', lang: 'fr-FR' }], speak: (u) => { phrasesSysteme.push(u); u.onstart?.(); }, cancel() {} };
globalThis.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
register('./crochets.mjs', import.meta.url);
const { connecter } = await import('../public/js/canal.js');
const { definirEtatVoix, parlerMembre, choisirMoteur, taire } = await import('../public/js/voix-equipe.js');
connecter();
const recevoir = (m) => auMessage({ data: JSON.stringify(m) });

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};

definirEtatVoix({ installee: true, installation: null, voix: [
  { cle: 'siwis', langue: 'fr', genre: 'f' }, { cle: 'jessica', langue: 'fr', genre: 'f' },
  { cle: 'pierre', langue: 'fr', genre: 'm' },
] });
choisirMoteur('naturelle');
const parlent = [];
const quiParle = (cle) => parlent.push(cle);
const lea = { cle: 'principal', feminin: true };
const hugo = { cle: 'sous:t1', feminin: false };
parlerMembre(lea, 'Bonjour, je suis Léa.', quiParle);
parlerMembre(hugo, 'Et moi Hugo.', quiParle);
const [d1, d2] = envois.filter((e) => e.t === 'voix_dire');
noter('voix accordée au genre (Léa : voix de femme, Hugo : voix d’homme)', ['siwis', 'jessica'].includes(d1?.voix) && d2?.voix === 'pierre', `${d1?.voix} / ${d2?.voix}`);
noter('débit propre à chacun (0,92 à 1,08)', d1.vitesse >= 0.92 && d1.vitesse <= 1.08 && d2.vitesse >= 0.92 && d2.vitesse <= 1.08);
const pcm = Buffer.alloc(200).toString('base64');
recevoir({ t: 'voix_audio', id: d2.id, taux: 22050, pcm }); // la voix de Hugo arrive avant celle de Léa
noter('ordre gardé : Hugo attend que Léa ait parlé', lectures.length === 0 && parlent.length === 0);
recevoir({ t: 'voix_audio', id: d1.id, taux: 22050, pcm });
noter('Léa parle, seule', lectures.length === 1 && parlent.at(-1) === 'principal');
lectures[0].onended();
noter('puis Hugo', lectures.length === 2 && parlent.at(-1) === 'sous:t1');
lectures[1].onended();
noter('puis plus personne', parlent.at(-1) === null);

// Voix naturelles absentes sur le serveur : la voix du système prend le relais, avec un timbre propre.
parlerMembre(lea, 'Encore moi.', quiParle);
const d3 = envois.filter((e) => e.t === 'voix_dire').at(-1);
recevoir({ t: 'voix_audio', id: d3.id, erreur: 'voix_absente' });
noter('relais par la voix du système (voix de femme)', phrasesSysteme.at(-1)?.voice?.name === 'Microsoft Hortense' && phrasesSysteme.at(-1).pitch >= 0.85 && phrasesSysteme.at(-1).pitch <= 1.16);
taire();
choisirMoteur('systeme');
const avant = envois.length;
parlerMembre(hugo, 'Voix du système choisie.', quiParle);
noter('moteur « système » choisi : rien ne part au serveur, voix d’homme', envois.length === avant && phrasesSysteme.at(-1)?.voice?.name === 'Microsoft Paul');

// Réglage « Voix » : tout dire / l'essentiel / muet, et les annonces (annonces.js).
const { modeVoix, choisirModeVoix, choisirVolume, volumeVoix } = await import('../public/js/voix-equipe.js');
const { phraseAnnonce, aAnnoncer, initAnnonces } = await import('../public/js/annonces.js');
window.localStorage.setItem('devworkshop.voix', 'oui');
noter('ancien réglage « oui » : tout dire', modeVoix() === 'tout');
window.localStorage.removeItem('devworkshop.voix');
noter('par défaut : tout dire', modeVoix() === 'tout');
const accord = { t: 'alerte', id: 'autre', genre: 'accord', projet: 'intervizio', auteur: 'GPT' };
noter('phrases : besoin de toi, terminé, arrêté', phraseAnnonce(accord) === 'GPT a besoin de toi sur intervizio.'
  && phraseAnnonce({ genre: 'fini', projet: 'intervizio' }) === 'Travail terminé sur intervizio.'
  && phraseAnnonce({ genre: 'echec', projet: 'intervizio' }) === 'Le travail s’est arrêté sur intervizio.'
  && phraseAnnonce({ genre: 'accord', projet: 'p' }, { ici: true, prenom: 'Léa' }) === 'Léa a besoin de toi sur p.');
noter('pas d’annonce pour la mémoire ou les échanges', phraseAnnonce({ genre: 'memoire' }) === null && !aAnnoncer({ genre: 'echange' }, { mode: 'essentiel' }));
noter('l’essentiel : annoncé même pour la discussion affichée', aAnnoncer(accord, { mode: 'essentiel', ici: true, equipeVisible: true }));
noter('tout dire : l’équipe visible le dit déjà, pas de doublon ; les autres discussions, si', !aAnnoncer(accord, { mode: 'tout', ici: true, equipeVisible: true }) && aAnnoncer(accord, { mode: 'tout', ici: false, equipeVisible: true }));
noter('muet : rien', !aAnnoncer(accord, { mode: 'non', ici: false }));
choisirModeVoix('naturelle'); // valeur inconnue : ignorée
noter('valeur inconnue ignorée', modeVoix() === 'tout');
taire(); // la phrase de Hugo (voix du système factice) ne finit jamais d'elle-même
choisirMoteur('naturelle');
initAnnonces({ session: () => 'affichee' });
choisirModeVoix('essentiel');
const avantAnnonce = envois.length;
recevoir({ t: 'alerte', id: 'autre', genre: 'fini', projet: 'intervizio' });
const annonce = envois.slice(avantAnnonce).find((e) => e.t === 'voix_dire');
noter('l’essentiel : « Travail terminé sur intervizio » part à la voix', annonce?.texte === 'Travail terminé sur intervizio.', annonce?.texte);
choisirVolume(0.3);
recevoir({ t: 'voix_audio', id: annonce?.id, taux: 22050, pcm });
noter('volume : la voix part au volume choisi', gains.at(-1)?.gain.value === 0.3 && volumeVoix() === 0.3);
choisirVolume(0.6);
noter('… et la phrase en cours suit le curseur', gains.at(-1)?.gain.value === 0.6);
choisirVolume(7);
noter('volume borné entre 0 et 1', volumeVoix() === 1);
lectures.at(-1)?.onended?.();
choisirModeVoix('non');
const avantMuet = envois.length;
const systemeAvantMuet = phrasesSysteme.length;
recevoir({ t: 'alerte', id: 'autre', genre: 'accord', projet: 'intervizio' });
parlerMembre(hugo, 'Je parle quand même ?', quiParle);
noter('muet : ni annonce ni parole', envois.length === avantMuet && phrasesSysteme.length === systemeAvantMuet);

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
