-- ============================================================
-- 0004_alta.sql — Alta de ejemplares y detección de duplicados
-- ------------------------------------------------------------
-- Dar de alta un libro toca cinco tablas: obra, autores, serie,
-- edición y ejemplar. Hacerlo desde el cliente con cinco viajes
-- deja fichas a medias en cuanto uno falla, y abre la puerta a
-- duplicar obras que ya existen.
--
-- Por eso todo pasa por `alta_ejemplar`, una sola llamada
-- transaccional que reutiliza lo que ya hay y solo crea lo que
-- falta.
--
-- Va en SECURITY INVOKER (el valor por defecto, declarado a
-- propósito para que se vea): la función NO se salta el row level
-- security. Quien no pueda escribir en la biblioteca recibe un
-- error de política, igual que si insertara a mano. Las funciones
-- SECURITY DEFINER de 0002 existen solo para romper la recursión
-- de `miembros`; aquí no hace ninguna falta.
-- ============================================================

-- ------------------------------------------------------------
-- Ayudas para leer el jsonb de entrada
-- ------------------------------------------------------------
-- Un campo vacío en un formulario llega como "" y no como null.
-- Guardar "" en editorial o en isbn13 rompe las comparaciones y
-- los índices únicos, así que se normaliza aquí una sola vez.
create or replace function public.jtexto(j jsonb, clave text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select nullif(btrim(j ->> clave), '');
$$;

create or replace function public.jentero(j jsonb, clave text)
returns int
language sql
immutable
set search_path = public, pg_catalog
as $$
  select nullif(btrim(j ->> clave), '')::int;
$$;

-- ------------------------------------------------------------
-- Autor: buscar por clave normalizada, crear si no existe
-- ------------------------------------------------------------
create or replace function public.obtener_autor(p_nombre text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id    uuid;
  v_clave text;
begin
  v_clave := public.normalizar(p_nombre);
  if v_clave is null then
    return null;
  end if;

  select id into v_id from public.autores where clave = v_clave;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.autores (nombre) values (btrim(p_nombre))
  on conflict do nothing
  returning id into v_id;

  -- Si otra sesión lo insertó entre el select y el insert.
  if v_id is null then
    select id into v_id from public.autores where clave = v_clave;
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- Serie: la misma idea, pero la identidad es nombre + editorial
-- ------------------------------------------------------------
-- «Biblioteca Marvel» de Panini y la de Forum no son la misma
-- colección, y numerarlas juntas sería un desastre.
create or replace function public.obtener_serie(p_nombre text, p_editorial text default null)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id    uuid;
  v_clave text;
begin
  v_clave := public.normalizar(p_nombre);
  if v_clave is null then
    return null;
  end if;

  select id into v_id
  from public.series
  where clave = v_clave and coalesce(editorial, '') = coalesce(btrim(p_editorial), '');
  if v_id is not null then
    return v_id;
  end if;

  insert into public.series (nombre, editorial)
  values (btrim(p_nombre), nullif(btrim(p_editorial), ''))
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select id into v_id
    from public.series
    where clave = v_clave and coalesce(editorial, '') = coalesce(btrim(p_editorial), '');
  end if;

  return v_id;
end;
$$;

-- ============================================================
-- Detección de duplicados
-- ------------------------------------------------------------
-- Tres capas, de más fiable a menos:
--
--   1. isbn      mismo ISBN-13 → es exactamente la misma edición
--   2. titulo    misma clave normalizada y mismo tipo
--   3. parecido  trigramas por encima del umbral
--
-- Devuelve ejemplares de ESA biblioteca. Como la función es
-- SECURITY INVOKER, si el usuario no es miembro no ve nada: el
-- propio RLS de `ejemplares` lo filtra.
-- ============================================================
create or replace function public.buscar_duplicado(
  p_biblioteca uuid,
  p_isbn13     text default null,
  p_titulo     text default null,
  p_tipo       tipo_obra default null,
  p_umbral     real default 0.6
)
returns table (
  ejemplar_id uuid,
  edicion_id  uuid,
  obra_id     uuid,
  titulo      text,
  autores     text,
  editorial   text,
  anio        int,
  isbn13      text,
  motivo      text,
  similitud   real
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with clave_buscada as (
    select public.normalizar(p_titulo) as clave
  )
  select
    ej.id,
    ed.id,
    ob.id,
    ob.titulo,
    (
      select string_agg(a.nombre, ', ' order by oa.orden, a.nombre)
      from public.obra_autores oa
      join public.autores a on a.id = oa.autor_id
      where oa.obra_id = ob.id
    ),
    ed.editorial,
    ed.anio,
    ed.isbn13,
    case
      when p_isbn13 is not null and ed.isbn13 = p_isbn13 then 'isbn'
      when (select clave from clave_buscada) is not null and ob.clave = (select clave from clave_buscada) then 'titulo'
      else 'parecido'
    end,
    case
      when p_isbn13 is not null and ed.isbn13 = p_isbn13 then 1.0::real
      when (select clave from clave_buscada) is null then 0.0::real
      else similarity(ob.clave, (select clave from clave_buscada))
    end
  from public.ejemplares ej
  join public.ediciones ed on ed.id = ej.edicion_id
  join public.obras ob on ob.id = ed.obra_id
  where ej.biblioteca_id = p_biblioteca
    and (p_tipo is null or ob.tipo = p_tipo)
    and (
      (p_isbn13 is not null and ed.isbn13 = p_isbn13)
      or (
        (select clave from clave_buscada) is not null
        and similarity(ob.clave, (select clave from clave_buscada)) >= p_umbral
      )
    )
  order by 10 desc, 9
  limit 10;
$$;

comment on function public.buscar_duplicado is
  'Ejemplares ya presentes en la biblioteca que podrían ser el mismo libro. Se consulta antes de dar de alta para ofrecer "añadir otra unidad" en vez de duplicar.';

-- ============================================================
-- Alta atómica
-- ------------------------------------------------------------
-- Entrada (jsonb), todo opcional salvo biblioteca y título:
--
-- {
--   "biblioteca_id": "uuid",
--   "obra":      { "id": null, "titulo": "Dune", "subtitulo": null,
--                  "titulo_original": null, "tipo": "libro",
--                  "anio_primera_publicacion": 1965, "sinopsis": null },
--   "autores":   [ { "nombre": "Frank Herbert", "rol": "autor" } ],
--   "serie":     { "nombre": "Dune", "editorial": "Debolsillo",
--                  "numero": 1 },
--   "edicion":   { "id": null, "isbn13": "9788...", "editorial": "...",
--                  "idioma": "es", "anio": 2020, "paginas": 768, ... },
--   "ejemplar":  { "ubicacion_lugar": "Salón", "notas": "...", ... },
--   "etiquetas": [ "uuid", "uuid" ]
-- }
--
-- Devuelve qué se reutilizó y qué se creó, que es lo que la
-- interfaz necesita para decir «ficha nueva» o «se ha añadido a
-- una edición que ya tenías».
-- ============================================================
create or replace function public.alta_ejemplar(datos jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_biblioteca   uuid;
  j_obra         jsonb;
  j_edicion      jsonb;
  j_ejemplar     jsonb;
  j_serie        jsonb;
  v_titulo       text;
  v_tipo         tipo_obra;
  v_clave        text;
  v_obra         uuid;
  v_edicion      uuid;
  v_serie        uuid;
  v_ejemplar     uuid;
  v_isbn13       text;
  v_obra_nueva   boolean := false;
  v_edicion_nueva boolean := false;
  v_autor        uuid;
  v_claves_autor text[] := '{}';
  elemento       jsonb;
  v_orden        smallint := 0;
begin
  v_biblioteca := (public.jtexto(datos, 'biblioteca_id'))::uuid;
  if v_biblioteca is null then
    raise exception 'Falta la biblioteca' using errcode = '22023';
  end if;

  j_obra     := coalesce(datos -> 'obra', '{}'::jsonb);
  j_edicion  := coalesce(datos -> 'edicion', '{}'::jsonb);
  j_ejemplar := coalesce(datos -> 'ejemplar', '{}'::jsonb);
  j_serie    := datos -> 'serie';

  -- ----------------------------------------------------------
  -- Serie
  -- ----------------------------------------------------------
  if j_serie is not null and public.jtexto(j_serie, 'nombre') is not null then
    v_serie := public.obtener_serie(
      public.jtexto(j_serie, 'nombre'),
      public.jtexto(j_serie, 'editorial')
    );
  end if;

  -- ----------------------------------------------------------
  -- Obra: reutilizar la que ya esté, o crearla
  -- ----------------------------------------------------------
  v_obra := (public.jtexto(j_obra, 'id'))::uuid;

  if v_obra is null then
    v_titulo := public.jtexto(j_obra, 'titulo');
    if v_titulo is null then
      raise exception 'Falta el título' using errcode = '22023';
    end if;

    v_tipo  := coalesce(public.jtexto(j_obra, 'tipo'), 'libro')::tipo_obra;
    v_clave := public.normalizar(v_titulo);

    -- Claves normalizadas de los autores que llegan, para no
    -- fundir dos obras distintas con el mismo título. «La
    -- metamorfosis» de Kafka y la de otro autor son dos obras.
    for elemento in select * from jsonb_array_elements(coalesce(datos -> 'autores', '[]'::jsonb))
    loop
      if public.normalizar(public.jtexto(elemento, 'nombre')) is not null then
        v_claves_autor := v_claves_autor || public.normalizar(public.jtexto(elemento, 'nombre'));
      end if;
    end loop;

    if cardinality(v_claves_autor) = 0 then
      -- Sin autoría solo se puede comparar el título.
      select o.id into v_obra
      from public.obras o
      where o.clave = v_clave and o.tipo = v_tipo
      order by o.creada_en
      limit 1;
    else
      -- Con autoría se exige que compartan al menos un autor.
      select o.id into v_obra
      from public.obras o
      where o.clave = v_clave
        and o.tipo = v_tipo
        and exists (
          select 1
          from public.obra_autores oa
          join public.autores a on a.id = oa.autor_id
          where oa.obra_id = o.id and a.clave = any (v_claves_autor)
        )
      order by o.creada_en
      limit 1;
    end if;

    if v_obra is null then
      insert into public.obras (titulo, subtitulo, titulo_original, tipo, anio_primera_publicacion, sinopsis)
      values (
        v_titulo,
        public.jtexto(j_obra, 'subtitulo'),
        public.jtexto(j_obra, 'titulo_original'),
        v_tipo,
        public.jentero(j_obra, 'anio_primera_publicacion'),
        public.jtexto(j_obra, 'sinopsis')
      )
      returning id into v_obra;
      v_obra_nueva := true;
    end if;
  end if;

  -- ----------------------------------------------------------
  -- Autoría
  -- ----------------------------------------------------------
  for elemento in select * from jsonb_array_elements(coalesce(datos -> 'autores', '[]'::jsonb))
  loop
    v_autor := public.obtener_autor(public.jtexto(elemento, 'nombre'));
    if v_autor is not null then
      insert into public.obra_autores (obra_id, autor_id, rol, orden)
      values (
        v_obra,
        v_autor,
        coalesce(public.jtexto(elemento, 'rol'), 'autor')::rol_autor,
        coalesce(public.jentero(elemento, 'orden'), v_orden)
      )
      on conflict (obra_id, autor_id, rol) do nothing;
      v_orden := v_orden + 1;
    end if;
  end loop;

  -- ----------------------------------------------------------
  -- Edición
  -- ----------------------------------------------------------
  v_edicion := (public.jtexto(j_edicion, 'id'))::uuid;
  v_isbn13  := regexp_replace(coalesce(public.jtexto(j_edicion, 'isbn13'), ''), '[^0-9]', '', 'g');
  v_isbn13  := nullif(v_isbn13, '');

  -- El ISBN-13 es único en toda la base: si ya está, es esa
  -- edición, venga de la biblioteca que venga.
  if v_edicion is null and v_isbn13 is not null then
    select id into v_edicion from public.ediciones where isbn13 = v_isbn13;
  end if;

  if v_edicion is null then
    insert into public.ediciones (
      obra_id, serie_id, numero_serie, isbn13, isbn10, editorial, sello, idioma,
      anio, numero_edicion, encuadernacion, paginas, portada_url, portada_path,
      origen, fuente, fuente_id, datos_fuente
    )
    values (
      v_obra,
      v_serie,
      nullif(btrim(coalesce(j_serie ->> 'numero', j_edicion ->> 'numero_serie', '')), '')::numeric,
      v_isbn13,
      upper(nullif(regexp_replace(coalesce(public.jtexto(j_edicion, 'isbn10'), ''), '[^0-9Xx]', '', 'g'), '')),
      public.jtexto(j_edicion, 'editorial'),
      public.jtexto(j_edicion, 'sello'),
      coalesce(public.jtexto(j_edicion, 'idioma'), 'es'),
      public.jentero(j_edicion, 'anio'),
      public.jentero(j_edicion, 'numero_edicion'),
      public.jtexto(j_edicion, 'encuadernacion'),
      public.jentero(j_edicion, 'paginas'),
      public.jtexto(j_edicion, 'portada_url'),
      public.jtexto(j_edicion, 'portada_path'),
      coalesce(public.jtexto(j_edicion, 'origen'), 'manual')::origen_dato,
      public.jtexto(j_edicion, 'fuente'),
      public.jtexto(j_edicion, 'fuente_id'),
      j_edicion -> 'datos_fuente'
    )
    returning id into v_edicion;
    v_edicion_nueva := true;
  end if;

  -- ----------------------------------------------------------
  -- Etiquetas (vocabulario cerrado: solo ids existentes)
  -- ----------------------------------------------------------
  for elemento in select * from jsonb_array_elements(coalesce(datos -> 'etiquetas', '[]'::jsonb))
  loop
    insert into public.obra_etiquetas (obra_id, etiqueta_id, origen)
    select v_obra, (elemento #>> '{}')::uuid, coalesce(public.jtexto(j_edicion, 'origen'), 'manual')::origen_dato
    where exists (select 1 from public.etiquetas e where e.id = (elemento #>> '{}')::uuid)
    on conflict (obra_id, etiqueta_id) do nothing;
  end loop;

  -- ----------------------------------------------------------
  -- Ejemplar: siempre se inserta. Dos unidades de la misma
  -- edición son dos filas, y eso es lo correcto.
  -- ----------------------------------------------------------
  insert into public.ejemplares (
    biblioteca_id, edicion_id, estado_conservacion, adquirido_en, adquirido_lugar,
    precio, ubicacion_lugar, ubicacion_contenedor, firmado, notas, foto_path, anadido_por
  )
  values (
    v_biblioteca,
    v_edicion,
    public.jtexto(j_ejemplar, 'estado_conservacion'),
    (public.jtexto(j_ejemplar, 'adquirido_en'))::date,
    public.jtexto(j_ejemplar, 'adquirido_lugar'),
    (public.jtexto(j_ejemplar, 'precio'))::numeric,
    public.jtexto(j_ejemplar, 'ubicacion_lugar'),
    public.jtexto(j_ejemplar, 'ubicacion_contenedor'),
    coalesce((j_ejemplar ->> 'firmado')::boolean, false),
    public.jtexto(j_ejemplar, 'notas'),
    public.jtexto(j_ejemplar, 'foto_path'),
    auth.uid()
  )
  returning id into v_ejemplar;

  return jsonb_build_object(
    'ejemplar_id',    v_ejemplar,
    'edicion_id',     v_edicion,
    'obra_id',        v_obra,
    'serie_id',       v_serie,
    'obra_nueva',     v_obra_nueva,
    'edicion_nueva',  v_edicion_nueva
  );
end;
$$;

comment on function public.alta_ejemplar is
  'Alta completa en una transacción: reutiliza obra, autores, serie y edición si ya existen, y crea el ejemplar. SECURITY INVOKER, así que el RLS decide quién puede.';

-- ============================================================
-- Actualización de la ficha
-- ------------------------------------------------------------
-- La pantalla de ficha permite corregir la obra y la edición con
-- lo que traiga un catálogo, una foto leída por IA o el propio
-- usuario. La regla: solo se escribe lo que venga en el jsonb, y
-- nunca se pisa con null lo que ya había, salvo que se pida
-- expresamente con "vaciar".
-- ============================================================
create or replace function public.actualizar_ficha(
  p_edicion uuid,
  cambios   jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  j_obra    jsonb := coalesce(cambios -> 'obra', '{}'::jsonb);
  j_edicion jsonb := coalesce(cambios -> 'edicion', '{}'::jsonb);
  v_obra    uuid;
  v_serie   uuid;
  elemento  jsonb;
  v_autor   uuid;
  v_orden   smallint := 0;
begin
  select obra_id into v_obra from public.ediciones where id = p_edicion;
  if v_obra is null then
    raise exception 'La edición no existe' using errcode = '22023';
  end if;

  if j_obra <> '{}'::jsonb then
    update public.obras set
      titulo                   = coalesce(public.jtexto(j_obra, 'titulo'), titulo),
      subtitulo                = coalesce(public.jtexto(j_obra, 'subtitulo'), subtitulo),
      titulo_original          = coalesce(public.jtexto(j_obra, 'titulo_original'), titulo_original),
      tipo                     = coalesce(public.jtexto(j_obra, 'tipo')::tipo_obra, tipo),
      anio_primera_publicacion = coalesce(public.jentero(j_obra, 'anio_primera_publicacion'), anio_primera_publicacion),
      sinopsis                 = coalesce(public.jtexto(j_obra, 'sinopsis'), sinopsis)
    where id = v_obra;
  end if;

  if cambios -> 'serie' is not null and public.jtexto(cambios -> 'serie', 'nombre') is not null then
    v_serie := public.obtener_serie(
      public.jtexto(cambios -> 'serie', 'nombre'),
      public.jtexto(cambios -> 'serie', 'editorial')
    );
  end if;

  if j_edicion <> '{}'::jsonb or v_serie is not null then
    update public.ediciones set
      serie_id       = coalesce(v_serie, serie_id),
      numero_serie   = coalesce(nullif(btrim(coalesce(cambios #>> '{serie,numero}', j_edicion ->> 'numero_serie', '')), '')::numeric, numero_serie),
      isbn13         = coalesce(nullif(regexp_replace(coalesce(public.jtexto(j_edicion, 'isbn13'), ''), '[^0-9]', '', 'g'), ''), isbn13),
      isbn10         = coalesce(upper(nullif(regexp_replace(coalesce(public.jtexto(j_edicion, 'isbn10'), ''), '[^0-9Xx]', '', 'g'), '')), isbn10),
      editorial      = coalesce(public.jtexto(j_edicion, 'editorial'), editorial),
      sello          = coalesce(public.jtexto(j_edicion, 'sello'), sello),
      idioma         = coalesce(public.jtexto(j_edicion, 'idioma'), idioma),
      anio           = coalesce(public.jentero(j_edicion, 'anio'), anio),
      numero_edicion = coalesce(public.jentero(j_edicion, 'numero_edicion'), numero_edicion),
      encuadernacion = coalesce(public.jtexto(j_edicion, 'encuadernacion'), encuadernacion),
      paginas        = coalesce(public.jentero(j_edicion, 'paginas'), paginas),
      portada_url    = coalesce(public.jtexto(j_edicion, 'portada_url'), portada_url),
      portada_path   = coalesce(public.jtexto(j_edicion, 'portada_path'), portada_path),
      origen         = coalesce(public.jtexto(j_edicion, 'origen')::origen_dato, origen),
      fuente         = coalesce(public.jtexto(j_edicion, 'fuente'), fuente),
      fuente_id      = coalesce(public.jtexto(j_edicion, 'fuente_id'), fuente_id),
      datos_fuente   = coalesce(j_edicion -> 'datos_fuente', datos_fuente)
    where id = p_edicion;
  end if;

  -- Los autores se añaden, no se sustituyen: quitar autoría es una
  -- acción explícita, no un efecto colateral de leer una portada.
  for elemento in select * from jsonb_array_elements(coalesce(cambios -> 'autores', '[]'::jsonb))
  loop
    v_autor := public.obtener_autor(public.jtexto(elemento, 'nombre'));
    if v_autor is not null then
      insert into public.obra_autores (obra_id, autor_id, rol, orden)
      values (v_obra, v_autor, coalesce(public.jtexto(elemento, 'rol'), 'autor')::rol_autor,
              coalesce(public.jentero(elemento, 'orden'), v_orden))
      on conflict (obra_id, autor_id, rol) do nothing;
      v_orden := v_orden + 1;
    end if;
  end loop;

  for elemento in select * from jsonb_array_elements(coalesce(cambios -> 'etiquetas', '[]'::jsonb))
  loop
    insert into public.obra_etiquetas (obra_id, etiqueta_id, origen)
    select v_obra, (elemento #>> '{}')::uuid, coalesce(public.jtexto(j_edicion, 'origen'), 'manual')::origen_dato
    where exists (select 1 from public.etiquetas e where e.id = (elemento #>> '{}')::uuid)
    on conflict (obra_id, etiqueta_id) do nothing;
  end loop;

  return jsonb_build_object('obra_id', v_obra, 'edicion_id', p_edicion);
end;
$$;

comment on function public.actualizar_ficha is
  'Aplica correcciones a obra y edición sin pisar con null lo ya guardado. La usan el catálogo, la IA y la edición manual.';

-- ============================================================
-- Vista de estantería
-- ------------------------------------------------------------
-- Lo que necesita el listado de una biblioteca, sin que el cliente
-- tenga que encadenar joins. `security_invoker` hace que la vista
-- se evalúe con los permisos de quien consulta, así que el RLS de
-- `ejemplares` sigue mandando: sin él, una vista expondría los
-- ejemplares de todo el mundo.
-- ============================================================
create or replace view public.vista_ejemplares
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
  ed.portada_url,
  ed.portada_path,
  ed.numero_serie,
  s.nombre                 as serie,
  ob.id                    as obra_id,
  ob.titulo,
  ob.subtitulo,
  ob.tipo,
  ob.sinopsis,
  ob.clave                 as clave_titulo,
  (
    select string_agg(a.nombre, ', ' order by oa.orden, a.nombre)
    from public.obra_autores oa
    join public.autores a on a.id = oa.autor_id
    where oa.obra_id = ob.id
  )                        as autores
from public.ejemplares ej
join public.ediciones ed on ed.id = ej.edicion_id
join public.obras ob on ob.id = ed.obra_id
left join public.series s on s.id = ed.serie_id;

comment on view public.vista_ejemplares is
  'Estantería lista para pintar: ejemplar + edición + obra + autores. security_invoker, así que respeta el RLS.';

-- Supabase concede permisos por defecto a `authenticated`, pero se
-- dejan explícitos para no depender de ello.
grant select on public.vista_ejemplares to authenticated;
grant execute on function public.alta_ejemplar(jsonb) to authenticated;
grant execute on function public.actualizar_ficha(uuid, jsonb) to authenticated;
grant execute on function public.buscar_duplicado(uuid, text, text, tipo_obra, real) to authenticated;
