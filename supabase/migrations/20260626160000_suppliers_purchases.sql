-- Slice A: suppliers table + index + RLS + GRANT
-- Slice B will APPEND purchases + purchase_items + RPCs to this same file.

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  nombre      text        not null,
  ruc         text,
  contacto    text,
  telefono    text,
  email       text,
  notas       text,
  activo      boolean     not null default true,
  created_at  timestamptz not null default now()
);

create index idx_suppliers_tenant on public.suppliers(tenant_id);

alter table public.suppliers enable row level security;

grant select, insert, update, delete on public.suppliers to authenticated;

create policy suppliers_isolation on public.suppliers for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));

-- ---------------------------------------------------------------------------
-- Slice B: purchases + purchase_items tables, RPCs, RLS, GRANTs
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- purchases
-- ---------------------------------------------------------------------------
create table public.purchases (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  supplier_id uuid        not null references public.suppliers(id),
  fecha       date        not null default current_date,
  estado      text        not null default 'recibido'
                check (estado in ('recibido','cancelado')),
  total       numeric(14,2),
  notas       text,
  created_at  timestamptz not null default now()
);

create index idx_purchases_tenant       on public.purchases(tenant_id);
create index idx_purchases_supplier     on public.purchases(supplier_id);
create index idx_purchases_tenant_fecha on public.purchases(tenant_id, fecha);

-- ---------------------------------------------------------------------------
-- purchase_items
-- ---------------------------------------------------------------------------
create table public.purchase_items (
  id             uuid           primary key default gen_random_uuid(),
  purchase_id    uuid           not null references public.purchases(id) on delete cascade,
  tenant_id      uuid           not null references public.tenants(id) on delete cascade,
  product_id     uuid           not null references public.products(id),
  cantidad       integer        not null check (cantidad > 0),
  costo_unitario numeric(12,2)  not null check (costo_unitario >= 0),
  subtotal       numeric(14,2)  generated always as (costo_unitario * cantidad) stored
);

create index idx_purchase_items_tenant   on public.purchase_items(tenant_id);
create index idx_purchase_items_purchase on public.purchase_items(purchase_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.purchases      enable row level security;
alter table public.purchase_items enable row level security;

grant select, insert, update, delete on public.purchases      to authenticated;
grant select, insert, update, delete on public.purchase_items to authenticated;

create policy purchases_isolation on public.purchases for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));

create policy purchase_items_isolation on public.purchase_items for all
  using (tenant_id = (select public.get_tenant_id()))
  with check (tenant_id = (select public.get_tenant_id()));

-- ---------------------------------------------------------------------------
-- RPC: create_purchase
-- ---------------------------------------------------------------------------
create or replace function public.create_purchase(
  p_supplier_id uuid,
  p_items       jsonb,
  p_fecha       date    default current_date,
  p_notas       text    default null
) returns uuid
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_tenant_id   uuid;
  v_purchase_id uuid;
  v_item        jsonb;
  v_stock       integer;
begin
  -- 1. Derive tenant from session
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  -- 2. Validate supplier belongs to tenant and is active
  if not exists (
    select 1
    from public.suppliers
    where id = p_supplier_id
      and tenant_id = v_tenant_id
      and activo = true
  ) then
    raise exception 'Supplier % not found in tenant', p_supplier_id;
  end if;

  -- 3. Insert purchase header
  insert into public.purchases (tenant_id, supplier_id, fecha, estado, notas)
  values (v_tenant_id, p_supplier_id, coalesce(p_fecha, current_date), 'recibido', p_notas)
  returning id into v_purchase_id;

  -- 4. Loop over items: lock product, insert item, increment stock
  for v_item in select * from jsonb_array_elements(p_items) loop
    select stock_actual into v_stock
    from public.products
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id
    for update;

    if v_stock is null then
      raise exception 'Product % not found in tenant', v_item->>'product_id';
    end if;

    insert into public.purchase_items (purchase_id, tenant_id, product_id, cantidad, costo_unitario)
    values (
      v_purchase_id,
      v_tenant_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'cantidad')::integer,
      (v_item->>'costo_unitario')::numeric(12,2)
    );

    update public.products
    set stock_actual = stock_actual + (v_item->>'cantidad')::integer
    where id = (v_item->>'product_id')::uuid
      and tenant_id = v_tenant_id;
  end loop;

  -- 5. Compute and persist total
  update public.purchases
  set total = (
    select coalesce(sum(subtotal), 0)
    from public.purchase_items
    where purchase_id = v_purchase_id
  )
  where id = v_purchase_id;

  return v_purchase_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: cancel_purchase
-- ---------------------------------------------------------------------------
create or replace function public.cancel_purchase(
  p_purchase_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  v_tenant_id uuid;
  v_estado    text;
  v_item      record;
begin
  -- 1. Derive tenant
  v_tenant_id := (select public.get_tenant_id());
  if v_tenant_id is null then
    raise exception 'Not authenticated or profile not found';
  end if;

  -- 2. Lock the purchase row and read estado
  select estado into v_estado
  from public.purchases
  where id = p_purchase_id
    and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Purchase % not found in tenant', p_purchase_id;
  end if;

  -- 3. Guard state machine
  if v_estado <> 'recibido' then
    raise exception 'Only received purchases can be cancelled (current estado: %)', v_estado;
  end if;

  -- 4. PRE-CHECK phase: lock products and verify no negative stock
  for v_item in
    select pi.product_id, pi.cantidad, p.stock_actual
    from public.purchase_items pi
    join public.products p on p.id = pi.product_id and p.tenant_id = v_tenant_id
    where pi.purchase_id = p_purchase_id
    for update of p
  loop
    if v_item.stock_actual < v_item.cantidad then
      raise exception
        'Cannot cancel purchase: product % stock would go negative (current: %, purchase: %)',
        v_item.product_id, v_item.stock_actual, v_item.cantidad;
    end if;
  end loop;

  -- 5. MUTATION phase (only reached if all checks passed)
  update public.products p
  set stock_actual = p.stock_actual - pi.cantidad
  from public.purchase_items pi
  where pi.purchase_id = p_purchase_id
    and pi.product_id = p.id
    and p.tenant_id = v_tenant_id;

  update public.purchases
  set estado = 'cancelado'
  where id = p_purchase_id
    and tenant_id = v_tenant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- EXECUTE grants
-- ---------------------------------------------------------------------------
grant execute on function public.create_purchase(uuid, jsonb, date, text) to authenticated;
grant execute on function public.cancel_purchase(uuid) to authenticated;
