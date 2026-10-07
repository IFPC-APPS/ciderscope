import { describe, expect, it } from "vitest";
import { genererJeton, jetonValide } from "../server/jetonSeance";

/**
 * Le jeton est l'unique chose qui sépare le public d'une dégustation : aucune
 * connexion n'est demandée au dégustateur. Ce qui est vérifié ici n'est donc
 * pas du confort, c'est la serrure.
 */
describe("jeton d'entrée", () => {
  it("produit un jeton de forme acceptée", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(jetonValide(genererJeton())).toBe(true);
    }
  });

  it("ne tire jamais deux fois le même", () => {
    const vus = new Set(Array.from({ length: 500 }, () => genererJeton()));
    expect(vus.size).toBe(500);
  });

  it("évite les caractères qu'on confond en les recopiant", () => {
    // Une adresse se retape à la main quand le téléphone ne scanne pas :
    // 0/O et 1/l/I rendraient l'exercice pénible et faillible.
    const jetons = Array.from({ length: 200 }, () => genererJeton()).join("");
    for (const ambigu of ["0", "O", "1", "I", "L"]) {
      expect(jetons).not.toContain(ambigu);
    }
  });

  it("est assez long pour ne pas se deviner", () => {
    // 32 caractères sur un alphabet de 31 : environ 158 bits. Un jeton court
    // se forcerait par essais successifs, et il n'y a rien derrière lui.
    expect(genererJeton()).toHaveLength(32);
  });

  describe("refus", () => {
    it("rejette ce qui n'est pas une chaîne", () => {
      for (const valeur of [null, undefined, 42, {}, [], true]) {
        expect(jetonValide(valeur)).toBe(false);
      }
    });

    it("rejette une longueur différente", () => {
      const bon = genererJeton();
      expect(jetonValide(bon.slice(0, 31))).toBe(false);
      expect(jetonValide(bon + "A")).toBe(false);
      expect(jetonValide("")).toBe(false);
    });

    it("rejette un caractère hors alphabet", () => {
      // Sans cela, la vérification de forme ne filtrerait pas les tentatives
      // d'injection avant d'atteindre la base.
      const bon = genererJeton();
      for (const intrus of ["0", "-", "'", " ", "%"]) {
        expect(jetonValide(intrus + bon.slice(1))).toBe(false);
      }
    });
  });
});
