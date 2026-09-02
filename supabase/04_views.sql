-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 04. Views de métrica
-- security_invoker = on faz o RLS das tabelas continuar valendo aqui.
-- ═══════════════════════════════════════════════════════════════════

-- ── Funil ──────────────────────────────────────────────────────────
-- O funil do painel antigo empilhava "parciais" e "completos" como se
-- fossem etapas em sequência — daí sair "711.8% de conversão". Eles são
-- desfechos irmãos da mesma abertura. A sequência real é:
--   abriu o form → começou a preencher → enviou
create or replace view public.funil with (security_invoker = on) as
with abre as (
  select e.project_id,
         c.id as campaign_id,
         count(distinct e.session_id) as aberturas
  from public.lead_events e
  left join public.campaigns c
    on c.project_id = e.project_id
   and e.criado_em::date between coalesce(c.inicio, '-infinity'::date)
                             and coalesce(c.fim,    'infinity'::date)
  where e.tipo = 'form_open'
  group by 1, 2
),
lds as (
  select project_id,
         campaign_id,
         count(*)                              as iniciaram,
         count(*) filter (where completo)      as completos,
         count(*) filter (where not completo)  as parciais
  from public.leads
  group by 1, 2
),
-- Chaves (projeto, campanha) das duas pontas. Substitui o FULL JOIN, que o
-- Postgres recusa quando a condição usa `is not distinct from` (erro 0A000).
keys as (
  select project_id, campaign_id from abre
  union
  select project_id, campaign_id from lds
)
select
  k.project_id,
  k.campaign_id,
  coalesce(a.aberturas, 0)               as aberturas,
  coalesce(l.iniciaram, 0)               as iniciaram,
  coalesce(l.parciais, 0)                as parciais,
  coalesce(l.completos, 0)               as completos,
  -- % de quem abriu e começou a preencher
  round(100.0 * coalesce(l.iniciaram, 0) / nullif(a.aberturas, 0), 1) as tx_engajamento,
  -- % de quem começou e terminou  (os 87,7% do seu print)
  round(100.0 * coalesce(l.completos, 0) / nullif(l.iniciaram, 0), 1) as tx_conclusao,
  -- % de quem abriu e virou lead completo — a conversão que importa
  round(100.0 * coalesce(l.completos, 0) / nullif(a.aberturas, 0), 1) as tx_conversao
from keys k
left join abre a on a.project_id = k.project_id and a.campaign_id is not distinct from k.campaign_id
left join lds  l on l.project_id = k.project_id and l.campaign_id is not distinct from k.campaign_id;

-- ── Série diária (gráfico "Leads — Últimos 7 dias") ────────────────
create or replace view public.leads_por_dia with (security_invoker = on) as
select project_id,
       campaign_id,
       criado_em::date                       as dia,
       count(*)                              as total,
       count(*) filter (where completo)      as completos
from public.leads
group by 1, 2, 3;

-- ── Origem dos leads (card "Principal Fonte") ──────────────────────
create or replace view public.leads_por_fonte with (security_invoker = on) as
select project_id,
       campaign_id,
       coalesce(nullif(utms->>'utm_source', ''), 'direto') as fonte,
       count(*) as total
from public.leads
group by 1, 2, 3;
