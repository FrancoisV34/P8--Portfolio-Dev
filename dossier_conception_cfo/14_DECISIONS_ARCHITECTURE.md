# 14 — Décisions d'architecture

Statut au 8 septembre 2026 : décisions mises à jour après les arbitrages de François. La cible React Router remplace Astro ; le serveur Node.js avec SQLite remplace la cible Vercel du dossier design. Fly.io est retenu pour évaluation, sans déploiement ni coût garanti.

Voir [le registre des décisions](16_ARBITRAGES_STACK_PROJET.md) et [les décisions design](../design-system/00-decisions.md).

- ADR-001 SQLite confirmé avec Drizzle + better-sqlite3 et abstraction repository.
- ADR-002 React Router en mode framework + React + TypeScript + Node.js ; remplace Astro shell/SSR et React islands.
- ADR-003 argent en centimes INTEGER.
- ADR-004 règles réglementaires versionnées.
- ADR-005 séparation foyer/business.
- ADR-006 moteur explicable et historisé.
- ADR-007 pas de conseil juridique automatique définitif.
- ADR-008 moteur déterministe avant IA.
- ADR-009 manual-first ; synchro bancaire future optionnelle.
- ADR-010 portfolio public ; CFO, GoMining, données et projections privés.
- ADR-011 François seul utilisateur autorisé ; Better Auth, identité fixe côté serveur, inscription désactivée.
- ADR-012 Tailwind/shadcn, Zod/React Hook Form, Recharts, TanStack Table, decimal.js, Vitest/Playwright validés ; CSS en finance, GSAP pour le portfolio selon besoin.
- ADR-013 serveur avec stockage persistant ; Fly.io à évaluer, sauvegardes privées hors du volume et coût à confirmer.
- ADR-014 démonstration publique à données fictives reportée ; aucun partage avec d'autres utilisateurs dans le périmètre actuel.

## Périmètre confirmé le 8 septembre 2026
- Le module financier est obligatoire dans le projet final.
- La simulation GoMining simple est ajoutée aux investissements et simulations, conformément à [sa spécification](15_GOMINING_STRATEGIE_SIMULATION.md).
- La stack et le périmètre d'accès sont validés. L'implémentation reste pour une étape ultérieure ; paramètres GoMining et modalités d'exploitation restent à préciser au moment utile.
