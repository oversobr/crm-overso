-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 13. Acesso global (ver todos os clientes)
--
-- Um usuário "global" (super-admin) enxerga TODAS as páginas sem precisar
-- ser vinculado a cada projeto. Só o super-admin pode conceder isso —
-- um admin de projeto NÃO pode tornar alguém global (evita vazamento entre
-- clientes).
-- ═══════════════════════════════════════════════════════════════════

-- Super-admin passa a ver todos os DADOS (não só a lista de projetos).
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (public.is_member(project_id) or public.is_super_admin());

drop policy if exists lead_events_select on public.lead_events;
create policy lead_events_select on public.lead_events
  for select to authenticated
  using (public.is_member(project_id) or public.is_super_admin());

drop policy if exists campaigns_all on public.campaigns;
create policy campaigns_all on public.campaigns
  for all to authenticated
  using (public.is_member(project_id) or public.is_super_admin())
  with check (public.is_member(project_id) or public.is_super_admin());

-- ── Conceder / revogar acesso global (só super-admin) ──────────────
create or replace function public.definir_global(p_email text, p_ativar boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.is_super_admin() then
    raise exception 'apenas o super-admin pode conceder acesso global' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Nenhuma conta com esse email. Crie a conta no Supabase primeiro.'
      using errcode = 'P0002';
  end if;
  if p_ativar then
    insert into public.super_admins (user_id) values (v_user) on conflict do nothing;
  else
    if v_user = auth.uid() then
      raise exception 'você não pode remover seu próprio acesso global' using errcode = '42501';
    end if;
    delete from public.super_admins where user_id = v_user;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.listar_globais()
returns table(user_id uuid, email text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'apenas o super-admin' using errcode = '42501';
  end if;
  return query
    select s.user_id, u.email::text
    from public.super_admins s
    join auth.users u on u.id = s.user_id
    order by u.email;
end;
$$;

revoke all on function public.definir_global(text, boolean) from anon;
revoke all on function public.listar_globais() from anon;
grant execute on function public.definir_global(text, boolean) to authenticated;
grant execute on function public.listar_globais() to authenticated;

notify pgrst, 'reload schema';
