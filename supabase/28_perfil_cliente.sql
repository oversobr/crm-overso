-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 28. Ficha de trabalho do cliente
--
-- Até aqui, "cliente" no banco era só nome, slug, chave e módulos. Tudo que
-- a equipe precisa saber para TRABALHAR o cliente — quem cuida dele, com
-- quem falar, o que foi combinado, onde ficam os arquivos — vivia fora do
-- portal, em conversa. Estas colunas dão lugar a isso.
--
-- ⚠️ ATENÇÃO À MIGRATION 16: ela revogou o SELECT da tabela inteira e
-- concedeu apenas uma LISTA FECHADA de colunas (id, nome, slug, criado_em),
-- para fechar a ingest_key. Coluna nova NÃO entra nessa lista sozinha — sem
-- o grant lá embaixo, o painel receberia "permission denied" ao ler a ficha.
--
-- Quem edita: ninguém novo. A policy projects_update (17) já exige admin do
-- projeto ou super-admin, e vale para estas colunas como para as outras.
-- ═══════════════════════════════════════════════════════════════════

alter table public.projects
  add column if not exists responsavel       text,   -- quem cuida dele na OVERSO
  add column if not exists contato_nome      text,
  add column if not exists contato_email     text,
  add column if not exists contato_telefone  text,
  add column if not exists observacoes       text,   -- briefing, combinados, histórico
  -- [{ "rotulo": "Site", "url": "https://..." }] — formato livre porque cada
  -- cliente tem um conjunto diferente de lugares (drive, figma, redes…).
  add column if not exists links             jsonb not null default '[]'::jsonb,
  add column if not exists atualizado_em     timestamptz not null default now();

-- Carimbo automático, usando o gatilho que já existe desde o 01_schema.
drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before update on public.projects
  for each row execute function public.touch_atualizado_em();

-- ── O grant que a migration 16 obriga ──────────────────────────────
-- Sem isto o membro comum lê id/nome/slug e toma erro no resto da ficha.
-- A ingest_key continua FORA da lista: ela segue saindo só pela função
-- projetos_gerenciaveis(), restrita à equipe OVERSO.
grant select (
  id, nome, slug, criado_em,
  responsavel, contato_nome, contato_email, contato_telefone,
  observacoes, links, atualizado_em
) on public.projects to authenticated;

notify pgrst, 'reload schema';

-- ── Conferência ────────────────────────────────────────────────────
-- No SQL Editor você é dono do banco e ignora RLS e grant de coluna, então
-- finja ser um MEMBRO comum (não admin) para o teste valer:
--
--   begin;
--   select set_config('request.jwt.claims',
--                     '{"sub":"UUID-DO-MEMBRO","role":"authenticated"}', true);
--   set local role authenticated;
--
--   select nome, responsavel, contato_email, links from public.projects;  -- ok
--   rollback;
--
-- E, num bloco separado (o erro aborta a transação):
--   select ingest_key from public.projects;   -- ERRO: continua fechada
--   update public.projects set observacoes = 'x';  -- 0 linhas: não é admin
