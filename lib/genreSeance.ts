import type { GenreSeance, SessionConfig } from "../types";

/**
 * Le genre d'une séance, et ce qu'il commande.
 *
 * Regroupé ici plutôt que dispersé en tests `config.genre === "panel"` : le
 * jour où un troisième usage apparaîtra, c'est ce fichier qu'on relira, et non
 * la dizaine d'écrans qui posent la question.
 */

export const GENRES: { valeur: GenreSeance; libelle: string; detail: string }[] = [
  {
    valeur: "panel",
    libelle: "Panel IFPC",
    detail: "Créneaux, inscriptions et invitations des dégustateurs.",
  },
  {
    valeur: "degustation",
    libelle: "Dégustation producteur",
    detail: "Les participants rejoignent par QR code, sans compte ni créneau.",
  },
];

/**
 * Le genre d'une séance.
 *
 * Les séances créées avant l'introduction du champ n'en portent pas : ce sont
 * des panels, puisque c'était le seul usage. Choisir l'autre valeur par défaut
 * leur retirerait leurs créneaux du jour au lendemain.
 */
export const genreDe = (config: Pick<SessionConfig, "genre"> | null | undefined): GenreSeance =>
  config?.genre === "degustation" ? "degustation" : "panel";

/** La séance comporte-t-elle des créneaux ? */
export const avecCreneaux = (config: Pick<SessionConfig, "genre"> | null | undefined): boolean =>
  genreDe(config) === "panel";

/** La séance se rejoint-elle par une adresse dédiée (QR code) ? */
export const avecLienDirect = (config: Pick<SessionConfig, "genre"> | null | undefined): boolean =>
  genreDe(config) === "degustation";

export const libelleGenre = (genre: GenreSeance): string =>
  GENRES.find((g) => g.valeur === genre)?.libelle ?? genre;
