-- ============================================================
-- 0007_deseos.sql — Lista de deseos
-- ------------------------------------------------------------
-- Lo que todavía no está en casa. Va en su propia tabla y NO en
-- el catálogo común (obras/ediciones/ejemplares) a propósito:
--
--   · Un deseo suele ser media ficha — un título oído de pasada,
--     a veces ni con autor. Meterlo en `obras` ensuciaría el
--     catálogo de fichas fantasma que luego salen en las
--     búsquedas y en la detección de duplicados.
--   · Un deseo se borra sin dejar rastro. Una obra no: tiene
--     ejemplares, etiquetas y lecturas colgando.
--
-- Cuando el libro por fin entra en casa, `conseguido_en` marca la
-- fecha y `ejemplar_id` apunta al ejemplar que lo cumplió. El
-- deseo se queda como historial en vez de desaparecer: saber que
-- algo estuvo dos años en la lista tiene su gracia.
--
-- Es de la biblioteca, no de la persona: es una lista familiar,
-- la misma idea que el resto de la aplicación. `anadido_por`
-- guarda quién lo pidió, que es lo que hace falta saber en
-- diciembre.
-- ============================================================

create table if not exists public.deseos (
  id              uuid primary key default gen_random_uuid(),
  biblioteca_id   uuid not null references public.bibliotecas(id) on delete cascade,
  titulo          text not null check (length(trim(titulo)) between 1 and 300),
  autores         text,
  tipo            tipo_obra not null default 'libro',
  isbn13          text check (isbn13 is null or isbn13 ~ '^[0-9]{13}$'),
  editorial       text,
  anio            int check (anio is null or anio between 1400 and 2200),
  portada_url     text,
  notas           text,
  -- 1 lo quiero ya · 2 algún día · 3 si me lo encuentro
  prioridad       smallint not null default 2 check (prioridad between 1 and 3),
  clave           text generated always as (public.normalizar(titulo)) stored,
  conseguido_en   timestamptz,
  ejemplar_id     uuid references public.ejemplares(id) on delete set null,
  anadido_por     uuid not null references auth.users(id) on delete restrict,
  creado_en       timestamptz not null default now()
);

comment on table public.deseos is
  'Libros que se quieren y todavía no están. Se cumplen dando de alta el ejemplar, no se borran al cumplirse.';

create index if not exists deseos_biblioteca_idx
  on public.deseos (biblioteca_id, conseguido_en, prioridad, creado_en desc);

-- Evita pedir dos veces lo mismo por descuido. Los ya conseguidos
-- quedan fuera del índice: el mismo título se puede volver a
-- desear años después (regalo, se prestó y no volvió).
create unique index if not exists deseos_sin_repetir_idx
  on public.deseos (biblioteca_id, clave, tipo)
  where conseguido_en is null;

-- ------------------------------------------------------------
-- Permisos: exactamente los del ejemplar
-- ------------------------------------------------------------
-- Quien puede añadir un libro puede pedirlo. Quien solo lee, lee.
alter table public.deseos enable row level security;

drop policy if exists "veo los deseos de mis bibliotecas" on public.deseos;
create policy "veo los deseos de mis bibliotecas" on public.deseos
  for select to authenticated
  using (public.es_miembro(biblioteca_id));

drop policy if exists "pido libros" on public.deseos;
create policy "pido libros" on public.deseos
  for insert to authenticated
  with check (public.puede_escribir(biblioteca_id) and anadido_por = auth.uid());

-- El colaborador retoca lo suyo; editor y propietario, todo. Marcar
-- un deseo como conseguido es un UPDATE, así que un colaborador no
-- puede cerrar el deseo de otro — que es lo correcto: el que lo
-- pidió es quien sabe si ya lo tiene.
drop policy if exists "edito deseos" on public.deseos;
create policy "edito deseos" on public.deseos
  for update to authenticated
  using (
    public.rol_en(biblioteca_id) in ('propietario', 'editor')
    or (public.rol_en(biblioteca_id) = 'colaborador' and anadido_por = auth.uid())
  )
  with check (public.puede_escribir(biblioteca_id));

drop policy if exists "borro deseos" on public.deseos;
create policy "borro deseos" on public.deseos
  for delete to authenticated
  using (
    public.rol_en(biblioteca_id) in ('propietario', 'editor')
    or (public.rol_en(biblioteca_id) = 'colaborador' and anadido_por = auth.uid())
  );

grant select, insert, update, delete on public.deseos to authenticated;

-- ------------------------------------------------------------
-- Lo que hay en la estantería, para los filtros del listado
-- ------------------------------------------------------------
-- El listado necesita dos cosas que no salen de las filas que ya
-- ha traído (están filtradas): cuántos hay de cada tipo y qué
-- géneros existen en ESTA biblioteca. Pedirlo con una función
-- ahorra traerse las 500 filas enteras solo para contar.
create or replace function public.resumen_estanteria(p_biblioteca uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'tipos', coalesce((
      select jsonb_object_agg(t.tipo, t.cuantos)
      from (
        select ob.tipo::text as tipo, count(*) as cuantos
        from public.ejemplares ej
        join public.ediciones ed on ed.id = ej.edicion_id
        join public.obras ob on ob.id = ed.obra_id
        where ej.biblioteca_id = p_biblioteca
        group by ob.tipo
      ) t
    ), '{}'::jsonb),
    'etiquetas', coalesce((
      select jsonb_agg(e.nombre order by e.nombre)
      from (
        select distinct et.nombre
        from public.ejemplares ej
        join public.ediciones ed on ed.id = ej.edicion_id
        join public.obra_etiquetas oe on oe.obra_id = ed.obra_id
        join public.etiquetas et on et.id = oe.etiqueta_id
        where ej.biblioteca_id = p_biblioteca
      ) e
    ), '[]'::jsonb),
    'deseos', (
      select count(*) from public.deseos d
      where d.biblioteca_id = p_biblioteca and d.conseguido_en is null
    )
  );
$$;

grant execute on function public.resumen_estanteria(uuid) to authenticated;
