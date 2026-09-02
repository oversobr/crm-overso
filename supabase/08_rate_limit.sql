-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 08. Rate-limit na captura
--
-- A ingest_key é pública (fica no JS da página), então quem a copiar pode
-- injetar leads falsos. Não lê nem apaga nada — só polui. O teste de invasão
-- confirmou 10 inserções em ~4s sem freio.
--
-- Este teto corta o abuso em massa sem atrapalhar tráfego real: conta os
-- COMPLETE de uma sessão numa janela curta e barra a partir de um limite.
-- form_open e partial não contam — eles se repetem legitimamente.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.capture_lead(
  p_key     text,
  p_session text,
  p_evento  text,
  p_dados   jsonb default '{}'::jsonb,
  p_utms    jsonb default '{}'::jsonb,
  p_origem  text  default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project  uuid;
  v_campaign uuid;
  v_lead     uuid;
  v_norm     jsonb;
  v_nome     text;
  v_email    text;
  v_whats    text;
  v_recentes int;
begin
  select id into v_project from public.projects where ingest_key = p_key;
  if v_project is null then
    raise exception 'chave de captura inválida' using errcode = '42501';
  end if;

  if p_session is null or length(p_session) not between 8 and 128 then
    raise exception 'sessão inválida' using errcode = '22023';
  end if;

  if pg_column_size(p_dados) > 64000 then
    raise exception 'payload muito grande' using errcode = '22023';
  end if;

  -- Freio contra flood: no máximo 30 leads completos por projeto por minuto.
  -- Uma landing real raramente passa disso; um script de abuso passa na hora.
  if p_evento = 'complete' then
    select count(*) into v_recentes
    from public.lead_events
    where project_id = v_project
      and tipo = 'complete'
      and criado_em > now() - interval '1 minute';
    if v_recentes >= 30 then
      raise exception 'muitas requisições, tente em instantes' using errcode = '53400';
    end if;
  end if;

  insert into public.lead_events (project_id, session_id, tipo, payload)
  values (v_project, p_session, p_evento, coalesce(p_dados, '{}'::jsonb))
  on conflict do nothing;

  if p_evento = 'form_open' then
    return jsonb_build_object('ok', true, 'lead_id', null);
  end if;

  select c.id into v_campaign
  from public.campaigns c
  where c.project_id = v_project
    and (c.inicio is null or c.inicio <= current_date)
    and (c.fim    is null or c.fim    >= current_date)
  order by c.inicio desc nulls last
  limit 1;

  select coalesce(jsonb_object_agg(regexp_replace(lower(k), '[\s_-]', '', 'g'), v), '{}'::jsonb)
    into v_norm
    from jsonb_each(coalesce(p_dados, '{}'::jsonb)) as t(k, v);

  v_nome := nullif(trim(coalesce(
    v_norm->>'nome', v_norm->>'name', v_norm->>'nomecompleto',
    v_norm->>'fullname', v_norm->>'seunome'
  )), '');
  v_email := nullif(lower(trim(coalesce(
    v_norm->>'email', v_norm->>'seuemail', v_norm->>'youremail'
  ))), '');
  v_whats := nullif(regexp_replace(coalesce(
    v_norm->>'whatsapp', v_norm->>'telefone', v_norm->>'phone',
    v_norm->>'celular', v_norm->>'tel', v_norm->>'fone',
    v_norm->>'seuwhatsapp', ''
  ), '\D', '', 'g'), '');

  insert into public.leads as l
    (project_id, campaign_id, session_id, nome, email, whatsapp,
     respostas, utms, origem, completo, completado_em)
  values
    (v_project, v_campaign, p_session, v_nome, v_email, v_whats,
     coalesce(p_dados, '{}'::jsonb), coalesce(p_utms, '{}'::jsonb), p_origem,
     p_evento = 'complete',
     case when p_evento = 'complete' then now() end)
  on conflict (project_id, session_id) do update set
    respostas     = l.respostas || excluded.respostas,
    utms          = case when l.utms = '{}'::jsonb then excluded.utms else l.utms end,
    nome          = coalesce(excluded.nome,  l.nome),
    email         = coalesce(excluded.email, l.email),
    whatsapp      = coalesce(excluded.whatsapp, l.whatsapp),
    campaign_id   = coalesce(l.campaign_id, excluded.campaign_id),
    completo      = l.completo or excluded.completo,
    completado_em = coalesce(l.completado_em, excluded.completado_em)
  returning l.id into v_lead;

  return jsonb_build_object('ok', true, 'lead_id', v_lead);
end;
$$;

revoke all on function public.capture_lead(text,text,text,jsonb,jsonb,text) from public, anon, authenticated;
grant execute on function public.capture_lead(text,text,text,jsonb,jsonb,text) to anon, authenticated;
