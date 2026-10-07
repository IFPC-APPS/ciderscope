import { NextResponse } from "next/server";

import { cookieSecurise } from "../../../lib/server/cookieSecurity";
import { jetonValide, seanceDuJeton } from "../../../lib/server/jetonSeance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * La porte d'entrée d'une dégustation : l'adresse que porte le QR code.
 *
 * Aucune connexion n'est demandée, et le dégustateur n'a pas de compte. Le
 * jeton de l'adresse est donc le seul droit d'entrée — c'est pourquoi il est
 * aussitôt déposé dans un cookie `HttpOnly` plutôt que laissé dans l'URL : il
 * ne traîne ni dans l'historique du navigateur, ni dans le `Referer` envoyé
 * aux pages suivantes, ni dans le code de la page.
 *
 * Une séance pouvant être rejouée, le cookie dure longtemps : la même feuille
 * imprimée resert d'une session à l'autre, et un dégustateur qui revient le
 * lendemain n'a pas à rescanner.
 */
export const COOKIE_SEANCE = "ciderscope_seance";
const DUREE_COOKIE_S = 60 * 60 * 24 * 30;

export async function GET(
  request: Request,
  context: { params: Promise<{ jeton: string }> },
) {
  const { jeton } = await context.params;

  // Forme vérifiée avant toute requête : un jeton mal formé est refusé sans
  // toucher la base, ce qui évite de faire de cette route un moyen de la
  // sonder.
  if (!jetonValide(jeton)) {
    return NextResponse.redirect(new URL("/?acces=refuse", request.url));
  }

  let sessionId: string | null = null;
  try {
    sessionId = await seanceDuJeton(jeton);
  } catch (error) {
    console.error("Entrée par jeton:", error);
    return NextResponse.redirect(new URL("/?acces=erreur", request.url));
  }

  if (!sessionId) {
    // Jeton inconnu ou régénéré depuis l'impression de la feuille. Le message
    // est le même dans les deux cas : distinguer renseignerait un visiteur qui
    // essaie des jetons au hasard.
    return NextResponse.redirect(new URL("/?acces=refuse", request.url));
  }

  const reponse = NextResponse.redirect(new URL("/", request.url));
  reponse.cookies.set(COOKIE_SEANCE, jeton, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecurise(),
    path: "/",
    maxAge: DUREE_COOKIE_S,
  });
  return reponse;
}
