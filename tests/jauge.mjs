// Essai de la jauge de consommation, sans serveur : une discussion reprise ne doit pas afficher le cumul de toute
// son histoire comme le prix d'un tour. Chiffres relevés le 21/11/2026 sur une vraie reprise (323,90 $ au 1er tour).
// Usage : node tests/jauge.mjs
import { JSDOM } from 'jsdom';
import { register } from 'node:module';

const dom = new JSDOM('<!doctype html><html lang="fr"><body><button id="jauge"></button><section id="conso"></section></body></html>', { url: 'http://localhost/' });
for (const nom of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'DocumentFragment']) {
  Object.defineProperty(globalThis, nom, { value: nom === 'window' ? dom.window : dom.window[nom], configurable: true });
}
Object.defineProperty(globalThis, 'localStorage', { value: dom.window.localStorage, configurable: true });
dom.window.localStorage.setItem('devworkshop.langue', 'fr');
register('./crochets.mjs', import.meta.url);
const { majJauge, razJauge } = await import('../public/js/jauge.js');

const bilan = [];
const noter = (nom, ok, detail = '') => {
  bilan.push(Boolean(ok));
  console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
};
const pastille = () => document.querySelector('#jauge .cout')?.textContent || '';
const rangee = (debut) => [...document.querySelectorAll('#conso tr')].find((tr) => tr.querySelector('th')?.textContent.startsWith(debut));
const coutDe = (tr) => tr?.lastChild.textContent || '';
const opus = (entree, cacheLu, cout) => ({ modele: 'claude-opus-5-5', entree, sortie: 100, cacheLu, cacheEcrit: 0, cout });

// Discussion reprise : le premier tour rend le cumul de toute l'histoire.
razJauge();
majJauge({ t: 'tour', ok: true, anterieur: true, coutSession: 323.90342764499985, modeles: [opus(51706, 349204077, 323.9)] });
noter('1er tour après reprise : pas de coût dans la pastille', pastille() === '', pastille());
noter('« Dernier tour » : inconnu, pas 323 $', /inconnu/.test(rangee('Dernier tour')?.textContent) && !/323/.test(coutDe(rangee('Dernier tour'))), rangee('Dernier tour')?.textContent);
noter('le cumul de la discussion est montré à part, nommé comme tel', /323/.test(coutDe(rangee('Cumul de la discussion'))));
majJauge({ t: 'tour', ok: true, coutSession: 325.40342764499985, modeles: [opus(52706, 349504077, 325.4)] });
noter('2e tour : la pastille montre 1,50 $', /1[,.]50/.test(pastille()), pastille());
noter('« Dernier tour » : 1,50 $', /1[,.]50/.test(coutDe(rangee('Dernier tour'))), coutDe(rangee('Dernier tour')));
noter('« Depuis l’ouverture ici » : jetons du 2e tour seulement', /1\s?000/.test(rangee('Depuis l’ouverture ici')?.children[1].textContent) && /1[,.]50/.test(coutDe(rangee('Depuis l’ouverture ici'))), rangee('Depuis l’ouverture ici')?.textContent);

// Discussion neuve : rien ne change.
razJauge();
majJauge({ t: 'tour', ok: true, coutSession: 0.42, modeles: [opus(1000, 0, 0.42)] });
noter('discussion neuve : le 1er tour a son coût', /0[,.]42/.test(pastille()) && /0[,.]42/.test(coutDe(rangee('Dernier tour'))) && !rangee('Cumul de la discussion'));

// Reprise, puis changement d'équipe (ou relais) : le compteur d'une nouvelle session repart de zéro.
razJauge();
majJauge({ t: 'tour', ok: true, anterieur: true, coutSession: 323.9, modeles: [opus(1, 1, 323.9)] });
majJauge({ t: 'tour', ok: true, coutSession: 325.4, modeles: [opus(2, 2, 325.4)] });
majJauge({ t: 'tour', ok: true, coutSession: 0.3, modeles: [opus(3, 3, 0.3)] });
noter('compteur reparti de zéro : jamais négatif, 1,50 + 0,30 = 1,80 $', /1[,.]80/.test(pastille()) && !pastille().includes('-'), pastille());
noter('« Dernier tour » de la nouvelle session : 0,30 $', /0[,.]30/.test(coutDe(rangee('Dernier tour'))), coutDe(rangee('Dernier tour')));
// … puis l'orchestre reprend la même session Claude Code : nouveau cumul « antérieur ».
majJauge({ t: 'tour', ok: true, anterieur: true, coutSession: 330, modeles: [opus(4, 4, 330)] });
noter('reprise en route : ce qui était dépensé reste compté, rien d’inventé', /1[,.]80/.test(pastille()), pastille());

const echecs = bilan.filter((x) => !x).length;
console.log(`\n${bilan.length - echecs}/${bilan.length} vérifications réussies.`);
process.exit(echecs ? 1 : 0);
