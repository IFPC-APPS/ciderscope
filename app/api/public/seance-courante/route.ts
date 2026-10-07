import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { seanceDuJeton } from "../../../../lib/server/jetonSeance";
import { isSessionJoinable } from "../../../../lib/server/sessionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const COOKIE_SEANCE = "ciderscope_seance";

/**
 * La séance que le QR code a ouverte pour ce navigateur, s'il y en a une.
 *
 * Le dégustateur a scanné, /s/<jeton> a déposé le cookie et l'a renvoyé ici :
 * il reste à lui dire dans quelle séance il entre, pour que l'application
 * saute l'écran de choix et aille droit à l'identification.
 *
 * Ne renvoie que l'identifiant. La configuration passe par la route de détail,
 * qui vérifie le même cookie — une seule vérification, à un seul endroit.
 */
export async function GET() {
  try {
    const jeton = (await cookies()).get(COOKIE_SEANCE)?.value;
    if (!jeton) return NextResponse.json({ sessionId: null });

    const sessionId = await seanceDuJeton(jeton);
    if (!sessionId) {
      // Jeton régénéré depuis le scan : le cookie est périmé. On répond
      // simplement « aucune séance » ; l'application retombe sur l'accueil.
      return NextResponse.json({ sessionId: null });
    }

    // Une séance close ne doit pas aspirer le dégustateur dans un écran vide.
    if (!(await isSessionJoinable(sessionId))) {
      return NextResponse.json({ sessionId: null, close: true });
    }

    return NextResponse.json({ sessionId });
  } catch (error) {
    console.error("Séance courante:", error);
    return NextResponse.json({ sessionId: null });
  }
}
