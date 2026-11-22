// Essai des voix de l'équipe (voix-equipe.js) dans un navigateur simulé : voix naturelle accordée au genre et propre à
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
globalThis.AudioContext = class {
  get destination() { return {}; }
  createBuffer(_, n, taux) { return { n, taux, getChannelData: () => new Float32Array(n) }; }
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

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
