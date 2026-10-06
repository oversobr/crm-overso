-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 31. Endurecimento de segurança
--
-- Resultado da auditoria feita antes de publicar o portal novo. O que já
-- estava certo continua: toda tabela tem RLS, quem não está logado não lê
-- nada, e cada cliente só enxerga o que é dele. Aqui entram quatro furos
-- que a tela escondia, mas o banco aceitava de quem chamasse a API direto:
--
--   1. O admin de um cliente conseguia ligar módulo não contratado, trocar
--      a chave de captura, o identificador e o nome do próprio cliente. A
--      policy projects_update (17) libera a LINHA inteira; faltava travar
--      as colunas que são só da equipe OVERSO.
--      E conseguia REMOVER o cliente inteiro, com todos os leads.
--   2. Dava para forjar "aprovado por Fulano" num post e "editado por
--      Fulano" na ficha, gravando os carimbos direto, sem mudar o status.
--   3. Qualquer membro editava ou apagava anotação de lead escrita por
--      outra pessoa.
--   4. Funções de apoio (is_member, is_admin…) respondiam a quem não está
--      logado. Só devolviam "false", mas não há motivo para responderem.
--
-- Não apaga dado nenhum e pode rodar de novo. Rode depois do 30.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Colunas do cliente que só a equipe OVERSO altera ────────────
-- Sem sessão (SQL Editor, manutenção) passa: ali quem opera é o dono do banco.
create or replace function public.projects_trava()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;
  if (new.nome, new.slug, new.ingest_key, new.usa_crm, new.usa_conteudo, new.usa_eventos, new.criado_em)
     is distinct from
     (old.nome, old.slug, old.ingest_key, old.usa_crm, old.usa_conteudo, old.usa_eventos, old.criado_em)
  then
    raise exception 'apenas a equipe OVERSO altera nome, módulos e chave de captura do cliente'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists projects_trava on public.projects;
create trigger projects_trava before update on public.projects
  for each row execute function public.projects_trava();

