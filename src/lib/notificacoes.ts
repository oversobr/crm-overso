import { queryOptions } from "@tanstack/react-query";
import { guardado } from "./guardado";
import { chegouEm, paginaDoLead, respostasDe, valorDaResposta } from "./leads";
import { hojeBrasilia } from "./queries";
import { getSupabaseBrowserClient } from "./supabase/client";
import type { Formato, Lead, Modulo } from "./types";
import { FORMATO_LABEL } from "./types";

/**
 * Notificações do sino e da central.
 *
 * O banco ainda não tem tabela de notificações. Até lá a lista é DERIVADA do
 * que já existe: leads parados, formulários enviados e abandonados,
 * comentários, posts sem arte e posts esperando aprovação. É dado real do
 * cliente escolhido, passando pela mesma RLS de qualquer outra consulta. O
 * que ainda não é do banco é o "lida" e as preferências de aviso, que ficam
 * guardados neste navegador.
 */
export type TipoNotificacao = "alerta" | "lead" | "comentario" | "post";

/** As regras de "Quando avisar". Cada notificação pertence a uma. */
export type RegraDeAviso = "novo" | "parado" | "parcial" | "arte" | "comentario" | "aprovacao";

export const REGRAS_DE_AVISO: { id: RegraDeAviso; rotulo: string; dica: string; modulo: Modulo }[] = [
  { id: "novo", rotulo: "Lead novo", dica: "Assim que alguém envia o formulário", modulo: "crm" },
  { id: "parado", rotulo: "Lead parado", dica: "Novo há mais de 24h sem contato", modulo: "crm" },
  { id: "parcial", rotulo: "Lead parcial", dica: "Começou o formulário e não enviou", modulo: "crm" },
  { id: "arte", rotulo: "Post sem arte", dica: "Agendado para as próximas 48h", modulo: "conteudo" },
  { id: "comentario", rotulo: "Comentário em post", dica: "Em qualquer post do calendário", modulo: "conteudo" },
  { id: "aprovacao", rotulo: "Aprovação pendente", dica: "Post esperando o cliente há 2 dias", modulo: "conteudo" },
];

export type Notificacao = {
  /** Estável entre recargas: é o que o "lida" guarda. */
  id: string;
  tipo: TipoNotificacao;
  regra: RegraDeAviso;
  modulo: "CRM" | "CONTEÚDO";
  urgente: boolean;
  titulo: string;
  /** Linha de contexto abaixo do título. */
  detalhe: string | null;
  /** Instante do fato (ISO). */
  quando: string;
  /** Texto do botão e para onde ele leva. */
  acao: string;
  para: "/leads" | "/postagens";
  busca?: Record<string, string>;
};

const HORA = 3600_000;
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
const somarDia = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
};

type LeadCurto = Pick<Lead, "id" | "nome" | "whatsapp" | "origem" | "respostas" | "completo" | "criado_em" | "completado_em">;

