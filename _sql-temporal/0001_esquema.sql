-- ============================================================
-- 0001_esquema.sql — Estructura de la biblioteca
-- ------------------------------------------------------------
-- La decisión estructural del proyecto es separar tres niveles:
--
--   obra      el contenido intelectual  (Watchmen)
--   edición   la publicación concreta   (la absolute de ECC, con su ISBN)
--   ejemplar  el objeto físico          (el que está en tu salón)
--
-- Sin esa separación los duplicados y los cómics por números se
-- vuelven inmanejables: dos ejemplares de la misma edición son dos
-- filas, y ahí se resuelve el "¿añado otra unidad?".
--
-- Obras, ediciones, series, autores y etiquetas son un catálogo
-- COMÚN a todas las bibliotecas: no tiene sentido duplicar la ficha
-- de Dune por cada miembro de la familia. Lo privado de cada
-- biblioteca son los ejemplares; lo privado de cada persona, su
-- estado de lectura.
-- ============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "pg_trgm";    -- similitud difusa para duplicados
create extension if not exists "unaccent";   -- claves normalizadas sin acentos

-- ------------------------------------------------------------
-- Tipos
-- ------------------------------------------------------------
create type rol_biblioteca as enum ('propietario', 'editor', 'colaborador', 'lector');
create type tipo_obra      as enum ('libro', 'comic', 'manga', 'revista');
create type rol_autor      as enum ('autor', 'guion', 'dibujo', 'color', 'entintado', 'traduccion', 'edicion');
create type tipo_etiqueta  as enum ('genero', 'materia', 'publico', 'formato', 'libre');
create type origen_dato    as enum ('manual', 'catalogo', 'ia');
create type estado_lectura as enum ('pendiente', 'leyendo', 'leido', 'abandonado');

-- ------------------------------------------------------------
-- Utilidad: clave normalizada para comparar títulos y nombres
-- ------------------------------------------------------------
-- Minúsculas, sin acentos, sin artículo inicial, sin puntuación y
-- con los espacios colapsados. Es la segunda capa de detección de
-- duplicados, por debajo del ISBN y por encima de la difusa.
create or replace function public.normalizar(texto text)
returns text
language sql
immutable
set search_path = public, pg_catalog
as $$
  select nullif(
    trim(regexp_replace(
      regexp_replace(
        regexp_replace(lower(unaccent(coalesce(texto, ''))), '^(el|la|los|las|un|una|the|a|an)\s+', ''),
        '[^a-z0-9ñ ]', ' ', 'g'),
      '\s+', ' ', 'g')),
  '');
$$;

-- ============================================================
-- Personas y bibliotecas
-- ============================================================

create table public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombre      text,
  creado_en   timestamptz not null default now()
);

comment on table public.perfiles is
  'Datos visibles de cada usuario. auth.users no es legible por los demás miembros.';

create table public.bibliotecas (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) between 1 and 80),
  creada_por  uuid not null references auth.users(id) on delete restrict,
  creada_en   timestamptz not null default now()
);

comment on table public.bibliotecas is
  'Unidad de aislamiento. Lo que se ve en una no se mezcla nunca con otra.';

create table public.miembros (
  biblioteca_id uuid not null references public.bibliotecas(id) on delete cascade,
  usuario_id    uuid not null references auth.users(id) on delete cascade,
  rol           rol_biblioteca not null default 'lector',
  creado_en     timestamptz not null default now(),
  primary key (biblioteca_id, usuario_id)
);

create index on public.miembros (usuario_id);

-- Invitación por enlace con código de un solo uso: no todos los
-- miembros de una familia tienen correo propio (los niños).
create table public.invitaciones (
  id            uuid primary key default gen_random_uuid(),
  biblioteca_id uuid not null references public.bibliotecas(id) on delete cascade,
  codigo        text not null unique,
  rol           rol_biblioteca not null default 'colaborador',
  caduca_en     timestamptz not null default now() + interval '14 days',
  usada_por     uuid references auth.users(id) on delete set null,
  usada_en      timestamptz,
  creada_por    uuid not null references auth.users(id) on delete cascade,
  creada_en     timestamptz not null default now()
);

create index on public.invitaciones (biblioteca_id);

-- ============================================================
-- Catálogo común
-- ============================================================

create table public.autores (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  clave       text generated always as (public.normalizar(nombre)) stored,
  creado_en   timestamptz not null default now()
);

create unique index autores_clave_idx on public.autores (clave);

create table public.series (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  clave           text generated always as (public.normalizar(nombre)) stored,
  editorial       text,
  total_previsto  int check (total_previsto is null or total_previsto > 0),
  creada_en       timestamptz not null default now()
);

create unique index series_clave_idx on public.series (clave, coalesce(editorial, ''));

create table public.obras (
  id                        uuid primary key default gen_random_uuid(),
  titulo                    text not null check (length(trim(titulo)) > 0),
  titulo_original           text,
  subtitulo                 text,
  tipo                      tipo_obra not null default 'libro',
  anio_primera_publicacion  int check (anio_primera_publicacion between 1400 and 2200),
  sinopsis                  text,
  clave                     text generated always as (public.normalizar(titulo)) stored,
  creada_en                 timestamptz not null default now()
);

-- Índice difuso para "título muy parecido, sin ISBN"
create index obras_clave_trgm_idx on public.obras using gin (clave gin_trgm_ops);
create index obras_tipo_idx on public.obras (tipo);

create table public.obra_autores (
  obra_id   uuid not null references public.obras(id) on delete cascade,
  autor_id  uuid not null references public.autores(id) on delete cascade,
  rol       rol_autor not null default 'autor',
  orden     smallint not null default 0,
  primary key (obra_id, autor_id, rol)
);

