import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ADMIN_COOKIE = "ciderscope_admin";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const localSessionSecret = randomBytes(32).toString("base64url");

/**
 * Capacités d'un animateur SUR CiderScope.
 *
 * Ce sont NOS noms, pas ceux de l'organigramme PADOC : un rôle « expert
 * cidricole » n'a aucun sens ici, alors que « voit la planification » en a un.
 * PADOC les transmet tels quels sans les interpréter.
 */
export const CAPACITES = {
  /** Créer et conduire des séances : c'est l'accès administrateur. */
  ANIMATEUR: "animateur",
  /** Planification par créneaux et invitations Outlook — usage panel PADOC. */
  CRENEAUX: "creneaux",
} as const;

export type Capacite = (typeof CAPACITES)[keyof typeof CAPACITES];

type AdminPayload = {
  user: string;
  nonce: string;
  exp: number;
  /** Identifiant PADOC, opaque et stable. Absent pour une session mot de passe. */
  sub?: string;
  /** Capacités portées par la session. */
  roles?: string[];
  /** D'où vient cette session : « padoc » ou « motdepasse ». */
  src?: "padoc" | "motdepasse";
};

export interface AdminSession {
  user: string;
  subject?: string;
  roles: string[];
  federated: boolean;
}

/**
 * Capacités d'une session ouverte par mot de passe partagé.
 *
 * Tout, délibérément : c'est le chemin historique du panel PADOC, et le
 * restreindre retirerait des fonctions à une installation en service. Il
 * disparaîtra quand tous les animateurs seront passés par la fédération.
 */
const CAPACITES_MOT_DE_PASSE: string[] = [CAPACITES.ANIMATEUR, CAPACITES.CRENEAUX];

const base64UrlEncode = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const base64UrlDecode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const getSecret = () => {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    localSessionSecret
  );
};

const sign = (payload: string) => {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
};

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

const encodeSession = (payload: AdminPayload) => {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
};

export const createAdminSessionToken = (user: string) =>
  encodeSession({
    user,
    nonce: randomBytes(12).toString("hex"),
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    roles: CAPACITES_MOT_DE_PASSE,
    src: "motdepasse",
  });

/**
 * Session ouverte par PADOC.
 *
 * La durée reste celle de CiderScope : le jeton d'accès PADOC, lui, vit dix
 * minutes et n'a pas vocation à être conservé. Ce que nous gardons est le
 * résultat de l'authentification, pas le jeton.
 */
export const createFederatedSessionToken = (
  subject: string,
  user: string,
  roles: string[],
) =>
  encodeSession({
    user,
    sub: subject,
    roles,
    src: "padoc",
    nonce: randomBytes(12).toString("hex"),
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  });

/** Relit la session, ou null si le jeton est absent, altéré ou expiré. */
export const readAdminSessionToken = (token?: string): AdminSession | null => {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as AdminPayload;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    return {
      user: payload.user,
      subject: payload.sub,
      // Une session d'avant cette évolution n'a pas de rôles : lui refuser
      // l'accès déconnecterait les animateurs en cours de séance.
      roles: Array.isArray(payload.roles) ? payload.roles : CAPACITES_MOT_DE_PASSE,
      federated: payload.src === "padoc",
    };
  } catch {
    return null;
  }
};

/** Conservé : de nombreux appelants ne veulent qu'un booléen. */
export const verifyAdminSessionToken = (token?: string) =>
  readAdminSessionToken(token) !== null;

export const setAdminCookie = (response: NextResponse, token: string) => {
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
};

export const clearAdminCookie = (response: NextResponse) => {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
};

/** La session courante, ou null. */
export const readAdminSession = async (): Promise<AdminSession | null> => {
  const store = await cookies();
  return readAdminSessionToken(store.get(ADMIN_COOKIE)?.value);
};

export const isAdminRequest = async () => (await readAdminSession()) !== null;

export const requireAdmin = async () => {
  if (await isAdminRequest()) return null;
  return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
};

/**
 * Exige une capacité précise.
 *
 * Distinct de {@link requireAdmin} : être authentifié ne dit pas ce qu'on a le
 * droit de faire. Les routes de planification l'emploieront pour rester
 * fermées aux animateurs qui n'ont pas reçu la capacité « creneaux ».
 */
export const requireCapacite = async (capacite: Capacite) => {
  const session = await readAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }
  if (!session.roles.includes(capacite)) {
    // 403 et non 404 : la route existe, c'est le droit qui manque. Masquer
    // son existence n'apporterait rien, l'interface la nomme déjà.
    return NextResponse.json(
      { error: `Capacité « ${capacite} » requise.` },
      { status: 403 },
    );
  }
  return null;
};

export const isValidAdminCredentials = (login: string, password: string) => {
  const expectedLogin = process.env.ADMIN_USERNAME || "ifpc";
  const expectedPassword = process.env.ADMIN_PASSWORD || "ifpc";
  return safeEqual(login.trim().toLowerCase(), expectedLogin.trim().toLowerCase())
    && safeEqual(password, expectedPassword);
};
