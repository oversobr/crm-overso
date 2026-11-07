-- ═══════════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 38. Relatórios mensais de resultados
--
-- A página do relatório é estática (public/relatorio) e o design é o mesmo
-- para todos os clientes: aqui ficam só os dados de cada um, mês a mês.
--
-- O cliente abre portal.overso.co/relatorio/<slug>, sem login. Por isso:
--   • As tabelas NÃO têm leitura para anon. Quem não é da equipe só chega
--     nos dados pela função relatorio_publico().
--   • ATENÇÃO: o slug é o nome do cliente, então o endereço é fácil de
--     adivinhar. Escolha do negócio: quem digitar o endereço vê o relatório.
--   • Só meses publicados saem pela função; rascunho fica só com a equipe.
--   • Escrever é só da equipe da Overso (super admin). Membro de cliente não
--     lê nem altera estas tabelas: o relatório dele é o que a equipe publicou.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.relatorios (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null unique references public.projects(id) on delete cascade,
  -- O que vem depois de /relatorio/ no endereço. "previa" é da tela de prévia.
  slug           text not null unique
                 check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 60 and slug <> 'previa'),
  -- Nome mostrado na capa. Vazio = usa o nome do cliente.
  nome_exibicao  text,
  subtitulo      text not null default 'Desempenho de mídia paga',
  fontes         text not null default 'Google Ads, Meta ADS',
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.relatorio_meses (
  id             uuid primary key default gen_random_uuid(),
  relatorio_id   uuid not null references public.relatorios(id) on delete cascade,
  referencia     text not null check (referencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  -- O mês inteiro, no formato que a página lê. JSON de propósito: cliente
  -- novo pode ter canais e métricas diferentes sem precisar de migration.
  dados          jsonb not null check (dados->>'id' = referencia),
  publicado      boolean not null default false,
  atualizado_por uuid references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (relatorio_id, referencia)
);
create index if not exists relatorio_meses_relatorio on public.relatorio_meses (relatorio_id, referencia);

alter table public.relatorios      enable row level security;
alter table public.relatorio_meses enable row level security;

drop policy if exists relatorios_equipe on public.relatorios;
create policy relatorios_equipe on public.relatorios
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists relatorio_meses_equipe on public.relatorio_meses;
create policy relatorio_meses_equipe on public.relatorio_meses
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

revoke all on public.relatorios, public.relatorio_meses from public, anon;
grant select, insert, update, delete on public.relatorios, public.relatorio_meses to authenticated;

-- ── A única porta para quem abre o link ───────────────────────────────
-- Endereço inexistente devolve null.
create or replace function public.relatorio_publico(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'exemplo',     false,
    'cliente',     coalesce(nullif(r.nome_exibicao, ''), p.nome),
    'logoCliente', p.logo_url,
    'subtitulo',   r.subtitulo,
    'fontes',      r.fontes,
    'meses',       coalesce(
      (select jsonb_agg(m.dados order by m.referencia)
         from public.relatorio_meses m
        where m.relatorio_id = r.id and m.publicado),
      '[]'::jsonb)
  )
  from public.relatorios r
  join public.projects p on p.id = r.project_id
  where r.slug = p_slug;
$$;

revoke all on function public.relatorio_publico(text) from public;
grant execute on function public.relatorio_publico(text) to anon, authenticated;
