import { NextResponse } from "next/server";
import { readUserSession } from "../../../../lib/server/adminAuth";
import { isPadocConfigured } from "../../../../lib/server/padocFederation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Qui est connecté, administrateur ou simple utilisateur.
 *
 * Confort d'affichage seulement : pré-remplir le prénom d'un jury, montrer le
 * bouton de connexion. Les routes sensibles vérifient elles-mêmes les droits.
 */
export async function GET() {
  const session = await readUserSession();

  if (!session) {
    return NextResponse.json({ authenticated: false, padocAvailable: isPadocConfigured() });
  }

  return NextResponse.json({
    authenticated: true,
    padocAvailable: isPadocConfigured(),
    user: session.user,
    roles: session.roles,
    isAdmin: session.isAdmin,
  });
}
