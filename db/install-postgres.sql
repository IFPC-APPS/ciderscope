-- Installation de ciderscope sur le PostgreSQL de PADOC
-- =====================================================
--
-- CiderScope et PADOC appartiennent à la même structure, mais restent deux
-- applications distinctes. Elles partagent ici un serveur de base de données —
-- pas un schéma.
--
-- Pourquoi ce cloisonnement
-- -------------------------
-- PADOC confie son schéma à Hibernate en « ddl-auto: update » : il crée et
-- modifie ses tables tout seul, dans « public ». Deux applications qui
-- écrivent au même endroit, ce serait le couplage que la séparation des deux
-- projets visait précisément à éviter — déplacé du code vers la base.
--
-- D'où : schéma dédié, utilisateur dédié, et aucun droit sur « public ». Une
-- erreur de CiderScope ne peut pas atteindre les lots, les cuves ni le
-- registre des analyses de pasteurisation.
--
-- Ce que ce script NE fait PAS : créer une table d'utilisateurs. L'identité
-- vient de PADOC par la fédération OpenID Connect, et CiderScope se repère sur
-- le « sub » du jeton. Il n'a donc aucun compte à stocker.
--
-- Usage, en tant qu'administrateur de la base :
--     psql "$URL_ADMIN" -v mot_de_passe=un-mot-de-passe-solide \
--          -f db/install-postgres.sql
--
-- Idempotent : rejouable sans dommage sur une installation existante.

\set ON_ERROR_STOP on

-- ── 1. Utilisateur applicatif ────────────────────────────────────────────────
-- Distinct de celui de PADOC. C'est lui qui porte le cloisonnement : les droits
-- accordés plus bas sont les seuls qu'il aura jamais.
-- \gexec plutôt qu'un bloc DO : psql ne substitue pas ses variables à
-- l'intérieur d'une chaîne encadrée par $$, le mot de passe n'y arriverait
-- jamais.
SELECT 'CREATE ROLE ciderscope_app LOGIN'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ciderscope_app')
\gexec

SELECT format('ALTER ROLE ciderscope_app PASSWORD %L', :'mot_de_passe')
\gexec

CREATE SCHEMA IF NOT EXISTS ciderscope;

-- pgcrypto fournit gen_random_bytes(), utilisé pour les jetons d'inscription.
-- Installée DANS le schéma ciderscope, et non dans public : l'utilisateur
-- applicatif n'a aucun droit sur public (voir plus bas), il ne pourrait donc
-- pas appeler la fonction si elle y résidait.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA ciderscope;
CREATE FUNCTION ciderscope.bump_answer_revision() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'ciderscope'
    AS $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
CREATE FUNCTION ciderscope.bump_session_revision() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'ciderscope'
    AS $$
begin
  new.updated_at := now();
  if new.name is distinct from old.name
     or new.date is distinct from old.date
     or new.config is distinct from old.config then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end;
$$;
CREATE FUNCTION ciderscope.consume_slot_registration_quota(p_participant_email text, p_requested integer, p_daily_limit integer DEFAULT 20) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'ciderscope'
    AS $_$
declare
  v_email text := lower(btrim(coalesce(p_participant_email, '')));
  v_today date := (now() at time zone 'Europe/Paris')::date;
  v_attempts integer;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     or p_requested <= 0
     or p_daily_limit <= 0
     or p_requested > p_daily_limit then
    return false;
  end if;
  delete from slot_registration_rate_limits
    where rate_date < v_today - 31;
  insert into slot_registration_rate_limits (rate_date, participant_email, attempts)
  values (v_today, v_email, p_requested)
  on conflict (rate_date, participant_email) do update
    set attempts = slot_registration_rate_limits.attempts + excluded.attempts,
        updated_at = now()
    where slot_registration_rate_limits.attempts + excluded.attempts <= p_daily_limit
  returning attempts into v_attempts;
  return found and v_attempts <= p_daily_limit;
end;
$_$;
CREATE FUNCTION ciderscope.sync_session_juror_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'ciderscope'
    AS $$
declare
  v_session_id text;
begin
  v_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  update sessions
    set juror_count = (
      select count(*)::integer
      from answers
      where session_id = v_session_id
    )
    where id = v_session_id;
  return null;
