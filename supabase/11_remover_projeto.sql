-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 11. Remover cliente (projeto) pelo painel
--
-- Ação destrutiva: apagar o projeto apaga em cascata TODOS os leads,
-- eventos, campanhas e vínculos dele (on delete cascade no schema).
-- Por isso é função própria, só para ADMIN do projeto, com checagem de
-- sessão manual (security definer ignora RLS).
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.remover_projeto(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if auth.uid() is null then
    raise exception 'precisa estar autenticado' using errcode = '42501';
  end if;

  -- Só admin do projeto remove. `is_admin` já existe (02_rls.sql).
  if not public.is_admin(p_project) then
    raise exception 'só um admin do projeto pode removê-lo' using errcode = '42501';
  end if;

  select nome into v_nome from public.projects where id = p_project;
  if v_nome is null then
    raise exception 'projeto não encontrado' using errcode = 'P0002';
  end if;

  -- O cascade cuida de leads, lead_events, campaigns, project_members e notes.
  delete from public.projects where id = p_project;

  return jsonb_build_object('ok', true, 'nome', v_nome);
end;
$$;

revoke all on function public.remover_projeto(uuid) from public, anon;
grant execute on function public.remover_projeto(uuid) to authenticated;
