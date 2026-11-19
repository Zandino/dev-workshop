// Liaison WebSocket avec le serveur : jeton d'accès, reconnexion, distribution des événements.
const CLE = 'devworkshop.jeton';
const ecouteurs = new Set();
let ws = null;
let jeton = null;
let essais = 0;

function lireStockage() {
  try { return localStorage.getItem(CLE); } catch { return null; }
}

/** Le lien d'accès porte le jeton dans le fragment : on le range et on le retire de la barre d'adresse. */
export function jetonInitial() {
  const m = location.hash.match(/jeton=([A-Za-z0-9_-]{20,})/);
  if (m) {
    definirJeton(m[1]);
    history.replaceState(null, '', location.pathname);
  } else {
    jeton = lireStockage();
  }
  return Boolean(jeton);
}

export function definirJeton(valeur) {
  jeton = valeur.trim();
  try { localStorage.setItem(CLE, jeton); } catch { /* stockage indisponible : le jeton reste en mémoire */ }
}

export function oublierJeton() {
  jeton = null;
  try { localStorage.removeItem(CLE); } catch { /* rien à retirer */ }
}

export const ecouter = (f) => ecouteurs.add(f);
const diffuser = (m) => ecouteurs.forEach((f) => f(m));

export function connecter() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ t: 'bonjour', jeton }));
  });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'general' && essais !== 0) diffuser({ t: 'canal', etat: 'retabli' });
    if (m.t === 'general') essais = 0;
    diffuser(m);
  });
  ws.addEventListener('close', (e) => {
    if (e.code === 4401) return diffuser({ t: 'canal', etat: 'jeton_refuse' });
    essais += 1;
    diffuser({ t: 'canal', etat: 'perdu' });
    setTimeout(connecter, Math.min(8000, 500 * 2 ** Math.min(essais, 4)));
  });
}

export function dire(ordre) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(ordre));
}
