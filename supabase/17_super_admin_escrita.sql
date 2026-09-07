-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 17. Super-admin também ESCREVE
--
-- O 13_acesso_global deu ao super-admin visão de tudo, mas só mexeu nas
-- policies de leitura (leads_select, lead_events_select) e em campaigns_all.
-- As de escrita continuaram com a regra antiga, que exige vínculo explícito
-- em project_members:
--
--   leads_update    -> is_member(project_id)
--   leads_delete    -> is_admin(project_id)
--   notes_all       -> is_member(...) via lead
--   projects_update -> is_admin(id)
--
-- Efeito prático: o super-admin abre a página de um cliente, vê os leads,
-- clica em excluir... e nada acontece. E o pior — SEM ERRO. Um DELETE
-- barrado por RLS não falha: ele simplesmente casa com zero linhas e
-- retorna sucesso. O painel fechava o modal comemorando.
--
-- Aqui as quatro passam a aceitar super-admin, igual às de leitura.
-- ═══════════════════════════════════════════════════════════════════

-- ── Leads: alterar status ──────────────────────────────────────────
drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update to authenticated
  using (public.is_member(project_id) or public.is_super_admin())
  with check (public.is_member(project_id) or public.is_super_admin());

-- ── Leads: excluir ─────────────────────────────────────────────────
-- Continua sendo coisa de admin (membro comum não apaga lead), mas o
-- super-admin entra na conta sem precisar ser membro de cada página.
drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete to authenticated
  using (public.is_admin(project_id) or public.is_super_admin());

-- ── Anotações internas do lead ─────────────────────────────────────
drop policy if exists notes_all on public.lead_notes;
create policy notes_all on public.lead_notes
  for all to authenticated
  using (
    public.is_super_admin()
    or exists (select 1 from public.leads l where l.id = lead_id and public.is_member(l.project_id))
  )
  with check (
    public.is_super_admin()
    or exists (select 1 from public.leads l where l.id = lead_id and public.is_member(l.project_id))
  );

-- ── Renomear a página ──────────────────────────────────────────────
-- A tela Conectar edita o nome direto na tabela; sem isto o super-admin
-- também renomeava "com sucesso" sem nada mudar.
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects
  for update to authenticated
  using (public.is_admin(id) or public.is_super_admin())
  with check (public.is_admin(id) or public.is_super_admin());

-- ── Equipe: enxergar e gerenciar membros ───────────────────────────
-- As funções equipe_* já usavam pode_gerenciar (que inclui super-admin);
-- estas policies são o acesso direto à tabela, que ficou para trás.
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin(project_id) or public.is_super_admin());

drop policy if exists members_manage on public.project_members;
create policy members_manage on public.project_members
  for all to authenticated
  using (public.is_admin(project_id) or public.is_super_admin())
  with check (public.is_admin(project_id) or public.is_super_admin());

notify pgrst, 'reload schema';

-- ── Conferência ────────────────────────────────────────────────────
-- Lembre: no SQL Editor você é dono do banco e ignora RLS. Para valer,
-- finja ser você mesmo pela API (é o que o painel faz):
--
--   begin;
--   select set_config('request.jwt.claims',
--                     '{"sub":"SEU-UUID","role":"authenticated"}', true);
--   set local role authenticated;
--   -- num projeto de que você NÃO é membro:
--   delete from public.leads where id = 'UUID-DE-UM-LEAD' returning id;
--   rollback;   -- devolve 1 linha se a policy passou; 0 linhas se barrou
