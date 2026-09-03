-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 14. Agrupar dias em horário de Brasília
--
-- As views agrupavam por dia em UTC (criado_em::date). Resultado: o painel
-- "virava o dia" às 21h no Brasil (meia-noite UTC). Convertendo para
-- America/Sao_Paulo, o dia vira à meia-noite local, como esperado.
-- ═══════════════════════════════════════════════════════════════════

create or replace view public.leads_por_dia with (security_invoker = on) as
select project_id,
       campaign_id,
       (criado_em at time zone 'America/Sao_Paulo')::date as dia,
       count(*)                              as total,
       count(*) filter (where completo)      as completos
from public.leads
group by 1, 2, 3;

-- Funil: mesma lógica no casamento de abertura com o período da campanha.
create or replace view public.funil with (security_invoker = on) as
with abre as (
  select e.project_id,
         c.id as campaign_id,
         count(distinct e.session_id) as aberturas
  from public.lead_events e
  left join public.campaigns c
    on c.project_id = e.project_id
   and (e.criado_em at time zone 'America/Sao_Paulo')::date
         between coalesce(c.inicio, '-infinity'::date) and coalesce(c.fim, 'infinity'::date)
  where e.tipo = 'form_open'
  group by 1, 2
),
lds as (
  select project_id, campaign_id,
         count(*)                              as iniciaram,
         count(*) filter (where completo)      as completos,
         count(*) filter (where not completo)  as parciais
  from public.leads
  group by 1, 2
),
keys as (
  select project_id, campaign_id from abre
  union
  select project_id, campaign_id from lds
)
select
  k.project_id,
  k.campaign_id,
  coalesce(a.aberturas, 0) as aberturas,
  coalesce(l.iniciaram, 0) as iniciaram,
  coalesce(l.parciais, 0)  as parciais,
  coalesce(l.completos, 0) as completos,
  round(100.0 * coalesce(l.iniciaram, 0) / nullif(a.aberturas, 0), 1) as tx_engajamento,
  round(100.0 * coalesce(l.completos, 0) / nullif(l.iniciaram, 0), 1) as tx_conclusao,
  round(100.0 * coalesce(l.completos, 0) / nullif(a.aberturas, 0), 1) as tx_conversao
from keys k
left join abre a on a.project_id = k.project_id and a.campaign_id is not distinct from k.campaign_id
left join lds  l on l.project_id = k.project_id and l.campaign_id is not distinct from k.campaign_id;

grant select on public.leads_por_dia, public.funil to authenticated;
notify pgrst, 'reload schema';