end;
$$;
CREATE TABLE ciderscope.answers (
    session_id text NOT NULL,
    juror_name text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    access_token_hash text,
    revision bigint DEFAULT 0 NOT NULL,
    juror_subject text
);
CREATE TABLE ciderscope.app_users (
    subject text NOT NULL,
    display_name text,
    email text,
    roles text[] DEFAULT '{}'::text[] NOT NULL,
    first_login_at timestamp with time zone DEFAULT now() NOT NULL,
    last_login_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE ciderscope.email_domain_whitelist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    domain text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_domain_whitelist_domain_normalized CHECK ((domain = lower(btrim(domain)))),
    CONSTRAINT email_domain_whitelist_domain_not_blank CHECK ((char_length(btrim(domain)) > 0))
);
CREATE TABLE ciderscope.session_slots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_date date NOT NULL,
    start_time time without time zone DEFAULT '11:30:00'::time without time zone NOT NULL,
    end_time time without time zone DEFAULT '12:30:00'::time without time zone NOT NULL,
    timezone text DEFAULT 'Europe/Paris'::text NOT NULL,
    capacity integer DEFAULT 10 NOT NULL,
    session_id text,
    session_name text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    outlook_event_id text,
    outlook_event_created_at timestamp with time zone,
    outlook_event_updated_at timestamp with time zone,
    CONSTRAINT session_slots_fixed_capacity CHECK ((capacity = 10)),
    CONSTRAINT session_slots_fixed_end_time CHECK ((end_time = '12:30:00'::time without time zone)),
    CONSTRAINT session_slots_fixed_start_time CHECK ((start_time = '11:30:00'::time without time zone)),
    CONSTRAINT session_slots_fixed_timezone CHECK ((timezone = 'Europe/Paris'::text)),
    CONSTRAINT session_slots_session_name_required CHECK ((char_length(btrim(session_name)) > 0))
);
CREATE TABLE ciderscope.sessions (
    id text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    date text DEFAULT ''::text,
    active boolean DEFAULT false,
    juror_count integer DEFAULT 0,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    analysis_settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    results_visible boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    revision bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE ciderscope.slot_registration_rate_limits (
    rate_date date NOT NULL,
    participant_email text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT slot_registration_rate_limits_attempts_positive CHECK ((attempts >= 0))
);
CREATE TABLE ciderscope.slot_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slot_id uuid NOT NULL,
    participant_name text NOT NULL,
    participant_email text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    token text DEFAULT encode(ciderscope.gen_random_bytes(16), 'hex'::text) NOT NULL,
    outlook_invite_status text DEFAULT 'pending'::text NOT NULL,
    outlook_invite_due_at timestamp with time zone,
    outlook_invite_attempts integer DEFAULT 0 NOT NULL,
    outlook_invite_sent_at timestamp with time zone,
    outlook_event_id text,
    outlook_invite_last_error text,
    registration_status text DEFAULT 'confirmed'::text NOT NULL,
    outlook_response_status text,
    outlook_response_at timestamp with time zone,
    CONSTRAINT slot_registrations_email_normalized CHECK ((participant_email = lower(btrim(participant_email)))),
    CONSTRAINT slot_registrations_email_required CHECK ((char_length(btrim(participant_email)) > 0)),
    CONSTRAINT slot_registrations_name_required CHECK ((char_length(btrim(participant_name)) > 0)),
    CONSTRAINT slot_registrations_outlook_invite_status_check CHECK ((outlook_invite_status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'cancel_pending'::text, 'cancel_sending'::text, 'cancelled'::text, 'cancel_failed'::text]))),
    CONSTRAINT slot_registrations_registration_status_check CHECK ((registration_status = ANY (ARRAY['confirmed'::text, 'waitlist'::text]))),
    CONSTRAINT slot_registrations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'cancelled'::text])))
);
ALTER TABLE ONLY ciderscope.answers
    ADD CONSTRAINT answers_pkey PRIMARY KEY (session_id, juror_name);
ALTER TABLE ONLY ciderscope.app_users
    ADD CONSTRAINT app_users_pkey PRIMARY KEY (subject);
ALTER TABLE ONLY ciderscope.email_domain_whitelist
    ADD CONSTRAINT email_domain_whitelist_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ciderscope.session_slots
    ADD CONSTRAINT session_slots_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ciderscope.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY ciderscope.slot_registration_rate_limits
    ADD CONSTRAINT slot_registration_rate_limits_pkey PRIMARY KEY (rate_date, participant_email);
ALTER TABLE ONLY ciderscope.slot_registrations
    ADD CONSTRAINT slot_registrations_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX answers_access_token_hash_key ON ciderscope.answers USING btree (access_token_hash) WHERE (access_token_hash IS NOT NULL);
