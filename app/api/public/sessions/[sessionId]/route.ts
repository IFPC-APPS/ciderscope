import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { avecLienDirect } from "../../../../../lib/genreSeance";
import { seanceDuJeton } from "../../../../../lib/server/jetonSeance";
import { sanitizeParticipantConfig } from "../../../../../lib/server/sessionSecurity";
import {
  getSessionDetails,
  isSessionJoinable,
  listOccupiedPostes,
} from "../../../../../lib/server/sessionStore";
import type { SessionConfig } from "../../../../../types";

export const runtime = "nodejs";

export const COOKIE_SEANCE = "ciderscope_seance";

/**
 * Le détail d'une séance, pour le dégustateur.
 *
 * Un panel IFPC reste ouvert : il figure au catalogue public, et son
 * identifiant n'a jamais été un secret.
 *
 * Une dégustation producteur, elle, exige son jeton. Sans cette vérification,
 * le QR code ne protégerait rien : l'identifiant de séance se devine, et il a
 * suffi jusqu'ici pour obtenir la configuration complète. Le jeton voyage dans
 * un cookie `HttpOnly` déposé par /s/<jeton>, donc sans que la page ait à le
 * manipuler.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await context.params;
    const [session, joinable] = await Promise.all([
      getSessionDetails(sessionId),
      isSessionJoinable(sessionId),
    ]);
    if (!session || !joinable) {
      return NextResponse.json({ error: "Séance indisponible." }, { status: 404 });
    }

    if (avecLienDirect(session.config as SessionConfig)) {
      const jeton = (await cookies()).get(COOKIE_SEANCE)?.value;
      const autorisee = jeton ? await seanceDuJeton(jeton) : null;
      if (autorisee !== sessionId) {
        // 404 et non 403 : répondre « interdit » confirmerait l'existence de
        // la séance à qui essaie des identifiants au hasard.
        return NextResponse.json({ error: "Séance indisponible." }, { status: 404 });
      }
    }

    return NextResponse.json({
      config: sanitizeParticipantConfig(session.config),
      takenPostes: await listOccupiedPostes(sessionId),
    });
  } catch (error) {
    console.error("Public session detail error:", error);
    return NextResponse.json({ error: "Impossible de charger la séance." }, { status: 500 });
  }
}
