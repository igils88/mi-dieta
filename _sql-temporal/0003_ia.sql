-- ============================================================
-- 0003_ia.sql — Caché de lecturas y control de gasto
-- ------------------------------------------------------------
-- Dos tablas que existen para no gastar de más:
--
--   lecturas_ia   la misma foto no se procesa dos veces, aunque se
--                 reintente el lote entero
--   llamadas_ia   registro de cada llamada, que es lo que permite
--                 aplicar un tope mensual y comparar proveedores
--                 sobre el mismo juego de fotos de prueba
-- ============================================================

create type operacion_ia as enum ('portada', 'estanteria', 'clasificacion');

create table public.lecturas_ia (
  hash        text primary key,           -- sha256 de la imagen
  operacion   operacion_ia not null,
  proveedor   text not null,
  modelo      text not null,
  resultado   jsonb not null,
  creada_en   timestamptz not null default now()
);

comment on table public.lecturas_ia is
  'Caché por hash de imagen. Evita repetir el gasto al reintentar un lote.';

create table public.llamadas_ia (
  id              uuid primary key default gen_random_uuid(),
  biblioteca_id   uuid references public.bibliotecas(id) on delete set null,
  usuario_id      uuid references auth.users(id) on delete set null,
  operacion       operacion_ia not null,
  proveedor       text not null,
  modelo          text not null,
  tokens_entrada  int,
  tokens_salida   int,
  coste_estimado  numeric(10,6),
  desde_cache     boolean not null default false,
  error           text,
  creada_en       timestamptz not null default now()
);

create index llamadas_ia_mes_idx on public.llamadas_ia (creada_en desc);
create index llamadas_ia_biblioteca_idx on public.llamadas_ia (biblioteca_id);

-- Gasto del mes en curso, para comparar contra el tope antes de llamar.
create or replace function public.gasto_ia_del_mes(bib uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(coste_estimado), 0)
  from public.llamadas_ia
  where creada_en >= date_trunc('month', now())
    and not desde_cache
    and (bib is null or biblioteca_id = bib);
$$;

alter table public.lecturas_ia enable row level security;
alter table public.llamadas_ia enable row level security;

-- La caché es del catálogo común: cualquiera identificado la usa.
create policy "leo la caché de lecturas" on public.lecturas_ia
  for select to authenticated using (true);
create policy "escribo en la caché" on public.lecturas_ia
  for insert to authenticated with check (true);

-- El registro de gasto se ve dentro de la biblioteca a la que pertenece.
create policy "veo el gasto de mis bibliotecas" on public.llamadas_ia
  for select to authenticated
  using (biblioteca_id is null or public.es_miembro(biblioteca_id));
create policy "registro mis llamadas" on public.llamadas_ia
  for insert to authenticated
  with check (usuario_id = auth.uid());
