-- WU3 Migration 3/3: Add SRI fiscal snapshot columns to invoices
--
-- REQ-5, REQ-6, REQ-8: Snapshot buyer + emisor + IVA breakdown at emit time.
-- All columns are nullable for backward compatibility — pre-SRI invoices
-- keep NULL values; InvoiceDetail degrades gracefully (REQ-7d).
--
-- IVA columns:
--   subtotal_base_imponible = round(total / 1.15, 2)  — computed by create_invoice RPC
--   valor_iva               = total - subtotal_base_imponible
--
-- Buyer (comprador) columns — snapshotted from stores at emit:
--   comprador_tipo_identificacion  ← stores.tipo_identificacion
--   comprador_numero_identificacion← stores.numero_identificacion
--   comprador_razon_social         ← stores.razon_social_comprobante ?? stores.nombre
--
-- Emisor columns — snapshotted from tenants at emit:
--   emisor_ruc          ← tenants.ruc
--   emisor_razon_social ← tenants.nombre
--   emisor_estab        ← tenants.estab
--   emisor_pto_emi      ← tenants.pto_emi

ALTER TABLE public.invoices
  -- IVA breakdown
  ADD COLUMN subtotal_base_imponible numeric(14, 2),
  ADD COLUMN valor_iva               numeric(14, 2),
  -- Buyer snapshot
  ADD COLUMN comprador_tipo_identificacion   text,
  ADD COLUMN comprador_numero_identificacion text,
  ADD COLUMN comprador_razon_social          text,
  -- Emisor snapshot
  ADD COLUMN emisor_ruc          text,
  ADD COLUMN emisor_razon_social text,
  ADD COLUMN emisor_estab        text,
  ADD COLUMN emisor_pto_emi      text;
