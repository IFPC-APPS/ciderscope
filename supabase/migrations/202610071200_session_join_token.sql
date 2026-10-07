-- Jeton d'entrée des dégustations producteurs.
-- Apply after 202609301200_app_users.sql.
--
-- Le QR code posé sur la table porte ce jeton, et le jeton seul désigne la
-- séance : l'identifiant n'apparaît jamais dans l'adresse. Aucune connexion
-- n'étant demandée au dégustateur, c'est l'unique chose qui sépare le public
-- de la séance.
--
-- Nul sur les panels IFPC et sur les séances antérieures : il est créé à la
-- volée, le jour où quelqu'un affiche le QR code d'une dégustation.
--
-- Non qualifié, comme les autres migrations de ce dossier : le schéma vient du
-- search_path. Sur une installation auto-hébergée, lancer d'abord
--     SET search_path TO ciderscope;
--
-- Idempotent : rejouable sans risque, et sans registre à tenir.

alter table sessions
    add column if not exists join_token text;

-- Unique, mais partiel : la plupart des séances n'ont pas de jeton, et
-- plusieurs NULL ne doivent pas entrer en conflit.
create unique index if not exists sessions_join_token_idx
    on sessions using btree (join_token)
    where (join_token is not null);
