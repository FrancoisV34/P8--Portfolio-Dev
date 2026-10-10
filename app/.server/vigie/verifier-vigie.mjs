#!/usr/bin/env node
// Vérifie qu'une copie de Vigie n'a pas été modifiée à la main (ADR-0004). À lancer dans la CI de
// l'application :   node <dossier de la copie>/verifier-vigie.mjs
// Une correction se fait dans Vigie, puis se recopie ; jamais dans la copie.
// Aucune dépendance : Node 24 seul. Globales importées explicitement : le fichier passe le lint
// de l'application hôte (ESLint `no-undef`).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const dossier = resolve(process.argv[2] ?? dirname(fileURLToPath(import.meta.url)));
const manifeste = JSON.parse(readFileSync(join(dossier, "vigie.json"), "utf8"));
const attendus = new Map(Object.entries(manifeste.fichiers));
const problemes = [];

for (const entree of readdirSync(dossier, { recursive: true })) {
  const chemin = join(dossier, String(entree));
  if (!statSync(chemin).isFile()) continue;
  const nom = relative(dossier, chemin).split(sep).join("/");
  if (nom === "vigie.json") continue;
  const attendu = attendus.get(nom);
  if (attendu === undefined) problemes.push(`ajouté : ${nom}`);
  else if (createHash("sha256").update(readFileSync(chemin)).digest("hex") !== attendu) problemes.push(`modifié : ${nom}`);
  attendus.delete(nom);
}
for (const nom of attendus.keys()) problemes.push(`supprimé : ${nom}`);

if (problemes.length > 0) {
  process.stderr.write(`Copie de Vigie ${manifeste.brique} ${manifeste.version} altérée :\n  ${problemes.join("\n  ")}\n`);
  process.stderr.write("Corriger dans le dépôt Vigie, puis recopier avec outils/copier-vigie.mjs.\n");
  process.exit(1);
}
process.stdout.write(`Copie de Vigie ${manifeste.brique} ${manifeste.version} (${manifeste.commit.slice(0, 7)}) intacte.\n`);
