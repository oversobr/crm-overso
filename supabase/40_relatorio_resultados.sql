-- ═══════════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 40. Relatório adaptado a cada cliente
--
-- O relatório monta os resultados do Meta pelo objetivo de cada campanha
-- (leads, conversas, visitas...). Duas escolhas ficam por cliente:
--
--   destaque          o número grande do Resumo. 'auto' escolhe sozinho
--                     (leads e compras, depois conversões do Google, depois
--                     conversas e visitas); ou fixa um: 'leads', 'compras',
--                     'conversas', 'visitas', 'google'.
--   conversao_google  o que é a conversão no Google Ads desse cliente:
--                     "Ligações", "Cliques no WhatsApp"... Padrão "Conversões".
--
-- Pode rodar de novo. Rode depois do 39.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.relatorios
  add column if not exists destaque text not null default 'auto',
  add column if not exists conversao_google text not null default 'Conversões';

alter table public.relatorios drop constraint if exists relatorios_destaque_check;
alter table public.relatorios add constraint relatorios_destaque_check
  check (destaque in ('auto', 'leads', 'compras', 'conversas', 'visitas', 'google'));
alter table public.relatorios drop constraint if exists relatorios_conversao_google_check;
alter table public.relatorios add constraint relatorios_conversao_google_check
  check (length(trim(conversao_google)) between 2 and 40);

create or replace function public.relatorio_publico(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'exemplo',         false,
    'cliente',         coalesce(nullif(r.nome_exibicao, ''), p.nome),
    'logoCliente',     p.logo_url,
    'logoCores',       r.logo_cores,
    'destaque',        r.destaque,
    'conversaoGoogle', r.conversao_google,
    'subtitulo',       r.subtitulo,
    'fontes',          r.fontes,
    'meses',           coalesce(
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

notify pgrst, 'reload schema';
