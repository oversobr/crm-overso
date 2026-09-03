-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 15. Campanha definida pela DATA do lead (todos os clientes)
--
-- Antes: a campanha era carimbada na captura. Lead anterior à campanha
-- ficava de fora, e não dava pra ter 2 campanhas no mês.
-- Agora: o lead pertence à campanha cujo período [inicio, fim] contém a
-- data dele (em horário de Brasília). Criar/editar/remover campanha
-- reassocia os leads automaticamente.
-- ═══════════════════════════════════════════════════════════════════

-- Qual campanha do projeto cobre esta data? (empate: início mais recente)
create or replace function public.campanha_da_data(p_project uuid, p_ts timestamptz)
returns uuid language sql stable set search_path = public as $$
  select c.id
  from public.campaigns c
  where c.project_id = p_project
    and (p_ts at time zone 'America/Sao_Paulo')::date
        between coalesce(c.inicio, '-infinity'::date) and coalesce(c.fim, 'infinity'::date)
  order by c.inicio desc nulls last
  limit 1;
$$;

-- Todo lead novo já entra na campanha certa pela data.
create or replace function public.leads_set_campanha()
returns trigger language plpgsql set search_path = public as $$
begin
  new.campaign_id := public.campanha_da_data(new.project_id, new.criado_em);
  return new;
end;
$$;
drop trigger if exists leads_campanha on public.leads;
create trigger leads_campanha before insert on public.leads
  for each row execute function public.leads_set_campanha();

-- Mexeu numa campanha (criou/editou/removeu) → reassocia os leads do projeto.
create or replace function public.campaigns_recalcular()
returns trigger language plpgsql set search_path = public as $$
declare pid uuid;
begin
  pid := coalesce(new.project_id, old.project_id);
  update public.leads l
     set campaign_id = public.campanha_da_data(l.project_id, l.criado_em)
   where l.project_id = pid;
  return null;
end;
$$;
drop trigger if exists campaigns_recalc on public.campaigns;
create trigger campaigns_recalc after insert or update or delete on public.campaigns
  for each row execute function public.campaigns_recalcular();

-- Backfill: aplica a regra a TODOS os leads já existentes, de todos os clientes.
update public.leads l
   set campaign_id = public.campanha_da_data(l.project_id, l.criado_em);

notify pgrst, 'reload schema';
