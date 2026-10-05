import { cookies } from "next/headers";
import { cookieSecurise } from "./cookieSecurity";
import { NextResponse } from "next/server";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ADMIN_COOKIE = "ciderscope_admin";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const localSessionSecret = randomBytes(32).toString("base64url");

/**
 * Capacités d'un utilisateur SUR CiderScope.
 *
 * Ce sont NOS noms, pas ceux de l'organigramme PADOC : un rôle « expert
 * cidricole » n'a aucun sens ici, alors que « voit la planification » en a un.
 * PADOC les transmet tels quels sans les interpréter.
 *
 * Une habilitation PADOC sans aucun rôle est légitime : c'est un utilisateur
 * classique (un jury), identifié mais sans accès à l'administration.
 */
export const CAPACITES = {
  /** Créer et conduire des séances : c'est l'accès administrateur. */
  ANIMATEUR: "animateur",
  /** Planification par créneaux et invitations Outlook — usage panel PADOC. */
  CRENEAUX: "creneaux",
} as const;

export type Capacite = (typeof CAPACITES)[keyof typeof CAPACITES];

type SessionPayload = {
  user: string;
  nonce: string;
  exp: number;
  /** Identifiant PADOC, opaque et stable. */
  sub: string;
  /** Capacités portées par la session. */
  roles: string[];
  /** Origine de la session. Seule « padoc » est encore acceptée. */
  src: "padoc";
};

export interface UserSession {
  /** Nom affiché. */
  user: string;
  /** Identifiant PADOC : la seule clé fiable pour désigner la personne. */
  subject: string;
  roles: string[];
  /** Vrai si la session ouvre l'espace d'administration. */
  isAdmin: boolean;
}

/** Conservé pour les appelants existants. */
export type AdminSession = UserSession;

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

const encodeSession = (payload: SessionPayload) => {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
};

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
export const readAdminSessionToken = (token?: string): UserSession | null => {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encoded)) as Partial<SessionPayload>;
    if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return null;
    // Une session sans sujet PADOC vient de l'ancien mot de passe partagé,
    // retiré : elle ne désigne personne et n'ouvre plus rien.
    if (payload.src !== "padoc" || typeof payload.sub !== "string" || !payload.sub) return null;
    const roles = Array.isArray(payload.roles)
      ? payload.roles.filter((r): r is string => typeof r === "string")
      : [];
    return {
      user: typeof payload.user === "string" ? payload.user : payload.sub,
      subject: payload.sub,
      roles,
      isAdmin: roles.includes(CAPACITES.ANIMATEUR),
    };
  } catch {
    return null;
  }
};

/** Conservé : de nombreux appelants ne veulent qu'un booléen. */
export const verifyAdminSessionToken = (token?: string) =>
  readAdminSessionToken(token)?.isAdmin === true;

export const setAdminCookie = (response: NextResponse, token: string) => {
  response.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecurise(),
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
};

export const clearAdminCookie = (response: NextResponse) => {
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecurise(),
    path: "/",
    maxAge: 0,
  });
};

/** La personne connectée, administratrice ou non, ou null. */
export const readUserSession = async (): Promise<UserSession | null> => {
  const store = await cookies();
  return readAdminSessionToken(store.get(ADMIN_COOKIE)?.value);
};

/** La session courante si elle ouvre l'administration, sinon null. */
export const readAdminSession = async (): Promise<UserSession | null> => {
  const session = await readUserSession();
  return session?.isAdmin ? session : null;
};

export const isAdminRequest = async () => (await readAdminSession()) !== null;

/**
 * Exige l'accès administrateur.
 *
 * Être connecté ne suffit plus : un jury identifié par PADOC a une session,
 * mais pas la capacité « animateur ». 401 invite à se connecter, 403 dit que
 * le droit manque.
 */
export const requireAdmin = async () => {
  const session = await readUserSession();
  if (!session) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json(
      { error: `Capacité « ${CAPACITES.ANIMATEUR} » requise.` },
      { status: 403 },
    );
  }
  return null;
};

/**
 * Exige une capacité précise, en plus de l'accès administrateur.
 *
 * Être animateur ne dit pas tout ce qu'on a le droit de faire : les routes de
 * planification restent fermées aux animateurs qui n'ont pas reçu la capacité
 * « creneaux ».
 */
export const requireCapacite = async (capacite: Capacite) => {
  const refus = await requireAdmin();
  if (refus) return refus;
  const session = await readAdminSession();
  if (!session?.roles.includes(capacite)) {
    // 403 et non 404 : la route existe, c'est le droit qui manque. Masquer
    // son existence n'apporterait rien, l'interface la nomme déjà.
    return NextResponse.json(
      { error: `Capacité « ${capacite} » requise.` },
      { status: 403 },
    );
  }
  return null;
};
