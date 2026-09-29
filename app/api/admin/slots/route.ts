import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listSlots } from "../../../../lib/server/slotData";
import { getSupabaseAdminIfConfigured } from "../../../../lib/server/supabaseAdmin";
import { createSlotFromSql, hasSlotSqlConfig, listSlotsFromSql } from "../../../../lib/server/slotSql";
import { CAPACITES, requireCapacite } from "../../../../lib/server/adminAuth";
import { parseIsoDate } from "../../../../lib/slots/dates";

export const runtime = "nodejs";

type SlotCreatePayload = {
  slotDate?: string;
  slotDates?: string[];
  sessionId?: string | null;
  sessionName?: string;
};

const getAdminErrorDetail = (error: unknown) => {
  const typed = error as { code?: string; message?: string; details?: string; hint?: string };
  return [typed.code, typed.message, typed.details, typed.hint].filter(Boolean).join(" - ");
};

const isUniqueSlotError = (error: unknown) => (error as { code?: string }).code === "23505";
const isRlsError = (error: unknown) => (error as { code?: string }).code === "42501";
const isSlotAlreadyAttachedError = (error: unknown) => (error as { code?: string }).code === "slot_already_attached";

const normalizeSlotDates = (body: SlotCreatePayload | null) => {
  const rawDates = Array.isArray(body?.slotDates) && body.slotDates.length > 0
    ? body.slotDates
    : body?.slotDate
      ? [body.slotDate]
      : [];
  return Array.from(new Set(rawDates.map(date => date.trim()).filter(Boolean)));
};

const createSlotWithSupabase = async (
  supabase: SupabaseClient,
  slotDate: string,
  sessionId: string | null,
  sessionName: string
) => {
  const { data: existing, error: existingError } = await supabase
    .from("session_slots")
    .select("id, session_id")
    .eq("slot_date", slotDate)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    const existingSlot = existing as { id: string; session_id: string | null };
    if (existingSlot.session_id && existingSlot.session_id !== sessionId) {
      const error = new Error("Slot already attached to another session.") as Error & { code?: string };
      error.code = "slot_already_attached";
      throw error;
    }

    const { data, error } = await supabase
      .from("session_slots")
      .update({
        session_id: sessionId,
        session_name: sessionName,
        created_by: "admin",
      })
      .eq("id", existingSlot.id)
      .select("id")
      .single();

    if (error) throw error;
    return { id: (data as { id: string }).id, slotDate, attached: true };
  }

  const { data, error } = await supabase
    .from("session_slots")
    .insert({
      slot_date: slotDate,
      session_id: sessionId,
      session_name: sessionName,
      created_by: "admin",
    })
    .select("id")
    .single();

  if (error) throw error;
  return { id: (data as { id: string }).id, slotDate, attached: false };
};

