-- ═══════════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 39. Logo do cliente com as cores originais no relatório
--
-- Na abertura do relatório o logo do cliente aparece de uma cor só (a página
-- pinta o desenho inteiro). Em logo de letras, como o da Nivee, fica bonito;
-- em logo ilustrado, como o tubarão da Shark Lub, vira uma silhueta. Esta
-- opção, ligada em Relatórios, mostra o logo como ele é.
--
-- Pode rodar de novo. Rode depois do 38.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.relatorios
  add column if not exists logo_cores boolean not null default false;

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
    'logoCores',   r.logo_cores,
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

notify pgrst, 'reload schema';
