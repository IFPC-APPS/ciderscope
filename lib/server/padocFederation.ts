import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Connexion à PADOC, fournisseur d'identité de la filière.
 *
 * CiderScope ne gère plus ni mots de passe ni comptes : l'identité vient de
 * PADOC, et les rôles reçus disent ce que la personne a le droit de faire ici.
 * Le mot de passe administrateur partagé reste en place le temps de la
 * bascule (cf. adminAuth), mais il a vocation à disparaître : un secret unique
 * partagé par tous les animateurs ne dit pas qui a fait quoi.
 *
 * Les vérifications du jeton ne sont pas écrites à la main. Un JWT décodé sans
 * contrôle est une chaîne fournie par le client, donc sans valeur ; `jose`
 * applique la liste blanche d'algorithmes, l'émetteur, l'audience et
 * l'expiration, et met le JWKS en cache en le rafraîchissant sur `kid` inconnu
 * — ce qui rend les rotations de clés de PADOC transparentes.
 */

/** Espace de noms des claims privés de PADOC. */
const CLAIM_ROLES = "https://ifpc.eu/claims/roles";

export const PADOC_STATE_COOKIE = "ciderscope_padoc_oidc";

/** Durée de vie du cookie d'aller : le temps de se connecter, pas davantage. */
export const PADOC_STATE_MAX_AGE_SECONDS = 10 * 60;

export interface PadocIdentity {
  /** Identifiant PADOC, opaque et stable : la seule clé de rattachement. */
  subject: string;
  email?: string;
  name?: string;
  /** Rôles accordés à cette personne SUR CiderScope, dans notre vocabulaire. */
  roles: string[];
}

export interface PadocTransientState {
  state: string;
  nonce: string;
  codeVerifier: string;
  /** Page à rouvrir une fois connecté, pour ne pas perdre le contexte. */
  returnTo?: string;
}

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

const base64Url = (input: Buffer) => input.toString("base64url");

export const padocIssuer = () => (process.env.PADOC_ISSUER || "").replace(/\/+$/, "");
export const padocClientId = () => process.env.PADOC_CLIENT_ID || "";
const padocClientSecret = () => process.env.PADOC_CLIENT_SECRET || "";

/** Vrai si la fédération est configurée sur cette instance. */
export const isPadocConfigured = () =>
  Boolean(padocIssuer() && padocClientId() && padocClientSecret());

/**
 * Document de découverte, mis en cache pour la durée du processus.
 *
 * Aucune URL de PADOC n'est écrite en dur ailleurs que l'émetteur : c'est ce
 * qui permet à PADOC de déplacer un point d'entrée sans nous casser.
 */
let discoveryCache: { issuer: string; document: DiscoveryDocument } | null = null;

export const padocDiscovery = async (): Promise<DiscoveryDocument> => {
  const issuer = padocIssuer();
  if (!issuer) throw new Error("PADOC_ISSUER n'est pas défini.");
  if (discoveryCache?.issuer === issuer) return discoveryCache.document;

  const response = await fetch(`${issuer}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Découverte PADOC indisponible (${response.status}).`);
  }
  const document = await response.json() as DiscoveryDocument;

  // L'émetteur annoncé doit être celui que nous avons configuré : sinon nous
  // parlons à autre chose que ce que nous croyons.
  if (document.issuer?.replace(/\/+$/, "") !== issuer) {
    throw new Error(
      `L'émetteur annoncé par PADOC (${document.issuer}) ne correspond pas à PADOC_ISSUER.`,
    );
  }

  discoveryCache = { issuer, document };
  return document;
};

let jwksCache: { uri: string; keys: ReturnType<typeof createRemoteJWKSet> } | null = null;

const jwks = (uri: string) => {
  if (jwksCache?.uri !== uri) {
    jwksCache = { uri, keys: createRemoteJWKSet(new URL(uri)) };
  }
  return jwksCache.keys;
};

/** Valeurs à usage unique du parcours : anti-rejeu, anti-CSRF, PKCE. */
export const createTransientState = (returnTo?: string): PadocTransientState => {
  const codeVerifier = base64Url(randomBytes(48));
  return {
    state: base64Url(randomBytes(24)),
    nonce: base64Url(randomBytes(24)),
    codeVerifier,
    returnTo,
  };
};

export const codeChallengeFor = (codeVerifier: string) =>
  base64Url(createHash("sha256").update(codeVerifier).digest());

export const padocAuthorizationUrl = async (
  transient: PadocTransientState,
  redirectUri: string,
) => {
  const { authorization_endpoint } = await padocDiscovery();
  const url = new URL(authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", padocClientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("state", transient.state);
  url.searchParams.set("nonce", transient.nonce);
  url.searchParams.set("code_challenge", codeChallengeFor(transient.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
};

/**
 * Échange le code contre les jetons, puis vérifie l'identité.
 *
 * L'échange se fait de serveur à serveur avec le secret : CiderScope est un
 * client confidentiel, le secret ne touche jamais le navigateur.
 */
export const exchangeCodeForIdentity = async (
  code: string,
  codeVerifier: string,
  expectedNonce: string,
  redirectUri: string,
): Promise<PadocIdentity> => {
  const discovery = await padocDiscovery();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const credentials = Buffer
    .from(`${padocClientId()}:${padocClientSecret()}`)
    .toString("base64");

  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    // Le corps porte un code d'erreur OAuth normalisé ; le journaliser aide,
    // le montrer à l'utilisateur non.
    const detail = await response.text().catch(() => "");
    throw new Error(`Échange du code refusé par PADOC (${response.status}) ${detail}`.trim());
  }

  const tokens = await response.json() as { id_token?: string };
  if (!tokens.id_token) {
    throw new Error("PADOC n'a pas renvoyé de jeton d'identité.");
  }

  const { payload } = await jwtVerify(tokens.id_token, jwks(discovery.jwks_uri), {
    issuer: discovery.issuer,
    audience: padocClientId(),
    // Liste blanche explicite : accepter l'algorithme annoncé par le jeton
    // lui-même — « none » compris — est la faille classique.
    algorithms: ["RS256", "ES256"],
  });

  // Le nonce lie ce jeton à la demande que NOUS avons émise. Sans ce contrôle,
  // un jeton valide obtenu ailleurs pourrait être rejoué ici.
  if (payload.nonce !== expectedNonce) {
    throw new Error("Le nonce du jeton ne correspond pas à la demande.");
  }

  return toIdentity(payload);
};

const toIdentity = (payload: JWTPayload): PadocIdentity => {
  if (!payload.sub) throw new Error("Jeton PADOC sans sujet.");

  const brut = payload[CLAIM_ROLES];
  const roles = Array.isArray(brut)
    ? brut.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    : [];

  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    roles,
  };
};
