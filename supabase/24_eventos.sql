-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 24. Eventos
--
-- Um cliente pode organizar vários eventos ao mesmo tempo, e cada um tem
-- demandas, materiais e divulgação próprios. Estrutura:
--
--   eventos            o evento em si (data, local, briefing, status)
--   evento_demandas    as tarefas, num quadro Kanban
--   evento_materiais   arquivos (bucket privado "eventos") e links
--   conteudos.evento_id  post do Calendário ligado à divulgação do evento
--
-- "Eventos" vira um terceiro módulo por cliente (como CRM e Conteúdo) e
-- nasce DESLIGADO: só aparece ativo para quem a OVERSO ligar.
-- Rode depois do 23_conteudo_autor.sql.
-- ═══════════════════════════════════════════════════════════════════

-- ── Módulo ─────────────────────────────────────────────────────────
alter table public.projects
  add column if not exists usa_eventos boolean not null default false;

grant select (usa_eventos) on public.projects to authenticated;

alter table public.projects drop constraint if exists projects_algum_modulo;
alter table public.projects
  add constraint projects_algum_modulo check (usa_crm or usa_conteudo or usa_eventos);

-- Liga/desliga módulos (21), agora com eventos. Troca a assinatura.
drop function if exists public.definir_modulos(uuid, boolean, boolean);
create or replace function public.definir_modulos(
  p_project  uuid,
  p_crm      boolean default null,
  p_conteudo boolean default null,
  p_eventos  boolean default null
)
returns table(id uuid, usa_crm boolean, usa_conteudo boolean, usa_eventos boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'precisa estar autenticado' using errcode = '42501';
  end if;
  if not public.pode_conectar() then
    raise exception 'apenas a equipe OVERSO liga ou desliga módulos' using errcode = '42501';
  end if;

  update public.projects p
     set usa_crm      = coalesce(p_crm, p.usa_crm),
         usa_conteudo = coalesce(p_conteudo, p.usa_conteudo),
         usa_eventos  = coalesce(p_eventos, p.usa_eventos)
   where p.id = p_project;

  if not found then
    raise exception 'cliente não encontrado' using errcode = 'P0002';
  end if;

  return query
    select p.id, p.usa_crm, p.usa_conteudo, p.usa_eventos from public.projects p where p.id = p_project;
end;
$$;

revoke all on function public.definir_modulos(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.definir_modulos(uuid, boolean, boolean, boolean) to authenticated;

-- Criar cliente (20), agora com eventos. Troca a assinatura.
drop function if exists public.criar_projeto(text, text, boolean, boolean);
create or replace function public.criar_projeto(
  p_nome     text,
  p_slug     text    default null,
  p_crm      boolean default true,
  p_conteudo boolean default true,
  p_eventos  boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
  v_id   uuid;
  v_key  text;
begin
  if auth.uid() is null then
    raise exception 'precisa estar autenticado' using errcode = '42501';
  end if;
  if not public.pode_conectar() then
    raise exception 'apenas administradores podem cadastrar um cliente' using errcode = '42501';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'informe o nome do cliente' using errcode = '22023';
  end if;
  if not (coalesce(p_crm, false) or coalesce(p_conteudo, false) or coalesce(p_eventos, false)) then
    raise exception 'escolha ao menos um módulo' using errcode = '22023';
  end if;

  v_slug := lower(trim(coalesce(nullif(trim(p_slug), ''), p_nome)));
  v_slug := translate(v_slug, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);
  if v_slug = '' then
    raise exception 'não consegui gerar um identificador a partir desse nome' using errcode = '22023';
  end if;
  if exists (select 1 from public.projects where slug = v_slug) then
    raise exception 'já existe um cliente com o identificador "%"', v_slug using errcode = '23505';
  end if;

  insert into public.projects (nome, slug, usa_crm, usa_conteudo, usa_eventos)
  values (trim(p_nome), v_slug, coalesce(p_crm, false), coalesce(p_conteudo, false), coalesce(p_eventos, false))
  returning id, ingest_key into v_id, v_key;

  insert into public.project_members (user_id, project_id, papel)
  values (auth.uid(), v_id, 'admin');

  return jsonb_build_object(
    'id', v_id, 'nome', trim(p_nome), 'slug', v_slug, 'ingest_key', v_key,
    'usa_crm', coalesce(p_crm, false), 'usa_conteudo', coalesce(p_conteudo, false),
    'usa_eventos', coalesce(p_eventos, false)
  );
end;
$$;

revoke all on function public.criar_projeto(text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.criar_projeto(text, text, boolean, boolean, boolean) to authenticated;

-- ── Eventos ────────────────────────────────────────────────────────
create table if not exists public.eventos (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references public.projects(id) on delete cascade,
  nome             text not null check (length(trim(nome)) > 0),
  data_inicio      date not null,
  data_fim         date,
  local            text,
  descricao        text,
  status           text not null default 'planejamento'
                   check (status in ('planejamento', 'confirmado', 'realizado', 'cancelado')),
  criado_por       uuid references auth.users(id) on delete set null default auth.uid(),
  criado_por_nome  text,
  criado_por_email text,
  criado_em        timestamptz not null default now(),
  check (data_fim is null or data_fim >= data_inicio)
);

create index if not exists eventos_projeto on public.eventos (project_id, data_inicio);

-- Mesmo gatilho dos conteúdos (23): grava quem criou pela sessão.
drop trigger if exists eventos_autor on public.eventos;
create trigger eventos_autor
  before insert on public.eventos
  for each row execute function public.preencher_autor_conteudo();

-- ── Filhos do evento: cliente e autor vêm do banco ─────────────────
-- O navegador manda só o evento_id; o project_id (que a RLS confere) é o do
-- evento, e o autor é quem está logado. Ninguém pendura item em evento de
-- outro cliente nem assina em nome de outra pessoa.
create or replace function public.preencher_item_evento()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_meta  jsonb;
begin
  select e.project_id into new.project_id from public.eventos e where e.id = new.evento_id;

  if tg_op = 'INSERT' and auth.uid() is not null then
    select u.email, u.raw_user_meta_data into v_email, v_meta from auth.users u where u.id = auth.uid();
    new.criado_por      := auth.uid();
    new.criado_por_nome := coalesce(
      nullif(v_meta->>'full_name', ''),
      nullif(v_meta->>'name', ''),
      split_part(coalesce(v_email, ''), '@', 1)
    );
  end if;
  return new;
end;
$$;

-- ── Demandas (Kanban) ──────────────────────────────────────────────
create table if not exists public.evento_demandas (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.eventos(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  titulo          text not null check (length(trim(titulo)) > 0),
  descricao       text,
  status          text not null default 'a_fazer'
                  check (status in ('a_fazer', 'fazendo', 'revisao', 'concluido')),
  responsavel     text,
  prazo           date,
  -- Posição dentro da coluna. Número com casas: soltar entre dois cards
  -- usa a média deles, sem renumerar a coluna inteira.
  ordem           double precision not null default extract(epoch from now()),
  criado_por      uuid references auth.users(id) on delete set null,
  criado_por_nome text,
  criado_em       timestamptz not null default now()
);

create index if not exists evento_demandas_evento on public.evento_demandas (evento_id, status, ordem);

drop trigger if exists evento_demandas_preencher on public.evento_demandas;
create trigger evento_demandas_preencher
  before insert or update of evento_id on public.evento_demandas
  for each row execute function public.preencher_item_evento();

-- ── Materiais (arquivos e links) ───────────────────────────────────
create table if not exists public.evento_materiais (
  id              uuid primary key default gen_random_uuid(),
  evento_id       uuid not null references public.eventos(id) on delete cascade,
  project_id      uuid not null references public.projects(id) on delete cascade,
  categoria       text not null default 'outros'
                  check (categoria in ('artes', 'contratos', 'roteiro', 'fornecedores', 'fotos_videos', 'outros')),
  tipo            text not null check (tipo in ('arquivo', 'link')),
  nome            text not null check (length(trim(nome)) > 0),
  -- arquivo: caminho no bucket "eventos"; link: a URL.
  endereco        text not null,
  tamanho         bigint,
  mime            text,
  criado_por      uuid references auth.users(id) on delete set null,
  criado_por_nome text,
  criado_em       timestamptz not null default now()
);

create index if not exists evento_materiais_evento on public.evento_materiais (evento_id, categoria, criado_em);

drop trigger if exists evento_materiais_preencher on public.evento_materiais;
create trigger evento_materiais_preencher
  before insert or update of evento_id on public.evento_materiais
  for each row execute function public.preencher_item_evento();

-- ── Post do Calendário ligado ao evento ────────────────────────────
alter table public.conteudos
  add column if not exists evento_id uuid references public.eventos(id) on delete set null;

create index if not exists conteudos_evento on public.conteudos (evento_id) where evento_id is not null;

-- ── RLS: quem é do cliente (ou super-admin) lê e escreve ────────────
alter table public.eventos          enable row level security;
alter table public.evento_demandas  enable row level security;
alter table public.evento_materiais enable row level security;

drop policy if exists eventos_all on public.eventos;
create policy eventos_all on public.eventos
  for all to authenticated
  using (public.is_member(project_id) or public.is_super_admin())
  with check (public.is_member(project_id) or public.is_super_admin());

drop policy if exists evento_demandas_all on public.evento_demandas;
create policy evento_demandas_all on public.evento_demandas
  for all to authenticated
  using (public.is_member(project_id) or public.is_super_admin())
  with check (public.is_member(project_id) or public.is_super_admin());

drop policy if exists evento_materiais_all on public.evento_materiais;
create policy evento_materiais_all on public.evento_materiais
  for all to authenticated
  using (public.is_member(project_id) or public.is_super_admin())
  with check (public.is_member(project_id) or public.is_super_admin());

revoke all on public.eventos, public.evento_demandas, public.evento_materiais from anon;
grant select, insert, update, delete on public.eventos, public.evento_demandas, public.evento_materiais to authenticated;

-- ── Arquivos: bucket privado "eventos" ─────────────────────────────
-- Caminho <project_id>/<evento_id>/<uuid>.<ext>. A 1ª pasta é o cliente, e a
-- policy reaproveita a checagem das imagens do calendário (19).
insert into storage.buckets (id, name, public, file_size_limit)
values ('eventos', 'eventos', false, 50 * 1024 * 1024)  -- 50 MB por arquivo
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists eventos_arquivos_select on storage.objects;
create policy eventos_arquivos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'eventos' and public.pode_acessar_midia(name));

drop policy if exists eventos_arquivos_insert on storage.objects;
create policy eventos_arquivos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'eventos' and public.pode_acessar_midia(name));

drop policy if exists eventos_arquivos_delete on storage.objects;
create policy eventos_arquivos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'eventos' and public.pode_acessar_midia(name));

notify pgrst, 'reload schema';
