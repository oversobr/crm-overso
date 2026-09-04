-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 16. "Conectar Cliente" é só para admin
--
-- Antes: qualquer membro de um projeto enxergava a aba Conectar, lia a
-- `ingest_key` de todas as páginas e via o botão de excluir cliente.
--
-- A remoção e a edição JÁ eram barradas no banco (remover_projeto exige
-- is_admin, e a policy projects_update também) — o que faltava era:
--
--   1) a chave de captura não podia estar visível pra membro comum. Com
--      ela dá pra injetar lead falso no cliente. Esconder a aba no painel
--      não resolveria: o app é estático, e a API responderia do mesmo
--      jeito a quem chamasse direto. Por isso a trava é por COLUNA aqui.
--   2) criar página nova também virou coisa de admin.
--
-- O PAINEL NÃO DEPENDE DESTE ARQUIVO para esconder a aba: ele descobre quem
-- é admin com o que já existe (is_super_admin + a própria linha em
-- project_members). Isto aqui é o endurecimento — o que impede a chamada
-- direta à API. Pode rodar a qualquer momento, sem janela de painel quebrado.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Quem pode abrir a aba Conectar ──────────────────────────────
-- Só super-admin. Cadastrar cliente é operação da OVERSO, não do cliente:
-- ser `admin` de uma página dá poder SOBRE AQUELA PÁGINA (equipe, leads),
-- não sobre o CRM. Quem entra na lista se decide em Acesso global (13).
create or replace function public.pode_conectar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_super_admin();
$$;

revoke all on function public.pode_conectar() from public, anon;
grant execute on function public.pode_conectar() to authenticated;

-- ── 2. A ingest_key sai do alcance do SELECT comum ─────────────────
-- Grant por coluna: o painel continua lendo id/nome/slug (precisa deles
-- pro seletor de páginas), mas ingest_key não volta mais em consulta
-- direta — nem pra membro, nem pra admin. Quem precisa dela usa a
-- função do item 3, que checa o papel antes de devolver.
revoke select on public.projects from public, authenticated;
grant select (id, nome, slug, criado_em) on public.projects to authenticated;

-- ── 3. As páginas com a chave de captura ───────────────────────────
-- security definer para poder ler a coluna que acabamos de fechar. Mesma
-- regra do item 1: a chave é o que liga uma LP ao CRM, e quem faz essa
-- ligação é a OVERSO. Com a chave em mãos qualquer um injeta lead no
-- cliente, então ela não sai para admin de página nem para membro.
create or replace function public.projetos_gerenciaveis()
returns table(id uuid, nome text, slug text, ingest_key text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_conectar() then
    raise exception 'apenas a equipe OVERSO acessa as chaves de captura'
      using errcode = '42501';
  end if;
  return query
    select p.id, p.nome, p.slug, p.ingest_key
    from public.projects p
    order by p.nome;
end;
$$;

revoke all on function public.projetos_gerenciaveis() from public, anon;
grant execute on function public.projetos_gerenciaveis() to authenticated;

-- ── 4. Criar página nova também é de admin ─────────────────────────
-- Mesma função do 06, com uma checagem a mais logo depois da sessão.
create or replace function public.criar_projeto(p_nome text, p_slug text default null)
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

  -- Novo: membro comum não cadastra cliente.
  if not public.pode_conectar() then
    raise exception 'apenas administradores podem cadastrar um cliente'
      using errcode = '42501';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'informe o nome da página' using errcode = '22023';
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
    raise exception 'já existe uma página com o identificador "%"', v_slug
      using errcode = '23505';
  end if;

  insert into public.projects (nome, slug)
  values (trim(p_nome), v_slug)
  returning id, ingest_key into v_id, v_key;

  insert into public.project_members (user_id, project_id, papel)
  values (auth.uid(), v_id, 'admin');

  return jsonb_build_object(
    'id', v_id, 'nome', trim(p_nome), 'slug', v_slug, 'ingest_key', v_key
  );
end;
$$;

revoke all on function public.criar_projeto(text, text) from public, anon;
grant execute on function public.criar_projeto(text, text) to authenticated;

notify pgrst, 'reload schema';

-- ── Conferência ────────────────────────────────────────────────────
-- ATENÇÃO: no SQL Editor você é DONO do banco, e dono ignora RLS e grant de
-- coluna — o teste ali mente. Finja ser o usuário, na mesma transação:
--
--   begin;
--   select set_config('request.jwt.claims',
--                     '{"sub":"UUID-DO-USUARIO","role":"authenticated"}', true);
--   set local role authenticated;
--
--   select pode_conectar();               -- membro: false | admin de página: false
--   select id, nome, slug from projects;  -- as páginas dele (segue funcionando)
--   rollback;
--
-- E, num bloco separado (o erro aborta a transação):
--   select ingest_key from projects;      -- ERRO de permissão
--   select * from projetos_gerenciaveis();-- ERRO: só a equipe OVERSO
--
-- Como super-admin, pode_conectar() volta true e projetos_gerenciaveis()
-- devolve todas as páginas com a chave.
