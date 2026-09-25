-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 26. Tarefas avulsas do Calendário
--
-- O Calendário virou a visão geral do que está sendo feito para o cliente:
-- eventos, posts programados (que moram na Programação de Postagem) e estas
-- tarefas — o que não é post nem demanda de evento ("Reunião de
-- alinhamento", "Enviar relatório", "Gravar vídeo institucional").
--
-- Mesmas regras dos conteúdos: quem é do cliente (ou super-admin) lê e
-- escreve, e o autor é gravado pelo banco a partir da sessão.
-- Rode depois do 23_conteudo_autor.sql.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.tarefas (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  titulo           text not null check (length(trim(titulo)) > 0),
  descricao        text,
  -- Dia e hora separados, como nos posts: "dia 12 às 15h" é hora de Brasília.
  data             date not null,
  hora             time,
  status           text not null default 'a_fazer'
                   check (status in ('a_fazer', 'fazendo', 'concluido')),
  responsavel      text,
  criado_por       uuid references auth.users(id) on delete set null default auth.uid(),
  criado_por_nome  text,
  criado_por_email text,
  criado_em        timestamptz not null default now()
);

create index if not exists tarefas_projeto_data on public.tarefas (project_id, data);

-- Mesmo gatilho dos conteúdos (23): quem criou vem da sessão.
drop trigger if exists tarefas_autor on public.tarefas;
create trigger tarefas_autor
  before insert on public.tarefas
  for each row execute function public.preencher_autor_conteudo();

alter table public.tarefas enable row level security;

drop policy if exists tarefas_all on public.tarefas;
create policy tarefas_all on public.tarefas
  for all to authenticated
  using (public.is_member(project_id) or public.is_super_admin())
  with check (public.is_member(project_id) or public.is_super_admin());

revoke all on public.tarefas from anon;
grant select, insert, update, delete on public.tarefas to authenticated;

notify pgrst, 'reload schema';
