-- ═══════════════════════════════════════════════════════════
-- CRM OVERSO — setup completo (01 a 04)
-- Cole tudo isto no SQL Editor do Supabase e rode uma vez.
-- ═══════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 01. Schema
-- Rode os arquivos na ordem: 01 → 02 → 03 → 04
-- ═══════════════════════════════════════════════════════════════════

-- ── Projetos ───────────────────────────────────────────────────────
-- Um projeto = uma landing page / cliente. É o que "vincula" a página
-- ao CRM: a LP guarda a ingest_key e todo lead dela cai aqui dentro.
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  slug        text not null unique,
  -- Chave pública da página. Vai no JS da LP, então é visível — por isso
  -- ela NÃO dá leitura de nada: só permite gravar lead neste projeto.
  ingest_key  text not null unique default encode(gen_random_bytes(16), 'hex'),
  criado_em   timestamptz not null default now()
);

-- ── Campanhas ──────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  nome        text not null,
  inicio      date,
  fim         date,
  meta_leads  integer,
  criado_em   timestamptz not null default now()
);

-- ── Leads ──────────────────────────────────────────────────────────
create table if not exists public.leads (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  campaign_id   uuid references public.campaigns(id) on delete set null,

  -- Gerado no navegador na abertura do form. É a chave que faz o lead
  -- parcial VIRAR o lead completo em vez de criar uma segunda linha.
  session_id    text not null,

  -- Promovidos a coluna porque a tabela busca/ordena/exporta por eles.
  nome          text,
  email         text,
  whatsapp      text,

  -- O formulário inteiro, com o formato que a LP quiser. É isto que
  -- permite página nova sem migration: "Profissão" numa LP e "Curso"
  -- noutra convivem aqui sem o banco precisar conhecer nenhuma das duas.
  respostas     jsonb not null default '{}'::jsonb,
  utms          jsonb not null default '{}'::jsonb,

  origem        text,
  status        text not null default 'novo'
                check (status in ('novo','contato_feito','entrou_no_grupo','convertido','perdido')),
  -- false = preencheu e abandonou. true = enviou.
  completo      boolean not null default false,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  completado_em timestamptz,

  -- O upsert do lead parcial → completo se apoia nesta constraint.
  unique (project_id, session_id)
);

create index if not exists leads_project_criado_idx on public.leads (project_id, criado_em desc);
create index if not exists leads_campaign_idx       on public.leads (campaign_id);
create index if not exists leads_status_idx         on public.leads (project_id, status);
create index if not exists leads_whatsapp_idx       on public.leads (project_id, whatsapp);
-- Busca dentro das respostas dinâmicas sem precisar saber os campos.
create index if not exists leads_respostas_idx      on public.leads using gin (respostas);

-- ── Eventos ────────────────────────────────────────────────────────
-- Guarda por session_id (não por lead_id) de propósito: a "abertura de
-- formulário" acontece antes de existir lead, e são justamente essas
-- 1.402 aberturas que formam o topo do funil.
create table if not exists public.lead_events (
  id         bigserial primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  session_id text not null,
  tipo       text not null check (tipo in ('form_open','partial','complete')),
  payload    jsonb not null default '{}'::jsonb,
  criado_em  timestamptz not null default now()
);

create index if not exists lead_events_project_tipo_idx on public.lead_events (project_id, tipo, criado_em desc);
create unique index if not exists lead_events_open_unico_idx
  on public.lead_events (project_id, session_id) where tipo = 'form_open';

-- ── Acesso ao painel ───────────────────────────────────────────────
create table if not exists public.project_members (
  user_id    uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  papel      text not null default 'membro' check (papel in ('admin','membro')),
  primary key (user_id, project_id)
);

-- ── Anotações internas do lead ─────────────────────────────────────
create table if not exists public.lead_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  texto      text not null,
  criado_em  timestamptz not null default now()
);

-- atualizado_em automático
create or replace function public.touch_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists leads_touch on public.leads;
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_atualizado_em();

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

