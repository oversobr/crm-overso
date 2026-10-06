-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 30. O que o portal novo precisa do banco
--
-- As telas novas foram feitas para funcionar com o banco como estava, e
-- cada uma deixou para depois o que dependia de coluna ou função nova.
-- Este arquivo entrega tudo de uma vez:
--
--   1. Campanha: cor, investimento, regra (data ou UTM) e landing pages,
--      e o lead passa a entrar na campanha respeitando a regra.
--   2. Landing pages do cliente, contadas no banco.
--   3. Leads: busca dentro das respostas, campo em que o parcial parou e
--      nome de quem escreveu cada anotação.
--   4. Posts: desde quando esperam aprovação, quem aprovou e quando; e
--      se o comentário é da OVERSO ou do cliente.
--   5. Cliente: segmento, quem editou a ficha, nome das pessoas com acesso.
--   6. Notificações lidas, avisos desligados e último acesso por cliente,
--      guardados por conta (hoje ficam só no navegador).
--   7. Resumos prontos para o Dashboard, Escolher cliente e Clientes.
--
-- Pode rodar inteiro de uma vez e pode rodar de novo: nada aqui apaga dado.
-- Rode depois do 29_logo_cliente.sql.
-- ═══════════════════════════════════════════════════════════════════

-- Nome de exibição de uma conta, como nos comentários (22): o nome do
-- cadastro ou, na falta, o começo do email. Só as funções daqui usam; o
-- painel não chama direto, senão qualquer conta leria o nome de qualquer outra.
create or replace function public.nome_do_usuario(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(u.raw_user_meta_data->>'full_name', ''),
    nullif(u.raw_user_meta_data->>'name', ''),
    split_part(coalesce(u.email, ''), '@', 1)
  )
  from auth.users u where u.id = p_user;
$$;
revoke all on function public.nome_do_usuario(uuid) from public, anon, authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 1. CAMPANHAS
-- ═══════════════════════════════════════════════════════════════════

alter table public.campaigns
  add column if not exists cor           text,
  add column if not exists investimento  numeric(12, 2),
  -- 'data': todo lead do período. 'utm': só os que chegam com o utm_campaign.
  add column if not exists regra         text not null default 'data',
  add column if not exists utm_campaign  text,
  -- Endereços (domínio + caminho, sem UTMs). Vazio ou nulo = todas as páginas.
  add column if not exists landing_pages text[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'campaigns_regra_valida') then
    alter table public.campaigns
      add constraint campaigns_regra_valida check (regra in ('data', 'utm'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaigns_cor_valida') then
    alter table public.campaigns
      add constraint campaigns_cor_valida check (cor is null or cor ~ '^#[0-9A-Fa-f]{6}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaigns_investimento_valido') then
    alter table public.campaigns
      add constraint campaigns_investimento_valido check (investimento is null or investimento >= 0);
  end if;
end $$;

-- "https://www.site.com.br/lp/bio/?utm_source=x" vira "site.com.br/lp/bio".
-- É o mesmo recorte que o painel faz para listar as páginas, e é por ele
-- que a campanha reconhece a landing page do lead.
create or replace function public.pagina_da_origem(p_origem text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(trim(p_origem), '[?#].*$', ''),
          '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''),
        '^www\.', '', 'i'),
      '/+$', ''),
    '');
$$;

-- De qual campanha é este lead? Além do período (15), agora contam a regra
-- por UTM e as landing pages. No empate ganha a mais específica: a que
-- exige UTM, depois a que restringe páginas, depois a de início mais recente.
create or replace function public.campanha_do_lead(
  p_project uuid, p_ts timestamptz, p_utms jsonb, p_origem text
)
returns uuid language sql stable set search_path = public as $$
  select c.id
  from public.campaigns c
  where c.project_id = p_project
    and (p_ts at time zone 'America/Sao_Paulo')::date
        between coalesce(c.inicio, '-infinity'::date) and coalesce(c.fim, 'infinity'::date)
    and (
      c.regra <> 'utm'
      or lower(coalesce(p_utms->>'utm_campaign', '')) = lower(coalesce(c.utm_campaign, ''))
    )
    and (
      coalesce(cardinality(c.landing_pages), 0) = 0
      or lower(public.pagina_da_origem(p_origem)) in (select lower(lp) from unnest(c.landing_pages) as lp)
    )
  order by (c.regra = 'utm') desc,
           (coalesce(cardinality(c.landing_pages), 0) > 0) desc,
           c.inicio desc nulls last
  limit 1;
