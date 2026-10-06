# 22 — Nom de domaine et référencement

Décisions du **5 octobre 2026**, mises **en pause le 6 octobre 2026**. Tout le
code est prêt et déployé ; il ne reste que des opérations (achat, DNS,
certificats, configuration). Rien n'a été acheté ni configuré.

## 1. Décisions

| Sujet | Décision |
|---|---|
| Domaine | `francoisvittecoq.com`, seul : ni `.dev` ni `.fr` défensifs pour l'instant |
| Adresse officielle | le domaine nu `francoisvittecoq.com` ; `www.` y redirige |
| Bureau d'enregistrement | Cloudflare Registrar : prix coûtant (~10,44 $ par an, identique au renouvellement), protection WHOIS et DNSSEC gratuits. Impose le DNS Cloudflare |
| Ancienne adresse | `francoisv34-portfolio-cfo.fly.dev` redirige en 308 vers le domaine, même chemin. Les liens déjà partagés (LinkedIn) restent valables |

## 2. Vérifications faites le 5 octobre 2026

**Disponibilité**, interrogée directement auprès des registres (serveurs RDAP
de l'amorçage IANA, contrôlés chacun avec un domaine connu), et par `whois`
pour `.io` et `.me` :

- `francoisvittecoq`, `francois-vittecoq`, `fvittecoq`, `vittecoq-dev` : libres
  en `.fr`, `.dev`, `.com`, `.io`, `.me`, `.tech` et `.ai` ;
- `vittecoq` : libre partout sauf `vittecoq.fr` (enregistré depuis 2011).

**Marques**, par l'API de TMview (qui regroupe notamment l'INPI, l'EUIPO et
l'OMPI) : aucune marque contenant « vittecoq », « francoisvittecoq » ou
« fvittecoq ». Contrôle : « decathlon » renvoie 1 070 marques, dont des marques
françaises. Le site de l'INPI refuse les requêtes automatiques (403).

À refaire juste avant l'achat si plusieurs semaines se sont écoulées.

## 3. Étude des portfolios de développeurs

Échantillon : la liste [emmabostian/developer-portfolios](https://github.com/emmabostian/developer-portfolios),
environ 2 000 portfolios, surtout anglophones.

- **Domaine à soi : 57 %**, adresse d'une plateforme (`vercel.app`, `github.io`,
  `netlify.app`…) : 43 %.
- **Extensions des domaines achetés** : `.com` 38 %, `.dev` 22 %, `.me` 7 %,
  `.io` 2 %, `.tech` 2 %, `.fr` 1 %.
- **Forme du nom** : prénom et nom 46 %, pseudo 31 %, prénom seul 16 %. Le « dev »
  se met dans l'extension plutôt que dans le nom (3 %), les tirets sont rares.

Prix relevés (1re année / renouvellement) : OVHcloud `.com` 9,59 € / 16,19 € TTC,
`.fr` 5,99 € / 9,35 € TTC ; Cloudflare `.com` ~10,44 $ / ~10,44 $. Écartés :
`.io` (cher, avenir lié au traité des Chagos, signé mais pas en vigueur), `.me`
(renouvellement presque triplé chez OVHcloud), `.ai` (80 à 190 € par an).

## 4. Déjà en place

Redirection vers l'adresse officielle (commit `e93cabe`, en production depuis
le 5 octobre 2026) : `app/.server/security/canonical-host.server.ts`, branchée
dans `scripts/production/server.mjs`. Inactive tant que `SITE_URL` reste
l'adresse `fly.dev`. La destination ne vient que de `SITE_URL`, jamais du
`Host` ; `/healthz` n'est jamais redirigé. Voir [SECURITY.md](../SECURITY.md).

## 5. Procédure du jour J

1. **François** : compte Cloudflare avec double authentification (clé de
   sécurité ou application TOTP, pas de SMS), codes de secours dans le
   gestionnaire de mots de passe. Achat de `francoisvittecoq.com`, DNSSEC activé,
   verrou de transfert vérifié. Refaire la vérification de marques si besoin.
2. Certificats Fly :
   ```sh
   fly certs add francoisvittecoq.com
   fly certs add www.francoisvittecoq.com
   ```
3. DNS chez Cloudflare, **tous en « DNS only » (nuage gris)** ; relever les
   adresses avec `fly ips list` :

   | Type | Nom | Valeur |
   |---|---|---|
   | A | `@` | IPv4 de l'application (partagée Fly) |
   | AAAA | `@` | IPv6 dédiée de l'application |
   | CNAME | `www` | `francoisv34-portfolio-cfo.fly.dev` |

   Le proxy Cloudflare (nuage orange) bloquerait l'émission du certificat et
   remplacerait l'IP du visiteur dans `fly-client-ip`, dont dépend la limite de
   débit de Better Auth. Un éventuel enregistrement CAA doit autoriser
   `letsencrypt.org`.
4. Attendre que `fly certs check francoisvittecoq.com` montre le certificat émis.
5. `SITE_URL = "https://francoisvittecoq.com"` dans `fly.toml`. Mettre aussi à
   jour l'URL du README (introduction et section « Exploiter Fly.io »).
6. `npm run check`, `npm run test:auth`, `npx playwright test`, `npm run build`,
   puis `fly deploy` et `git push origin refacto`.
7. Vérifier :
   - `/healthz`, `/`, `/blog`, l'article, `/blog/rss.xml` en 200 sur le domaine ;
   - URLs canoniques, `og:url`, sitemap et RSS en `francoisvittecoq.com` ;
   - `fly.dev` et `www.` en 308 vers le même chemin sur le domaine.
8. **François** se reconnecte à l'espace privé sur le nouveau domaine : la
   session `fly.dev` n'y est plus valable, car Better Auth et le contrôle d'origine
   des formulaires n'acceptent que `SITE_URL`. Vérifier qu'une saisie passe.

L'en-tête HSTS porte `includeSubDomains` : tout sous-domaine futur du domaine
devra être servi en HTTPS.

## 6. Référencement : reporté

À reprendre après la bascule :

- déclarer le domaine dans Google Search Console et y soumettre le sitemap ;
- mettre l'URL du site sur le profil LinkedIn ;
- réévaluer un `.fr` défensif redirigé vers le `.com`, s'il est encore libre ;
- ajouter `npx playwright test` à la procédure de déploiement du README : elle ne
  le mentionne pas, et un test public cassé par la publication de l'article est
  passé inaperçu le 5 octobre 2026 (corrigé dans `5af3b63`).

L'extension n'a pas d'effet sur le classement Google ; ce qui compte est le nom
complet dans le domaine et une adresse stable qui accumule les liens.
