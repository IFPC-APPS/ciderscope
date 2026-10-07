import { getSessionSqlPool } from "./sessionSql";
import { getSupabaseAdminIfConfigured } from "./supabaseAdmin";

/**
 * Le genre d'une séance, lu directement en base.
 *
 * Le catalogue public est produit par une procédure stockée côté Supabase, qui
 * ne remonte pas le genre. Plutôt que de modifier cette procédure — et d'avoir
 * à la déployer séparément sur chaque base — on interroge ici les seules
 * séances concernées, et le filtrage se fait dans la route.
 *
 * Le genre vit dans le `config` (colonne `jsonb`), d'où `config->>'genre'`.
 */

/** Identifiants des dégustations producteurs. */
export const idsDesDegustations = async (): Promise<Set<string>> => {
  const supabase = getSupabaseAdminIfConfigured();
  if (supabase) {
    const { data, error } = await supabase
      .from("sessions")
      .select("id")
      .eq("config->>genre", "degustation");
    if (error) throw error;
    return new Set(((data as { id: string }[]) || []).map((r) => r.id));
  }

  const { rows } = await getSessionSqlPool().query<{ id: string }>(
    "select id from sessions where config->>'genre' = 'degustation'",
  );
  return new Set(rows.map((r) => r.id));
};
