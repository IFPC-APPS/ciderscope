import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

/**
 * Connexion à PADOC, fournisseur d'identité de la filière.
 *
 * CiderScope ne gère plus ni mots de passe ni comptes : l'identité vient de
 * PADOC, et les rôles reçus disent ce que la personne a le droit de faire ici.
 * C'est l'unique moyen de connexion : l'ancien mot de passe administrateur
 * partagé a été retiré, un secret commun à tous les animateurs ne disant pas
 * qui a fait quoi.
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
  /** Non vérifié par PADOC (`email_verified` vaut false) : affichage seulement. */
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
  /**
   * Vrai si la connexion part de l'écran d'administration : un compte sans
   * capacité « animateur » reçoit alors un refus explicite plutôt qu'une
   * session de jury qu'il n'a pas demandée.
   */
  admin?: boolean;
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

/**
 * Portées demandées. `openid profile email` par défaut, mais PADOC refuse d'un
 * `invalid_scope` celles qui ne sont pas ouvertes à notre client : la variable
 * permet de se replier sur `openid` seul sans redéployer de code.
 */
export const padocScopes = () => (process.env.PADOC_SCOPES || "openid profile email").trim();

/**
 * Force HTTPS sur une adresse annoncée par PADOC.
 *
 * L'instance Railway annonce ses points d'entrée en `http://` mais redirige en
 * 301 vers `https://`. Pour un GET ce n'est qu'un détour ; pour l'échange du
 * code c'est rédhibitoire : `fetch` rejoue un POST redirigé en 301 sous forme
 * de GET sans corps, et le secret client serait d'abord parti en clair. Seul
 * le transport change — l'émetteur attendu dans les jetons reste celui que
 * PADOC annonce. Le développement local contre un PADOC en `http://localhost`
 * n'est pas touché.
 */
export const secureEndpoint = (adresse: string) => {
  const url = new URL(adresse);
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol === "http:" && !local) url.protocol = "https:";
  return url.toString();
};

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

  const response = await fetch(secureEndpoint(`${issuer}/.well-known/openid-configuration`), {
    cache: "no-store",
  });
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
    jwksCache = { uri, keys: createRemoteJWKSet(new URL(secureEndpoint(uri))) };
  }
  return jwksCache.keys;
};

/** Valeurs à usage unique du parcours : anti-rejeu, anti-CSRF, PKCE. */
export const createTransientState = (returnTo?: string, admin = false): PadocTransientState => {
  const codeVerifier = base64Url(randomBytes(48));
  return {
    state: base64Url(randomBytes(24)),
    nonce: base64Url(randomBytes(24)),
    codeVerifier,
    returnTo,
    admin,
  };
};

export const codeChallengeFor = (codeVerifier: string) =>
  base64Url(createHash("sha256").update(codeVerifier).digest());

export const padocAuthorizationUrl = async (
  transient: PadocTransientState,
  redirectUri: string,
) => {
  const { authorization_endpoint } = await padocDiscovery();
  const url = new URL(secureEndpoint(authorization_endpoint));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", padocClientId());
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", padocScopes());
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

  const response = await fetch(secureEndpoint(discovery.token_endpoint), {
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
    // Liste blanche explicite, limitée à ce que PADOC signe : accepter
    // l'algorithme annoncé par le jeton lui-même — « none » compris — est la
    // faille classique.
    algorithms: ["RS256"],
  });

  // Le nonce lie ce jeton à la demande que NOUS avons émise. Sans ce contrôle,
  // un jeton valide obtenu ailleurs pourrait être rejoué ici.
  if (payload.nonce !== expectedNonce) {
    throw new Error("Le nonce du jeton ne correspond pas à la demande.");
  }

  return toIdentity(payload);
};

const texte = (valeur: unknown) =>
  typeof valeur === "string" && valeur.trim() ? valeur.trim() : undefined;

export const toIdentity = (payload: JWTPayload): PadocIdentity => {
  if (!payload.sub) throw new Error("Jeton PADOC sans sujet.");

  const brut = payload[CLAIM_ROLES];
  const roles = Array.isArray(brut)
    ? brut.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    : [];

  return {
    subject: payload.sub,
    email: texte(payload.email),
    // Les claims de profil sont facultatifs : `name` d'abord, sinon ses parties.
    name: texte(payload.name)
      || texte([texte(payload.given_name), texte(payload.family_name)].filter(Boolean).join(" ")),
    roles,
  };
};
