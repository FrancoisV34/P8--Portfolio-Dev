import * as Sentry from "@sentry/browser";
import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import { VIGIE_DSN_NAVIGATEUR, VIGIE_TUNNEL } from "./lib/vigie";

// Vigie : les erreurs du navigateur partent vers le tunnel de l'application (même origine).
// Seulement les erreurs : ni traces, ni fil d'Ariane (clics, requêtes, console), ni donnée
// d'utilisateur collectée par le SDK.
Sentry.init({
  dsn: VIGIE_DSN_NAVIGATEUR,
  tunnel: VIGIE_TUNNEL,
  release: import.meta.env.VITE_RELEASE || undefined,
  environment: import.meta.env.MODE,
  defaultIntegrations: false,
  integrations: [
    Sentry.globalHandlersIntegration(),
    Sentry.linkedErrorsIntegration(),
    Sentry.dedupeIntegration(),
  ],
  dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
});

// React journalise ces erreurs par défaut ; on garde ce journal en plus de l'envoi à Vigie.
const capturer = (error: unknown) => {
  console.error(error);
  Sentry.captureException(error);
};

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
    { onUncaughtError: capturer, onCaughtError: capturer },
  );
});
