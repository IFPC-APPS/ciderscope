import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  codeChallengeFor,
  createTransientState,
  isPadocConfigured,
  secureEndpoint,
  toIdentity,
} from "../server/padocFederation";

import {
  CAPACITES,
  createFederatedSessionToken,
  readAdminSessionToken,
  verifyAdminSessionToken,
} from "../server/adminAuth";

const env = { ...process.env };

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = "secret-de-test-pour-les-sessions";
});

afterEach(() => {
  process.env = { ...env };
});

describe("configuration de la fédération", () => {
  it("reste inactive tant que les trois variables ne sont pas fournies", () => {
    delete process.env.PADOC_ISSUER;
    delete process.env.PADOC_CLIENT_ID;
    delete process.env.PADOC_CLIENT_SECRET;
    expect(isPadocConfigured()).toBe(false);

    process.env.PADOC_ISSUER = "https://padoc.exemple.fr";
    process.env.PADOC_CLIENT_ID = "ciderscope";
    // Un client confidentiel sans secret ne peut pas échanger le code :
    // mieux vaut annoncer la fédération indisponible que la voir échouer
    // au retour de l'utilisateur.
    expect(isPadocConfigured()).toBe(false);

    process.env.PADOC_CLIENT_SECRET = "un-secret";
    expect(isPadocConfigured()).toBe(true);
  });
});

describe("PKCE", () => {
  it("produit un défi qui est bien le SHA-256 du vérificateur, en base64url", () => {
    const { codeVerifier } = createTransientState();
    const attendu = createHash("sha256").update(codeVerifier).digest("base64url");

    expect(codeChallengeFor(codeVerifier)).toBe(attendu);
    // base64url : ni +, ni /, ni remplissage — sinon PADOC rejette le défi.
    expect(codeChallengeFor(codeVerifier)).not.toMatch(/[+/=]/);
  });

  it("tire des valeurs différentes à chaque parcours", () => {
    const a = createTransientState();
    const b = createTransientState();

    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    // Longueur minimale imposée par la spécification PKCE.
    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43);
  });

  it("ne conserve une destination de retour que si elle est interne", () => {
    expect(createTransientState("/admin").returnTo).toBe("/admin");
    expect(createTransientState(undefined).returnTo).toBeUndefined();
  });
});

describe("session d'administration", () => {
  it("une session fédérée porte le sujet PADOC et ses capacités", () => {
    const jeton = createFederatedSessionToken("sub-123", "Marie Durand", ["animateur"]);
    const session = readAdminSessionToken(jeton);

    expect(session).not.toBeNull();
    expect(session?.subject).toBe("sub-123");
    expect(session?.user).toBe("Marie Durand");
    expect(session?.roles).toEqual(["animateur"]);
    expect(session?.isAdmin).toBe(true);
  });

  it("une habilitation sans rôle donne une session de jury, pas d'administration", () => {
    const session = readAdminSessionToken(createFederatedSessionToken("sub-7", "Jury", []));

    expect(session?.subject).toBe("sub-7");
    expect(session?.roles).toEqual([]);
    expect(session?.isAdmin).toBe(false);
  });

  it("un animateur cidrier n'obtient pas la capacité créneaux", () => {
    const session = readAdminSessionToken(
      createFederatedSessionToken("sub-9", "Cidrier", [CAPACITES.ANIMATEUR]),
    );

    expect(session?.roles).toContain(CAPACITES.ANIMATEUR);
    expect(session?.roles).not.toContain(CAPACITES.CRENEAUX);
  });

  it("refuse un jeton dont la charge a été modifiée", () => {
    const jeton = createFederatedSessionToken("sub-1", "Quelqu un", ["animateur"]);
    const [charge, signature] = jeton.split(".");

    const falsifiee = Buffer
      .from(JSON.stringify({
        user: "Quelqu un",
        sub: "sub-1",
        roles: [CAPACITES.ANIMATEUR, CAPACITES.CRENEAUX],
        src: "padoc",
        nonce: "x",
        exp: Date.now() + 60_000,
      }))
      .toString("base64url");

    expect(charge).not.toBe(falsifiee);
    expect(readAdminSessionToken(`${falsifiee}.${signature}`)).toBeNull();
  });

  it("refuse un jeton expiré", () => {
    const expire = Buffer
      .from(JSON.stringify({ user: "x", nonce: "n", exp: Date.now() - 1000 }))
      .toString("base64url");

    expect(readAdminSessionToken(expire)).toBeNull();
    expect(readAdminSessionToken(undefined)).toBeNull();
    expect(readAdminSessionToken("n-importe-quoi")).toBeNull();
  });

  it("verifyAdminSessionToken reste cohérent avec la lecture de session", () => {
    const jeton = createFederatedSessionToken("s", "u", ["animateur"]);

    expect(verifyAdminSessionToken(jeton)).toBe(true);
    expect(verifyAdminSessionToken(createFederatedSessionToken("s", "u", []))).toBe(false);
    expect(verifyAdminSessionToken("casse")).toBe(false);
  });
});

describe("transport vers PADOC", () => {
  it("force HTTPS sur les adresses annoncées en http par l'instance hébergée", () => {
    // Un POST redirigé en 301 devient un GET sans corps : l'échange du code
    // échouerait, après avoir envoyé le secret en clair.
    expect(secureEndpoint("http://padoc.up.railway.app/oauth2/token"))
      .toBe("https://padoc.up.railway.app/oauth2/token");
    expect(secureEndpoint("https://padoc.exemple.fr/oauth2/jwks"))
      .toBe("https://padoc.exemple.fr/oauth2/jwks");
  });

  it("laisse intact un PADOC local de développement", () => {
    expect(secureEndpoint("http://localhost:9000/oauth2/token"))
      .toBe("http://localhost:9000/oauth2/token");
  });
});

describe("lecture des claims", () => {
  it("prend les rôles CiderScope et ignore les valeurs vides", () => {
    const identite = toIdentity({
      sub: "sub-1",
      "https://ifpc.eu/claims/roles": ["animateur", "", 42, "creneaux"],
    });

    expect(identite.roles).toEqual(["animateur", "creneaux"]);
  });

  it("recompose le nom à partir de ses parties quand `name` manque", () => {
    expect(toIdentity({ sub: "s", given_name: "Marie", family_name: "Durand" }).name)
      .toBe("Marie Durand");
    expect(toIdentity({ sub: "s" }).name).toBeUndefined();
  });

  it("refuse un jeton sans sujet", () => {
    expect(() => toIdentity({ name: "Personne" })).toThrow();
  });
});
