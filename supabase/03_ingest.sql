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
