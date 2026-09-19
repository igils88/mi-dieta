-- ============================================================
-- 0005_acceso.sql — Super admin, roles y alta de usuarios
-- ------------------------------------------------------------
-- Tres cambios de gobierno:
--
--   1. Crear bibliotecas deja de ser algo que pueda hacer
--      cualquiera: es del super admin.
--   2. Quién entra y con qué rol lo decide el super admin ANTES
--      de que la persona se registre, en `accesos_previstos`.
--   3. Al registrarse, esa persona queda dada de alta en todas
--      las bibliotecas con el rol que se le haya puesto.
--
-- El punto 2 es lo que hace que abrir el registro no abra la
-- biblioteca: alguien que se registre sin estar en la lista
-- entra a una app vacía, sin ninguna biblioteca y sin poder
-- crearse una. Sin esa lista, cualquiera con la URL vería el
-- catálogo de casa.
-- ============================================================

-- ------------------------------------------------------------
-- Perfil: correo visible y marca de super admin
-- ------------------------------------------------------------
-- El correo se copia a `perfiles` porque auth.users no es
-- legible por los demás usuarios, y la pantalla de gestión
-- necesita saber quién es quién.
alter table public.perfiles
  add column if not exists correo        text,
  add column if not exists es_superadmin boolean not null default false;

-- ------------------------------------------------------------
-- Quién entra y con qué rol, decidido de antemano
-- ------------------------------------------------------------
create table if not exists public.accesos_previstos (
  correo        text primary key,
  rol           rol_biblioteca not null default 'editor',
  es_superadmin boolean not null default false,
  nota          text,
  creado_por    uuid references auth.users(id) on delete set null,
  creado_en     timestamptz not null default now(),
  constraint correo_en_minusculas check (correo = lower(btrim(correo)))
);

comment on table public.accesos_previstos is
  'Lista blanca: correos autorizados y rol que recibirán al registrarse. Quien no esté aquí se registra pero no ve ninguna biblioteca.';

-- El super admin de la casa.
insert into public.accesos_previstos (correo, rol, es_superadmin, nota)
values ('igils88@gmail.com', 'propietario', true, 'Super admin')
on conflict (correo) do update
  set rol = 'propietario', es_superadmin = true;

-- Si ese usuario ya existe, se le marca ahora.
update public.perfiles p
set es_superadmin = true
from auth.users u
where u.id = p.id and lower(u.email) = 'igils88@gmail.com';

-- Y se rellena el correo de los perfiles que ya hubiera.
update public.perfiles p
set correo = lower(u.email)
from auth.users u
where u.id = p.id and p.correo is null;

-- ------------------------------------------------------------
-- ¿Soy super admin?
-- ------------------------------------------------------------
-- SECURITY DEFINER por el mismo motivo que `es_miembro`: se
-- consulta desde políticas de `perfiles`, y una política sobre
-- perfiles que lea perfiles entra en recursión.
create or replace function public.es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.es_superadmin from public.perfiles p where p.id = auth.uid()),
    false
  );
$$;

-- ============================================================
-- Altas automáticas
-- ============================================================

-- Al registrarse una persona: perfil, marca de super admin si le
-- toca, y alta en todas las bibliotecas que ya existan.
create or replace function public.crear_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correo text := lower(btrim(new.email));
  v_acceso public.accesos_previstos%rowtype;
begin
  select * into v_acceso from public.accesos_previstos where correo = v_correo;

  insert into public.perfiles (id, nombre, correo, es_superadmin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nombre', split_part(v_correo, '@', 1)),
    v_correo,
    coalesce(v_acceso.es_superadmin, false)
  )
  on conflict (id) do update
    set correo        = excluded.correo,
        es_superadmin = excluded.es_superadmin;

  -- Sin invitación previa no hay acceso a nada. Es deliberado.
  if v_acceso.correo is not null then
    insert into public.miembros (biblioteca_id, usuario_id, rol)
    select b.id, new.id, v_acceso.rol
    from public.bibliotecas b
    on conflict (biblioteca_id, usuario_id) do nothing;
  end if;

  return new;
