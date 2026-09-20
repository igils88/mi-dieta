-- ============================================================
-- 0008_portadas.sql — Guardar la foto de la portada
-- ------------------------------------------------------------
-- Hasta ahora las cubiertas venían siempre de fuera: una URL de
-- Google Books o de Open Library. Funciona para un libro con
-- ISBN, y nada más. Un cómic de los 80, un ejemplar dedicado, un
-- libro de una editorial pequeña: el catálogo no los tiene, y la
-- foto que uno acaba de hacer para dar el libro de alta es la
-- mejor cubierta que va a existir de ese ejemplar.
--
-- El bucket es PÚBLICO en lectura a propósito. Las alternativas
-- eran URLs firmadas que caducan (hay que renovarlas y rompen la
-- rejilla a mitad de sesión) o servirlas por una ruta propia
-- (paga la función por cada miniatura). A cambio, lo que se sube
-- es la cubierta de un libro: alguien que adivine un uuid de 36
-- caracteres ve la portada de un tebeo.
--
-- Lo que NO es público es escribir: para eso hay que ser miembro
-- de la biblioteca a la que pertenece la carpeta. Cada fichero
-- vive en portadas/<biblioteca_id>/<lo que sea>, y la política
-- comprueba esa primera carpeta contra `es_miembro`.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portadas',
  'portadas',
  true,
  3000000,                                        -- 3 MB: una foto ya reducida no llega
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 3000000,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- ------------------------------------------------------------
-- ¿Puedo escribir en la biblioteca que dice esta carpeta?
-- ------------------------------------------------------------
-- La ruta de un fichero es texto, y su primera carpeta debería
-- ser el uuid de una biblioteca — pero «debería» no basta: quien
-- sube elige el nombre. Si no es un uuid, la respuesta es no, sin
-- reventar la política con un error de conversión.
create or replace function public.puede_escribir_en(carpeta text)
returns boolean
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_biblioteca uuid;
begin
  begin
    v_biblioteca := carpeta::uuid;
  exception when others then
    return false;
  end;

  return public.puede_escribir(v_biblioteca);
end;
$$;

grant execute on function public.puede_escribir_en(text) to authenticated;

-- ------------------------------------------------------------
-- Quién puede tocar qué
-- ------------------------------------------------------------
drop policy if exists "portadas visibles" on storage.objects;
create policy "portadas visibles" on storage.objects
  for select
  using (bucket_id = 'portadas');

drop policy if exists "subo portadas a mis bibliotecas" on storage.objects;
create policy "subo portadas a mis bibliotecas" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'portadas'
    -- (storage.foldername(name))[1] es la primera carpeta de la
    -- ruta. Si no es un uuid de biblioteca de las mías, no entra.
    and public.puede_escribir_en((storage.foldername(name))[1])
  );

drop policy if exists "reemplazo portadas de mis bibliotecas" on storage.objects;
create policy "reemplazo portadas de mis bibliotecas" on storage.objects
  for update to authenticated
  using (bucket_id = 'portadas' and public.puede_escribir_en((storage.foldername(name))[1]))
  with check (bucket_id = 'portadas' and public.puede_escribir_en((storage.foldername(name))[1]));

drop policy if exists "borro portadas de mis bibliotecas" on storage.objects;
create policy "borro portadas de mis bibliotecas" on storage.objects
  for delete to authenticated
  using (bucket_id = 'portadas' and public.puede_escribir_en((storage.foldername(name))[1]));
