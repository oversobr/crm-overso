-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 19. Imagens no calendário de conteúdo
--
-- As imagens moram no Storage do Supabase, num bucket PRIVADO: arte de
-- cliente não pode ficar num link público adivinhável. O painel mostra cada
-- uma por um link assinado que expira.
--
-- Caminho de cada arquivo: <project_id>/<uuid>.<ext>. A primeira pasta é o
-- cliente, e é ela que a policy confere — a mesma regra da tabela conteudos
-- (membro do projeto ou super-admin). Rode depois do 18_calendario.sql.
-- ═══════════════════════════════════════════════════════════════════

-- Caminhos dos arquivos no bucket, na ordem do carrossel.
alter table public.conteudos add column if not exists midias text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'conteudos',
  'conteudos',
  false,
  10 * 1024 * 1024,  -- 10 MB por imagem
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lê o cliente da 1ª pasta do caminho. O CASE garante que o texto só é
-- convertido pra uuid depois de conferido: um nome fora do padrão vira
-- "sem acesso" em vez de estourar erro de conversão.
create or replace function public.pode_acessar_midia(p_nome text)
returns boolean language sql stable set search_path = public as $$
  select case
    when split_part(p_nome, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then public.is_member(split_part(p_nome, '/', 1)::uuid) or public.is_super_admin()
    else false
  end;
$$;

revoke all on function public.pode_acessar_midia(text) from anon;
grant execute on function public.pode_acessar_midia(text) to authenticated;

drop policy if exists conteudos_midias_select on storage.objects;
create policy conteudos_midias_select on storage.objects
  for select to authenticated
  using (bucket_id = 'conteudos' and public.pode_acessar_midia(name));

drop policy if exists conteudos_midias_insert on storage.objects;
create policy conteudos_midias_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'conteudos' and public.pode_acessar_midia(name));

drop policy if exists conteudos_midias_update on storage.objects;
create policy conteudos_midias_update on storage.objects
  for update to authenticated
  using (bucket_id = 'conteudos' and public.pode_acessar_midia(name))
  with check (bucket_id = 'conteudos' and public.pode_acessar_midia(name));

drop policy if exists conteudos_midias_delete on storage.objects;
create policy conteudos_midias_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'conteudos' and public.pode_acessar_midia(name));

notify pgrst, 'reload schema';
