import { NextResponse } from "next/server";
import { cookieSecurise } from "../../../../../lib/server/cookieSecurity";
import {
  PADOC_STATE_COOKIE,
  PADOC_STATE_MAX_AGE_SECONDS,
  createTransientState,
  isPadocConfigured,
  padocAuthorizationUrl,
} from "../../../../../lib/server/padocFederation";
import { callbackUrlFor } from "../callbackUrl";

export const runtime = "nodejs";

/**
 * Départ du parcours « Se connecter avec PADOC ».
 *
 * Les valeurs à usage unique (state, nonce, vérificateur PKCE) sont déposées
 * dans un cookie `httpOnly` plutôt que gardées côté serveur : CiderScope tourne
 * sans état sur Vercel, deux requêtes successives ne touchent pas forcément la
 * même instance. Le cookie est de courte durée et disparaît au retour.
 */
export async function GET(request: Request) {
  if (!isPadocConfigured()) {
    return NextResponse.json(
      { error: "La connexion PADOC n'est pas configurée sur cette instance." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);

  // Destination après connexion. Restreinte à un chemin interne : accepter une
  // URL absolue ferait de cette route une redirection ouverte, commode pour
  // faire atterrir un utilisateur authentifié sur un site tiers.
  const demande = url.searchParams.get("returnTo") || "";
  const returnTo = demande.startsWith("/") && !demande.startsWith("//") ? demande : undefined;

  const transient = createTransientState(returnTo, url.searchParams.get("admin") === "1");

  try {
    const destination = await padocAuthorizationUrl(transient, callbackUrlFor(request));
    const response = NextResponse.redirect(destination);
    response.cookies.set(PADOC_STATE_COOKIE, JSON.stringify(transient), {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecurise(),
      path: "/",
      maxAge: PADOC_STATE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("[padoc] départ du parcours impossible", error);
    return NextResponse.json(
      { error: "PADOC est injoignable pour le moment." },
      { status: 502 },
    );
  }
}
