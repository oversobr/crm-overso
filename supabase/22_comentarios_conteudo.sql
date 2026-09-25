-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 22. Comentários nos conteúdos do calendário
--
-- No lugar do campo "Observações internas", uma conversa por conteúdo
-- (como no Trello/Asana): cada comentário guarda quem escreveu e quando.
--
-- Autor e cliente NÃO vêm do navegador: um gatilho preenche a partir da
-- sessão (auth.uid) e do próprio conteúdo. Assim ninguém comenta em nome de
-- outra pessoa nem pendura comentário em cliente que não é seu.
-- Rode depois do 18_calendario.sql.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.conteudo_comentarios (
  id           uuid primary key default gen_random_uuid(),
  conteudo_id  uuid not null references public.conteudos(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  autor_id     uuid references auth.users(id) on delete set null,
  -- Foto do autor no momento do comentário: o painel não lê auth.users.
  autor_nome   text not null default '',
  autor_email  text not null default '',
  texto        text not null check (length(trim(texto)) > 0 and length(texto) <= 5000),
  criado_em    timestamptz not null default now()
);

create index if not exists conteudo_comentarios_conteudo
  on public.conteudo_comentarios (conteudo_id, criado_em);

-- ── Autor e cliente vêm do banco ───────────────────────────────────
create or replace function public.preencher_comentario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_meta  jsonb;
begin
  select u.email, u.raw_user_meta_data into v_email, v_meta
  from auth.users u where u.id = auth.uid();

  new.autor_id    := auth.uid();
  new.autor_email := coalesce(v_email, '');
  new.autor_nome  := coalesce(
    nullif(v_meta->>'full_name', ''),
    nullif(v_meta->>'name', ''),
    split_part(coalesce(v_email, ''), '@', 1)
  );
  -- O cliente é sempre o do conteúdo: a policy abaixo confere o acesso a ele.
  select c.project_id into new.project_id from public.conteudos c where c.id = new.conteudo_id;
  new.criado_em := now();
  return new;
end;
$$;

drop trigger if exists conteudo_comentarios_preencher on public.conteudo_comentarios;
create trigger conteudo_comentarios_preencher
  before insert on public.conteudo_comentarios
  for each row execute function public.preencher_comentario();

-- ── RLS ────────────────────────────────────────────────────────────
alter table public.conteudo_comentarios enable row level security;

-- Lê e comenta quem tem acesso ao cliente (a mesma regra do calendário).
drop policy if exists comentarios_select on public.conteudo_comentarios;
create policy comentarios_select on public.conteudo_comentarios
  for select to authenticated
  using (public.is_member(project_id) or public.is_super_admin());

drop policy if exists comentarios_insert on public.conteudo_comentarios;
create policy comentarios_insert on public.conteudo_comentarios
  for insert to authenticated
  with check (public.is_member(project_id) or public.is_super_admin());

-- Apagar: só o próprio comentário. Editar não existe — a conversa é registro.
drop policy if exists comentarios_delete on public.conteudo_comentarios;
create policy comentarios_delete on public.conteudo_comentarios
  for delete to authenticated
  using (autor_id = auth.uid());

revoke all on public.conteudo_comentarios from anon;
grant select, insert, delete on public.conteudo_comentarios to authenticated;

notify pgrst, 'reload schema';
