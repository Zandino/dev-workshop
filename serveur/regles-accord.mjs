// Règles d'accord d'un projet : ce que l'IA peut faire sans te demander (lectures, modifications dans le projet,
// tests, navigateur) et ce qui est toujours refusé (suppressions, réseau). Entre le mode manuel et « tout
// autoriser » : l'IA avance seule sur le travail courant, et s'arrête sur ce qui est risqué.
import path from 'node:path';
import { lireRegles, ecrireRegles, projetDe } from './projets.mjs';

// Sans réglage, rien ne change : toutes les demandes reviennent à l'écran, comme avant.
export const REGLES_DEFAUT = { lectures: false, modifications: false, tests: false, navigateur: false, refuserSuppressions: false, refuserReseau: false };
const CLES = Object.keys(REGLES_DEFAUT);

const LECTURE = /^(Read|Glob|Grep|LS|NotebookRead|TodoWrite|WebSearch)$/;
const ECRITURE = /^(Edit|Write|MultiEdit|NotebookEdit|Patch)$/;
// Commandes de test et de compilation, seules (pas d'enchaînement ni de redirection : rien de caché derrière).
const TEST = /^(npm|pnpm|yarn|bun)\s+(test|run\s+(test|build|lint|typecheck|check)[\w:.-]*)\b|^npx\s+(vitest|jest|eslint|tsc|prettier\s+--check|playwright\s+test)\b|^(pytest|go\s+test|cargo\s+(test|build|check)|make(\s+(test|build|check))?|dotnet\s+(test|build)|php\s+artisan\s+test|phpunit)\b/;
const META = /[;&|`$<>]|\n/;
const SUPPRESSION = /(^|[\s;&|(])(rm|rmdir|shred|mkfs|dd)\s|git\s+push\s+(-f\b|--force)|git\s+reset\s+--hard|git\s+clean\s+-[a-z]*f|drop\s+(table|database)/i;
const RESEAU = /(^|[\s;&|(])(curl|wget|ssh|scp|rsync|nc|ncat|telnet|ftp)\s/;

export function reglesDu(nom) {
  return { ...REGLES_DEFAUT, ...(lireRegles(nom) || {}) };
}

export function enregistrerRegles(nom, saisie) {
  const regles = Object.fromEntries(CLES.map((k) => [k, saisie?.[k] === true]));
  ecrireRegles(nom, regles);
  return regles;
}

const reglesDuDossier = (dossier) => {
  const nom = projetDe(dossier);
  return nom ? reglesDu(nom) : REGLES_DEFAUT;
};

const dansLeProjet = (dossier, fichier) => {
  if (!fichier) return true; // pas de chemin (Patch de Codex) : ses écritures restent bornées au projet
  const complet = path.resolve(dossier, String(fichier));
  return complet === dossier || complet.startsWith(dossier + path.sep);
};

/**
 * Décision automatique pour une demande d'accord : 'autoriser', 'refuser', ou null (on demande à la personne).
 * `outil` : nom de l'outil (Read, Edit, Bash, mcp__navigateur__…) ; `entree` : ses paramètres.
 */
export function decisionAuto(dossier, outil, entree = {}) {
  const r = reglesDuDossier(dossier);
  const commande = String(entree.command || '').trim();
  if (commande) {
    if (r.refuserSuppressions && SUPPRESSION.test(commande)) return 'refuser';
    if (r.refuserReseau && RESEAU.test(commande)) return 'refuser';
    if (r.tests && /^(Bash|shell|execute)$/i.test(outil) && TEST.test(commande) && !META.test(commande)) return 'autoriser';
    return null;
  }
  if (r.lectures && LECTURE.test(outil)) return 'autoriser';
  if (r.modifications && ECRITURE.test(outil) && dansLeProjet(dossier, entree.file_path || entree.notebook_path || entree.path)) return 'autoriser';
  if (r.navigateur && /^mcp__navigateur__/.test(outil)) return 'autoriser';
  return null;
}

/** Règles de refus au format de Claude Code : elles s'appliquent dans tous les modes, même « tout autoriser ». */
export function interditsClaude(dossier) {
  const r = reglesDuDossier(dossier);
  return [
    ...(r.refuserSuppressions ? ['Bash(rm:*)', 'Bash(rmdir:*)', 'Bash(shred:*)', 'Bash(git push --force:*)', 'Bash(git push -f:*)', 'Bash(git reset --hard:*)', 'Bash(git clean:*)'] : []),
    ...(r.refuserReseau ? ['Bash(curl:*)', 'Bash(wget:*)', 'Bash(ssh:*)', 'Bash(scp:*)', 'Bash(rsync:*)', 'Bash(nc:*)'] : []),
  ];
}

export const MOTIF_REFUS = 'Refusé par les règles d’accord du projet (réglages du projet dans Dev Workshop).';
