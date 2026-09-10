// Verrou temporaire : à remplacer par la vérification de session ET du propriétaire
// lors de L04. Aucun accès aux données financières n'est autorisé à ce stade.
export function denyFinanceAccess(): never {
  throw new Response('Espace privé indisponible.', {
    status: 503,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