CREATE INDEX answers_juror_subject_idx ON ciderscope.answers USING btree (juror_subject) WHERE (juror_subject IS NOT NULL);
CREATE UNIQUE INDEX email_domain_whitelist_domain_key ON ciderscope.email_domain_whitelist USING btree (domain);
CREATE UNIQUE INDEX session_slots_one_open_slot_per_day ON ciderscope.session_slots USING btree (slot_date) WHERE (deleted_at IS NULL);
CREATE INDEX session_slots_session_date_active_idx ON ciderscope.session_slots USING btree (session_id, slot_date) WHERE (deleted_at IS NULL);
CREATE INDEX session_slots_slot_date_idx ON ciderscope.session_slots USING btree (slot_date);
CREATE UNIQUE INDEX sessions_unique_name_date ON ciderscope.sessions USING btree (date, lower(btrim(name)));
CREATE INDEX slot_registrations_outlook_event_idx ON ciderscope.slot_registrations USING btree (outlook_event_id) WHERE (outlook_event_id IS NOT NULL);
CREATE INDEX slot_registrations_outlook_response_idx ON ciderscope.slot_registrations USING btree (outlook_response_status, outlook_response_at) WHERE (outlook_response_status IS NOT NULL);
CREATE INDEX slot_registrations_slot_seat_status_idx ON ciderscope.slot_registrations USING btree (slot_id, status, registration_status, created_at);
CREATE INDEX slot_registrations_slot_status_idx ON ciderscope.slot_registrations USING btree (slot_id, status);
CREATE UNIQUE INDEX slot_registrations_token_key ON ciderscope.slot_registrations USING btree (token);
CREATE UNIQUE INDEX slot_registrations_unique_active_email ON ciderscope.slot_registrations USING btree (slot_id, participant_email) WHERE (status = 'active'::text);
CREATE TRIGGER answers_bump_revision BEFORE UPDATE ON ciderscope.answers FOR EACH ROW EXECUTE FUNCTION ciderscope.bump_answer_revision();
CREATE TRIGGER answers_sync_session_juror_count AFTER INSERT OR DELETE ON ciderscope.answers FOR EACH ROW EXECUTE FUNCTION ciderscope.sync_session_juror_count();
CREATE TRIGGER sessions_bump_revision BEFORE UPDATE ON ciderscope.sessions FOR EACH ROW EXECUTE FUNCTION ciderscope.bump_session_revision();
ALTER TABLE ONLY ciderscope.answers
    ADD CONSTRAINT answers_juror_subject_fkey FOREIGN KEY (juror_subject) REFERENCES ciderscope.app_users(subject) ON DELETE SET NULL;
ALTER TABLE ONLY ciderscope.answers
    ADD CONSTRAINT answers_session_id_fkey FOREIGN KEY (session_id) REFERENCES ciderscope.sessions(id) ON DELETE CASCADE;
ALTER TABLE ONLY ciderscope.session_slots
    ADD CONSTRAINT session_slots_session_id_fkey FOREIGN KEY (session_id) REFERENCES ciderscope.sessions(id) ON DELETE SET NULL;
ALTER TABLE ONLY ciderscope.slot_registrations
    ADD CONSTRAINT slot_registrations_slot_id_fkey FOREIGN KEY (slot_id) REFERENCES ciderscope.session_slots(id) ON DELETE CASCADE;
ALTER TABLE ciderscope.answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciderscope.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciderscope.email_domain_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciderscope.session_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciderscope.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciderscope.slot_registration_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ciderscope.slot_registrations ENABLE ROW LEVEL SECURITY;

-- ── 2. Droits : tout sur son schéma, rien ailleurs ───────────────────────────
GRANT USAGE ON SCHEMA ciderscope TO ciderscope_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ciderscope TO ciderscope_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ciderscope TO ciderscope_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ciderscope TO ciderscope_app;

-- Les objets créés plus tard héritent des mêmes droits, sans avoir à rejouer
-- les GRANT ci-dessus.
ALTER DEFAULT PRIVILEGES IN SCHEMA ciderscope
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ciderscope_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ciderscope
  GRANT USAGE, SELECT ON SEQUENCES TO ciderscope_app;

-- ── 2bis. Sécurité au niveau ligne (RLS) ─────────────────────────────────────
-- Désactivée, et il faut dire pourquoi.
--
-- Ces politiques viennent de Supabase, qui expose la base DIRECTEMENT au
-- navigateur : là-bas, RLS était le seul rempart, puisque n'importe qui
-- pouvait interroger les tables avec la clé publique.
--
-- Ici, personne n'atteint la base depuis un navigateur. Seul le serveur Next
-- s'y connecte, avec des identifiants qui ne quittent jamais la machine, et
-- l'autorisation est vérifiée dans l'application (requireAdmin,
-- requireCapacite). Le rempart n'a pas disparu : il a changé d'endroit.
--
-- Conserver ces politiques telles quelles ne protégerait rien de plus — elles
-- sont écrites pour les rôles de Supabase (anon, authenticated, service_role)
-- qui n'existent pas ici — et bloqueraient simplement toute écriture.
--
-- À reconsidérer le jour où un client se connecterait directement à la base.
DO $rls$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'ciderscope' LOOP
    EXECUTE format('ALTER TABLE ciderscope.%I DISABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END
$rls$;

-- ── 3. Interdiction explicite du schéma de PADOC ─────────────────────────────
-- REVOKE plutôt que simple absence de GRANT : PostgreSQL accorde USAGE sur
-- « public » à tout le monde par défaut. Sans cette ligne, ciderscope_app
-- pourrait lire les tables de PADOC.
REVOKE ALL ON SCHEMA public FROM ciderscope_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ciderscope_app;

-- ── 4. Schéma par défaut de l'utilisateur ────────────────────────────────────
-- Évite d'avoir à qualifier chaque table dans le code applicatif, et évite
-- surtout de bricoler un search_path dans la chaîne de connexion.
ALTER ROLE ciderscope_app SET search_path = ciderscope;

-- ── 5. Contrôle ──────────────────────────────────────────────────────────────
DO $verif$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_tables WHERE schemaname = 'ciderscope';
  RAISE NOTICE 'Schéma ciderscope : % table(s).', n;
  IF n < 6 THEN
    RAISE EXCEPTION 'Installation incomplète : 6 tables attendues, % trouvée(s).', n;
  END IF;
END
$verif$;
