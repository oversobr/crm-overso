-- ═══════════════════════════════════════════════════════════════════
-- PORTAL OVERSO — 23. Quem criou cada conteúdo
--
-- A tabela conteudos já guardava criado_por (o id), mas o painel não lê
-- auth.users, então não tinha como mostrar o NOME. Aqui o nome e o email de
-- quem criou ficam gravados junto do conteúdo, e aparecem pra todo mundo
-- que abre a demanda.
--
-- Quem preenche é o banco, pela sessão (como nos comentários do 22): o
-- navegador não escolhe o autor. Rode depois do 18_calendario.sql.
-- ═══════════════════════════════════════════════════════════════════

alter table public.conteudos
  add column if not exists criado_por_nome  text,
  add column if not exists criado_por_email text;

create or replace function public.preencher_autor_conteudo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_meta  jsonb;
begin
  -- Sem sessão (ex.: inserção pelo SQL Editor) não há de quem tirar o nome.
  if auth.uid() is null then
    return new;
  end if;

  select u.email, u.raw_user_meta_data into v_email, v_meta
  from auth.users u where u.id = auth.uid();

  new.criado_por       := auth.uid();
  new.criado_por_email := v_email;
  new.criado_por_nome  := coalesce(
    nullif(v_meta->>'full_name', ''),
    nullif(v_meta->>'name', ''),
    split_part(coalesce(v_email, ''), '@', 1)
  );
  return new;
end;
$$;

drop trigger if exists conteudos_autor on public.conteudos;
create trigger conteudos_autor
  before insert on public.conteudos
  for each row execute function public.preencher_autor_conteudo();

-- Os conteúdos que já existem ganham o nome a partir do criado_por que
-- foi gravado na criação.
update public.conteudos c
   set criado_por_email = u.email,
       criado_por_nome  = coalesce(
         nullif(u.raw_user_meta_data->>'full_name', ''),
         nullif(u.raw_user_meta_data->>'name', ''),
         split_part(coalesce(u.email, ''), '@', 1)
       )
  from auth.users u
 where u.id = c.criado_por
   and c.criado_por_nome is null;

notify pgrst, 'reload schema';