$$;

create or replace function public.leads_set_campanha()
returns trigger language plpgsql set search_path = public as $$
begin
  new.campaign_id := public.campanha_do_lead(new.project_id, new.criado_em, new.utms, new.origem);
  return new;
end;
$$;
drop trigger if exists leads_campanha on public.leads;
create trigger leads_campanha before insert on public.leads
  for each row execute function public.leads_set_campanha();

-- Mexeu numa campanha (criou, editou ou removeu): reassocia os leads do cliente.
create or replace function public.campaigns_recalcular()
returns trigger language plpgsql set search_path = public as $$
declare pid uuid;
begin
  pid := coalesce(new.project_id, old.project_id);
  update public.leads l
     set campaign_id = public.campanha_do_lead(l.project_id, l.criado_em, l.utms, l.origem)
   where l.project_id = pid
     and l.campaign_id is distinct from public.campanha_do_lead(l.project_id, l.criado_em, l.utms, l.origem);
  return null;
end;
$$;
drop trigger if exists campaigns_recalc on public.campaigns;
create trigger campaigns_recalc after insert or update or delete on public.campaigns
  for each row execute function public.campaigns_recalcular();


-- ═══════════════════════════════════════════════════════════════════
-- 2. LANDING PAGES DO CLIENTE
-- ═══════════════════════════════════════════════════════════════════

-- As páginas que mandaram lead nos últimos p_dias dias, da mais movimentada
-- para a menos. Roda com a permissão de quem chama: a RLS de leads decide.
create or replace function public.landing_pages_do_cliente(p_project uuid, p_dias integer default 30)
returns table(endereco text, leads bigint, ultimo_lead timestamptz)
language sql stable set search_path = public as $$
  select public.pagina_da_origem(l.origem), count(*), max(l.criado_em)
  from public.leads l
  where l.project_id = p_project
    and public.pagina_da_origem(l.origem) is not null
    and l.criado_em >= now() - make_interval(days => greatest(coalesce(p_dias, 30), 1))
  group by 1
  order by 2 desc, 1;
$$;
revoke all on function public.landing_pages_do_cliente(uuid, integer) from public, anon;
grant execute on function public.landing_pages_do_cliente(uuid, integer) to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 3. LEADS
-- ═══════════════════════════════════════════════════════════════════

alter table public.leads
  -- Os valores das respostas num texto só: é onde a busca da tela procura.
  add column if not exists respostas_texto text,
  -- Último campo preenchido antes de o lead abandonar o formulário.
  add column if not exists parou_em        text;

create or replace function public.leads_derivados()
returns trigger language plpgsql set search_path = public as $$
declare v_campo text;
begin
  if jsonb_typeof(new.respostas) = 'object' then
    select string_agg(t.value, ' ') into new.respostas_texto
    from jsonb_each_text(new.respostas) as t;

    -- O campo novo desta gravação é onde a pessoa estava. Na primeira
    -- gravação só dá para saber quando veio um campo só: o jsonb não
    -- guarda a ordem em que os campos foram preenchidos.
    if tg_op = 'INSERT' then
      if (select count(*) from jsonb_object_keys(new.respostas)) = 1 then
        select k into v_campo from jsonb_object_keys(new.respostas) as k;
      end if;
    else
      select k into v_campo
      from jsonb_object_keys(new.respostas) as k
      where jsonb_typeof(old.respostas) <> 'object' or not (old.respostas ? k)
      limit 1;
    end if;
    if v_campo is not null then
      new.parou_em := v_campo;
    end if;
  end if;
  -- Quem enviou não parou em lugar nenhum.
  if new.completo then
    new.parou_em := null;
  end if;
  return new;
end;
$$;
drop trigger if exists leads_derivados on public.leads;
create trigger leads_derivados before insert or update on public.leads
  for each row execute function public.leads_derivados();

-- Quem escreveu a anotação. O nome é gravado pelo banco, a partir da sessão.
alter table public.lead_notes
  add column if not exists autor_nome text;

