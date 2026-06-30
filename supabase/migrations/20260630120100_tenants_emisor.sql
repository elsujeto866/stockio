-- WU3 Migration 2/3: Add emisor establishment columns to tenants + RUC length CHECK
--
-- REQ-4: Tenants act as the emisor (issuer) on SRI comprobantes.
--
-- estab and pto_emi default to '001' — the single-emission-point default for
-- Nivel 1. Existing tenants receive these values without a data migration.
--
-- tenants.ruc already exists (nullable). Adding a CHECK so that any non-null
-- value must be exactly 13 characters (Ecuador RUC length).
-- NULL is still allowed (blocks invoice emit per REQ-4a; enforced in create_invoice).

ALTER TABLE public.tenants
  ADD COLUMN estab text NOT NULL DEFAULT '001',
  ADD COLUMN pto_emi text NOT NULL DEFAULT '001',
  ADD CONSTRAINT tenants_ruc_length
    CHECK (ruc IS NULL OR length(ruc) = 13) NOT VALID;
