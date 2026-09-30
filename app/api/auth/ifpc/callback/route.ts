import { NextResponse } from "next/server";
import {
  CAPACITES,
  createFederatedSessionToken,
  setAdminCookie,
} from "../../../../../lib/server/adminAuth";
import { upsertFederatedUser } from "../../../../../lib/server/userAccounts";
import {
  PADOC_STATE_COOKIE,
  exchangeCodeForIdentity,
  isPadocConfigured,
  type PadocTransientState,
} from "../../../../../lib/server/padocFederation";
import { callbackUrlFor } from "../callbackUrl";

export const runtime = "nodejs";

/** Renvoie sur l'accueil avec un motif lisible, plutôt qu'un JSON nu. */
const echec = (request: Request, motif: string) => {
  const destination = new URL("/", new URL(request.url).origin);
  destination.searchParams.set("connexion", motif);
  const response = NextResponse.redirect(destination);
  response.cookies.set(PADOC_STATE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
};

/**
 * Retour de PADOC après authentification.
 *
 * Deux contrôles avant d'ouvrir une session, dans cet ordre : le `state`
 * atteste que ce retour répond bien à une demande partie d'ici, puis l'échange
 * du code vérifie signature, émetteur, audience, expiration et `nonce`.
 *
 * Toute personne habilitée par PADOC obtient une session : les rôles reçus
 * disent ensuite ce qu'elle peut faire. Sans « animateur », c'est un jury
 * identifié, qui n'ouvre pas l'administration.
 */
export async function GET(request: Request) {
  if (!isPadocConfigured()) {
    return echec(request, "indisponible");
  }

  const url = new URL(request.url);

  // PADOC signale lui-même certains refus — compte non habilité, consentement
  // refusé — par un paramètre d'erreur plutôt que par un code.
  if (url.searchParams.get("error")) {
    console.warn("[padoc] refus annoncé :", url.searchParams.get("error"));
    return echec(request, "refus");
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return echec(request, "incomplet");

  const brut = request.headers
    .get("cookie")
    ?.split(";")
    .map(part => part.trim())
    .find(part => part.startsWith(`${PADOC_STATE_COOKIE}=`))
    ?.slice(PADOC_STATE_COOKIE.length + 1);

  if (!brut) return echec(request, "expire");

  let transient: PadocTransientState;
  try {
    transient = JSON.parse(decodeURIComponent(brut)) as PadocTransientState;
  } catch {
    return echec(request, "expire");
  }

  // Comparaison du state : sans elle, un tiers pourrait faire consommer chez
  // nous un code d'autorisation obtenu ailleurs.
  if (!transient.state || transient.state !== state) {
    console.warn("[padoc] state inattendu au retour");
    return echec(request, "invalide");
  }

  try {
    const identite = await exchangeCodeForIdentity(
      code,
      transient.codeVerifier,
      transient.nonce,
      callbackUrlFor(request),
    );

    // Authentifié ne veut pas dire autorisé : partie de l'écran
    // d'administration, une personne sans capacité « animateur » doit savoir
    // pourquoi elle n'y entre pas.
    if (transient.admin && !identite.roles.includes(CAPACITES.ANIMATEUR)) {
      console.warn("[padoc] compte sans capacité animateur :", identite.subject);
      return echec(request, "sans-role");
    }

    // Compte local créé à la première connexion. Un incident de base ne doit
    // pas fermer la porte : la session repose sur le cookie, pas sur la table.
    await upsertFederatedUser(identite).catch((error: unknown) => {
      console.error("[padoc] enregistrement du compte local impossible", error);
    });

    const destination = new URL(transient.returnTo || "/", new URL(request.url).origin);
    const response = NextResponse.redirect(destination);
    setAdminCookie(
      response,
      createFederatedSessionToken(
        identite.subject,
        identite.name || identite.email || identite.subject,
        identite.roles,
      ),
    );
    response.cookies.set(PADOC_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    // Le détail part au journal, pas à l'utilisateur : il porte des éléments
    // du jeton et de la configuration.
    console.error("[padoc] échec de l'échange", error);
    return echec(request, "echec");
  }
}
