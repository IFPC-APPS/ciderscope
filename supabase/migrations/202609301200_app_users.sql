-- Comptes locaux des personnes connectées par la fédération PADOC (IFPC).
-- Apply after 202608031000_merge_sessions.sql.
--
-- Un compte est créé à la première connexion, à partir des claims du jeton
-- d'identité. PADOC ne synchronise aucun annuaire : cette table n'est que le
-- reflet de la dernière connexion de chacun.
--
-- La clé est le `sub` PADOC, opaque et stable à vie. Jamais l'e-mail : il peut
-- changer et n'est pas vérifié par PADOC (`email_verified` vaut false), donc
-- rattacher un compte sur une égalité d'adresse serait une prise de contrôle.

create table if not exists app_users (
  subject text primary key,
  display_name text,
  email text,
  roles text[] not null default '{}',
  first_login_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

alter table app_users enable row level security;
revoke all on table app_users from anon, authenticated;

-- Rattache les réponses d'un jury à son compte, quand il s'est identifié par
-- PADOC. Facultatif : le parcours par prénom seul reste ouvert.
alter table answers
  add column if not exists juror_subject text references app_users(subject) on delete set null;

create index if not exists answers_juror_subject_idx
  on answers (juror_subject)
  where juror_subject is not null;
