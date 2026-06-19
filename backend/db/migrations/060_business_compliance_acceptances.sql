-- 060_business_compliance_acceptances.sql
-- Audit log for compliance acceptances by business operators.
--
-- The business dashboard surfaces a non-skippable gate before a
-- business's FIRST node can be activated: the operator must tick
-- "I will display the provided privacy signage" and view the
-- country-appropriate sign. We log every acceptance here so that:
--
--   - Regulators (ICO, DPC, OAIC, OPC) asking "did you require the
--     operator to display signage?" get a per-business, per-version
--     timestamped answer.
--   - We can detect operators who haven't re-accepted after a
--     signage version bump (the version they accepted is stored
--     verbatim — never updated retroactively).
--   - Multi-user businesses retain the identity of the operator who
--     actually accepted, not just the business.
--
-- IP and user-agent are best-effort context for audit forensics —
-- not used for any business logic. They follow GDPR-acceptable
-- "balancing of interests" for audit logs.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS business_compliance_acceptances (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id     INTEGER      NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id         INTEGER      NOT NULL REFERENCES users(id)      ON DELETE RESTRICT,
  country_code    CHAR(2)      NOT NULL,
  signage_version VARCHAR(40)  NOT NULL,
  accepted_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  ip_address      VARCHAR(45),
  user_agent      TEXT
);

CREATE INDEX IF NOT EXISTS idx_compliance_acceptances_business
  ON business_compliance_acceptances (business_id, accepted_at DESC);

CREATE INDEX IF NOT EXISTS idx_compliance_acceptances_country_version
  ON business_compliance_acceptances (country_code, signage_version);
