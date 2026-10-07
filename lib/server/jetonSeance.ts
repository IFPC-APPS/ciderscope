import { randomBytes } from "node:crypto";

import { getSessionSqlPool } from "./sessionSql";
import { getSupabaseAdminIfConfigured } from "./supabaseAdmin";

/**
 * Le jeton d'entrée d'une dégustation.
 *
 * C'est l'unique chose qui sépare le public d'une dégustation de producteur :
 * aucune connexion n'est demandée au dégustateur, et il n'a pas de compte. Le
 * QR code imprimé porte ce jeton, et le jeton seul désigne la séance —
 * l'identifiant n'apparaît jamais dans l'adresse.
 *
 * **Durable, et non à usage unique.** Une séance peut être rejouée : la même
 * feuille posée sur la table doit resservir d'une session à l'autre. Il reste
 * régénérable à la demande, pour le cas où une adresse aurait circulé.
 */

/**
 * 32 caractères tirés de 24 octets d'aléa cryptographique.
 *
 * Sans tiret ni souligné : le jeton se lit parfois à voix haute dans un chai,
 * et se retape à la main quand le téléphone ne scanne pas. Les caractères
 * ambigus (0/O, 1/l/I) sont écartés pour la même raison.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LONGUEUR = 32;

export const genererJeton = (): string => {
  const octets = randomBytes(LONGUEUR);
  let jeton = "";
  for (let i = 0; i < LONGUEUR; i += 1) {
    jeton += ALPHABET[octets[i] % ALPHABET.length];
  }
  return jeton;
};

/** Forme acceptable, vérifiée avant toute requête. */
export const jetonValide = (jeton: unknown): jeton is string =>
  typeof jeton === "string"
  && jeton.length === LONGUEUR
  && [...jeton].every((c) => ALPHABET.includes(c));

/**
 * L'identifiant de la séance que ce jeton ouvre, ou null.
 *
 * La forme est vérifiée avant d'interroger la base : un jeton mal formé est
 * refusé sans aucune requête, ce qui évite de transformer cette route en moyen
 * de sonder la base.
 */
export const seanceDuJeton = async (jeton: string): Promise<string | null> => {
  if (!jetonValide(jeton)) return null;

  const supabase = getSupabaseAdminIfConfigured();
  if (supabase) {
    const { data, error } = await supabase
      .from("sessions")
      .select("id")
      .eq("join_token", jeton)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string } | null)?.id ?? null;
  }

  const { rows } = await getSessionSqlPool().query<{ id: string }>(
    "select id from sessions where join_token = $1",
    [jeton],
  );
  return rows[0]?.id ?? null;
};

/** Le jeton d'une séance, s'il en a un. */
export const jetonDeLaSeance = async (sessionId: string): Promise<string | null> => {
  const supabase = getSupabaseAdminIfConfigured();
  if (supabase) {
    const { data, error } = await supabase
      .from("sessions")
      .select("join_token")
      .eq("id", sessionId)
      .maybeSingle();
    if (error) throw error;
    return (data as { join_token: string | null } | null)?.join_token ?? null;
  }

  const { rows } = await getSessionSqlPool().query<{ join_token: string | null }>(
    "select join_token from sessions where id = $1",
    [sessionId],
  );
  return rows[0]?.join_token ?? null;
};

const ecrireJeton = async (sessionId: string, jeton: string): Promise<void> => {
  const supabase = getSupabaseAdminIfConfigured();
  if (supabase) {
    const { error } = await supabase
      .from("sessions")
      .update({ join_token: jeton })
      .eq("id", sessionId);
    if (error) throw error;
    return;
  }
  await getSessionSqlPool().query(
    "update sessions set join_token = $2 where id = $1",
    [sessionId, jeton],
  );
};

/**
 * Le jeton de la séance, créé s'il n'existe pas encore.
 *
 * Les séances antérieures à cette fonctionnalité n'en ont pas, et le créer à
 * la volée évite une migration de données : le jeton apparaît le jour où
 * quelqu'un l'affiche.
 */
export const assurerJeton = async (sessionId: string): Promise<string> => {
  const existant = await jetonDeLaSeance(sessionId);
  if (existant && jetonValide(existant)) return existant;
  const jeton = genererJeton();
  await ecrireJeton(sessionId, jeton);
  return jeton;
};

/**
 * Remplace le jeton. L'ancienne adresse cesse aussitôt de fonctionner, et les
 * feuilles déjà imprimées deviennent inutilisables — c'est le but.
 */
export const regenererJeton = async (sessionId: string): Promise<string> => {
  const jeton = genererJeton();
  await ecrireJeton(sessionId, jeton);
  return jeton;
};
