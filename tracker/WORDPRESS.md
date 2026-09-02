# Conectar um site WordPress / Elementor ao CRM

Use [`overso-lead-wp.js`](overso-lead-wp.js) — autocontido, sem build, entra
como `<script>` puro.

## 1. Cadastre o site no CRM

Cada site WordPress é um **projeto próprio**, com sua própria `ingest_key`.
No SQL Editor do Supabase:

```sql
with novo as (
  insert into public.projects (nome, slug)
  values ('Nome do Cliente', 'slug-do-cliente')
  on conflict (slug) do update set nome = excluded.nome
  returning id, nome, ingest_key
),
acesso as (
  insert into public.project_members (user_id, project_id, papel)
  select u.id, n.id, 'admin'
  from novo n, auth.users u
  where u.email = 'jose.silvajunior0131@gmail.com'
  on conflict (user_id, project_id) do update set papel = 'admin'
  returning 1
)
select nome, ingest_key from novo;
```

## 2. Nomeie os campos no Elementor — **este é o passo que mais erra**

Cada campo do Elementor tem um **ID** em *Avançado → ID*. Esse ID vira a chave
no CRM: o campo com ID `nome` chega como `nome`.

O Elementor gera IDs automáticos tipo `field_a1b2c3`. Se você deixar assim, o
painel vai mostrar `field_a1b2c3` no lugar de "Nome", e o lead não terá nome
nem WhatsApp nas colunas da tabela.

Renomeie pelo menos estes três:

| Campo | ID no Elementor | Vira |
|---|---|---|
| Nome | `nome` | coluna **Nome** |
| WhatsApp | `whatsapp` (ou `telefone`, `celular`) | coluna **WhatsApp**, com link `wa.me` |
| Email | `email` | coluna **Email** |

Qualquer outro campo (`profissao`, `cidade`, `procedimento`…) vira uma resposta
no detalhe do lead, sem precisar mexer no banco.

## 3. Instale o script

Abra `overso-lead-wp.js`, preencha o bloco `CFG` do topo:

```js
var CFG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "sb_publishable_...",
  key: "a_ingest_key_deste_site",
};
```

Depois cole o arquivo inteiro em **uma** destas opções:

| Onde | Precisa de `<script>`? | Alcance |
|---|---|---|
| **WPCode** (recomendado) | **Não** — o plugin envolve sozinho | site inteiro |
| **Elementor Pro → Custom Code** | **Sim** | site inteiro |
| **Widget HTML do Elementor** | **Sim** | só aquela página |
| `functions.php` (tema filho) | não (usa `wp_enqueue_script`) | site inteiro |

O erro mais comum é errar essa coluna: no WPCode, escolhendo o tipo
*JavaScript Snippet*, o plugin já adiciona a tag `<script>`. Se você colar as
tags junto, elas aparecem como texto na página e nada roda.

### Sobre o widget HTML

Funciona, e é a opção sem plugin nenhum. Só entenda o que você está aceitando:

- vale **só naquela página** — cada landing nova exige colar de novo
- some se alguém apagar o widget editando a página
- num **popup do Elementor**, coloque o widget na página que abre o popup, não
  dentro do popup: o conteúdo do popup só existe depois que ele abre

Para uma landing só, é perfeitamente adequado. A partir da segunda página do
mesmo site, o WPCode economiza trabalho e evita esquecimento.

## 4. Confira

Abra a página, preencha e envie. No SQL Editor:

```sql
select nome, whatsapp, completo, respostas, origem, criado_em
from public.leads order by criado_em desc limit 5;
```

Se `respostas` vier com chaves tipo `field_a1b2c3`, volte ao passo 2.

## O que ele captura sozinho

| Evento | Quando |
|---|---|
| `form_open` | formulário entra na tela (não no load da página) |
| `partial` | pessoa digita e para por 2,5s |
| `partial` | pessoa fecha a aba sem enviar |
| `complete` | Elementor confirma o envio (`submit_success`) |

A abertura conta quando o form fica **visível**, não quando a página carrega —
em WordPress o formulário costuma estar no rodapé ou num popup, e contar a
página inteira inflaria o topo do funil.

## Plugins suportados

| Plugin | Envio detectado por | Nomes dos campos |
|---|---|---|
| Elementor Pro | `submit_success` (jQuery) | bons, se você seguir o passo 2 |
| Contact Form 7 | `wpcf7mailsent` | os que você definiu no shortcode |
| WPForms | `submit` nativo | **numéricos** (`wpforms[fields][3]` → `3`) |
| `<form>` comum | `submit` nativo | o atributo `name` |

**Limitação do WPForms:** ele não coloca o rótulo no `name`, só o índice do
campo. As respostas chegam como `0`, `1`, `2`. Dá pra usar, mas Elementor Pro e
CF7 produzem dados muito mais legíveis no painel.

## Por que não usa o submit nativo no Elementor

Elementor envia por AJAX e valida no servidor. O evento `submit` do navegador
dispara **antes** dessa validação — contaria como lead completo alguém que o
Elementor recusou. Por isso o script escuta `submit_success`, que só dispara
quando o envio realmente deu certo.
