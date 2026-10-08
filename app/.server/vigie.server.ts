// Vigie : suivi d'erreurs embarqué (dépôt FrancoisV34/vigie). Les erreurs du serveur et du
// navigateur sont nettoyées (secrets, e-mails, cartes, IBAN masqués, corps de requête supprimés),
// regroupées et stockées dans la base SQLite de l'application ; rien ne part sur le réseau.
//
// Le dossier ./vigie est une copie versionnée, vérifiée par `npm run check` : on ne la modifie
// jamais ici (corriger dans Vigie, puis recopier).
import * as Sentry from '@sentry/node';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { siteOrigin } from '../lib/site.server.ts';
import { VIGIE_CLE_NAVIGATEUR } from '../lib/vigie.ts';
import { authIsConfigured } from './auth/config.ts';
import { requireOwner } from './auth/owner.server.ts';
import { openDatabase } from './db/connection.ts';
import {
  baseBetterSqlite3,
  creerConsultation,
  creerPointEntree,
  creerSymboliseur,
  creerVigie,
  DSN_LOCAL,
  jetonValide,
  transportVigie,
  type Vigie,
} from './vigie/index.ts';

// Les cartes du navigateur sont déplacées hors de build/client après le build
// (scripts/assets/deplacer-cartes.ts) : elles restent sur le serveur, jamais servies.
const DOSSIER_CARTES = resolve('build/sourcemaps/client');

let instance: { vigie: Vigie; base: ReturnType<typeof baseBetterSqlite3> } | undefined;

function etat() {
  if (instance === undefined) {
    // Connexion dédiée : Vigie doit pouvoir écrire même si l'authentification n'est pas
    // configurée (erreur de démarrage, environnement local).
    const base = baseBetterSqlite3(openDatabase().sqlite);
    const vigie = creerVigie({
      base,
      symboliser: creerSymboliseur(async (nom) => {
        // Vigie ne transmet qu'un nom de fichier seul ; on le revérifie avant de lire le disque.
        if (basename(nom) !== nom) return undefined;
        return readFile(join(DOSSIER_CARTES, nom), 'utf8').catch(() => undefined);
      }),
    });
    instance = { vigie, base };
  }
  return instance;
}

/**
 * Le SDK 11 collecte par défaut cookies, en-têtes, corps et paramètres d'URL. Vigie les nettoie
 * de toute façon avant d'écrire ; on ne les collecte pas pour autant (défense en profondeur).
 */
export const COLLECTE_MINIMALE: Sentry.NodeOptions['dataCollection'] = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
};

let demarre = false;

/** À appeler une fois au démarrage du serveur (entry.server.tsx). */
export function demarrerVigie() {
  if (demarre || process.env.VIGIE_DESACTIVE === '1') return;
  demarre = true;
  Sentry.init({
    dsn: DSN_LOCAL,
    transport: transportVigie(etat().vigie),
    release: process.env.RELEASE || undefined,
    environment: process.env.NODE_ENV ?? 'development',
    dataCollection: COLLECTE_MINIMALE,
    // Pas de traces ni d'instrumentation automatique : seulement les erreurs.
    defaultIntegrations: false,
    integrations: [
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
    ],
  });
}

export function capturerErreurServeur(erreur: unknown) {
  Sentry.captureException(erreur);
}

/** Tunnel du SDK navigateur (POST /_vigie/enveloppe). */
export function recevoirEnveloppe(request: Request) {
  return creerPointEntree({
    vigie: etat().vigie,
    cle: VIGIE_CLE_NAVIGATEUR,
    origines: [siteOrigin()],
    // Fly réécrit `fly-client-ip` sur chaque requête entrante : c'est la seule adresse client
    // fiable ici (même choix que la limitation de débit de Better Auth).
    ipClient: (requete) => requete.headers.get('fly-client-ip') ?? undefined,
  })(request);
}

/**
 * Accès réservé : la session du propriétaire, ou le jeton des agents IA (`VIGIE_JETON_AGENTS`,
 * 32 caractères au moins, en en-tête `Authorization: Bearer`). Sinon Vigie répond 404.
 */
async function autoriser(request: Request) {
  const jeton = process.env.VIGIE_JETON_AGENTS;
  if (jeton !== undefined && jeton.length >= 32 && jetonValide(request, jeton)) return true;
  if (!authIsConfigured()) return false;
  try {
    await requireOwner(request);
    return true;
  } catch {
    return false;
  }
}

/** API des agents et dashboard (GET/POST /_vigie/...). */
export async function consulterVigie(request: Request) {
  const reponse = await creerConsultation({ base: etat().base, autoriser, origines: [siteOrigin()] })(request);
  return reponse ?? new Response(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
}