create or replace function public.preencher_autor_nota()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.user_id    := auth.uid();
    new.autor_nome := public.nome_do_usuario(auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists lead_notes_autor on public.lead_notes;
create trigger lead_notes_autor before insert on public.lead_notes
  for each row execute function public.preencher_autor_nota();

update public.lead_notes n
   set autor_nome = public.nome_do_usuario(n.user_id)
 where n.autor_nome is null and n.user_id is not null;

-- Leads que já existem: campanha pela regra nova e o texto de busca.
-- O gatilho leads_touch fica desligado durante o acerto, senão todo lead
-- sairia daqui com "atualizado agora".
alter table public.leads disable trigger leads_touch;
update public.leads l
   set campaign_id = public.campanha_do_lead(l.project_id, l.criado_em, l.utms, l.origem);
alter table public.leads enable trigger leads_touch;


-- ═══════════════════════════════════════════════════════════════════
-- 4. POSTS: APROVAÇÃO E PAPEL DE QUEM COMENTA
-- ═══════════════════════════════════════════════════════════════════

alter table public.conteudos
  add column if not exists em_aprovacao_desde timestamptz,
  add column if not exists aprovado_em        timestamptz,
  add column if not exists aprovado_por       uuid references auth.users(id) on delete set null,
  add column if not exists aprovado_por_nome  text;

-- O banco carimba a aprovação pela mudança de status: entrou em "aprovacao"
-- começa a contar; saiu de "aprovacao" para "agendado" ou "publicado" foi
-- aprovado por quem fez a mudança; voltou para antes, a aprovação cai.
create or replace function public.conteudos_aprovacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_antes text;
begin
  if tg_op = 'UPDATE' then
    v_antes := old.status;
  end if;
  if new.status is not distinct from v_antes then
    return new;
  end if;

  if new.status = 'aprovacao' then
    new.em_aprovacao_desde := now();
    new.aprovado_em := null;
    new.aprovado_por := null;
    new.aprovado_por_nome := null;
  elsif new.status in ('agendado', 'publicado') then
    if v_antes = 'aprovacao' then
      new.aprovado_em := now();
      new.aprovado_por := auth.uid();
      new.aprovado_por_nome := public.nome_do_usuario(auth.uid());
    end if;
  else
    new.em_aprovacao_desde := null;
    new.aprovado_em := null;
    new.aprovado_por := null;
    new.aprovado_por_nome := null;
  end if;
  return new;
end;
$$;
drop trigger if exists conteudos_aprovacao on public.conteudos;
create trigger conteudos_aprovacao before insert or update on public.conteudos
  for each row execute function public.conteudos_aprovacao();

-- Posts que já estão esperando: vale a data da última alteração.
alter table public.conteudos disable trigger conteudos_atualizado_em;
update public.conteudos
   set em_aprovacao_desde = atualizado_em
 where status = 'aprovacao' and em_aprovacao_desde is null;
alter table public.conteudos enable trigger conteudos_atualizado_em;

-- Comentário da OVERSO ou do cliente. OVERSO = conta com acesso global (13).
alter table public.conteudo_comentarios
  add column if not exists autor_papel text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'conteudo_comentarios_papel_valido') then
    alter table public.conteudo_comentarios
      add constraint conteudo_comentarios_papel_valido
      check (autor_papel is null or autor_papel in ('overso', 'cliente'));
  end if;
end $$;

-- A mesma função do 22, com o papel a mais.
create or replace function public.preencher_comentario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_meta  jsonb;
begin
  select u.email, u.raw_user_meta_data into v_email, v_meta
  from auth.users u where u.id = auth.uid();

  new.autor_id    := auth.uid();
  new.autor_email := coalesce(v_email, '');
  new.autor_nome  := coalesce(
    nullif(v_meta->>'full_name', ''),
    nullif(v_meta->>'name', ''),
    split_part(coalesce(v_email, ''), '@', 1)
  );
  new.autor_papel := case when public.is_super_admin() then 'overso' else 'cliente' end;

  -- O cliente é sempre o do conteúdo: a policy confere o acesso a ele.
  select c.project_id into new.project_id from public.conteudos c where c.id = new.conteudo_id;
  new.criado_em := now();
  return new;
