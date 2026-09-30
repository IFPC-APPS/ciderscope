import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookies: vi.fn() }));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import {
  CAPACITES,
  createFederatedSessionToken,
  requireAdmin,
  requireCapacite,
} from "../server/adminAuth";

const env = { ...process.env };

/** Simule la présence d'un cookie de session pour la requête en cours. */
const avecSession = (jeton?: string) => {
  mocks.cookies.mockResolvedValue({
    get: (nom: string) =>
      nom === "ciderscope_admin" && jeton ? { value: jeton } : undefined,
  });
};

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = "secret-de-test-des-capacites";
  mocks.cookies.mockReset();
});

afterEach(() => {
  process.env = { ...env };
});

describe("requireCapacite", () => {
  it("laisse passer un animateur PADOC qui a la capacité créneaux", async () => {
    avecSession(createFederatedSessionToken("sub-1", "Interne", [
      CAPACITES.ANIMATEUR,
      CAPACITES.CRENEAUX,
    ]));

    expect(await requireCapacite(CAPACITES.CRENEAUX)).toBeNull();
  });

  it("refuse en 403 un animateur cidrier, authentifié mais sans la capacité", async () => {
    // Le cas qui motive tout ce travail : une personne légitime, connectée,
    // mais dont l'outil n'a pas l'usage de la planification.
    avecSession(createFederatedSessionToken("sub-2", "Cidrier", [CAPACITES.ANIMATEUR]));

    const reponse = await requireCapacite(CAPACITES.CRENEAUX);

    expect(reponse).not.toBeNull();
    expect(reponse?.status).toBe(403);
  });

  it("refuse en 401 quand il n'y a pas de session du tout", async () => {
    avecSession(undefined);

    const reponse = await requireCapacite(CAPACITES.CRENEAUX);

    // 401 et non 403 : la distinction guide le client entre « connecte-toi »
    // et « demande le droit ».
    expect(reponse?.status).toBe(401);
  });

  it("refuse en 403 un jury connecté par PADOC, même doté de « creneaux »", async () => {
    // Sans « animateur », pas d'administration du tout : une capacité fine ne
    // rouvre pas la porte que la capacité de base ferme.
    avecSession(createFederatedSessionToken("sub-3", "Jury", [CAPACITES.CRENEAUX]));

    expect((await requireCapacite(CAPACITES.CRENEAUX))?.status).toBe(403);
  });

  it("refuse un cookie dont la signature ne tient pas", async () => {
    avecSession("charge-inventee.signature-inventee");

    expect((await requireCapacite(CAPACITES.ANIMATEUR))?.status).toBe(401);
  });
});

describe("requireAdmin", () => {
  it("laisse passer un animateur", async () => {
    avecSession(createFederatedSessionToken("sub-1", "Animatrice", [CAPACITES.ANIMATEUR]));

    expect(await requireAdmin()).toBeNull();
  });

  it("refuse en 403 un utilisateur PADOC sans rôle", async () => {
    // Habilité sur CiderScope sans rôle particulier : un jury identifié.
    avecSession(createFederatedSessionToken("sub-4", "Jury", []));

    expect((await requireAdmin())?.status).toBe(403);
  });

  it("refuse en 401 un ancien cookie ouvert par mot de passe partagé", async () => {
    // Correctement signé, mais sans sujet PADOC : il ne désigne personne.
    const charge = Buffer.from(JSON.stringify({
      user: "ifpc",
      nonce: "n",
      exp: Date.now() + 60_000,
      roles: [CAPACITES.ANIMATEUR, CAPACITES.CRENEAUX],
      src: "motdepasse",
    })).toString("base64url");
    const signature = createHmac("sha256", "secret-de-test-des-capacites")
      .update(charge)
      .digest("base64url");
    avecSession(`${charge}.${signature}`);

    expect((await requireAdmin())?.status).toBe(401);
  });
});
