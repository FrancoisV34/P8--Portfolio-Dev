# Sécurité du projet

Ce document est la mémoire de sécurité du projet. Il s’applique au portfolio public, à l’espace financier privé, à la base SQLite, aux sauvegardes et aux futures intégrations.

## Références vivantes

Vérifié le **9 septembre 2026** : l’édition générale la plus récente est [OWASP Top 10:2025](https://owasp.org/Top10/). Elle reste la checklist de base pour l’application web. [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/) sert de référence plus précise lorsque le contrôle doit être testé ou mis en ligne.

Si un lot introduit un LLM, un assistant ou un agent qui peut lire des données, appeler des outils ou produire une décision, compléter cette checklist par l’[OWASP GenAI LLM Top 10 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) et l’[OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/). Ces référentiels sont distincts du Top 10 web général.

## Règles non négociables

- Les données financières, secrets, fichiers SQLite, sauvegardes, exports et journaux détaillés restent privés et exclus de Git, des URL, du navigateur et des caches publics.
- Toute autorisation est recalculée côté serveur pour chaque lecture, mutation, téléchargement et simulation. L’identifiant fourni par le navigateur ne suffit jamais à autoriser une ressource.
- Les formulaires qui reçoivent un secret utilisent `POST` ; un mot de passe, token ou code de récupération ne figure jamais dans une URL. Une exposition impose immédiatement rotation et révocation.
- Les erreurs envoyées au navigateur sont utiles mais ne révèlent ni stack trace, ni structure de base, ni existence d’un autre compte, ni valeur financière privée.
- Aucun déploiement avec données réelles ne précède une sauvegarde restaurée avec succès, une configuration HTTPS, une vérification des secrets et un contrôle des accès.

## OWASP Top 10 général — contrôles attendus

| Risque OWASP actuel | Contrôles attendus dans ce projet |
|---|---|
| A01 — Contrôle d’accès défaillant | Garde serveur centralisée ; vérification du propriétaire et de l’appartenance de toute donnée ; tests sans session, avec autre identité et par appel direct d’API. |
| A02 — Mauvaise configuration | Secrets seulement dans l’environnement ; développement lié à `127.0.0.1` ; configuration de production revue, HTTPS, en-têtes de sécurité, CORS minimal, proxy de confiance explicitement configuré. |
| A03 — Défaillances de chaîne logicielle | Dépendance nécessaire et maintenue ; lockfile versionné ; `npm audit` après ajout ou mise à jour ; mise à jour des correctifs de sécurité ; scripts et artefacts de build revus. |
| A04 — Défaillances cryptographiques | TLS en production ; secret de session long et aléatoire ; mots de passe hachés par Better Auth ; aucune cryptographie maison ; sauvegardes chiffrées ou conservées dans un stockage privé à accès limité. |
| A05 — Injection | Validation serveur avec schémas ; Drizzle et requêtes paramétrées ; aucune concaténation SQL, commande shell ou URL provenant d’une donnée utilisateur ; encodage de sortie et contrôle des contenus HTML. |
| A06 — Conception non sécurisée | Modéliser les données, rôles, frontières et abus possibles avant un flux sensible ; montants en unités entières ; opérations financières atomiques, traçables et testées contre les cas limites. |
| A07 — Défaillances d’authentification | Inscription désactivée ; session courte et révocable ; cookies `HttpOnly`, `Secure` en HTTPS et `SameSite` adapté ; réponse générique aux identifiants invalides ; limitation des tentatives ; changement de mot de passe qui révoque les sessions. |
| A08 — Intégrité logicielle ou des données | Migrations relues et testées ; sauvegarde/restauration vérifiées ; entrées d’import validées ; intégrations, webhooks et fichiers reçus authentifiés avant traitement ; ne jamais exécuter de contenu importé. |
| A09 — Journalisation et alertes insuffisantes | Journaliser les événements de sécurité minimaux sans secrets ni montants détaillés : échec de connexion, accès refusé, changement de configuration, export, restauration et erreur serveur. Prévoir une revue des échecs en production. |
| A10 — Mauvaise gestion des conditions exceptionnelles | Refus par défaut ; délais, tailles et volumes bornés ; erreurs gérées pour SQLite, réseau et intégrations ; aucune donnée partielle présentée comme valide ; test des échecs et restauration d’un état cohérent. |

## Checklist avant de considérer une modification terminée

### Pour toute modification

- [ ] Identifier les données lues, écrites, exposées ou mises en cache.
- [ ] Valider côté serveur toutes les entrées et borner formats, tailles et volumes.
- [ ] Vérifier que les erreurs, logs, tests et URLs ne contiennent aucune donnée privée ni secret.
- [ ] Ajouter ou adapter les tests utiles, puis exécuter types, lint et tests concernés.

### Si la modification touche une route, une API ou une donnée privée

- [ ] Vérifier l’autorisation côté serveur avant la lecture et avant la mutation.
- [ ] Tester une requête sans session, avec session non autorisée et avec identifiant de ressource manipulé.
- [ ] Répondre avec un statut HTTP cohérent et sans détail sensible ; appliquer `no-store` aux données privées.
- [ ] Vérifier protection CSRF, même origine et limites de débit quand la route modifie un état.

### Si elle touche l’authentification, un mot de passe ou une session

- [ ] Aucun secret dans une URL, une prop client, un log ou une fixture.
- [ ] Vérifier connexion, échec générique, expiration, déconnexion et révocation.
- [ ] Vérifier les attributs des cookies sur l’environnement réellement visé.
- [ ] En cas d’exposition, tourner le secret ou mot de passe et invalider les sessions avant livraison.

### Si elle touche les dépendances, SQLite, une intégration ou le déploiement

- [ ] Vérifier la provenance et le besoin de chaque dépendance ; exécuter `npm audit` après changement.
- [ ] Tester migrations, contraintes, annulation atomique et restauration pour une donnée financière.
- [ ] Vérifier que fichier de base, WAL/SHM, sauvegardes et exports restent hors du serveur de fichiers public.
- [ ] Définir les délais, réessais, limites et traitement des pannes externes avant d’activer une intégration.
- [ ] Avant production : HTTPS, secrets de production, stockage persistant, sauvegarde restaurée et accès privé testés.

## Contrôles en place — revue du 19 septembre 2026

Revue complète du dépôt, de son historique Git et de la configuration de
déploiement. Aucun secret, identifiant ni fichier de base n'est suivi par Git,
ni ne l'a jamais été : seuls des mots de passe de test figurent dans les
fixtures. `npm audit` ne signale aucune vulnérabilité.

| Contrôle | Où | Vérifié par |
|---|---|---|
| Session propriétaire recalculée à chaque lecture et mutation | `app/.server/auth/owner.server.ts` | `tests/integration/auth.test.ts`, `tests/integration/finance-route.test.ts` |
| Même origine exigée sur les mutations **et sur la connexion** | `app/.server/security/same-origin.server.ts` | `tests/unit/same-origin.test.ts`, `tests/integration/auth.test.ts` |
| Limitation des essais de mot de passe | `app/.server/security/login-throttle.server.ts` | `tests/unit/login-throttle.test.ts`, `tests/integration/auth.test.ts` |
| En-têtes de sécurité sur chaque réponse | `app/.server/security/headers.server.ts`, `scripts/production/server.mjs` | `tests/unit/security-headers.test.ts`, `tests/auth-e2e/security-headers.spec.ts` |
| Une seule adresse publique : un autre nom d'hôte reçoit un 308 vers `SITE_URL`, destination jamais tirée du `Host` ; `/healthz` exclu | `app/.server/security/canonical-host.server.ts`, `scripts/production/server.mjs` | `tests/unit/canonical-host.test.ts`, `tests/auth-e2e/canonical-host.spec.ts` |
| Adresse de connexion non publique, réponse identique ailleurs ; l'entrée discrète du pied de page (trois clics sur le copyright) fait taper l'adresse sans jamais l'écrire dans la page | `app/.server/security/private-path.server.ts`, `app/Components/HiddenEntry.tsx` | `tests/unit/private-path.test.ts`, `tests/unit/hidden-entry.test.ts`, `tests/auth-e2e/login.spec.ts`, `tests/auth-e2e/hidden-entry.spec.ts` |
| Cookie de session `HttpOnly`, `SameSite=Strict`, `Secure` en HTTPS | `app/.server/auth/auth.server.ts` | `tests/auth-e2e/login.spec.ts` |
| Relevés importés : rien n'entre au journal sans validation explicite, ligne par ligne et atomique | `app/.server/repositories/imports.ts` | `tests/integration/imports.test.ts`, `tests/integration/finance-route.test.ts` |
| Relevé PDF déposé : lu dans un processus séparé (tas plafonné, sans environnement, sous `nobody`, tué au délai), corps de requête borné, fichier jamais conservé, import refusé si les opérations lues ne retombent pas sur le solde de fin | `app/.server/imports/`, `boundedFormData` dans `app/routes/finance.tsx` | `tests/integration/statement-pdf.test.ts`, `tests/integration/finance-route.test.ts`, `tests/auth-e2e/finance-journal.spec.ts` |
| Rapprochement et validation groupée : un clic explicite, reconnaissance recalculée côté serveur, un mouvement rattaché à une seule ligne, même compte et même sens exigés | `app/.server/repositories/imports.ts` | `tests/integration/imports.test.ts`, `tests/integration/finance-route.test.ts` |
| Connexion uniquement par l'adresse privée : le routeur Better Auth n'expose que la lecture de session | `app/routes/api-auth.ts` | `tests/integration/auth.test.ts` |
| Base et sauvegardes hors des fichiers servis | `app/.server/db/config.ts` | `tests/integration/database.test.ts`, `tests/dev/private-files.spec.ts` |

Deux points méritent d'être connus plutôt que masqués :

- Better Auth n'applique sa limitation de débit et son contrôle d'origine que
  dans son routeur HTTP (`auth.handler`). Un appel direct à `auth.api.*` les
  contourne : c'est pourquoi le formulaire privé pose lui-même les deux.
- `style-src` conserve `unsafe-inline`. React applique les styles calculés en
  attribut et la feuille Google Fonts est externe ; supprimer cette tolérance
  demanderait de retirer tout `style={{…}}` et d'héberger les fontes.

## Revue du 3 octobre 2026 — import de relevés et rapprochement

Revue menée après l'ajout de l'import PDF, du rapprochement et de la
validation groupée, élargie au routeur d'authentification, aux dépendances et
à l'image de production. Chaque correction est couverte par un test, et les
gardes du rapprochement ont été vérifiées par mutation (5 sur 5 détectées).

**Corrigé**

- **Bombe de décompression PDF.** Un PDF de 160 Ko se déployant en 64 Mo de
  texte faisait monter le serveur à 1 Go pendant 15 s, au-delà de la Machine
  de 512 Mo ; le délai de 10 s ne pouvait pas se déclencher, pdf.js bloquant
  la boucle d'événements. La lecture tourne désormais dans un processus jetable
  (`pdf-child.ts`) : tas de 128 Mo, aucune variable d'environnement, `nobody`
  quand le serveur est root, `oom_score_adj` à 1000, tué au délai. Vérifié dans
  l'image Docker de production.
- **Seconde porte de connexion.** `POST /api/auth/sign-in/email` et
  `/sign-out` étaient servis à une adresse publique et fixe sans que rien ne
  s'en serve ; la connexion y échappait à la limitation par adresse e-mail du
  formulaire caché. Seule `GET /api/auth/get-session` reste exposée.
- **Dépendances.** `express` et `@react-router/express`, importés par le
  serveur de production, n'étaient pas déclarés : ils arrivaient par
  `@react-router/serve`, inutilisé, qui embarquait `morgan` (injection dans les
  journaux, GHSA-9f6g-j8ch-79g4). Ils sont désormais déclarés et épinglés, le
  paquet inutile est retiré ; `brace-expansion` (eslint, dev) est corrigé.
  `npm audit` : 0 vulnérabilité.
- **Validation groupée fragile.** Une ligne reconnue qui échouait (engagement
  échu) annulait tout le lot ; elle est maintenant laissée dans la file, les
  autres passent.

- **Jeton de session dans les sauvegardes.** La sauvegarde téléchargée
  contenait la table `session`, dont le jeton (gardé en clair par Better Auth)
  ouvrait le compte sans mot de passe jusqu'à son expiration. La copie est
  désormais purgée des sessions et jetons de vérification, puis réécrite par
  `VACUUM` ; un test vérifie que le jeton n'est plus dans les octets du fichier.
  La sauvegarde du 3 octobre, téléchargée avant ce correctif, impose une
  déconnexion pour révoquer la session qu'elle contient.
- **Restauration vérifiée** sur cette même sauvegarde de production :
  `db:restore` vers une base séparée, `db:check`, migration à vide, relecture
  par le code de l'app.

**Risques résiduels acceptés**

- Le conteneur tourne en root. Passer le serveur sous `node` est souhaitable,
  mais les scripts d'administration lancés par `fly ssh console` créeraient
  alors des fichiers WAL appartenant à root que le serveur ne pourrait plus
  écrire : à faire avec une procédure d'administration adaptée. Le lecteur PDF,
  seule surface qui traite un fichier hostile, est déjà isolé sous `nobody`.
- La mémoire hors tas (tampons décompressés) du lecteur n'a pas de plafond dur ;
  le noyau le sacrifie en premier (`oom_score_adj`), avant le serveur.
- `GET /api/auth/get-session` révèle qu'un système d'authentification existe.
- La limitation par adresse e-mail permet de bloquer 5 minutes la connexion du
  propriétaire si l'on connaît son adresse et l'adresse privée.

## Vérifications régulières

- À chaque changement : `npm run check`, puis la vérification ciblée de la fonctionnalité.
- Après dépendance modifiée : `npm audit` et tests de build.
- Avant une mise en ligne ou après changement d’infrastructure : revue de cette checklist, test de session réelle, sauvegarde puis restauration isolée.
- Avant l’activation d’un assistant IA : revue dédiée OWASP GenAI/Agentic 2026, permissions minimales des outils, séparation des données privées et évaluation des entrées malveillantes.
