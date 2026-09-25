-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 21. Ligar/desligar módulos por função
--
-- O painel alterava usa_crm/usa_conteudo com um UPDATE direto na tabela, e
-- a mudança não pegava: a linha voltava com o valor antigo. A tabela
-- projects tem privilégio por coluna (16) e RLS por cima, e o UPDATE direto
-- depende de tudo isso estar alinhado.
--
-- Como criar e remover cliente, ligar módulo passa a ser uma porta
-- controlada: a função checa quem chamou e grava como dona da tabela.
-- Rode depois do 20_modulos_cliente.sql.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.definir_modulos(
  p_project  uuid,
  p_crm      boolean default null,
  p_conteudo boolean default null
)
returns table(id uuid, usa_crm boolean, usa_conteudo boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'precisa estar autenticado' using errcode = '42501';
  end if;

  -- Mesma regra do cadastro de cliente: módulo é o que a OVERSO contrata
  -- com o cliente, então quem liga e desliga é a equipe OVERSO.
  if not public.pode_conectar() then
    raise exception 'apenas a equipe OVERSO liga ou desliga módulos' using errcode = '42501';
  end if;

  -- null = não mexer naquele módulo.
  update public.projects p
     set usa_crm      = coalesce(p_crm, p.usa_crm),
         usa_conteudo = coalesce(p_conteudo, p.usa_conteudo)
   where p.id = p_project;

  if not found then
    raise exception 'cliente não encontrado' using errcode = 'P0002';
  end if;

  return query
    select p.id, p.usa_crm, p.usa_conteudo from public.projects p where p.id = p_project;
end;
$$;

revoke all on function public.definir_modulos(uuid, boolean, boolean) from public, anon;
grant execute on function public.definir_modulos(uuid, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
