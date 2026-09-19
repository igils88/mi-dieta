-- ============================================================
-- 0002_rls.sql — Aislamiento entre bibliotecas
-- ------------------------------------------------------------
-- La regla de oro: el cliente NUNCA filtra por biblioteca, filtra
-- la base de datos. Así un error en el frontend no expone nada.
--
-- Las funciones de pertenencia van en SECURITY DEFINER a propósito:
-- una política sobre `miembros` que consulte `miembros` entra en
-- recursión infinita. Al saltarse RLS dentro de la función, se
-- rompe el ciclo sin abrir ningún agujero, porque la función solo
-- responde sobre el usuario que llama.
-- ============================================================

create or replace function public.es_miembro(bib uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.miembros m
    where m.biblioteca_id = bib and m.usuario_id = auth.uid()
  );
$$;

create or replace function public.rol_en(bib uuid)
returns rol_biblioteca
language sql
stable
security definer
set search_path = public
as $$
  select m.rol from public.miembros m
  where m.biblioteca_id = bib and m.usuario_id = auth.uid();
$$;

create or replace function public.puede_escribir(bib uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.rol_en(bib) in ('propietario', 'editor', 'colaborador');
$$;

create or replace function public.comparte_biblioteca(otro uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.miembros mio
    join public.miembros suyo on suyo.biblioteca_id = mio.biblioteca_id
    where mio.usuario_id = auth.uid() and suyo.usuario_id = otro
  );
$$;

-- ------------------------------------------------------------
alter table public.perfiles       enable row level security;
alter table public.bibliotecas    enable row level security;
alter table public.miembros       enable row level security;
alter table public.invitaciones   enable row level security;
alter table public.autores        enable row level security;
alter table public.series         enable row level security;
alter table public.obras          enable row level security;
alter table public.obra_autores   enable row level security;
alter table public.ediciones      enable row level security;
alter table public.ejemplares     enable row level security;
alter table public.etiquetas      enable row level security;
alter table public.obra_etiquetas enable row level security;
alter table public.lecturas       enable row level security;

-- ============================================================
-- Perfiles: el mío, y el de quien comparte biblioteca conmigo
-- ============================================================
create policy "perfiles visibles" on public.perfiles
  for select to authenticated
  using (id = auth.uid() or public.comparte_biblioteca(id));

create policy "edito mi perfil" on public.perfiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ============================================================
-- Bibliotecas
-- ============================================================
create policy "veo mis bibliotecas" on public.bibliotecas
  for select to authenticated
  using (public.es_miembro(id));

create policy "creo bibliotecas" on public.bibliotecas
  for insert to authenticated
  with check (creada_por = auth.uid());

create policy "el propietario edita" on public.bibliotecas
  for update to authenticated
  using (public.rol_en(id) = 'propietario')
  with check (public.rol_en(id) = 'propietario');

create policy "el propietario borra" on public.bibliotecas
  for delete to authenticated
  using (public.rol_en(id) = 'propietario');

-- ============================================================
-- Miembros
-- ============================================================
create policy "veo los miembros de mis bibliotecas" on public.miembros
  for select to authenticated
  using (public.es_miembro(biblioteca_id));

create policy "el propietario invita" on public.miembros
  for insert to authenticated
  with check (public.rol_en(biblioteca_id) = 'propietario');

create policy "el propietario cambia roles" on public.miembros
  for update to authenticated
  using (public.rol_en(biblioteca_id) = 'propietario')
  with check (public.rol_en(biblioteca_id) = 'propietario');

-- Uno puede salirse; el propietario puede expulsar.
create policy "salir o expulsar" on public.miembros
  for delete to authenticated
  using (usuario_id = auth.uid() or public.rol_en(biblioteca_id) = 'propietario');

-- ============================================================
-- Invitaciones
-- ============================================================
create policy "el propietario gestiona invitaciones" on public.invitaciones
  for all to authenticated
  using (public.rol_en(biblioteca_id) = 'propietario')
  with check (public.rol_en(biblioteca_id) = 'propietario');

-- ============================================================
-- Catálogo común: lo lee cualquiera identificado, y cualquiera
-- puede añadir fichas. No se borra: las claves ajenas lo impiden
-- y un borrado accidental afectaría a las demás bibliotecas.
-- ============================================================
create policy "leo el catálogo" on public.autores
  for select to authenticated using (true);
create policy "añado autores" on public.autores
  for insert to authenticated with check (true);

create policy "leo las series" on public.series
  for select to authenticated using (true);
create policy "añado series" on public.series
  for insert to authenticated with check (true);
create policy "corrijo series" on public.series
  for update to authenticated using (true) with check (true);

create policy "leo las obras" on public.obras
  for select to authenticated using (true);
create policy "añado obras" on public.obras
  for insert to authenticated with check (true);
create policy "corrijo obras" on public.obras
  for update to authenticated using (true) with check (true);

create policy "leo la autoría" on public.obra_autores
  for select to authenticated using (true);
create policy "edito la autoría" on public.obra_autores
  for all to authenticated using (true) with check (true);

create policy "leo las ediciones" on public.ediciones
  for select to authenticated using (true);
create policy "añado ediciones" on public.ediciones
  for insert to authenticated with check (true);
create policy "corrijo ediciones" on public.ediciones
  for update to authenticated using (true) with check (true);

create policy "leo las etiquetas" on public.etiquetas
  for select to authenticated using (true);
create policy "amplío el vocabulario" on public.etiquetas
  for insert to authenticated with check (true);

create policy "leo el etiquetado" on public.obra_etiquetas
  for select to authenticated using (true);
create policy "edito el etiquetado" on public.obra_etiquetas
  for all to authenticated using (true) with check (true);

-- ============================================================
-- Ejemplares: aquí está el aislamiento de verdad
-- ============================================================
create policy "veo los ejemplares de mis bibliotecas" on public.ejemplares
  for select to authenticated
  using (public.es_miembro(biblioteca_id));

create policy "añado ejemplares" on public.ejemplares
  for insert to authenticated
  with check (public.puede_escribir(biblioteca_id) and anadido_por = auth.uid());

-- El colaborador solo toca lo que añadió él; editor y propietario, todo.
create policy "edito ejemplares" on public.ejemplares
  for update to authenticated
  using (
    public.rol_en(biblioteca_id) in ('propietario', 'editor')
    or (public.rol_en(biblioteca_id) = 'colaborador' and anadido_por = auth.uid())
  )
  with check (public.puede_escribir(biblioteca_id));

create policy "borro ejemplares" on public.ejemplares
  for delete to authenticated
  using (
    public.rol_en(biblioteca_id) in ('propietario', 'editor')
    or (public.rol_en(biblioteca_id) = 'colaborador' and anadido_por = auth.uid())
  );

-- ============================================================
-- Lecturas: estrictamente propias
-- ============================================================
create policy "mis lecturas" on public.lecturas
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());
