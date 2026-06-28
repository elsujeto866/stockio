-- AR-T2: Receivables backfill migration (idempotent)
-- Backfills due_date for existing invoices using each store's payment_terms_days.
-- total_paid and payment_terms_days are covered by column DEFAULT (0 and 30) — no UPDATE needed.
--
-- ⚠️ FEFO SEED GOTCHA: this join path (invoices → orders → stores) is the same
-- dependency chain used by integration fixtures. Fixtures MUST seed:
--   lots → products → orders (via create_order FEFO RPC) → invoices
-- in that exact order BEFORE recording payments, or create_order fails because
-- the FEFO RPC requires available lots. See expiry-batches fixes fbdafe0 / 5be6136.
--
-- Covers: REQ-7/S7-1, S7-2

update public.invoices i
set due_date = (
  i.fecha_emision + (coalesce(s.payment_terms_days, 30) || ' days')::interval
)::date
from public.orders o
join public.stores s on s.id = o.store_id
where i.order_id = o.id
  and i.due_date is null;