-- El rol del autor es imprescindible en cómic: Moore y Gibbons no
-- hacen lo mismo, y la ficha tiene que poder decirlo.

create table public.ediciones (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references public.obras(id) on delete cascade,
  serie_id        uuid references public.series(id) on delete set null,
  numero_serie    numeric(7,2),
  isbn13          text unique check (isbn13 ~ '^[0-9]{13}$'),
  isbn10          text check (isbn10 ~ '^[0-9]{9}[0-9Xx]$'),
  editorial       text,
  sello           text,
  idioma          text default 'es',
  anio            int check (anio between 1400 and 2200),
  numero_edicion  int,
  encuadernacion  text,
  paginas         int check (paginas is null or paginas > 0),
  portada_url     text,          -- origen externo
  portada_path    text,          -- copia en Supabase Storage
  -- Trazabilidad: de dónde salió cada dato, para poder reprocesar
  -- un lote cuando mejore un modelo y para saber si un campo raro
  -- lo inventó la IA o vino de Open Library.
  origen          origen_dato not null default 'manual',
  fuente          text,          -- 'google_books', 'open_library', 'comic_vine'…
  fuente_id       text,
  datos_fuente    jsonb,
  creada_en       timestamptz not null default now()
);

create index ediciones_obra_idx on public.ediciones (obra_id);
create index ediciones_serie_idx on public.ediciones (serie_id, numero_serie);

-- ============================================================
-- Inventario físico
-- ============================================================

create table public.ejemplares (
  id                    uuid primary key default gen_random_uuid(),
  biblioteca_id         uuid not null references public.bibliotecas(id) on delete cascade,
  edicion_id            uuid not null references public.ediciones(id) on delete restrict,
  estado_conservacion   text,
  adquirido_en          date,
  adquirido_lugar       text,
  precio                numeric(8,2),
  -- Ubicación en dos niveles, no jerarquía libre: si el alta viene
  -- de una foto de balda, todo el lote hereda la misma de golpe.
  ubicacion_lugar       text,
  ubicacion_contenedor  text,
  firmado               boolean not null default false,
  notas                 text,
  foto_path             text,
  anadido_por           uuid not null references auth.users(id) on delete restrict,
  creado_en             timestamptz not null default now()
);

create index ejemplares_biblioteca_idx on public.ejemplares (biblioteca_id);
create index ejemplares_edicion_idx on public.ejemplares (edicion_id);

-- ============================================================
-- Etiquetas (vocabulario cerrado, no texto libre de la IA)
-- ============================================================
-- Si el modelo inventa etiquetas, en seis meses hay "terror",
-- "horror", "Terror psicológico" y "miedo" como cuatro categorías
-- y el filtro deja de servir.

create table public.etiquetas (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null,
  tipo      tipo_etiqueta not null default 'genero',
  creada_en timestamptz not null default now()
);

create unique index etiquetas_nombre_idx on public.etiquetas (public.normalizar(nombre), tipo);

create table public.obra_etiquetas (
  obra_id     uuid not null references public.obras(id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas(id) on delete cascade,
  origen      origen_dato not null default 'manual',
  confianza   real check (confianza between 0 and 1),
  primary key (obra_id, etiqueta_id)
);

-- ============================================================
-- Lectura, por persona y por obra (no por ejemplar:
-- si tu hija lee tu ejemplar, la lectura es suya)
-- ============================================================

create table public.lecturas (
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  obra_id     uuid not null references public.obras(id) on delete cascade,
  estado      estado_lectura not null default 'pendiente',
  inicio      date,
  fin         date,
  valoracion  smallint check (valoracion between 1 and 5),
  resena      text,
  favorito    boolean not null default false,
  creada_en   timestamptz not null default now(),
  primary key (usuario_id, obra_id)
);

-- ============================================================
-- Automatismos
-- ============================================================

-- Cada usuario nuevo de auth.users obtiene su perfil.
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil();

-- Quien crea una biblioteca es su propietario. Va en SECURITY
-- DEFINER porque la política de inserción de `miembros` exige ser
-- ya propietario, y aquí todavía no lo es nadie.
create or replace function public.propietario_al_crear_biblioteca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.miembros (biblioteca_id, usuario_id, rol)
  values (new.id, new.creada_por, 'propietario');
  return new;
end;
$$;

create trigger al_crear_biblioteca
  after insert on public.bibliotecas
  for each row execute function public.propietario_al_crear_biblioteca();

-- ============================================================
-- Vocabulario inicial de etiquetas
-- ============================================================
insert into public.etiquetas (nombre, tipo) values
  ('Terror', 'genero'), ('Ciencia ficción', 'genero'), ('Fantasía', 'genero'),
  ('Novela negra', 'genero'), ('Histórica', 'genero'), ('Aventuras', 'genero'),
  ('Superhéroes', 'genero'), ('Humor', 'genero'), ('Costumbrista', 'genero'),
  ('Bélico', 'genero'), ('Western', 'genero'),
  ('Empresa y gestión', 'materia'), ('Divulgación científica', 'materia'),
  ('Tecnología', 'materia'), ('Historia', 'materia'), ('Biografía', 'materia'),
  ('Filosofía', 'materia'), ('Arte', 'materia'), ('Viajes', 'materia'),
  ('Cocina', 'materia'), ('Deporte', 'materia'),
  ('Infantil', 'publico'), ('Juvenil', 'publico'), ('Adulto', 'publico'),
  ('Manga', 'formato'), ('Novela gráfica', 'formato'), ('Integral', 'formato'),
  ('Álbum', 'formato')
on conflict do nothing;
