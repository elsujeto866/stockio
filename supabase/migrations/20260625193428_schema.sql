-- WU3: Base Schema Migration (schema only — NO RLS, NO RPCs)
-- RLS + get_tenant_id() + RPCs are added in the next migration (WU4).

-- ---------------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 2. Tables (dependency order)
-- ---------------------------------------------------------------------------

-- tenants: top of the isolation tree (the distributor company)
create table public.tenants (
  id          uuid        primary key default gen_random_uuid(),
  nombre      text        not null,
  ruc         text,                               -- tax / government ID, nullable
  direccion   text,
  telefono    text,
  created_at  timestamptz not null default now()
);

-- profiles: 1-to-1 with auth.users; id IS the auth.users UUID
create table public.profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  nombre      text,
  rol         text        not null default 'admin'
                check (rol in ('admin', 'operador')),  -- 'admin' default; column kept for future growth
  created_at  timestamptz not null default now()
);

-- products: tenant-scoped catalog
create table public.products (
  id              uuid           primary key default gen_random_uuid(),
  tenant_id       uuid           not null references public.tenants(id) on delete cascade,
  nombre          text           not null,
  sku             text,                                   -- product code / barcode, nullable
  categoria       text,
  precio_unitario numeric(12, 2) not null check (precio_unitario >= 0),
  stock_actual    integer        not null default 0 check (stock_actual >= 0),
  stock_minimo    integer        not null default 0,
  unidad_medida   text,
  activo          boolean        not null default true,
  created_at      timestamptz    not null default now()
);

-- stores: tenant-scoped points of sale / customers
create table public.stores (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants(id) on delete cascade,
  nombre      text        not null,
  contacto    text,
  direccion   text,
  telefono    text,
  created_at  timestamptz not null default now()
);

-- orders: order header
create table public.orders (
  id          uuid           primary key default gen_random_uuid(),
  tenant_id   uuid           not null references public.tenants(id) on delete cascade,
  store_id    uuid           not null references public.stores(id),
  fecha       date           not null default current_date,
  estado      text           not null default 'pendiente'
                check (estado in ('pendiente', 'entregado', 'cancelado')),
  total       numeric(14, 2),
  notas       text,
  created_at  timestamptz    not null default now()
);

-- order_items: lines; tenant_id DENORMALIZED for O(1) policy scan;
--              precio_unitario is a frozen snapshot (not a FK to products.precio);
--              subtotal is DB-computed via GENERATED ALWAYS ... STORED.
create table public.order_items (
  id              uuid           primary key default gen_random_uuid(),
  order_id        uuid           not null references public.orders(id) on delete cascade,
  tenant_id       uuid           not null references public.tenants(id) on delete cascade,
  product_id      uuid           not null references public.products(id),
  cantidad        integer        not null check (cantidad > 0),
  precio_unitario numeric(12, 2) not null,
  subtotal        numeric(14, 2) generated always as (precio_unitario * cantidad) stored
);

-- tenant_invoice_counters: gapless per-tenant correlative counter
--   Writes happen ONLY via the next_invoice_number() RPC (WU4).
create table public.tenant_invoice_counters (
  tenant_id   uuid    primary key references public.tenants(id) on delete cascade,
  last_number integer not null default 0
);

-- invoices: one per order; numero driven by the counter table (WU4 RPC)
create table public.invoices (
  id            uuid           primary key default gen_random_uuid(),
  tenant_id     uuid           not null references public.tenants(id) on delete cascade,
  order_id      uuid           not null references public.orders(id),
  numero        integer        not null,
  fecha_emision date           not null default current_date,
  total         numeric(14, 2) not null,
  estado_pago   text,                              -- nullable; e.g. 'pendiente', 'pagado'
  created_at    timestamptz    not null default now(),
  unique (order_id),                               -- one invoice per order
  unique (tenant_id, numero)                       -- correlative per tenant
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------
create index idx_profiles_tenant    on public.profiles(tenant_id);
create index idx_products_tenant    on public.products(tenant_id);
create index idx_stores_tenant      on public.stores(tenant_id);
create index idx_orders_tenant      on public.orders(tenant_id);
create index idx_orders_store       on public.orders(store_id);
create index idx_order_items_tenant on public.order_items(tenant_id);
create index idx_order_items_order  on public.order_items(order_id);
create index idx_invoices_tenant    on public.invoices(tenant_id);
