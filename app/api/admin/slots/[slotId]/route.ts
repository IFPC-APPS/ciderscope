import { NextResponse } from "next/server";
import { CAPACITES, requireCapacite } from "../../../../../lib/server/adminAuth";
import { getCalendarSlot } from "../../../../../lib/server/slotData";
import { getSupabaseAdminIfConfigured } from "../../../../../lib/server/supabaseAdmin";
import { deleteSlotFromSql, getCalendarSlotFromSql } from "../../../../../lib/server/slotSql";
import { cancelOutlookInvitationsForRegistrations } from "../../../../../lib/server/outlookInvitations";

export const runtime = "nodejs";

type DeleteSlotRpcResult = {
  ok: boolean;
  code?: string;
  slot?: {
    id: string;
    slot_date: string;
    session_id: string | null;
    session_name: string;
  };
  registrations?: Array<{
    id: string;
    slot_id: string;
    participant_name: string;
    participant_email: string;
    cancelled_at: string;
    outlook_event_id?: string | null;
  }>;
};

const tryCancelOutlookRegistrations = async (
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminIfConfigured>> | null,
  registrations: Array<{ id: string; outlookEventId: string | null }>,
  slotDate?: string | null
) => {
  if (registrations.length === 0) return;
  try {
    await cancelOutlookInvitationsForRegistrations({ supabase, registrations, slotDate });
  } catch (error) {
    console.error("Outlook registration event cancellation error:", error);
  }
};

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ slotId: string }> }
) {
  const unauthorized = await requireCapacite(CAPACITES.CRENEAUX);
  if (unauthorized) return unauthorized;

  try {
    const { slotId } = await context.params;
    const supabase = getSupabaseAdminIfConfigured();
    const slotForOutlook = supabase ? await getCalendarSlot(supabase, slotId) : await getCalendarSlotFromSql(slotId);

    if (!supabase) {
      const result = await deleteSlotFromSql(slotId);
      if (!result.ok) {
        return NextResponse.json({ ok: false, code: result.code }, { status: 404 });
      }
      await tryCancelOutlookRegistrations(null, result.registrations, slotForOutlook?.slotDate);
      return NextResponse.json({ ok: true, cancelledCount: result.cancelledCount });
    }

    const { data, error } = await supabase.rpc("delete_session_slot", {
      p_slot_id: slotId,
      p_deleted_by: "admin",
    });

    if (error) throw error;
    const result = data as DeleteSlotRpcResult;
    if (!result.ok) {
      return NextResponse.json({ ok: false, code: result.code }, { status: 404 });
    }
    await tryCancelOutlookRegistrations(
      supabase,
      (result.registrations || []).map(registration => ({
        id: registration.id,
        outlookEventId: registration.outlook_event_id || null,
      })),
      result.slot?.slot_date || slotForOutlook?.slotDate
    );
    return NextResponse.json({
      ok: true,
      cancelledCount: result.registrations?.length || 0,
    });
  } catch (error) {
    console.error("Admin slot delete error:", error);
    return NextResponse.json({ ok: false, error: "Impossible de supprimer le créneau." }, { status: 500 });
  }
}
