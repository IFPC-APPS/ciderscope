import { NextResponse } from "next/server";
import { listSessionCatalog } from "../../../../lib/server/sessionStore";
import { idsDesDegustations } from "../../../../lib/server/seanceGenre";

export const runtime = "nodejs";

/**
 * Le catalogue que voit un visiteur : les panels IFPC du jour.
 *
 * Les dégustations producteurs en sont retirées. Elles ne se parcourent pas,
 * elles se rejoignent par l'adresse de leur QR code — et les laisser ici
 * reviendrait à publier la liste des dégustations de chaque producteur, que
 * n'importe qui pourrait alors ouvrir. Le jeton ne protégerait plus rien.
 */
export async function GET() {
  try {
    const [sessions, degustations] = await Promise.all([
      listSessionCatalog({ currentDayOnly: true }),
      idsDesDegustations(),
    ]);
    return NextResponse.json({
      sessions: sessions.filter(session => session.active && !degustations.has(session.id)),
    });
  } catch (error) {
    console.error("Public session catalog error:", error);
    return NextResponse.json({ error: "Impossible de charger les séances." }, { status: 500 });
  }
}
