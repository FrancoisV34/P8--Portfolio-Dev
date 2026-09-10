# 20 — Authentification du compte privé unique

Réalisation du 9 septembre 2026 sur `refacto`. L’application garde un portfolio public et protège l’espace financier par un seul compte local : celui défini dans l’environnement privé. Aucun utilisateur réel, mot de passe ou secret n’est versionné.

## Parcours disponible

- `/login` reçoit l’adresse e-mail et le mot de passe du propriétaire.
- Une session valide ouvre `/finance` ; elle expire après douze heures d’inactivité prolongée et est actualisée au plus une fois par heure.
- Le bouton de déconnexion détruit la session serveur.
- Sans session, avec une autre adresse e-mail ou après déconnexion, les routes `/finance/*` et `/api/finance/*` répondent par un refus privé sans contenu financier.
- Sans configuration d’authentification, ces routes restent en `503` et ne démarrent aucune base ou compte implicite.

Better Auth utilise SQLite via l’adaptateur Drizzle. Les tables `user`, `session`, `account` et `verification` font partie de la migration `0001_auth_owner.sql`.

## Création locale du compte

1. Copier `.env.example` dans `.env`.
2. Définir `BETTER_AUTH_SECRET` avec une valeur secrète d’au moins 32 caractères, `FINANCE_OWNER_EMAIL` et `FINANCE_OWNER_NAME`.
3. Appliquer les migrations avec `npm run db:migrate`.
4. Lancer `npm run auth:bootstrap` et choisir le mot de passe demandé, masqué dans le terminal.

La commande refuse d’ajouter un compte si la base contient déjà un utilisateur. `npm run auth:reset-password` remplace le mot de passe du propriétaire et supprime ses sessions existantes. Ces opérations se font uniquement sur le serveur ou le poste local qui détient la base et le fichier `.env`.

## Surface HTTP volontairement réduite

La route `/api/auth/*` accepte seulement :

- `POST /api/auth/sign-in/email` ;
- `GET /api/auth/get-session` ;
- `POST /api/auth/sign-out`.

Les inscriptions, invitations, réinitialisations publiques, mises à jour de profil et tout autre endpoint Better Auth répondent `404`. Le provisionnement initial et le changement de mot de passe passent par les commandes serveur ci-dessus. Les cookies de session restent gérés par Better Auth et l’API impose une limite de cinq tentatives de connexion par minute pour ce chemin.

## Vérifications réalisées

- Tests unitaires de lecture de configuration : secret, e-mail, nom et origine invalides sont refusés.
- Tests d’intégration : les endpoints publics interdits renvoient `404`, le propriétaire est accepté, une autre identité est refusée et une session absente est reconnue comme telle.
- Test navigateur : connexion propriétaire, accès à `/finance`, déconnexion et disparition de la session.
- Test navigateur existant : le portfolio public reste accessible et les routes financières sont toujours fermées lorsqu’aucun `.env` n’est configuré.

Ce lot réalise L04 pour une utilisation locale. Avant toute donnée financière réelle en ligne, L06 reste obligatoire : stockage persistant, sauvegarde et restauration testée sur l’hébergeur retenu.