end;
$$;

update public.conteudo_comentarios c
   set autor_papel = case
         when exists (select 1 from public.super_admins s where s.user_id = c.autor_id) then 'overso'
         else 'cliente'
       end
 where c.autor_papel is null and c.autor_id is not null;


-- ═══════════════════════════════════════════════════════════════════
-- 5. CLIENTE: SEGMENTO, QUEM EDITOU E NOME DAS PESSOAS
-- ═══════════════════════════════════════════════════════════════════

alter table public.projects
  add column if not exists segmento           text,   -- "Estética", "Odontologia"…
  add column if not exists atualizado_por_nome text;  -- quem mexeu na ficha por último

-- ⚠️ A migration 16 fechou o SELECT de projects numa lista de colunas.
-- Coluna nova precisa entrar aqui, senão o painel toma "permission denied".
grant select (segmento, atualizado_por_nome) on public.projects to authenticated;

-- Só conta como edição da ficha o que é da ficha: ligar módulo ou trocar
-- logo não muda o "editado por".
create or replace function public.projects_quem_editou()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.nome, new.segmento, new.contato_nome, new.contato_email,
          new.contato_telefone, new.observacoes, new.links)
         is distinct from
         (old.nome, old.segmento, old.contato_nome, old.contato_email,
          old.contato_telefone, old.observacoes, old.links)
  then
    new.atualizado_por_nome := public.nome_do_usuario(auth.uid());
  end if;
  return new;
end;
$$;
drop trigger if exists projects_quem_editou on public.projects;
create trigger projects_quem_editou before update on public.projects
  for each row execute function public.projects_quem_editou();

