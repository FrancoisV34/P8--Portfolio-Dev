---
title: Orchestrer l'IA : ce que Claude Code fait, et ce que je vérifie
date: 2026-10-04
summary: Un agent de code écrit vite et bien. Mon travail s'est déplacé : poser les règles, demander les bonnes revues, exiger des preuves, et garder les décisions. Trois failles trouvées sur un vrai projet, et comment.
tags: Claude Code, Agents IA, Sécurité, Tests
published: true
---

Je me présente comme développeur **et** orchestrateur IA, à parts égales. La formule intrigue souvent : si un agent comme Claude Code écrit le code, que reste-t-il au développeur ?

Ces dernières semaines, j'ai construit avec Claude Code un espace privé qui lit des documents PDF et manipule des données sensibles. Le code est arrivé vite, propre et testé. Pourtant, ce qui a fait la qualité du résultat ne se trouve pas dans les lignes générées. Il se trouve dans quatre gestes que l'agent ne fait pas à ma place.

## Poser les règles avant la première ligne

Un agent ne connaît de votre projet que ce que vous lui écrivez. Avant de coder quoi que ce soit, le dépôt contient donc deux fichiers qu'il lit à chaque session : un `AGENTS.md` qui fixe les règles de travail, et un `SECURITY.md` qui sert de checklist.

On y trouve des règles courtes et non négociables :

- la sécurité est une **condition de fin** : un lot n'est pas terminé tant que sa checklist n'est pas vérifiée par des tests ;
- le contrôle d'accès est toujours **côté serveur** : une page cachée n'est jamais une protection ;
- aucune donnée importée n'entre dans l'application **sans une validation humaine explicite** ;
- toute nouvelle dépendance est justifiée, épinglée et auditée.

Ces règles ne restent pas décoratives. Quand j'ai demandé de pouvoir valider automatiquement les lignes importées que l'application reconnaît, l'agent m'a rappelé la règle de validation explicite et proposé un compromis : tout est reconnu et pré-rempli, mais il faut **un clic** pour valider le lot. Il n'a pas tranché seul ; il m'a mis devant le choix.

## Demander la revue, pas seulement le code

Le code fonctionnait. Les tests étaient verts. J'ai tout de même lancé une consigne simple : *une revue de sécurité poussée, en autonomie, avec un rapport à la fin.* Elle a trouvé trois problèmes qu'aucun test ne signalait.

**Un PDF de 160 Ko qui faisait monter le serveur à 1 Go.** Un PDF peut contenir des flux compressés. Un fichier piégé de 160 Ko se décompressait en 64 Mo de texte, et la lecture faisait grimper la mémoire du serveur à 1 Go pendant 15 secondes. Le délai de sécurité prévu ne pouvait même pas se déclencher : la bibliothèque bloquait la boucle d'exécution. Sur une machine de 512 Mo, c'était la panne assurée. Le correctif : lire le PDF dans un processus séparé, jetable, à la mémoire plafonnée, sans aucun secret, sans droits sur les données, et tué au-delà de dix secondes. Si le fichier est piégé, c'est ce processus qui tombe, pas le serveur.

```ts lecture-pdf.ts
const lecteur = spawn(process.execPath, ['--max-old-space-size=128', script], {
  env: {},              // aucun secret transmis
  timeout: 10_000,      // dix secondes, pas une de plus
  killSignal: 'SIGKILL',
});
```

**Une sauvegarde qui contenait une session ouverte.** L'application permet de télécharger une sauvegarde de sa base. En l'inspectant, l'agent a remarqué qu'elle contenait la table des sessions, avec le jeton de connexion en clair. Avec ce seul fichier, n'importe qui pouvait se connecter à ma place pendant douze heures, sans mot de passe. Désormais, la copie téléchargée est purgée des sessions, puis entièrement réécrite pour que les données effacées ne survivent pas dans les recoins du fichier.

**Des dépendances qui n'en étaient pas.** Le serveur de production utilisait deux paquets jamais déclarés : ils arrivaient par un troisième, inutile, qui embarquait une faille connue. Tout marchait, par accident. Les paquets réellement utilisés sont maintenant déclarés et épinglés, l'intrus est retiré, et l'audit des dépendances est revenu à zéro.

Aucun de ces problèmes n'était un bug visible. Ils ne sont apparus que parce qu'une revue a été **demandée**, avec une consigne claire et le temps de creuser.

## Vérifier les vérifications

Des tests verts rassurent. Ils ne prouvent rien tant qu'on ne sait pas qu'ils échoueraient en cas de problème.

Pour chaque protection importante, nous avons donc fait l'exercice inverse : **casser volontairement la protection, et vérifier qu'un test échoue**. C'est ce qu'on appelle un test par mutation. Sur la sauvegarde, par exemple, nous avons retiré l'étape de réécriture du fichier. La session était bien supprimée de la table, mais le test a échoué : les octets du jeton étaient encore présents dans le fichier. Sans ce test, on aurait cru la faille corrigée alors qu'elle ne l'était qu'à moitié.

Le même réflexe a évité d'autres faux sentiments de sécurité :

- un test qui « vérifiait » une limite de taille passait aussi **sans** la limite, parce qu'il échouait pour une autre raison. Il a été réécrit jusqu'à ce que retirer la limite le fasse casser ;
- des tests navigateur tournaient sur une version compilée **antérieure** à la dernière modification. Ils étaient verts, mais testaient l'ancien code. La règle est désormais écrite : on recompile avant de tester.

> [!Ce que je retiens]
> Un test qui reste vert quand on retire la protection ne protège rien.

C'est vrai avec ou sans IA, mais l'IA produit tellement de tests si vite qu'il devient indispensable de vérifier qu'ils mordent.

## Garder la décision

L'agent propose beaucoup, et souvent bien. Mais les arbitrages me reviennent, parce qu'ils engagent l'usage réel :

- **automatiser ou non.** Valider tout seul ce que l'application reconnaît aurait été plus rapide. J'ai choisi un clic explicite : la vitesse ne vaut pas une erreur qui passe en silence ;
- **ce qui se dit publiquement.** Tout ce qu'on publie sur l'architecture d'un système en dit aussi long à un attaquant qu'à un recruteur. Cet article lui-même a été relu avec cette question en tête ;
- **le moment de mettre en production.** L'agent prépare, teste et vérifie ; c'est moi qui déploie, après lecture du rapport.

Inversement, j'ai appris à corriger mes propres consignes quand l'agent montre qu'elles sont mal posées. Un formulaire me demandait une information que les données importées contenaient déjà ; plutôt que de me laisser la saisir, et donc me tromper, l'application la déduit maintenant, et refuse une saisie contradictoire.

## Ce qu'orchestrer veut dire

Orchestrer l'IA, ce n'est pas écrire moins. C'est écrire **autre chose** : des règles qui cadrent l'agent, des demandes de revue précises, des exigences de preuve, et des décisions assumées.

Si votre équipe adopte un agent de code, trois habitudes valent plus que n'importe quel prompt :

1. **Écrire les règles du projet dans le dépôt**, là où l'agent les lit à chaque session, et en faire une condition de fin.
2. **Demander des revues autant que du code**, avec une consigne claire et du temps pour creuser.
3. **Tester les tests** : casser volontairement chaque protection et vérifier qu'un test le voit.

Le code va plus vite que jamais. La responsabilité, elle, n'a pas changé de mains.
