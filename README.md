# CRM OVERSO

Um CRM central para todas as landing pages. Cada página é um **projeto**; os
leads de todas caem no mesmo painel, com UTMs, respostas do formulário e leads
parciais.

## Como está montado

```
LP biologia-com-ka ─┐
LP cliente-2 ───────┼──▶ capture_lead()  ──▶  Postgres  ──▶  Painel
LP cliente-3 ───────┘    (função no banco)      (RLS)         (este app)
```

A captura **não passa por servidor nosso**: a LP chama uma função dentro do
Postgres. Deploy no painel nunca derruba o formulário de um cliente.

## Subir

**1. Banco** — crie um projeto em [supabase.com](https://supabase.com) e rode,
no SQL Editor, na ordem:

| Arquivo | O que faz |
|---|---|
| `supabase/01_schema.sql` | tabelas e índices |
| `supabase/02_rls.sql` | quem enxerga o quê |
| `supabase/03_ingest.sql` | a função de captura |
| `supabase/04_views.sql` | funil e métricas |
| `supabase/05_seed.sql` | cadastra a 1ª página — **devolve a `ingest_key`** |

**2. Painel**

```bash
cp .env.example .env      # preencha com a URL e a anon key do Supabase
npm install
npm run dev               # http://localhost:3000
```

Crie seu usuário em Authentication → Users no Supabase, com o mesmo email que
está no `05_seed.sql`.

**3. Ligar uma landing page** — veja [`tracker/README.md`](tracker/README.md).
São 6 linhas na LP.

## O que o painel entrega

- **Dashboard** — meta da campanha, total, hoje, 7 dias, fonte principal, gráfico e leads recentes
- **Leads** — busca, filtro por status e por completo/parcial, CSV, detalhe com UTMs e todas as respostas, mudança de status, atalho de WhatsApp
- **Funil** — aberturas → começaram a preencher → completos, e onde você perde lead

## Duas decisões que explicam o resto

**`respostas` é JSON.** Cada LP pergunta o que quiser. Página nova não precisa
de migration, e o CSV descobre as colunas a partir dos próprios dados.

**`session_id` liga parcial e completo.** O mesmo id acompanha a pessoa da
abertura do formulário até o envio, então o lead parcial **vira** o completo em
vez de virar uma segunda linha.

## Sobre o funil

O painel antigo empilhava "parciais" e "completos" como etapas em sequência —
daí sair *711.8% de conversão*. Eles são desfechos irmãos da mesma abertura. A
sequência real, que é a implementada aqui:

```
abriu o formulário  →  começou a preencher  →  enviou
```

Nenhuma porcentagem pode passar de 100%.

## Estado

Build e typecheck passam; o app sobe, o guard de sessão redireciona e o login
renderiza. **O SQL ainda não foi executado contra um Postgres real** — isso só
dá para validar com um projeto Supabase de pé.
