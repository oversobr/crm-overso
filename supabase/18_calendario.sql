-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 18. Calendário de conteúdo
--
-- Cada linha é uma peça de conteúdo planejada para um cliente (projeto):
-- post, carrossel, story, reels, vídeo do YouTube… O painel mostra tudo num
-- calendário por mês.
--
-- Data e hora ficam separadas (date + time), e não num timestamptz, de
-- propósito: "dia 12 às 18h" é hora de Brasília do jeito que a equipe falou.
-- Guardar como instante UTC faria um post das 22h pular de dia na tela de
-- quem estiver em outro fuso — e o calendário existe pra evitar confusão.
--
-- Permissão igual à dos leads depois do 17: membro do projeto ou super-admin
-- lê e escreve. Rode depois do 17_super_admin_escrita.sql.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.conteudos (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,

  titulo        text not null check (length(trim(titulo)) > 0),
  -- O que é a peça. Lista fechada pra o calendário poder dar cor e ícone.
  formato       text not null default 'post'
                check (formato in ('post', 'carrossel', 'story', 'reels', 'youtube', 'shorts', 'tiktok', 'outro')),
  -- Onde vai sair. Array porque o mesmo reels costuma subir no Instagram e
  -- no Facebook — seriam duas linhas iguais se fosse uma coluna só.
  redes         text[] not null default '{}'
                check (redes <@ array['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'x', 'pinterest', 'outro']),

  data          date not null,
  hora          time,

  status        text not null default 'ideia'
                check (status in ('ideia', 'producao', 'aprovacao', 'agendado', 'publicado')),

  legenda       text,
  -- Link da arte / pasta do Drive / roteiro.
  link          text,
  observacoes   text,

  criado_por    uuid references auth.users(id) on delete set null default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- O calendário sempre pergunta "conteúdos deste cliente entre o dia X e Y".
create index if not exists conteudos_projeto_data on public.conteudos (project_id, data);

create or replace function public.tocar_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists conteudos_atualizado_em on public.conteudos;
create trigger conteudos_atualizado_em
  before update on public.conteudos
  for each row execute function public.tocar_atualizado_em();

-- ── RLS ────────────────────────────────────────────────────────────
alter table public.conteudos enable row level security;

drop policy if exists conteudos_all on public.conteudos;
create policy conteudos_all on public.conteudos
  for all to authenticated
  using (public.is_member(project_id) or public.is_super_admin())
  with check (public.is_member(project_id) or public.is_super_admin());

-- Mesma trava das outras tabelas: a anon key das LPs não enxerga nada aqui.
revoke all on public.conteudos from anon;
grant select, insert, update, delete on public.conteudos to authenticated;

notify pgrst, 'reload schema';