end;
$$;

-- Al crear una biblioteca: su creador es propietario y todos los
-- usuarios ya autorizados entran con su rol. Una biblioteca nueva
-- no deja fuera a la familia.
create or replace function public.propietario_al_crear_biblioteca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.miembros (biblioteca_id, usuario_id, rol)
  values (new.id, new.creada_por, 'propietario')
  on conflict (biblioteca_id, usuario_id) do nothing;

  insert into public.miembros (biblioteca_id, usuario_id, rol)
  select new.id, p.id, a.rol
  from public.perfiles p
  join public.accesos_previstos a on a.correo = p.correo
  where p.id <> new.creada_por
  on conflict (biblioteca_id, usuario_id) do nothing;

  return new;
end;
$$;

-- ============================================================
-- Políticas
-- ============================================================

-- Crear bibliotecas: solo el super admin.
drop policy if exists "creo bibliotecas" on public.bibliotecas;
create policy "el superadmin crea bibliotecas" on public.bibliotecas
  for insert to authenticated
  with check (creada_por = auth.uid() and public.es_superadmin());

-- El super admin ve y gestiona todas las bibliotecas, sea o no
-- miembro de ellas.
drop policy if exists "veo mis bibliotecas" on public.bibliotecas;
create policy "veo mis bibliotecas" on public.bibliotecas
  for select to authenticated
  using (public.es_miembro(id) or public.es_superadmin());

drop policy if exists "el propietario edita" on public.bibliotecas;
create policy "el propietario edita" on public.bibliotecas
  for update to authenticated
  using (public.rol_en(id) = 'propietario' or public.es_superadmin())
  with check (public.rol_en(id) = 'propietario' or public.es_superadmin());

drop policy if exists "el propietario borra" on public.bibliotecas;
create policy "el propietario borra" on public.bibliotecas
  for delete to authenticated
  using (public.rol_en(id) = 'propietario' or public.es_superadmin());

-- Miembros: el super admin reparte los roles.
drop policy if exists "veo los miembros de mis bibliotecas" on public.miembros;
create policy "veo los miembros de mis bibliotecas" on public.miembros
  for select to authenticated
  using (public.es_miembro(biblioteca_id) or public.es_superadmin());

create policy "el superadmin gestiona miembros" on public.miembros
  for all to authenticated
  using (public.es_superadmin())
  with check (public.es_superadmin());

-- Perfiles: el super admin los ve todos, para poder asignar roles.
drop policy if exists "perfiles visibles" on public.perfiles;
create policy "perfiles visibles" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.comparte_biblioteca(id) or public.es_superadmin());

-- ------------------------------------------------------------
-- El perfil propio se edita, pero no todos sus campos
-- ------------------------------------------------------------
-- La política "edito mi perfil" permite un UPDATE sobre la propia
-- fila, y RLS no distingue columnas: sin esto, cualquiera podría
-- ponerse `es_superadmin = true` y crearse bibliotecas. Dos capas:
-- se retira el permiso de columna, y un disparador devuelve los
-- campos sensibles a su valor anterior por si alguien vuelve a
-- ejecutar un `grant all` sobre la tabla.
revoke update on public.perfiles from authenticated;
grant update (nombre) on public.perfiles to authenticated;

create or replace function public.proteger_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() nulo = no hay sesión de usuario detrás (migración,
  -- service_role, disparador interno): ahí no se toca nada.
  if auth.uid() is not null and not public.es_superadmin() then
    new.id            := old.id;
    new.correo        := old.correo;
    new.es_superadmin := old.es_superadmin;
  end if;
  return new;
end;
$$;

drop trigger if exists al_editar_perfil on public.perfiles;
create trigger al_editar_perfil
  before update on public.perfiles
  for each row execute function public.proteger_perfil();

-- La lista de accesos es cosa exclusiva del super admin.
alter table public.accesos_previstos enable row level security;

