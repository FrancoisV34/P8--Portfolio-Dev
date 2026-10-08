/** Outils HTTP communs aux portes d'entrée (point d'entrée navigateur, API, dashboard). */

export class TropGros extends Error {}

/** Lit un flux en s'arrêtant dès que la limite est dépassée. */
export async function lireAuPlus(flux: ReadableStream<Uint8Array>, limite: number): Promise<Uint8Array<ArrayBuffer>> {
  const lecteur = flux.getReader();
  const morceaux: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > limite) {
      await lecteur.cancel().catch(() => {});
      throw new TropGros();
    }
    morceaux.push(value);
  }
  const octets = new Uint8Array(total);
  let position = 0;
  for (const morceau of morceaux) {
    octets.set(morceau, position);
    position += morceau.length;
  }
  return octets;
}

/** Comparaison dont la durée ne dépend pas de l'endroit où les textes diffèrent. */
export function egaliteConstante(a: string, b: string): boolean {
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    difference |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return difference === 0;
}
