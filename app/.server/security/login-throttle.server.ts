// Better Auth n'applique sa limitation de débit que dans son routeur HTTP
// (`auth.handler`). Le formulaire privé appelle `auth.api.signInEmail`
// directement : la limitation doit donc être posée ici, sinon rien ne borne
// les essais de mot de passe.
//
// La clé est l'adresse soumise, jamais l'IP : derrière le proxy Fly une IP est
// déclarative, alors qu'une seule adresse peut se connecter. Un compteur global
// borne en plus les tentatives sur des adresses inventées.

export type Throttle = ReturnType<typeof createLoginThrottle>;

export function createLoginThrottle({
  windowMs = 5 * 60_000,
  maxPerEmail = 5,
  maxGlobal = 30,
  now = () => Date.now(),
} = {}) {
  const attempts = new Map<string, number[]>();

  function recent(key: string, at: number) {
    const kept = (attempts.get(key) ?? []).filter((time) => at - time < windowMs);
    if (kept.length === 0) attempts.delete(key);
    else attempts.set(key, kept);
    return kept;
  }

  return {
    /** Nombre de secondes à attendre, ou 0 quand la tentative est permise. */
    retryAfter(email: string) {
      const at = now();
      const key = `email:${email}`;
      const perEmail = recent(key, at);
      const global = recent('global', at);
      const blocking = perEmail.length >= maxPerEmail ? perEmail : global.length >= maxGlobal ? global : null;
      if (!blocking) return 0;
      return Math.max(1, Math.ceil((windowMs - (at - Math.min(...blocking))) / 1000));
    },
    /** Un échec compte ; une réussite efface l'historique de l'adresse. */
    fail(email: string) {
      const at = now();
      const key = `email:${email}`;
      attempts.set(key, [...recent(key, at), at]);
      attempts.set('global', [...recent('global', at), at]);
    },
    succeed(email: string) {
      attempts.delete(`email:${email}`);
    },
  };
}

export const loginThrottle = createLoginThrottle();
