#!/usr/bin/env node
// Vérifie qu'une copie de Vigie n'a pas été modifiée à la main (ADR-0004). À lancer dans la CI de
// l'application :   node <dossier de la copie>/verifier-vigie.mjs [--migration <fichier>]…
// Une correction se fait dans Vigie, puis se recopie ; jamais dans la copie.
// `--migration` : une migration recopiée dans le dossier de l'application (renommée, renumérotée,
// découpée pour son outil) doit contenir exactement les instructions d'un des fichiers `.sql` de
// la copie ; seuls les commentaires `--` et les blancs peuvent différer.
// Aucune dépendance : Node 24 seul. Globales importées explicitement : le fichier passe le lint
// de l'application hôte (ESLint `no-undef`).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const migrations = [];
let dossierFourni;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--migration") {
    if (args[i + 1] === undefined) {
      process.stderr.write("verifier-vigie : --migration <fichier> attendu\n");
      process.exit(1);
    }
    migrations.push(resolve(args[++i]));
  } else dossierFourni = args[i];
}
const dossier = resolve(dossierFourni ?? dirname(fileURLToPath(import.meta.url)));
/** Les instructions SQL seules : sans commentaires `--`, blancs réduits. */
const instructions = (texte) =>
  texte
    .split("\n")
    .map((ligne) => ligne.replace(/--.*$/, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
const empreinteSql = (chemin) => createHash("sha256").update(instructions(readFileSync(chemin, "utf8"))).digest("hex");
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

const schemas = new Map(
  Object.keys(manifeste.fichiers)
    .filter((nom) => nom.endsWith(".sql"))
    .map((nom) => [empreinteSql(join(dossier, nom)), nom]),
);
const correspondances = [];
for (const migration of migrations) {
  const nom = schemas.get(empreinteSql(migration));
  if (nom === undefined) problemes.push(`migration différente de toutes celles de Vigie : ${migration}`);
  else correspondances.push(`${relative(process.cwd(), migration)} = ${nom}`);
}

if (problemes.length > 0) {
  process.stderr.write(`Copie de Vigie ${manifeste.brique} ${manifeste.version} altérée :\n  ${problemes.join("\n  ")}\n`);
  process.stderr.write("Corriger dans le dépôt Vigie, puis recopier avec outils/copier-vigie.mjs.\n");
  process.exit(1);
}
process.stdout.write(`Copie de Vigie ${manifeste.brique} ${manifeste.version} (${manifeste.commit.slice(0, 7)}) intacte.\n`);
for (const ligne of correspondances) process.stdout.write(`Migration identique : ${ligne}\n`);
