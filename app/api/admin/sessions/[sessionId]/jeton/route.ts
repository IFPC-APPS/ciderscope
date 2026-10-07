import { NextResponse } from "next/server";

import { requireAdmin } from "../../../../../../lib/server/adminAuth";
import { assurerJeton, regenererJeton } from "../../../../../../lib/server/jetonSeance";
import { getSessionDetails } from "../../../../../../lib/server/sessionStore";
import { avecLienDirect } from "../../../../../../lib/genreSeance";
import type { SessionConfig } from "../../../../../../types";

export const runtime = "nodejs";

/**
 * Le jeton d'entrée d'une dégustation, pour en faire un QR code.
 *
 * `GET` le crée s'il n'existe pas encore : les séances antérieures à cette
 * fonctionnalité n'en ont pas, et le créer à la volée évite une migration de
 * données.
 *
 * `POST` le remplace. L'ancienne adresse cesse aussitôt de fonctionner et les
 * feuilles imprimées deviennent inutilisables — c'est précisément à cela qu'il
 * sert, quand une adresse a circulé.
 */
async function verifierDegustation(sessionId: string) {
  const session = await getSessionDetails(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Séance introuvable." }, { status: 404 });
  }
  // Un panel IFPC se rejoint par le catalogue et ses créneaux : lui donner une
  // adresse d'entrée laisserait croire à un fonctionnement qu'il n'a pas.
  if (!avecLienDirect(session.config as SessionConfig)) {
    return NextResponse.json(
      { error: "Seule une dégustation producteur se rejoint par adresse dédiée." },
      { status: 409 },
    );
  }
  return null;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  try {
    const { sessionId } = await context.params;
    const refus = await verifierDegustation(sessionId);
    if (refus) return refus;
    return NextResponse.json({ jeton: await assurerJeton(sessionId) });
  } catch (error) {
    console.error("Jeton de séance — lecture:", error);
    return NextResponse.json({ error: "Impossible de lire le jeton." }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  try {
    const { sessionId } = await context.params;
    const refus = await verifierDegustation(sessionId);
    if (refus) return refus;
    return NextResponse.json({ jeton: await regenererJeton(sessionId) });
  } catch (error) {
    console.error("Jeton de séance — régénération:", error);
    return NextResponse.json({ error: "Impossible de régénérer le jeton." }, { status: 500 });
  }
}
