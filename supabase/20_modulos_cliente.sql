-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 20. Módulos por cliente (CRM / Conteúdo)
--
-- Nem todo cliente usa tudo: tem cliente só de conteúdo (sem landing page)
-- e cliente só de CRM. Cada projeto ganha duas chaves, e o painel mostra
-- desativado o que o cliente não contratou.
--
-- As duas nascem LIGADAS: quem já existe continua vendo tudo, e nada muda
-- até alguém desligar. Rode depois do 16_conectar_admin.sql.
-- ═══════════════════════════════════════════════════════════════════

alter table public.projects
  add column if not exists usa_crm      boolean not null default true,
  add column if not exists usa_conteudo boolean not null default true;

-- Cliente sem módulo nenhum não faz sentido: sobraria um portal vazio.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_algum_modulo') then
    alter table public.projects
      add constraint projects_algum_modulo check (usa_crm or usa_conteudo);
  end if;
end;
$$;

-- O 16 fechou o SELECT por coluna; as novas precisam entrar na lista, senão
-- o seletor de clientes do painel não consegue lê-las. Mudar continua sendo
-- só de admin/super-admin (policy projects_update do 17).
grant select (usa_crm, usa_conteudo) on public.projects to authenticated;

-- ── Lista de clientes da tela Clientes (agora com os módulos) ──────
-- Muda o tipo de retorno, então precisa sair e voltar.
drop function if exists public.projetos_gerenciaveis();
create function public.projetos_gerenciaveis()
returns table(id uuid, nome text, slug text, ingest_key text, usa_crm boolean, usa_conteudo boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_conectar() then
    raise exception 'apenas a equipe OVERSO acessa as chaves de captura'
      using errcode = '42501';
  end if;
  return query
    select p.id, p.nome, p.slug, p.ingest_key, p.usa_crm, p.usa_conteudo
    from public.projects p
    order by p.nome;
end;
$$;

revoke all on function public.projetos_gerenciaveis() from public, anon;
grant execute on function public.projetos_gerenciaveis() to authenticated;

-- ── Criar cliente já com os módulos escolhidos ─────────────────────
-- Mesma função do 16, com dois parâmetros a mais (padrão: os dois ligados,
-- então quem chamar do jeito antigo continua funcionando).
drop function if exists public.criar_projeto(text, text);
create or replace function public.criar_projeto(
  p_nome     text,
  p_slug     text    default null,
  p_crm      boolean default true,
  p_conteudo boolean default true
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
    raise exception 'apenas administradores podem cadastrar um cliente'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'informe o nome do cliente' using errcode = '22023';
  end if;

  if not (coalesce(p_crm, false) or coalesce(p_conteudo, false)) then
    raise exception 'escolha ao menos um módulo (CRM ou Conteúdo)' using errcode = '22023';
  end if;

  v_slug := lower(trim(coalesce(nullif(trim(p_slug), ''), p_nome)));
  v_slug := translate(v_slug, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := trim(both '-' from v_slug);

  if v_slug = '' then
    raise exception 'não consegui gerar um identificador a partir desse nome'
      using errcode = '22023';
  end if;

  if exists (select 1 from public.projects where slug = v_slug) then
    raise exception 'já existe um cliente com o identificador "%"', v_slug
      using errcode = '23505';
  end if;

  insert into public.projects (nome, slug, usa_crm, usa_conteudo)
  values (trim(p_nome), v_slug, coalesce(p_crm, false), coalesce(p_conteudo, false))
  returning id, ingest_key into v_id, v_key;

  insert into public.project_members (user_id, project_id, papel)
  values (auth.uid(), v_id, 'admin');

  return jsonb_build_object(
    'id', v_id, 'nome', trim(p_nome), 'slug', v_slug, 'ingest_key', v_key,
    'usa_crm', coalesce(p_crm, false), 'usa_conteudo', coalesce(p_conteudo, false)
  );
end;
$$;

revoke all on function public.criar_projeto(text, text, boolean, boolean) from public, anon;
grant execute on function public.criar_projeto(text, text, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
