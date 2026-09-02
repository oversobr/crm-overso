# OVERSO Lead — plugar uma página no CRM

## 1. Cadastre a página

Rode `supabase/05_seed.sql` trocando nome e slug. Ele devolve a `ingest_key`.

## 2. Ligue o formulário

A forma curta — funciona em qualquer página, sem mapear campo por campo:

```js
import { OversoLead } from "./overso-lead.js";

const crm = OversoLead.init({
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_ANON_KEY",
  key: "INGEST_KEY_DA_PAGINA",
});

crm.watch(document.querySelector("form"));
```

Pronto. A partir daí o CRM recebe sozinho:

| Evento | Quando | Vira o quê no painel |
|---|---|---|
| `form_open` | form aparece | **Aberturas do Formulário** |
| `partial` | pessoa digita e para | **Lead Parcial** |
| `partial` (keepalive) | pessoa fecha a aba | **Lead Parcial** |
| `complete` | submit | **Lead Completo** |

Os três eventos carregam o mesmo `session_id`, então o parcial **vira** o
completo — não duplica a pessoa.

## 3. Em React (as suas LPs)

```tsx
const crm = useRef(null);
const formRef = useRef(null);

useEffect(() => {
  crm.current = OversoLead.init({ url, anonKey, key });
  crm.current.watch(formRef.current);
}, []);

async function onSubmit(dados) {
  await crm.current.complete(dados);   // devolve o lead_id
  window.location.href = LINK_DO_GRUPO;
}
```

## O que sai do código antigo

O `mode: "no-cors"` e as 15 linhas de comentário explicando a gambiarra do
Apps Script deixam de ser necessários: o Supabase responde CORS de verdade,
então dá pra ler a resposta e saber se o lead entrou.

## Campos

Não existe campo obrigatório. Manda o que a página tiver — tudo cai em
`respostas` como JSON. `nome`, `email` e `whatsapp` (ou `telefone`/`phone`/
`celular`) são reconhecidos automaticamente e viram coluna na tabela.

---

## Site em WordPress / Elementor?

Use [`overso-lead-wp.js`](overso-lead-wp.js) e siga o
[WORDPRESS.md](WORDPRESS.md) — é uma versão autocontida, sem build, que
entende os nomes de campo do Elementor, do Contact Form 7 e do WPForms.