/** "LP Bioestimulador · Já fez o procedimento: Não · Melhor horário: Manhã" */
function resumoDoLead(l: LeadCurto): string | null {
  const pagina = paginaDoLead(l.origem);
  const respostas = respostasDe(l as Lead)
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${valorDaResposta(v)}`);
  return [pagina ? `LP ${pagina}` : null, ...respostas].filter(Boolean).join(" · ") || null;
}

export const notificacoesQuery = (projectId: string | undefined, mods: Record<Modulo, boolean>, userId: string | undefined) =>
  queryOptions({
    queryKey: ["notificacoes", projectId, mods.crm, mods.conteudo, userId],
    enabled: Boolean(projectId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<Notificacao[]> => {
      const sb = getSupabaseBrowserClient();
      const agora = Date.now();
      const hoje = hojeBrasilia();
      const ha24h = new Date(agora - 24 * HORA).toISOString();
      const ha48h = new Date(agora - 48 * HORA).toISOString();
      const lista: Notificacao[] = [];

      if (mods.crm) {
        const colunas = "id, nome, whatsapp, origem, respostas, completo, criado_em, completado_em";
        const [parados, maisAntigo, recentes] = await Promise.all([
          sb
            .from("leads")
            .select("id", { count: "exact", head: true })
            .eq("project_id", projectId!)
            .eq("completo", true)
            .eq("status", "novo")
            .lt("criado_em", ha24h),
          sb
            .from("leads")
            .select(colunas)
            .eq("project_id", projectId!)
            .eq("completo", true)
            .eq("status", "novo")
            .lt("criado_em", ha24h)
            .order("criado_em")
            .limit(1),
          // Enviados e abandonados das últimas 48h: cobre "hoje" e "ontem".
          sb.from("leads").select(colunas).eq("project_id", projectId!).gte("criado_em", ha48h).order("criado_em", { ascending: false }).limit(12),
        ]);
        if (parados.error) throw parados.error;
        if (recentes.error) throw recentes.error;

        const n = parados.count ?? 0;
        if (n > 0) {
          const antigo = (maisAntigo.data?.[0] ?? null) as LeadCurto | null;
          const pagina = antigo ? paginaDoLead(antigo.origem) : null;
          lista.push({
            // O dia entra no id: o aviso volta amanhã se os leads seguirem parados.
            id: `leads-parados:${hoje}`,
            tipo: "alerta",
            regra: "parado",
            modulo: "CRM",
            urgente: true,
            titulo: n === 1 ? "1 lead novo está há mais de 24h sem contato" : `${n} leads novos estão há mais de 24h sem contato`,
            detalhe: antigo
              ? `O mais antigo chegou ${chegouEm(antigo.criado_em).replace(/^(Hoje|Ontem)/, (m) => m.toLowerCase())}${pagina ? `, pela LP ${pagina}` : ""}.`
              : null,
            quando: `${hoje}T09:00:00-03:00`,
            acao: "Ver leads",
            para: "/leads",
          });
        }

        for (const l of (recentes.data ?? []) as LeadCurto[]) {
          const nome = l.nome?.trim();
          if (l.completo) {
            lista.push({
              id: `lead:${l.id}`,
              tipo: "lead",
              regra: "novo",
              modulo: "CRM",
              urgente: false,
              titulo: `${nome || "Um lead"} enviou o formulário`,
              detalhe: resumoDoLead(l),
              quando: l.completado_em ?? l.criado_em,
              acao: "Abrir lead",
              para: "/leads",
              ...(nome ? { busca: { busca: nome } } : {}),
            });
          } else if (agora - new Date(l.criado_em).getTime() > HORA) {
            // Parcial só vira aviso depois de 1h: antes disso a pessoa pode
            // ainda estar preenchendo.
            lista.push({
              id: `parcial:${l.id}`,
              tipo: "lead",
              regra: "parcial",
              modulo: "CRM",
              urgente: false,
              titulo: `${nome || "Alguém"} parou o formulário no meio`,
              detalhe: `Lead parcial: ${l.whatsapp ? "deixou o WhatsApp antes de parar" : "parou antes de deixar o telefone"}.`,
              quando: l.criado_em,
              acao: "Abrir lead",
              para: "/leads",
              ...(nome ? { busca: { busca: nome } } : {}),
            });
          }
        }
      }

      if (mods.conteudo) {
        const [proximos, emAprovacao, comentarios] = await Promise.all([
          sb
            .from("conteudos")
            .select("id, titulo, formato, data, hora, midias, status")
            .eq("project_id", projectId!)
            .gte("data", hoje)
            .lte("data", somarDia(hoje, 2))
            .eq("status", "agendado"),
          sb
            .from("conteudos")
            .select("id, titulo, data, atualizado_em")
            .eq("project_id", projectId!)
            .eq("status", "aprovacao")
            .lt("atualizado_em", ha48h)
            .order("data")
            .limit(10),
          sb
            .from("conteudo_comentarios")
            .select("id, conteudo_id, autor_id, autor_nome, texto, criado_em")
            .eq("project_id", projectId!)
            .gte("criado_em", ha48h)
            .order("criado_em", { ascending: false })
            .limit(8),
        ]);

        // Tabelas de conteúdo podem não existir num banco antigo: a lista
        // segue com o que tem em vez de quebrar o topo de todas as telas.
        type PostCurto = { id: string; titulo: string; formato: Formato; data: string; hora: string | null; midias: string[] | null };
        for (const c of (proximos.error ? [] : (proximos.data ?? [])) as PostCurto[]) {
          if (c.midias?.length) continue;
          const eHoje = c.data === hoje;
          const quandoSai = `${eHoje ? "de hoje" : `do dia ${ddmm(c.data)}`}${c.hora ? ` às ${c.hora.slice(0, 5)}` : ""}`;
          lista.push({
            id: `sem-arte:${c.id}:${hoje}`,
            tipo: "alerta",
            regra: "arte",
            modulo: "CONTEÚDO",
            urgente: eHoje,
            titulo: `Post ${quandoSai} ainda está sem arte`,
            detalhe: `${FORMATO_LABEL[c.formato] ?? "Post"} · ${c.titulo}`,
            quando: `${hoje}T08:00:00-03:00`,
            acao: "Anexar arte",
            para: "/postagens",
            busca: { abrir: c.id },
          });
        }

        const esperando = (emAprovacao.error ? [] : (emAprovacao.data ?? [])) as { id: string; titulo: string; data: string }[];
        if (esperando.length > 0) {
          lista.push({
            id: `aprovacao:${hoje}:${esperando.length}`,
            tipo: "post",
            regra: "aprovacao",
            modulo: "CONTEÚDO",
            urgente: false,
            titulo:
              esperando.length === 1
                ? "1 post espera aprovação do cliente há mais de 2 dias"
                : `${esperando.length} posts esperam aprovação do cliente há mais de 2 dias`,
            detalhe: esperando
              .slice(0, 4)
              .map((p) => `${p.titulo} (${ddmm(p.data)})`)
              .join(", "),
            quando: `${hoje}T08:30:00-03:00`,
            acao: esperando.length === 1 ? "Abrir post" : "Ver na programação",
            para: "/postagens",
            ...(esperando.length === 1 ? { busca: { abrir: esperando[0]!.id } } : {}),
          });
        }

        type ComentarioCurto = { id: string; conteudo_id: string; autor_id: string | null; autor_nome: string; texto: string; criado_em: string };
        for (const c of (comentarios.error ? [] : (comentarios.data ?? [])) as ComentarioCurto[]) {
          // Comentário próprio não é novidade para quem escreveu.
          if (c.autor_id === userId) continue;
          lista.push({
            id: `comentario:${c.id}`,
            tipo: "comentario",
            regra: "comentario",
            modulo: "CONTEÚDO",
            urgente: false,
            titulo: `${c.autor_nome || "Alguém"} comentou em um post`,
            // Sem o "[Card N]" que marca o card do carrossel (comment-thread.tsx).
            detalhe: `“${c.texto.replace(/^\[Card \d+\]\s*/, "")}”`,
            quando: c.criado_em,
            acao: "Responder",
            para: "/postagens",
            busca: { abrir: c.conteudo_id },
          });
        }
      }

      return lista.sort((a, b) => b.quando.localeCompare(a.quando));
    },
  });

/* ── O "lida" e as preferências ─────────────────────────────────────
   Ficam no navegador, para uso imediato, e na conta (30_portal_novo.sql),
   para valerem em todo aparelho. A gravação na conta é melhor esforço:
   num banco sem as tabelas, vale só o navegador, como antes. */

/** Grava na conta sem segurar a tela nem acusar erro. */
function naConta(gravar: (sb: ReturnType<typeof getSupabaseBrowserClient>, userId: string) => PromiseLike<unknown>) {
  void (async () => {
    const sb = getSupabaseBrowserClient();
    const { data } = await sb.auth.getSession();
    const userId = data.session?.user.id;
    if (userId) await gravar(sb, userId);
  })().catch(() => {});
}

/** O que a conta já tinha no banco entra junto do que está neste navegador. */
export function receberDaConta(daConta: { lidas: string[] | null; desligadas: string[] | null }) {
  if (daConta.lidas?.length) lidas.gravar([...new Set([...daConta.lidas, ...lidas.ler()])].slice(-LIMITE_LIDAS));
  // Preferência é escolha, não soma: se a conta tem uma gravada, é ela que vale.
  if (daConta.desligadas) {
    const validas = new Set<string>(REGRAS_DE_AVISO.map((r) => r.id));
    desligadas.gravar(daConta.desligadas.filter((r): r is RegraDeAviso => validas.has(r)));
  }
}

const LIMITE_LIDAS = 400;
const lidas = guardado<string[]>("overso:notificacoes-lidas", []);

export function marcarComoLidas(ids: string[]) {
  if (!ids.length) return;
  lidas.gravar([...new Set([...lidas.ler(), ...ids])].slice(-LIMITE_LIDAS));
  naConta((sb, userId) =>
    sb.from("notificacoes_lidas").upsert(
      ids.map((chave) => ({ user_id: userId, chave })),
      { onConflict: "user_id,chave", ignoreDuplicates: true },
    ),
  );
}

/** Os ids já lidos. A lista é a mesma referência enquanto nada muda. */
export function useLidas(): string[] {
  return lidas.usar();
}

/** Regras DESLIGADAS em "Quando avisar". Guardar o que saiu faz regra nova nascer ligada. */
const desligadas = guardado<RegraDeAviso[]>("overso:notificacoes-desligadas", []);

export function useRegrasDesligadas(): RegraDeAviso[] {
  return desligadas.usar();
}

/** Grava a lista inteira de uma vez: é o "Salvar" da tela de Configurações. */
export function definirRegrasDesligadas(lista: RegraDeAviso[]) {
  desligadas.gravar(lista);
  naConta((sb, userId) =>
    sb.from("preferencias_usuario").upsert({ user_id: userId, avisos_desligados: lista, atualizado_em: new Date().toISOString() }),
  );
}

export function alternarRegra(regra: RegraDeAviso) {
  const atual = desligadas.ler();
  definirRegrasDesligadas(atual.includes(regra) ? atual.filter((r) => r !== regra) : [...atual, regra]);
}

/* ── Datas ──────────────────────────────────────────────────────────── */

const FUSO = "America/Sao_Paulo";
const diaDe = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: FUSO });

/** "hoje", "ontem" ou "antes": o grupo da notificação na central. */
export function grupoDoDia(iso: string): "hoje" | "ontem" | "antes" {
  const dia = diaDe(new Date(iso));
  if (dia === diaDe(new Date())) return "hoje";
  if (dia === diaDe(new Date(Date.now() - 24 * HORA))) return "ontem";
  return "antes";
}

/** Só a hora: "09:42". */
export function horaCurta(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
}

/** "09:42" se foi hoje, "ontem", ou "03/10". */
export function quandoCurto(iso: string): string {
  const grupo = grupoDoDia(iso);
  if (grupo === "hoje") return horaCurta(iso);
  if (grupo === "ontem") return "ontem";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
}