-- Remover o cliente apaga tudo dele em cascata. A função do 11 pedia "admin
-- do projeto": o admin do cliente conseguia apagar a própria conta inteira,
-- e um super-admin que não fosse membro daquele cliente não conseguia.
-- Agora é da equipe OVERSO, como o botão da tela.
create or replace function public.remover_projeto(p_project uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
begin
  if auth.uid() is null then
    raise exception 'precisa estar autenticado' using errcode = '42501';
  end if;
  if not public.is_super_admin() then
    raise exception 'apenas a equipe OVERSO remove um cliente' using errcode = '42501';
  end if;

  select nome into v_nome from public.projects where id = p_project;
  if v_nome is null then
    raise exception 'projeto não encontrado' using errcode = 'P0002';
  end if;

  -- O cascade cuida de leads, eventos, campanhas, posts, acessos e anotações.
  delete from public.projects where id = p_project;

  return jsonb_build_object('ok', true, 'nome', v_nome);
end;
$$;
revoke all on function public.remover_projeto(uuid) from public, anon;
grant execute on function public.remover_projeto(uuid) to authenticated;

-- ── 2. Carimbos que só o banco escreve ─────────────────────────────
-- Ficha do cliente: "editado por" vem da sessão ou fica como estava.
create or replace function public.projects_quem_editou()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.atualizado_por_nome := old.atualizado_por_nome;
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

-- Post: a mesma regra do 30, mas o que o navegador mandar nos carimbos é
-- descartado. Só a mudança de status os altera.
create or replace function public.conteudos_aprovacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_antes text;
begin
  if tg_op = 'UPDATE' then
    v_antes := old.status;
    new.em_aprovacao_desde := old.em_aprovacao_desde;
    new.aprovado_em        := old.aprovado_em;
    new.aprovado_por       := old.aprovado_por;
    new.aprovado_por_nome  := old.aprovado_por_nome;
  else
    new.em_aprovacao_desde := null;
    new.aprovado_em        := null;
    new.aprovado_por       := null;
    new.aprovado_por_nome  := null;
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

-- Quem criou o post também é carimbo: o 23 preenche na criação, e daqui em
-- diante uma edição não troca o autor.
create or replace function public.conteudos_autor_fixo()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Sem sessão (SQL Editor) passa: é como se corrige um autor à mão.
  if auth.uid() is null then
    return new;
  end if;
  new.criado_por       := old.criado_por;
  new.criado_por_nome  := old.criado_por_nome;
  new.criado_por_email := old.criado_por_email;
  new.criado_em        := old.criado_em;
  return new;
end;
$$;
drop trigger if exists conteudos_autor_fixo on public.conteudos;
create trigger conteudos_autor_fixo before update on public.conteudos
  for each row execute function public.conteudos_autor_fixo();

-- ── 3. Anotação de lead: ler é de todos, mexer é de quem escreveu ──
drop policy if exists notes_all on public.lead_notes;

drop policy if exists notes_select on public.lead_notes;
create policy notes_select on public.lead_notes
  for select to authenticated
  using (
    public.is_super_admin()
    or exists (select 1 from public.leads l where l.id = lead_id and public.is_member(l.project_id))
  );

drop policy if exists notes_insert on public.lead_notes;
create policy notes_insert on public.lead_notes
  for insert to authenticated
  with check (
    public.is_super_admin()
    or exists (select 1 from public.leads l where l.id = lead_id and public.is_member(l.project_id))
  );

-- Editar não existe na tela: a anotação é registro, como os comentários (22).
drop policy if exists notes_delete on public.lead_notes;
create policy notes_delete on public.lead_notes
  for delete to authenticated
  using (user_id = auth.uid());

revoke update on public.lead_notes from authenticated;

-- ── 4. Funções de apoio: só para quem está logado ──────────────────
-- As policies e o painel as chamam como `authenticated`; quem está de fora
-- não precisa de resposta nenhuma.
revoke all on function public.is_super_admin()            from public, anon;
revoke all on function public.is_member(uuid)             from public, anon;
revoke all on function public.is_admin(uuid)              from public, anon;
revoke all on function public.pode_gerenciar(uuid)        from public, anon;
revoke all on function public.pode_acessar_midia(text)    from public, anon;
revoke all on function public.definir_global(text, boolean)        from public, anon;
revoke all on function public.equipe_conceder(text, uuid, text)    from public, anon;
revoke all on function public.equipe_revogar(uuid, uuid)           from public, anon;
revoke all on function public.campanha_da_data(uuid, timestamptz)  from public, anon;
revoke all on function public.campanha_do_lead(uuid, timestamptz, jsonb, text) from public, anon;
revoke all on function public.pagina_da_origem(text)      from public, anon;

grant execute on function public.is_super_admin()            to authenticated;
grant execute on function public.is_member(uuid)             to authenticated;
grant execute on function public.is_admin(uuid)              to authenticated;
grant execute on function public.pode_gerenciar(uuid)        to authenticated;
grant execute on function public.pode_acessar_midia(text)    to authenticated;
grant execute on function public.definir_global(text, boolean)        to authenticated;
grant execute on function public.equipe_conceder(text, uuid, text)    to authenticated;
grant execute on function public.equipe_revogar(uuid, uuid)           to authenticated;
grant execute on function public.campanha_da_data(uuid, timestamptz)  to authenticated;
grant execute on function public.campanha_do_lead(uuid, timestamptz, jsonb, text) to authenticated;
grant execute on function public.pagina_da_origem(text)      to authenticated;

notify pgrst, 'reload schema';

-- ── Conferência ────────────────────────────────────────────────────
-- Como ADMIN DE UM CLIENTE (não super-admin), num bloco por vez:
--
--   begin;
--   select set_config('request.jwt.claims',
--                     '{"sub":"UUID-DO-ADMIN","role":"authenticated"}', true);
--   set local role authenticated;
--   update public.projects set usa_eventos = true where id = 'UUID-DO-CLIENTE';
--   -- ERRO: apenas a equipe OVERSO altera nome, módulos e chave…
--   rollback;
--
--   -- editar o contato continua funcionando:
--   update public.projects set contato_nome = 'Teste' where id = 'UUID-DO-CLIENTE';
