-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 29. Logo do cliente
--
-- Bucket PÚBLICO de leitura, igual ao de fotos de perfil (27): o logo
-- aparece no perfil e pode acabar num relatório impresso, e link fixo
-- evita renovar link assinado toda hora. Logo de cliente é material de
-- marca — não é dado sensível como as artes e os materiais de evento,
-- que seguem em buckets privados.
--
-- Escrever é só de quem administra AQUELE cliente: o caminho é
-- <project_id>/<arquivo>, e a policy confere o id contra pode_gerenciar().
-- Ninguém troca o logo do cliente de outro.
--
-- SVG fica de fora da lista de tipos de propósito: SVG é XML e pode
-- carregar script. Num bucket público, abrir o arquivo direto executaria
-- esse script no domínio do storage. PNG, JPEG e WebP não têm esse risco.
-- ═══════════════════════════════════════════════════════════════════

-- ── Onde o endereço fica ───────────────────────────────────────────
alter table public.projects
  add column if not exists logo_url      text,
  -- Guardado separado pra conseguir APAGAR o arquivo antigo na troca; só
  -- com a URL pública dava pra exibir, não pra remover do bucket.
  add column if not exists logo_caminho  text;

-- ⚠️ Mesma armadilha da 28: a migration 16 trocou o SELECT de `projects`
-- por uma lista fechada de colunas. Coluna nova precisa entrar na lista,
-- senão o painel toma "permission denied" ao ler o perfil.
grant select (
  id, nome, slug, criado_em,
  responsavel, contato_nome, contato_email, contato_telefone,
  observacoes, links, atualizado_em,
  logo_url, logo_caminho
) on public.projects to authenticated;

-- ── O bucket ───────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'logos-cliente', 'logos-cliente', true, 2 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Quem escreve ───────────────────────────────────────────────────
-- O `name ~` antes do cast não é decoração: sem ele, um caminho fora do
-- formato faria o ::uuid estourar erro em vez de simplesmente negar.
create or replace function public.logo_do_cliente_permitido(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
     and public.pode_gerenciar(split_part(p_name, '/', 1)::uuid);
$$;

revoke all on function public.logo_do_cliente_permitido(text) from public, anon;
grant execute on function public.logo_do_cliente_permitido(text) to authenticated;

drop policy if exists logos_cliente_insert on storage.objects;
create policy logos_cliente_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'logos-cliente' and public.logo_do_cliente_permitido(name));

drop policy if exists logos_cliente_update on storage.objects;
create policy logos_cliente_update on storage.objects
  for update to authenticated
  using (bucket_id = 'logos-cliente' and public.logo_do_cliente_permitido(name))
  with check (bucket_id = 'logos-cliente' and public.logo_do_cliente_permitido(name));

drop policy if exists logos_cliente_delete on storage.objects;
create policy logos_cliente_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'logos-cliente' and public.logo_do_cliente_permitido(name));

-- Leitura pela API. O bucket é público, então o conteúdo já é alcançável
-- pelo link direto; esta policy é só pra listagem pela API não ficar muda.
drop policy if exists logos_cliente_select on storage.objects;
create policy logos_cliente_select on storage.objects
  for select to authenticated
  using (bucket_id = 'logos-cliente');

notify pgrst, 'reload schema';

-- ── Conferência ────────────────────────────────────────────────────
-- Como MEMBRO comum (não admin), com a impersonação do SQL Editor:
--   select logo_url from public.projects;              -- ok, ele enxerga
--   update public.projects set logo_url = 'x';         -- 0 linhas: barrado
-- E o upload pelo painel só é oferecido a quem pode_gerenciar() aprova.