-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 03. Captura (substitui o Google Apps Script)
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.capture_lead(
  p_key     text,                        -- ingest_key do projeto
  p_session text,                        -- id de sessão gerado na LP
  p_evento  text,                        -- 'form_open' | 'partial' | 'complete'
  p_dados   jsonb default '{}'::jsonb,   -- o formulário inteiro, formato livre
  p_utms    jsonb default '{}'::jsonb,
  p_origem  text  default null
)
returns jsonb
language plpgsql
security definer                          -- roda com poder de dono: por isso o anon
set search_path = public                  -- não precisa (nem tem) acesso às tabelas
as $$
declare
  v_project  uuid;
  v_campaign uuid;
  v_lead     uuid;
  v_nome     text;
  v_email    text;
  v_whats    text;
begin
  -- 1. A chave é o que autoriza. Chave inválida não grava nada.
  select id into v_project from public.projects where ingest_key = p_key;
  if v_project is null then
    raise exception 'chave de captura inválida' using errcode = '42501';
  end if;

  if p_session is null or length(p_session) not between 8 and 128 then
    raise exception 'sessão inválida' using errcode = '22023';
  end if;

  -- Teto de payload: a chave é pública, então limitamos o estrago
  -- possível de alguém que resolva abusar do endpoint.
  if pg_column_size(p_dados) > 64000 then
    raise exception 'payload muito grande' using errcode = '22023';
  end if;

  -- 2. Registra o evento bruto. O form_open é o topo do funil.
  insert into public.lead_events (project_id, session_id, tipo, payload)
  values (v_project, p_session, p_evento, coalesce(p_dados, '{}'::jsonb))
  on conflict do nothing;

  -- Abertura ainda não é lead — sai aqui.
  if p_evento = 'form_open' then
    return jsonb_build_object('ok', true, 'lead_id', null);
  end if;

  -- 3. Campanha ativa que cobre hoje, se houver.
  select c.id into v_campaign
  from public.campaigns c
  where c.project_id = v_project
    and (c.inicio is null or c.inicio <= current_date)
    and (c.fim    is null or c.fim    >= current_date)
  order by c.inicio desc nulls last
  limit 1;

  -- 4. Campos que a tabela do painel busca e ordena. Aceita os nomes
  --    mais comuns para a LP não precisar se adaptar ao CRM.
  v_nome  := nullif(trim(coalesce(p_dados->>'nome', p_dados->>'name',
                                  p_dados->>'nome_completo', p_dados->>'fullName')), '');
  v_email := nullif(lower(trim(coalesce(p_dados->>'email', p_dados->>'e-mail'))), '');
  v_whats := nullif(regexp_replace(coalesce(p_dados->>'whatsapp', p_dados->>'telefone',
                                            p_dados->>'phone', p_dados->>'celular', ''),
                                   '\D', '', 'g'), '');

  -- 5. O upsert. É aqui que o lead parcial vira completo em vez de
  --    virar uma segunda linha — a constraint (project_id, session_id).
  insert into public.leads as l
    (project_id, campaign_id, session_id, nome, email, whatsapp,
     respostas, utms, origem, completo, completado_em)
  values
    (v_project, v_campaign, p_session, v_nome, v_email, v_whats,
     coalesce(p_dados, '{}'::jsonb), coalesce(p_utms, '{}'::jsonb), p_origem,
     p_evento = 'complete',
     case when p_evento = 'complete' then now() end)
  on conflict (project_id, session_id) do update set
    -- Mescla: o que chegou depois soma ao que já existia, não apaga.
    respostas     = l.respostas || excluded.respostas,
    utms          = case when l.utms = '{}'::jsonb then excluded.utms else l.utms end,
    nome          = coalesce(excluded.nome,  l.nome),
    email         = coalesce(excluded.email, l.email),
    whatsapp      = coalesce(excluded.whatsapp, l.whatsapp),
    campaign_id   = coalesce(l.campaign_id, excluded.campaign_id),
    -- Uma vez completo, nunca volta a parcial.
    completo      = l.completo or excluded.completo,
    completado_em = coalesce(l.completado_em, excluded.completado_em)
  returning l.id into v_lead;

  return jsonb_build_object('ok', true, 'lead_id', v_lead);
end;
$$;

-- O anon só ganha ISTO. Nenhuma tabela, nenhuma leitura.
revoke all on function public.capture_lead(text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.capture_lead(text,text,text,jsonb,jsonb,text) to anon, authenticated;

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
)
select
  coalesce(a.project_id, l.project_id)   as project_id,
  coalesce(a.campaign_id, l.campaign_id) as campaign_id,
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
from abre a
full outer join lds l
  on a.project_id = l.project_id
 and a.campaign_id is not distinct from l.campaign_id;

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

