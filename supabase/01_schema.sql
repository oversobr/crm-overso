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
