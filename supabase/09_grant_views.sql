-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 09. Permissão de leitura nas views de métrica
--
-- A tela Funil ficava vazia porque o papel `authenticated` (com o qual o
-- painel acessa a API) não tinha GRANT SELECT na view `funil`. Rodar como
-- admin no SQL Editor mascarava isso — o admin ignora grants. O Dashboard
-- também escondia, porque lê o funil com `?? 0` de reserva.
--
-- security_invoker = on nas views garante que o RLS das tabelas continua
-- valendo: cada usuário só enxerga os projetos de que é membro.
-- ═══════════════════════════════════════════════════════════════════

grant select on public.funil, public.leads_por_dia, public.leads_por_fonte to authenticated;

notify pgrst, 'reload schema';
