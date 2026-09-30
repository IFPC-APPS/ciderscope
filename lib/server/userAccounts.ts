import type { PadocIdentity } from "./padocFederation";
import { getSessionSqlPool, hasSessionSqlConfig } from "./sessionSql";
import { getSupabaseAdminIfConfigured } from "./supabaseAdmin";

/**
 * Comptes locaux, créés à la première connexion PADOC.
 *
 * Toujours rattachés par le `sub`, jamais par l'e-mail : PADOC ne vérifie pas
 * les adresses, les comparer ouvrirait une prise de contrôle de compte.
 */

const hasStore = () => Boolean(getSupabaseAdminIfConfigured()) || hasSessionSqlConfig();

/** Crée le compte à la première connexion, le met à jour aux suivantes. */
export const upsertFederatedUser = async (identity: PadocIdentity) => {
  const supabase = getSupabaseAdminIfConfigured();
  if (supabase) {
    // `first_login_at` est absent de la charge : fixé par défaut à la
    // création, il n'est pas réécrit en cas de conflit.
    const { error } = await supabase.from("app_users").upsert({
      subject: identity.subject,
      display_name: identity.name ?? null,
      email: identity.email ?? null,
      roles: identity.roles,
      last_login_at: new Date().toISOString(),
    }, { onConflict: "subject" });
    if (error) throw error;
    return;
  }

  if (!hasStore()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY or DIRECT_URL/DATABASE_URL is required for user accounts.");
  }

  await getSessionSqlPool().query(`
    insert into app_users (subject, display_name, email, roles)
    values ($1, $2, $3, $4)
    on conflict (subject) do update set
      display_name = excluded.display_name,
      email = excluded.email,
      roles = excluded.roles,
      last_login_at = now()
  `, [identity.subject, identity.name ?? null, identity.email ?? null, identity.roles]);
};

/**
 * Rattache les réponses d'un jury à son compte PADOC.
 *
 * Seulement si elles ne le sont pas déjà : un prénom partagé entre deux
 * personnes ne doit pas faire passer les réponses de l'une sur le compte de
 * l'autre.
 */
export const linkJurorAccount = async (sessionId: string, jurorName: string, subject: string) => {
  const supabase = getSupabaseAdminIfConfigured();
  if (supabase) {
    const { error } = await supabase
      .from("answers")
      .update({ juror_subject: subject })
      .eq("session_id", sessionId)
      .eq("juror_name", jurorName)
      .is("juror_subject", null);
    if (error) throw error;
    return;
  }

  if (!hasStore()) return;

  await getSessionSqlPool().query(`
    update answers set juror_subject = $3
    where session_id = $1 and juror_name = $2 and juror_subject is null
  `, [sessionId, jurorName, subject]);
};