export async function GET(request: Request) {
  const unauthorized = await requireCapacite(CAPACITES.CRENEAUX);
  if (unauthorized) return unauthorized;

  try {
    const url = new URL(request.url);
    const start = url.searchParams.get("start");
    const end = url.searchParams.get("end");
    const supabase = getSupabaseAdminIfConfigured();
    const slots = supabase
      ? await listSlots(supabase, { start, end, admin: true })
      : await listSlotsFromSql({ start, end, admin: true });
    return NextResponse.json({ slots });
  } catch (error) {
    console.error("Admin slot list error:", error);
    return NextResponse.json({
      error: "Impossible de charger les creneaux.",
      detail: getAdminErrorDetail(error),
    }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const unauthorized = await requireCapacite(CAPACITES.CRENEAUX);
  if (unauthorized) return unauthorized;

  try {
    const body = await request.json().catch(() => null) as SlotCreatePayload | null;
    const slotDates = normalizeSlotDates(body);

    if (slotDates.length === 0 || slotDates.some(date => !parseIsoDate(date))) {
      return NextResponse.json({ error: "Date de creneau invalide." }, { status: 400 });
    }
    if (slotDates.length > 366) {
      return NextResponse.json({ error: "La plage de dates est trop longue." }, { status: 400 });
    }

    const supabase = getSupabaseAdminIfConfigured();
    const canUseSql = hasSlotSqlConfig();
    const sessionId = body?.sessionId || null;
    let sessionName = (body?.sessionName || "").trim();

    if (!sessionName && supabase && sessionId && !canUseSql) {
      const { data: session, error: sessionError } = await supabase
        .from("sessions")
        .select("id, name")
        .eq("id", sessionId)
        .maybeSingle();

      if (sessionError) throw sessionError;
      if (!session) {
        return NextResponse.json({ error: "Seance introuvable." }, { status: 400 });
      }
      if (!sessionName) sessionName = (session as { name: string }).name;
    }

    if (!sessionName && !sessionId) {
      return NextResponse.json({ error: "Le nom de seance est obligatoire." }, { status: 400 });
    }

    const created: Array<{ id: string; slotDate: string }> = [];
    const attached: Array<{ id: string; slotDate: string }> = [];
    const skipped: Array<{ slotDate: string; error: string }> = [];

    for (const slotDate of slotDates) {
      try {
        const data = canUseSql
          ? { ...(await createSlotFromSql({ slotDate, sessionId, sessionName })), slotDate }
          : supabase
            ? await createSlotWithSupabase(supabase, slotDate, sessionId, sessionName)
            : { ...(await createSlotFromSql({ slotDate, sessionId, sessionName })), slotDate };
        if (data.attached) attached.push(data);
        else created.push(data);
      } catch (error) {
        if (isUniqueSlotError(error)) {
          try {
            const data = { ...(await createSlotFromSql({ slotDate, sessionId, sessionName })), slotDate };
            if (data.attached) attached.push(data);
            else created.push(data);
          } catch (sqlError) {
            if (isSlotAlreadyAttachedError(sqlError)) {
              skipped.push({ slotDate, error: "Ce creneau est deja rattache a une autre seance." });
              continue;
            }
            throw sqlError;
          }
          continue;
        }
        if (isRlsError(error) && canUseSql) {
          try {
            const data = { ...(await createSlotFromSql({ slotDate, sessionId, sessionName })), slotDate };
            if (data.attached) attached.push(data);
            else created.push(data);
          } catch (sqlError) {
            if (isSlotAlreadyAttachedError(sqlError)) {
              skipped.push({ slotDate, error: "Ce creneau est deja rattache a une autre seance." });
              continue;
            }
            throw sqlError;
          }
          continue;
        }
        if (isSlotAlreadyAttachedError(error)) {
          skipped.push({ slotDate, error: "Ce creneau est deja rattache a une autre seance." });
          continue;
        }
        throw error;
      }
    }

    if (created.length === 0 && attached.length === 0 && skipped.length > 0) {
      return NextResponse.json({ error: skipped[0].error, skipped }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      id: created[0]?.id || attached[0]?.id,
      created,
      attached,
      skipped,
    });
  } catch (error) {
    console.error("Admin slot create error:", error);
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ error: "Un creneau existe deja pour cette date." }, { status: 409 });
    }
    if (code === "slot_session_not_found") {
      return NextResponse.json({ error: "Seance introuvable." }, { status: 400 });
    }
    if (code === "slot_already_attached") {
      return NextResponse.json({ error: "Ce creneau est deja rattache a une autre seance." }, { status: 409 });
    }
    if (code === "42501") {
      return NextResponse.json({
        error: "Impossible de creer le creneau.",
        detail: "RLS bloque l'insertion dans session_slots. Verifiez que SUPABASE_SERVICE_ROLE_KEY contient la cle service_role Supabase, ou configurez DIRECT_URL/DATABASE_URL cote serveur pour le chemin SQL admin.",
      }, { status: 500 });
    }
    return NextResponse.json({
      error: "Impossible de creer le creneau.",
      detail: getAdminErrorDetail(error),
    }, { status: 500 });
  }
}
