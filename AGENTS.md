# Règles projet pour les agents de développement

## Sécurité obligatoire

Ce projet contient des données financières réelles et un espace privé. Lire [SECURITY.md](SECURITY.md) avant toute modification qui touche aux routes, données, authentification, dépendances, déploiement, import/export ou intégration externe.

- La sécurité est une condition de fin : chaque lot doit appliquer les éléments pertinents de la checklist et les vérifier par des tests adaptés.
- Le contrôle d’accès est toujours côté serveur. Ne jamais considérer une page cachée, un composant React ou `noindex` comme une protection.
- Ne jamais placer de secret, mot de passe, token, session, donnée financière privée ou sauvegarde dans Git, une URL, un log, un message d’erreur ou un asset client.
- Toute exposition potentielle d’un secret impose sa rotation et la révocation des sessions ou jetons concernés avant de poursuivre.
- Tout nouvel endpoint, mutation, import/export ou fournisseur externe doit recevoir une revue de sécurité avant livraison.
- À l’ajout d’une dépendance, vérifier sa nécessité, son maintien, son lockfile et l’audit de sécurité. Ne pas installer de package seulement pour du confort.
- Une future fonction IA ou agentique doit aussi suivre les références OWASP GenAI et Agentic 2026 indiquées dans `SECURITY.md`.
