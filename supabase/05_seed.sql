-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 05. Seed / cadastro de página nova
-- Rode este bloco UMA VEZ por landing page que entrar no CRM.
-- ═══════════════════════════════════════════════════════════════════

-- 1. Cria o projeto (= a landing page) e já te dá acesso admin.
--    Troque o email pelo seu e o nome/slug pela página em questão.
with novo as (
  insert into public.projects (nome, slug)
  values ('Biologia com Ka', 'biologia-com-ka')
  on conflict (slug) do update set nome = excluded.nome
  returning id, nome, slug, ingest_key
),
acesso as (
  insert into public.project_members (user_id, project_id, papel)
  select u.id, n.id, 'admin'
  from novo n, auth.users u
  where u.email = 'jose.silvajunior0131@gmail.com'   -- ← seu login do painel
  on conflict (user_id, project_id) do update set papel = 'admin'
  returning 1
)
select nome, slug, ingest_key as "cole esta chave no JS da LP" from novo;

-- 2. (Opcional) Uma campanha, pra separar os leads por período/meta.
insert into public.campaigns (project_id, nome, inicio, fim, meta_leads)
select id, 'Campanha Setembro', date '2026-09-01', date '2026-09-30', 500
from public.projects where slug = 'biologia-com-ka'
on conflict do nothing;

-- ── Conferência ────────────────────────────────────────────────────
-- Rode depois de plugar a LP, pra ver os leads chegando:
--   select nome, whatsapp, completo, respostas, utms, criado_em
--   from public.leads order by criado_em desc limit 20;
--
-- E o funil corrigido:
--   select * from public.funil;
