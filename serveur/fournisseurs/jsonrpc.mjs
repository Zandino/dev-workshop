// Liaison JSON-RPC par lignes avec un outil officiel lancé en sous-processus (Codex, Gemini).
// On ne parle qu'au binaire officiel : ses fichiers d'identifiants ne sont jamais lus ici.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/** Chemin d'un outil installé avec le projet (versions figées dans package.json). */
export const binaire = (nom) => path.join(RACINE, 'node_modules', '.bin', nom);

/**
 * Claude Code : celui que la personne a installé (dans le PATH) s'il existe, sinon celui que le SDK embarque
 * (paquet @anthropic-ai/claude-agent-sdk-<système>-<processeur>). Un serveur fraîchement installé n'a ainsi
 * besoin de rien d'autre.
 */
export function binaireClaude() {
  for (const dossier of (process.env.PATH || '').split(path.delimiter)) {
    if (dossier && existsSync(path.join(dossier, 'claude'))) return 'claude';
  }
  const famille = path.join(RACINE, 'node_modules', '@anthropic-ai');
  const prefixe = `claude-agent-sdk-${process.platform}-${process.arch}`;
  const paquet = existsSync(famille) ? readdirSync(famille).filter((n) => n.startsWith(prefixe)).sort()[0] : null;
  const embarque = paquet && path.join(famille, paquet, 'claude');
  return embarque && existsSync(embarque) ? embarque : 'claude';
}

/**
 * Lance `commande` et échange des messages JSON, un par ligne.
 * - demander(méthode, paramètres) -> promesse du résultat
 * - notifier(méthode, paramètres)
 * - surDemande(méthode, paramètres) -> résultat renvoyé à l'outil (demandes d'accord)
 * - surNotification(méthode, paramètres), surTexte(ligne non JSON), surFin()
 */
export function lier(commande, args, { env, cwd, surDemande, surNotification, surTexte, surFin }) {
  const enfant = spawn(commande, args, { env, cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  const attentes = new Map();
  let prochain = 1;
  let reste = '';
  let fini = false;

  const ecrire = (o) => {
    if (!fini && enfant.stdin.writable) enfant.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...o }) + '\n');
  };

  async function traiter(m) {
    if (m.id !== undefined && m.method) {
      try {
        ecrire({ id: m.id, result: await surDemande?.(m.method, m.params || {}) });
      } catch (e) {
        ecrire({ id: m.id, error: { code: -32601, message: String(e?.message || 'refus').slice(0, 200) } });
      }
    } else if (m.id !== undefined) {
      const a = attentes.get(m.id);
      attentes.delete(m.id);
      if (!a) return;
      if (m.error) a.refuser(new Error(String(m.error.message || 'erreur').slice(0, 300)));
      else a.resoudre(m.result);
    } else if (m.method) {
      surNotification?.(m.method, m.params || {});
    }
  }

  enfant.stdout.on('data', (d) => {
    reste += d.toString();
    const lignes = reste.split('\n');
    reste = lignes.pop();
    for (const ligne of lignes) {
      const l = ligne.trim();
      if (!l) continue;
      let m = null;
      if (l.startsWith('{')) {
        try { m = JSON.parse(l); } catch { /* pas du JSON */ }
      }
      if (m) traiter(m);
      else surTexte?.(l);
    }
  });
  enfant.stderr.on('data', () => { /* journaux de l'outil : ni affichés ni gardés */ });

  const terminer = () => {
    if (fini) return;
    fini = true;
    for (const a of attentes.values()) a.refuser(new Error('outil_arrete'));
    attentes.clear();
    surFin?.();
  };
  enfant.on('exit', terminer);
  enfant.on('error', terminer);

  return {
    demander(methode, params, delaiMs = 60000) {
      return new Promise((resoudre, refuser) => {
        if (fini) return refuser(new Error('outil_arrete'));
        const id = prochain++;
        const minuterie = delaiMs ? setTimeout(() => attentes.delete(id) && refuser(new Error('delai')), delaiMs) : null;
        attentes.set(id, {
          resoudre: (v) => { clearTimeout(minuterie); resoudre(v); },
          refuser: (e) => { clearTimeout(minuterie); refuser(e); },
        });
        ecrire({ id, method: methode, params });
      });
    },
    notifier: (methode, params) => ecrire({ method: methode, ...(params ? { params } : {}) }),
    /** Écrit une ligne brute sur l'entrée de l'outil (code de connexion collé par la personne). */
    saisir: (texte) => !fini && enfant.stdin.write(texte + '\n'),
    fermer() {
      if (!fini) enfant.kill('SIGTERM');
      setTimeout(() => !enfant.killed && enfant.kill('SIGKILL'), 2000).unref();
    },
  };
}
