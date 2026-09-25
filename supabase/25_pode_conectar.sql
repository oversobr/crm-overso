-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 25. Garante a função pode_conectar()
--
-- pode_conectar() nasceu no 16_conectar_admin.sql, que não chegou a rodar
-- neste banco. As funções dos SQLs seguintes dependem dela para saber se
-- quem chamou é da equipe OVERSO:
--
--   projetos_gerenciaveis() (20)   lista de clientes da tela Clientes
--   criar_projeto()         (20/24) cadastrar cliente
--   definir_modulos()       (21/24) ligar/desligar módulos
--
-- Sem ela, cada uma falhava com "function public.pode_conectar() does not
-- exist". Aqui ela é criada sozinha, igual à do 16: equipe OVERSO =
-- super-admin (is_super_admin, do 12_equipe.sql). Pode rodar mais de uma vez.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.pode_conectar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin();
$$;

revoke all on function public.pode_conectar() from public, anon;
grant execute on function public.pode_conectar() to authenticated;

notify pgrst, 'reload schema';
