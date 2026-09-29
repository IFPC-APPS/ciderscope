import { NextResponse } from "next/server";
import { CAPACITES, requireCapacite } from "../../../../../../../lib/server/adminAuth";
import { getSupabaseAdminIfConfigured } from "../../../../../../../lib/server/supabaseAdmin";
import { cancelSlotRegistrationWithInvitations } from "../../../../../../../lib/server/slotCancellation";

export const runtime = "nodejs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slotId: string; registrationId: string }> }
) {
  const unauthorized = await requireCapacite(CAPACITES.CRENEAUX);
  if (unauthorized) return unauthorized;

  try {
    const { slotId, registrationId } = await context.params;
    if (!UUID_PATTERN.test(slotId) || !UUID_PATTERN.test(registrationId)) {
      return NextResponse.json({ ok: false, error: "Identifiant d'inscription invalide." }, { status: 400 });
    }

    const supabase = getSupabaseAdminIfConfigured();
    const { result, outlookCancellation, outlookPromotion } = await cancelSlotRegistrationWithInvitations({
      supabase,
      slotId,
      registrationId,
    });

    if (!result.ok || !result.registration) {
      const status = result.code === "slot_not_found" || result.code === "registration_not_found" ? 404 : 409;
      return NextResponse.json({
        ok: false,
        code: result.code,
        error: result.code === "slot_not_found"
          ? "Créneau introuvable."
          : "Cette inscription n'est plus active.",
      }, { status });
    }

    return NextResponse.json({
      ok: true,
      removedRegistrationId: result.registration.id,
      promotedRegistration: result.promoted_registration
        ? {
          id: result.promoted_registration.id,
          participantName: result.promoted_registration.participant_name,
        }
        : null,
      outlookCancellationStatus: outlookCancellation?.status || null,
      outlookPromotionStatus: outlookPromotion?.status || null,
    });
  } catch (error) {
    console.error("Admin slot registration cancellation error:", error);
    return NextResponse.json({ ok: false, error: "Impossible de retirer cette personne du créneau." }, { status: 500 });
  }
}
