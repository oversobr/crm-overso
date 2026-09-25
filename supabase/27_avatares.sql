-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 27. Fotos de perfil
--
-- Bucket "avatares" PÚBLICO de leitura: a foto aparece no menu e ao lado
-- dos comentários, e um link fixo evita renovar link assinado a toda hora.
-- Foto de perfil não é dado sensível do cliente — diferente das artes e
-- materiais, que ficam em buckets privados.
--
-- Escrever é só na própria pasta: <user_id>/<arquivo>. Ninguém troca nem
-- apaga a foto de outra pessoa.
-- ═══════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists avatares_insert on storage.objects;
create policy avatares_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatares' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists avatares_update on storage.objects;
create policy avatares_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatares' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatares' and split_part(name, '/', 1) = auth.uid()::text);

drop policy if exists avatares_delete on storage.objects;
create policy avatares_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatares' and split_part(name, '/', 1) = auth.uid()::text);

-- Listar/ler pela API (além do link público) também só a própria pasta.
drop policy if exists avatares_select on storage.objects;
create policy avatares_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatares' and split_part(name, '/', 1) = auth.uid()::text);