create policy "el superadmin gestiona los accesos" on public.accesos_previstos
  for all to authenticated
  using (public.es_superadmin())
  with check (public.es_superadmin());

-- ============================================================
-- Consulta para la pantalla de gestión
-- ============================================================
-- Devuelve, en una sola llamada, quién está autorizado, si ya se
-- ha registrado y qué rol tiene de verdad en cada biblioteca.
create or replace function public.usuarios_y_accesos()
returns table (
  correo        text,
  rol_previsto  rol_biblioteca,
  es_superadmin boolean,
  registrado    boolean,
  usuario_id    uuid,
  nombre        text,
  roles_reales  jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(a.correo, p.correo)                as correo,
    a.rol                                       as rol_previsto,
    coalesce(p.es_superadmin, a.es_superadmin, false),
    p.id is not null                            as registrado,
    p.id                                        as usuario_id,
    p.nombre,
    (
      select coalesce(jsonb_object_agg(b.nombre, m.rol), '{}'::jsonb)
      from public.miembros m
      join public.bibliotecas b on b.id = m.biblioteca_id
      where m.usuario_id = p.id
    )
  from public.accesos_previstos a
  full outer join public.perfiles p on p.correo = a.correo
  where public.es_superadmin()
  order by 1;
$$;

comment on function public.usuarios_y_accesos is
  'Pantalla de gestión de usuarios. SECURITY DEFINER, pero solo devuelve filas si quien llama es super admin.';

-- Cambiar el rol de alguien en todas las bibliotecas de golpe,
-- que es como se usa en una casa: «Marta pasa a solo lectura».
create or replace function public.fijar_rol(p_correo text, p_rol rol_biblioteca)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correo  text := lower(btrim(p_correo));
  v_usuario uuid;
  v_filas   int := 0;
begin
  if not public.es_superadmin() then
    raise exception 'Solo el super admin cambia roles' using errcode = '42501';
  end if;

  insert into public.accesos_previstos (correo, rol, creado_por)
  values (v_correo, p_rol, auth.uid())
  on conflict (correo) do update set rol = excluded.rol;

  select id into v_usuario from public.perfiles where correo = v_correo;

  if v_usuario is not null then
    -- Al propietario de una biblioteca no se le degrada por aquí.
    update public.miembros m
    set rol = p_rol
    where m.usuario_id = v_usuario and m.rol <> 'propietario';
    get diagnostics v_filas = row_count;

    insert into public.miembros (biblioteca_id, usuario_id, rol)
    select b.id, v_usuario, p_rol
    from public.bibliotecas b
    on conflict (biblioteca_id, usuario_id) do nothing;
  end if;

  return jsonb_build_object('correo', v_correo, 'rol', p_rol, 'registrado', v_usuario is not null, 'bibliotecas', v_filas);
end;
$$;

create or replace function public.quitar_acceso(p_correo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_correo  text := lower(btrim(p_correo));
  v_usuario uuid;
begin
  if not public.es_superadmin() then
    raise exception 'Solo el super admin retira accesos' using errcode = '42501';
  end if;

  delete from public.accesos_previstos where correo = v_correo and not es_superadmin;

  select id into v_usuario from public.perfiles where correo = v_correo;
  if v_usuario is not null then
    -- Se le saca de las bibliotecas, pero no se borra su cuenta ni
    -- lo que haya añadido: los ejemplares son de la biblioteca.
    delete from public.miembros where usuario_id = v_usuario and rol <> 'propietario';
  end if;

  return jsonb_build_object('correo', v_correo, 'retirado', true);
end;
$$;

grant execute on function public.es_superadmin() to authenticated;
grant execute on function public.usuarios_y_accesos() to authenticated;
grant execute on function public.fijar_rol(text, rol_biblioteca) to authenticated;
grant execute on function public.quitar_acceso(text) to authenticated;
grant select, insert, update, delete on public.accesos_previstos to authenticated;
