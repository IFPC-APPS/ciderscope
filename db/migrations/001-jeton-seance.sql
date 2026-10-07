-- Jeton d'entrée des dégustations producteurs.
--
-- À passer sur une base déjà installée ; db/install-postgres.sql porte déjà la
-- colonne pour les installations neuves.
--
-- Sans effet si la migration a déjà été appliquée : les deux instructions sont
-- idempotentes, et le script peut être rejoué sans risque.

ALTER TABLE ciderscope.sessions
    ADD COLUMN IF NOT EXISTS join_token text;

-- Unique, mais partiel : la plupart des séances n'ont pas de jeton, et
-- plusieurs NULL ne doivent pas entrer en conflit.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_join_token_idx
    ON ciderscope.sessions USING btree (join_token)
    WHERE (join_token IS NOT NULL);
