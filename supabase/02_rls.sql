-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 02. RLS (quem enxerga o quê)
-- ═══════════════════════════════════════════════════════════════════

alter table public.projects        enable row level security;
alter table public.campaigns       enable row level security;
alter table public.leads           enable row level security;
alter table public.lead_events     enable row level security;
alter table public.project_members enable row level security;
alter table public.lead_notes      enable row level security;

-- security definer para não cair em recursão infinita: a policy de
-- project_members não pode consultar project_members via RLS.
create or replace function public.is_member(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members
    where user_id = auth.uid() and project_id = p_project
  );
$$;

create or replace function public.is_admin(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members
    where user_id = auth.uid() and project_id = p_project and papel = 'admin'
  );
$$;

-- ── Projetos ───────────────────────────────────────────────────────
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects
  for select to authenticated using (public.is_member(id));

-- A ingest_key é segredo de operação: só admin do projeto atualiza.
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated using (public.is_admin(id)) with check (public.is_admin(id));

-- ── Campanhas ──────────────────────────────────────────────────────
drop policy if exists campaigns_all on public.campaigns;
create policy campaigns_all on public.campaigns
  for all to authenticated
  using (public.is_member(project_id)) with check (public.is_member(project_id));

-- ── Leads ──────────────────────────────────────────────────────────
-- Repare que NÃO existe policy de INSERT para `authenticated`/`anon`:
-- lead só entra pela função capture_lead. Ninguém grava direto.
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated using (public.is_member(project_id));

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (public.is_member(project_id)) with check (public.is_member(project_id));

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete to authenticated using (public.is_admin(project_id));

-- ── Eventos ────────────────────────────────────────────────────────
drop policy if exists lead_events_select on public.lead_events;
create policy lead_events_select on public.lead_events
  for select to authenticated using (public.is_member(project_id));

-- ── Membros ────────────────────────────────────────────────────────
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members
  for select to authenticated using (user_id = auth.uid() or public.is_admin(project_id));

drop policy if exists members_manage on public.project_members;
create policy members_manage on public.project_members
  for all to authenticated
  using (public.is_admin(project_id)) with check (public.is_admin(project_id));

-- ── Anotações ──────────────────────────────────────────────────────
drop policy if exists notes_all on public.lead_notes;
create policy notes_all on public.lead_notes
  for all to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id and public.is_member(l.project_id)))
  with check (exists (select 1 from public.leads l where l.id = lead_id and public.is_member(l.project_id)));

-- ── Trava do anon ──────────────────────────────────────────────────
-- A anon key fica exposta no JS da LP. Aqui garantimos que ela não lê
-- absolutamente nada: o único poder dela é chamar capture_lead (03).
revoke all on public.projects, public.campaigns, public.leads,
              public.lead_events, public.project_members, public.lead_notes
  from anon;
