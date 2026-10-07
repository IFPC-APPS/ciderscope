import { describe, expect, it } from "vitest";
import { avecCreneaux, avecLienDirect, genreDe, GENRES, libelleGenre } from "../genreSeance";

/**
 * Le genre décide ce que l'animateur voit et ce que le participant peut faire.
 * Les cas qui comptent sont ceux où l'information manque : une séance d'avant
 * le champ, une configuration absente, une valeur inattendue.
 */
describe("genre d'une séance", () => {
  it("une séance antérieure au champ est un panel", () => {
    // Choisir l'autre valeur par défaut retirerait leurs créneaux aux séances
    // existantes du jour au lendemain, sans que personne ne l'ait décidé.
    expect(genreDe({})).toBe("panel");
    expect(genreDe({ genre: undefined })).toBe("panel");
  });

  it("tolère l'absence de configuration", () => {
    expect(genreDe(null)).toBe("panel");
    expect(genreDe(undefined)).toBe("panel");
  });

  it("respecte le genre déclaré", () => {
    expect(genreDe({ genre: "degustation" })).toBe("degustation");
    expect(genreDe({ genre: "panel" })).toBe("panel");
  });

  it("une valeur inattendue retombe sur panel", () => {
    // Donnée venue de la base : mieux vaut l'usage historique qu'un écran vide.
    expect(genreDe({ genre: "autre" as never })).toBe("panel");
  });
});

describe("ce que le genre commande", () => {
  it("seul un panel comporte des créneaux", () => {
    expect(avecCreneaux({ genre: "panel" })).toBe(true);
    expect(avecCreneaux({ genre: "degustation" })).toBe(false);
    expect(avecCreneaux({})).toBe(true);
  });

  it("seule une dégustation se rejoint par adresse dédiée", () => {
    expect(avecLienDirect({ genre: "degustation" })).toBe(true);
    expect(avecLienDirect({ genre: "panel" })).toBe(false);
    expect(avecLienDirect({})).toBe(false);
  });

  it("les deux usages s'excluent", () => {
    for (const { valeur } of GENRES) {
      expect(avecCreneaux({ genre: valeur })).toBe(!avecLienDirect({ genre: valeur }));
    }
  });
});

describe("catalogue des genres", () => {
  it("propose exactement les deux usages, chacun décrit", () => {
    expect(GENRES.map((g) => g.valeur)).toEqual(["panel", "degustation"]);
    for (const genre of GENRES) {
      expect(genre.libelle.length).toBeGreaterThan(0);
      expect(genre.detail.length).toBeGreaterThan(0);
    }
  });

  it("nomme chaque genre", () => {
    expect(libelleGenre("panel")).toBe("Panel IFPC");
    expect(libelleGenre("degustation")).toBe("Dégustation producteur");
  });
});
