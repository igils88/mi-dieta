-- ============================================================
-- 0006_ajustes.sql — Preferencias por biblioteca y etiquetado
-- ------------------------------------------------------------
-- Cada biblioteca decide cómo se ve: qué vista usa el listado,
-- si se muestran portadas y qué datos aparecen en cada libro.
-- Van en la propia biblioteca y no en cada persona a propósito:
-- es un catálogo familiar, y que cada uno vea una cosa distinta
-- complica las conversaciones («el de la portada azul, el tercero
-- de la segunda fila») sin ganar nada.
--
-- Se guardan en jsonb en vez de en columnas porque esto va a
-- cambiar cada semana durante una temporada, y no quiero una
-- migración por cada casilla nueva. Lo que sí hay es un valor por
-- defecto en el código: un jsonb vacío es una biblioteca recién
-- creada, no una rota.
-- ============================================================

alter table public.bibliotecas
  add column if not exists ajustes jsonb not null default '{}'::jsonb;

comment on column public.bibliotecas.ajustes is
  'Preferencias de presentación: vista del listado, portadas, campos visibles. El código pone los valores por defecto.';

-- ------------------------------------------------------------
-- Etiquetas por nombre
-- ------------------------------------------------------------
-- El catálogo devuelve géneros como texto libre («Fiction /
-- Science Fiction / Space Opera»). La aplicación los traduce al
-- vocabulario cerrado y pide aquí los identificadores. Es
-- deliberado que esta función NO cree etiquetas: si el catálogo
-- pudiera inventarlas, en seis meses habría «terror», «Terror» y
-- «horror» como tres cosas distintas y el filtro dejaría de
-- servir.
create or replace function public.etiquetas_por_nombre(nombres text[])
returns table (id uuid, nombre text, tipo tipo_etiqueta)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select e.id, e.nombre, e.tipo
  from public.etiquetas e
  where public.normalizar(e.nombre) = any (
    select public.normalizar(n) from unnest(nombres) as n
  );
$$;

-- ------------------------------------------------------------
-- La estantería, ahora con etiquetas
-- ------------------------------------------------------------
-- El listado necesita las etiquetas para poder enseñarlas y
-- filtrar por género sin una consulta por libro.
-- `create or replace view` no deja insertar columnas en medio, y
-- aquí se añaden encuadernación, año de la obra y etiquetas: hay
-- que rehacerla. No se pierde nada, una vista no guarda datos.
drop view if exists public.vista_ejemplares;

create view public.vista_ejemplares
with (security_invoker = true)
as
select
  ej.id                    as ejemplar_id,
  ej.biblioteca_id,
  ej.ubicacion_lugar,
  ej.ubicacion_contenedor,
  ej.notas,
  ej.firmado,
  ej.creado_en,
  ej.anadido_por,
  ed.id                    as edicion_id,
  ed.isbn13,
  ed.editorial,
  ed.anio,
  ed.paginas,
  ed.idioma,
  ed.encuadernacion,
  ed.portada_url,
  ed.portada_path,
  ed.numero_serie,
  s.nombre                 as serie,
  ob.id                    as obra_id,
  ob.titulo,
  ob.subtitulo,
  ob.tipo,
  ob.sinopsis,
  ob.anio_primera_publicacion,
  ob.clave                 as clave_titulo,
  (
    select string_agg(a.nombre, ', ' order by oa.orden, a.nombre)
    from public.obra_autores oa
    join public.autores a on a.id = oa.autor_id
    where oa.obra_id = ob.id
  )                        as autores,
  (
    select string_agg(et.nombre, ', ' order by et.tipo, et.nombre)
    from public.obra_etiquetas oe
    join public.etiquetas et on et.id = oe.etiqueta_id
    where oe.obra_id = ob.id
  )                        as etiquetas
from public.ejemplares ej
join public.ediciones ed on ed.id = ej.edicion_id
join public.obras ob on ob.id = ed.obra_id
left join public.series s on s.id = ed.serie_id;

comment on view public.vista_ejemplares is
  'Estantería lista para pintar: ejemplar + edición + obra + autores + etiquetas. security_invoker, así que respeta el RLS.';

-- ------------------------------------------------------------
-- Guardar las preferencias
-- ------------------------------------------------------------
-- Mezcla lo que llega con lo que había, para que cambiar una
-- casilla no borre las demás.
create or replace function public.guardar_ajustes(p_biblioteca uuid, cambios jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_ajustes jsonb;
begin
  update public.bibliotecas
  set ajustes = coalesce(ajustes, '{}'::jsonb) || coalesce(cambios, '{}'::jsonb)
  where id = p_biblioteca
  returning ajustes into v_ajustes;

  if v_ajustes is null then
    -- O no existe, o el RLS no deja tocarla: el propietario edita.
    raise exception 'No se han podido guardar los ajustes' using errcode = '42501';
  end if;

  return v_ajustes;
end;
$$;

-- Renombrar una biblioteca es lo mismo: lo hace quien la posee.
create or replace function public.renombrar_biblioteca(p_biblioteca uuid, p_nombre text)
returns text
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_nombre text;
begin
  update public.bibliotecas
  set nombre = btrim(p_nombre)
  where id = p_biblioteca
  returning nombre into v_nombre;

  if v_nombre is null then
    raise exception 'No se ha podido renombrar' using errcode = '42501';
  end if;

  return v_nombre;
end;
$$;

-- ------------------------------------------------------------
-- Etiquetar una obra sin pasar por el alta completa
-- ------------------------------------------------------------
create or replace function public.etiquetar_obra(p_obra uuid, ids uuid[], p_origen origen_dato default 'catalogo')
returns int
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_filas int;
begin
  insert into public.obra_etiquetas (obra_id, etiqueta_id, origen)
  select p_obra, i, p_origen
  from unnest(ids) as i
  where exists (select 1 from public.etiquetas e where e.id = i)
  on conflict (obra_id, etiqueta_id) do nothing;

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

grant select on public.vista_ejemplares to authenticated;
grant execute on function public.etiquetas_por_nombre(text[]) to authenticated;
grant execute on function public.guardar_ajustes(uuid, jsonb) to authenticated;
grant execute on function public.renombrar_biblioteca(uuid, text) to authenticated;
grant execute on function public.etiquetar_obra(uuid, uuid[], origen_dato) to authenticated;

-- Vocabulario que faltaba para cubrir lo que devuelven los
-- catálogos en español e inglés.
insert into public.etiquetas (nombre, tipo) values
  ('Novela', 'formato'), ('Relatos', 'formato'), ('Poesía', 'formato'),
  ('Teatro', 'formato'), ('Ensayo', 'formato'), ('Cómic', 'formato'),
  ('Romántica', 'genero'), ('Thriller', 'genero'), ('Misterio', 'genero'),
  ('Distopía', 'genero'), ('Clásicos', 'genero'), ('Realismo mágico', 'genero'),
  ('Autoayuda', 'materia'), ('Economía', 'materia'), ('Política', 'materia'),
  ('Psicología', 'materia'), ('Religión', 'materia'), ('Naturaleza', 'materia'),
  ('Música', 'materia'), ('Cine', 'materia'), ('Fotografía', 'materia'),
  ('Educación', 'materia'), ('Salud', 'materia'), ('Informática', 'materia')
on conflict do nothing;
