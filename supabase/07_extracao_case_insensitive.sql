-- ═══════════════════════════════════════════════════════════════════
-- CRM OVERSO — 07. Extração insensível a maiúsculas
--
-- Bug corrigido aqui: a extração usava p_dados->>'nome' em minúsculo, mas
-- quem monta o formulário nomeia o campo como quiser — o Elementor mandou
-- "Nome" e "WhatsApp" com maiúscula. JSON é case-sensitive, então nome e
-- whatsapp ficavam NULL mesmo com o dado presente em `respostas`, e o lead
-- aparecia como "Lead parcial" no painel sendo que estava completo.
--
-- `respostas` continua guardando as chaves ORIGINAIS: o rótulo que o cliente
-- escolheu é o que faz sentido exibir no detalhe do lead.
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

  -- Cópia só para extrair, com as chaves em minúsculas e sem espaços.
  -- "Nome Completo" e "nome_completo" passam a cair no mesmo lugar.
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


-- ── Conserta os leads que já entraram com nome/whatsapp NULL ────────
with norm as (
  select l.id,
         coalesce(jsonb_object_agg(regexp_replace(lower(k), '[\s_-]', '', 'g'), v), '{}'::jsonb) as d
  from public.leads l, jsonb_each(l.respostas) as t(k, v)
  where l.nome is null or l.whatsapp is null or l.email is null
  group by l.id
)
update public.leads l
set nome = coalesce(l.nome, nullif(trim(coalesce(
      n.d->>'nome', n.d->>'name', n.d->>'nomecompleto', n.d->>'fullname', n.d->>'seunome')), '')),
    email = coalesce(l.email, nullif(lower(trim(coalesce(
      n.d->>'email', n.d->>'seuemail', n.d->>'youremail'))), '')),
    whatsapp = coalesce(l.whatsapp, nullif(regexp_replace(coalesce(
      n.d->>'whatsapp', n.d->>'telefone', n.d->>'phone', n.d->>'celular',
      n.d->>'tel', n.d->>'fone', n.d->>'seuwhatsapp', ''), '\D', '', 'g'), ''))
from norm n
where n.id = l.id;

select nome, whatsapp, email, completo from public.leads order by criado_em desc limit 10;
