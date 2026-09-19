// En-têtes de sécurité appliqués à chaque réponse du serveur de production.
// Valeurs alignées le 19 septembre 2026 sur l'OWASP HTTP Security Response
// Headers Cheat Sheet et l'OWASP Secure Headers Project.
// https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
// https://github.com/OWASP/www-project-secure-headers

// Les fonctionnalités matérielles ne servent ni au portfolio ni à l'espace
// financier : elles sont refusées à la page elle-même comme à ses cadres.
const disabledFeatures = [
  'accelerometer', 'autoplay', 'browsing-topics', 'camera', 'display-capture',
  'encrypted-media', 'fullscreen', 'geolocation', 'gyroscope', 'magnetometer',
  'microphone', 'midi', 'payment', 'picture-in-picture', 'publickey-credentials-get',
  'screen-wake-lock', 'usb', 'xr-spatial-tracking',
];

/**
 * Politique de contenu liée au nonce de la requête : React Router insère ses
 * scripts d'hydratation en ligne, le nonce les autorise sans ouvrir
 * `unsafe-inline` aux scripts injectés par une faille XSS.
 *
 * `style-src` conserve `unsafe-inline` : React applique les styles calculés
 * (`style={{…}}`) en attribut, et la feuille Google Fonts est chargée par
 * `public-layout.tsx`. `frame-src 'self'` sert au CV affiché en cadre.
 */
export function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'none'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "manifest-src 'self'",
    "frame-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ].join('; ');
}

/**
 * `secure` vaut vrai quand la requête est arrivée en HTTPS : HSTS ne doit
 * jamais être émis sur une connexion locale en clair.
 */
export function securityHeaders({ nonce, secure }: { nonce: string; secure: boolean }) {
  return {
    'Content-Security-Policy': contentSecurityPolicy(nonce),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
    'Permissions-Policy': disabledFeatures.map((feature) => `${feature}=()`).join(', '),
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Permitted-Cross-Domain-Policies': 'none',
    ...(secure ? { 'Strict-Transport-Security': 'max-age=63072000; includeSubDomains' } : {}),
  };
}
