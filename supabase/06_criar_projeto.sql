-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 06. Criar página pelo painel
--
-- Sem isto, cadastrar uma página nova exige abrir o SQL Editor: a tabela
-- projects não tem policy de INSERT de propósito (ninguém escreve direto
-- nela). Esta função é a porta controlada — ela cria o projeto E já dá
-- acesso admin a quem chamou, numa transação só.
-- ═══════════════════════════════════════════════════════════════════

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
  -- security definer ignora RLS, então a checagem de sessão é manual e
  -- obrigatória: sem isto qualquer visitante anônimo criaria projetos.
  if auth.uid() is null then
    raise exception 'precisa estar autenticado' using errcode = '42501';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'informe o nome da página' using errcode = '22023';
  end if;

  -- Slug derivado do nome quando não informado: minúsculas, sem acento,
  -- espaços viram hífen. "Clínica São José" -> "clinica-sao-jose".
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

  -- Quem cria vira admin na mesma transação: se este insert falhar, o
  -- projeto não fica órfão e invisível por RLS.
  insert into public.project_members (user_id, project_id, papel)
  values (auth.uid(), v_id, 'admin');

  return jsonb_build_object(
    'id', v_id, 'nome', trim(p_nome), 'slug', v_slug, 'ingest_key', v_key
  );
end;
$$;

-- Só quem está logado. O anon (chave da landing page) não cria nada.
revoke all on function public.criar_projeto(text, text) from public, anon;
grant execute on function public.criar_projeto(text, text) to authenticated;