-- As duas listas de pessoas passam a devolver o nome. Mudar o retorno de
-- uma função exige tirar e pôr de volta.
drop function if exists public.equipe_membros(uuid);
create function public.equipe_membros(p_project uuid)
returns table(user_id uuid, email text, papel text, nome text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_gerenciar(p_project) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.papel, public.nome_do_usuario(m.user_id)
    from public.project_members m
    join auth.users u on u.id = m.user_id
    where m.project_id = p_project
    order by (m.papel = 'admin') desc, u.email;
end;
$$;
revoke all on function public.equipe_membros(uuid) from public, anon;
grant execute on function public.equipe_membros(uuid) to authenticated;

drop function if exists public.listar_globais();
create function public.listar_globais()
returns table(user_id uuid, email text, nome text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_super_admin() then
    raise exception 'apenas o super-admin' using errcode = '42501';
  end if;
  return query
    select s.user_id, u.email::text, public.nome_do_usuario(s.user_id)
    from public.super_admins s
    join auth.users u on u.id = s.user_id
    order by u.email;
end;
$$;
revoke all on function public.listar_globais() from public, anon;
grant execute on function public.listar_globais() to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 6. O QUE É DE CADA CONTA: LIDAS, AVISOS E ÚLTIMO ACESSO
-- ═══════════════════════════════════════════════════════════════════

-- As notificações continuam sendo calculadas na tela (lead novo, post
-- esperando…). O que vai para o banco é o que a pessoa já leu, para valer
-- no celular e no computador ao mesmo tempo.
create table if not exists public.notificacoes_lidas (
  user_id  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  chave    text not null check (length(chave) between 1 and 200),
  lida_em  timestamptz not null default now(),
  primary key (user_id, chave)
);

create table if not exists public.preferencias_usuario (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  -- Tipos de aviso que a pessoa desligou: novo, parado, parcial, arte…
  avisos_desligados text[] not null default '{}',
  atualizado_em     timestamptz not null default now()
);

-- Quando cada pessoa abriu cada cliente pela última vez.
create table if not exists public.acessos_cliente (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  ultimo_em  timestamptz not null default now(),
  primary key (user_id, project_id)
);

alter table public.notificacoes_lidas   enable row level security;
alter table public.preferencias_usuario enable row level security;
alter table public.acessos_cliente      enable row level security;

-- Cada conta só enxerga e só grava as próprias linhas.
drop policy if exists notificacoes_lidas_proprias on public.notificacoes_lidas;
create policy notificacoes_lidas_proprias on public.notificacoes_lidas
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists preferencias_proprias on public.preferencias_usuario;
create policy preferencias_proprias on public.preferencias_usuario
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists acessos_proprios on public.acessos_cliente;
create policy acessos_proprios on public.acessos_cliente
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (public.is_member(project_id) or public.is_super_admin()));

revoke all on public.notificacoes_lidas, public.preferencias_usuario, public.acessos_cliente from anon;
grant select, insert, update, delete
  on public.notificacoes_lidas, public.preferencias_usuario, public.acessos_cliente
  to authenticated;


-- ═══════════════════════════════════════════════════════════════════
-- 7. RESUMOS PRONTOS
-- ═══════════════════════════════════════════════════════════════════

-- Funil do formulário e leads por status entre dois dias de Brasília
-- (inclusive). O Dashboard fazia sete contagens para montar isto; agora é
-- uma chamada. Ponta nula = sem limite daquele lado.
create or replace function public.resumo_periodo(p_project uuid, p_de date, p_ate date)
returns jsonb language sql stable set search_path = public as $$
  with janela as (
    select
      case when p_de  is null then '-infinity'::timestamptz
           else p_de::timestamp at time zone 'America/Sao_Paulo' end as ini,
      case when p_ate is null then 'infinity'::timestamptz
           else (p_ate + 1)::timestamp at time zone 'America/Sao_Paulo' end as fim
  )
  select jsonb_build_object(
    'aberturas', (
      select count(*) from public.lead_events e, janela j
      where e.project_id = p_project and e.tipo = 'form_open'
        and e.criado_em >= j.ini and e.criado_em < j.fim
    ),
    'iniciaram', (
      select count(*) from public.leads l, janela j
      where l.project_id = p_project
        and l.criado_em >= j.ini and l.criado_em < j.fim
    ),
    'por_status', (
      select coalesce(jsonb_object_agg(s.status, s.total), '{}'::jsonb)
      from (
        select l.status, count(*) as total
        from public.leads l, janela j
        where l.project_id = p_project and l.completo
          and l.criado_em >= j.ini and l.criado_em < j.fim
        group by l.status
      ) s
    )
  );
$$;
revoke all on function public.resumo_periodo(uuid, date, date) from public, anon;
grant execute on function public.resumo_periodo(uuid, date, date) to authenticated;

-- Uma linha por cliente que a conta enxerga, com o que as telas Escolher
-- cliente e Clientes mostram em cada card. Roda com a permissão de quem
-- chama: a RLS de cada tabela decide o que entra na conta.
create or replace function public.resumo_dos_clientes()
returns table(
  project_id          uuid,
  criado_em           timestamptz,
  leads_30_dias       bigint,
  leads_novos         bigint,
  posts_para_aprovar  bigint,
  posts_hoje_sem_arte bigint
)
language sql stable set search_path = public as $$
  select
    p.id,
    p.criado_em,
    (select count(*) from public.leads l
      where l.project_id = p.id and l.criado_em >= now() - interval '30 days'),
    (select count(*) from public.leads l
      where l.project_id = p.id and l.completo and l.status = 'novo'),
    (select count(*) from public.conteudos c
      where c.project_id = p.id and c.status = 'aprovacao'),
    (select count(*) from public.conteudos c
      where c.project_id = p.id and c.status = 'agendado'
        and c.data = (now() at time zone 'America/Sao_Paulo')::date
        and coalesce(cardinality(c.midias), 0) = 0)
  from public.projects p;
$$;
revoke all on function public.resumo_dos_clientes() from public, anon;
grant execute on function public.resumo_dos_clientes() to authenticated;

notify pgrst, 'reload schema';

-- ── Conferência ────────────────────────────────────────────────────
-- No SQL Editor você é dono do banco e ignora RLS. Para ver o que o painel
-- vê, finja ser uma conta de verdade:
--
--   begin;
--   select set_config('request.jwt.claims',
--                     '{"sub":"SEU-UUID","role":"authenticated"}', true);
--   set local role authenticated;
--   select * from public.resumo_dos_clientes();
--   select public.resumo_periodo('UUID-DO-CLIENTE', current_date - 29, current_date);
--   select * from public.landing_pages_do_cliente('UUID-DO-CLIENTE');
--   rollback;
