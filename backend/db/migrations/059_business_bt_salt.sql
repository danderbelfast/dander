-- 059_business_bt_salt.sql
-- Per-business secret salt for hashing BLE MAC addresses on Dander Nodes.
--
-- Pre-this-migration the node's BLE-hash salt was SHA256(UTC date string) —
-- public knowledge to anyone who knew the date. That made bt_position_log
-- entries pseudonymous rather than truly anonymous: anyone holding a target
-- person's BLE MAC could recompute today's anonymous_id and confirm
-- presence.
--
-- After this migration each business has a 32-byte random salt. The salt
-- is sent to that business's nodes via the existing /api/webhooks/phone-counter
-- response (alongside the other node_commands fields). The nodes persist it
-- in EncryptedSharedPreferences (Android Keystore-backed) and use it for
-- hashing instead of the date. Re-identification now requires (a) knowing
-- the target's MAC, AND (b) compromising the business's salt — much higher
-- bar than knowing the current date.
--
-- Per-business (not per-node) preserves the position heatmap: all nodes at
-- one business hash the same MAC to the same anonymous_id, so trilateration
-- in positionHeatmap.js continues to work. Cross-business correlation is
-- impossible because different businesses have different salts.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE businesses
  ADD COLUMN IF NOT EXISTS bt_salt VARCHAR(64);

-- Backfill — every existing business gets a fresh salt. New businesses
-- get one via the same one-line backfill the webhook handler runs
-- lazily, so this is just a "catch up the existing fleet" pass.
UPDATE businesses
   SET bt_salt = encode(gen_random_bytes(32), 'hex')
 WHERE bt_salt IS NULL;
