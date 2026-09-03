-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 12. Super-admin + gestão de equipe
--
-- Conceito: uma conta "dona" (super-admin) que enxerga todos os projetos e
-- controla quem tem acesso a quê. Acima dos papéis por projeto (admin/membro).
-- Criar a CONTA em si continua no dashboard do Supabase; aqui cuidamos de
-- hierarquia e visibilidade (o que é repetitivo).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.super_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.super_admins enable row level security;
-- Ninguém lê/escreve direto; só as funções abaixo (security definer) usam.
revoke all on public.super_admins from anon, authenticated;

-- Você é o super-admin.
insert into public.super_admins (user_id)
select id from auth.users where email = 'jose.silvajunior0131@gmail.com'
on conflict do nothing;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.super_admins where user_id = auth.uid());
$$;

-- Super-admin enxerga TODOS os projetos (não só os de que é membro).
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated
  using (public.is_member(id) or public.is_super_admin());

-- ── Quem pode gerenciar a equipe de um projeto ─────────────────────
create or replace function public.pode_gerenciar(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or public.is_admin(p_project);
$$;

-- ── Listar membros de um projeto (com email) ───────────────────────
create or replace function public.equipe_membros(p_project uuid)
returns table(user_id uuid, email text, papel text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_gerenciar(p_project) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.papel
    from public.project_members m
    join auth.users u on u.id = m.user_id
    where m.project_id = p_project
    order by (m.papel = 'admin') desc, u.email;
end;
$$;

-- ── Conceder acesso a um usuário (por email) ───────────────────────
create or replace function public.equipe_conceder(p_email text, p_project uuid, p_papel text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  if not public.pode_gerenciar(p_project) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  if p_papel not in ('admin', 'membro') then
    raise exception 'papel inválido' using errcode = '22023';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(p_email));
  if v_user is null then
    raise exception 'Nenhuma conta com esse email. Crie a conta no Supabase primeiro.'
      using errcode = 'P0002';
  end if;
  insert into public.project_members (user_id, project_id, papel)
  values (v_user, p_project, p_papel)
  on conflict (user_id, project_id) do update set papel = excluded.papel;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Revogar acesso ─────────────────────────────────────────────────
create or replace function public.equipe_revogar(p_user uuid, p_project uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_gerenciar(p_project) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  -- Não deixa remover o último admin do projeto (evita projeto órfão).
  if (select papel from public.project_members where user_id = p_user and project_id = p_project) = 'admin'
     and (select count(*) from public.project_members where project_id = p_project and papel = 'admin') <= 1
  then
    raise exception 'não é possível remover o último admin do projeto' using errcode = '42501';
  end if;
  delete from public.project_members where user_id = p_user and project_id = p_project;
  return jsonb_build_object('ok', true);
end;
$$;

-- Grants: só usuário logado; as funções fazem a checagem fina por dentro.
revoke all on function public.is_super_admin() from anon;
revoke all on function public.pode_gerenciar(uuid) from anon;
revoke all on function public.equipe_membros(uuid) from anon;
revoke all on function public.equipe_conceder(text, uuid, text) from anon;
revoke all on function public.equipe_revogar(uuid, uuid) from anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.pode_gerenciar(uuid) to authenticated;
grant execute on function public.equipe_membros(uuid) to authenticated;
grant execute on function public.equipe_conceder(text, uuid, text) to authenticated;
grant execute on function public.equipe_revogar(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
