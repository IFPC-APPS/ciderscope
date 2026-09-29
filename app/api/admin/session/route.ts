import { NextResponse } from "next/server";
import { readAdminSession } from "../../../../lib/server/adminAuth";
import { isPadocConfigured } from "../../../../lib/server/padocFederation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Qui est connecté, et ce qu'il a le droit de faire.
 *
 * <p>Jusqu'ici l'interface se fiait à un drapeau posé dans `sessionStorage` au
 * moment de la connexion. Deux raisons de ne plus s'en contenter : un retour
 * de PADOC arrive par redirection, sans jamais repasser par le code qui posait
 * ce drapeau ; et un drapeau de navigateur ne dit rien des capacités réelles,
 * que seul le serveur connaît.</p>
 *
 * <p>Ce que renvoie cette route ne décide de rien : c'est un confort
 * d'affichage. Les routes sensibles vérifient la capacité elles-mêmes — masquer
 * un bouton n'a jamais protégé une API.</p>
 */
export async function GET() {
  const session = await readAdminSession();

  if (!session) {
    // On dit tout de même si la fédération est disponible : l'écran de
    // connexion doit savoir s'il propose le bouton PADOC.
    return NextResponse.json({
      authenticated: false,
      padocAvailable: isPadocConfigured(),
    });
  }

  return NextResponse.json({
    authenticated: true,
    padocAvailable: isPadocConfigured(),
    user: session.user,
    roles: session.roles,
    federated: session.federated,
  });
}
