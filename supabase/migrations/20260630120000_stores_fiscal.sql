-- WU3 Migration 1/3: Add fiscal identification columns to stores
--
-- REQ-2: Stores capture buyer fiscal identity for invoice comprobante.
-- Discriminator uses text + CHECK (matches every existing discriminator in codebase,
-- e.g. profiles.rol, orders.estado — never Postgres ENUM).
--
-- tipo_identificacion defaults to '07' (Consumidor Final) so existing rows are
-- immediately valid and no data migration is required.
-- numero_identificacion and razon_social_comprobante are nullable:
--   NULL razon_social falls back to stores.nombre at emit time (REQ-2, Scenario 2.3).
--   NULL numero triggers consumidor-final path in create_invoice (REQ-6, WU4).

ALTER TABLE public.stores
  ADD COLUMN tipo_identificacion text NOT NULL DEFAULT '07'
    CHECK (tipo_identificacion IN ('04', '05', '06', '07', '08')),
  ADD COLUMN numero_identificacion text,
  ADD COLUMN razon_social_comprobante text;
