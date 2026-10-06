import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarPlus, Check, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { CommentThread } from "@/components/comment-thread";
import { ModalColuna, ModalColunas, ModalDegrade } from "@/components/ds/modal";
import { CampoArtes, PostPreview } from "@/components/post-pecas";
import { hhmm } from "@/lib/datas";
import { atualizarConteudo, comentar, criarConteudo, eventosQuery, removerMidias } from "@/lib/queries";
import { toast } from "@/lib/toast";
import type { Conteudo, ConteudoEntrada, Formato, Project, Rede, StatusConteudo } from "@/lib/types";
import { FORMATO_LABEL, modulosDe, REDE_LABEL, STATUS_CONTEUDO_LABEL } from "@/lib/types";

/** Os quatro formatos do dia a dia ficam à mão; os outros, numa lista ao lado. */
const FORMATOS_PRINCIPAIS: Formato[] = ["post", "carrossel", "reels", "story"];
const OUTROS_FORMATOS = (Object.keys(FORMATO_LABEL) as Formato[]).filter((f) => !FORMATOS_PRINCIPAIS.includes(f));
const REDES = Object.keys(REDE_LABEL) as Rede[];
const TODOS_OS_STATUS = Object.keys(STATUS_CONTEUDO_LABEL) as StatusConteudo[];
/** Post novo não nasce publicado: a publicação nas redes é manual e vem depois. */
const STATUS_INICIAIS = TODOS_OS_STATUS.filter((s) => s !== "publicado");
const LIMITE_LEGENDA = 2200;

/**
 * Formulário do post, no popup do design: formato, redes, data, legenda,
 * artes com prévia, pedido de aprovação e comentários.
 *
 * Serve para os dois momentos. Sem `conteudo`, é a "Nova postagem": o post
 * entra no calendário do cliente escolhido no menu. Com `conteudo`, é o
 * "Editar" do popup de detalhes: os mesmos campos, já preenchidos.
 */
export function NovaPostagem({
  projeto,
  conteudo = null,
  dataInicial,
  horaInicial = null,
  onFechar,
}: {
  projeto: Project;
  /** Post que está sendo editado. Ausente = postagem nova. */
  conteudo?: Conteudo | null;
  /** Dia já preenchido (YYYY-MM-DD), quando o popup abre a partir de um dia. */
  dataInicial: string;
  /** Horário já preenchido (HH:MM), quando abre a partir de uma linha de horário. */
  horaInicial?: string | null;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const editando = conteudo;
  const { data: eventos = [] } = useQuery({
    ...eventosQuery(projeto.id),
    enabled: modulosDe(projeto).eventos,
  });

  const [f, setF] = useState<ConteudoEntrada>(() =>
    editando
      ? {
          titulo: editando.titulo,
          formato: editando.formato,
          redes: editando.redes,
          data: editando.data,
          hora: editando.hora,
          status: editando.status,
          legenda: editando.legenda,
          link: editando.link,
          observacoes: editando.observacoes,
          // "?? []": num banco sem a coluna de artes ela vem ausente.
          midias: editando.midias ?? [],
          evento_id: editando.evento_id ?? null,
        }
      : {
          titulo: "",
          formato: "post",
          redes: ["instagram"],
          data: dataInicial,
          hora: horaInicial,
          status: "ideia",
          legenda: null,
          link: null,
          observacoes: null,
          midias: [],
          evento_id: null,
        },
  );
  const set = <K extends keyof ConteudoEntrada>(k: K, v: ConteudoEntrada[K]) => setF((a) => ({ ...a, [k]: v }));

  const [arteAtiva, setArteAtiva] = useState(0);
  const [enviando, setEnviando] = useState(0);
  // Comentários escritos antes de o post existir: esperam aqui e são
  // publicados logo depois de ele ser criado.
  const [pendentes, setPendentes] = useState<string[]>([]);

  // A arte sobe na hora em que é escolhida, antes de o post ser salvo.
  // Guardamos quais subiram nesta abertura pra apagá-las se a pessoa
  // desistir: senão cada cancelamento deixaria arquivo solto no bucket.
  const enviadas = useRef<string[]>([]);
  const originais = editando?.midias ?? [];

  function cancelar() {
    void removerMidias(enviadas.current);
    onFechar();
  }

  const salvar = useMutation({
    mutationFn: async (status: StatusConteudo) => {
      // Campo de texto vazio vira null: "sem legenda" e não uma legenda "".
      const limpo = (s: string | null) => (s && s.trim() ? s.trim() : null);
      const { midias, evento_id, observacoes: _observacoes, ...resto } = f;
      const dados: Partial<ConteudoEntrada> = {
        ...resto,
        status,
        titulo: f.titulo.trim(),
        hora: f.hora || null,
        legenda: limpo(f.legenda),
        link: limpo(f.link),
        // `midias` e `evento_id` só vão quando há (ou havia) o que gravar:
        // assim o post salva mesmo num banco em que essas colunas não existem.
        ...(midias.length || originais.length ? { midias } : {}),
        ...(evento_id || editando?.evento_id ? { evento_id: evento_id ?? null } : {}),
      };

      if (editando) {
        await atualizarConteudo(editando.id, dados);
        return midias;
      }
      const id = await criarConteudo(projeto.id, dados as ConteudoEntrada);
      // Um por vez, na ordem em que foram escritos. Se algum falhar, o post
      // já está salvo: avisa e segue.
      for (const texto of pendentes) {
        try {
          await comentar(id, texto);
        } catch (e) {
          toast(`Post salvo, mas um comentário não foi publicado: ${(e as Error).message}`, "error");
        }
      }
      return midias;
    },
    onSuccess: (midiasSalvas, status) => {
      // Sai do bucket o que ficou sem dono: artes que subiram agora e foram
      // tiradas antes de salvar, e as antigas que a edição removeu. Só depois
      // de o banco aceitar a versão sem elas.
      void removerMidias([...enviadas.current, ...originais].filter((m) => !midiasSalvas.includes(m)));
      toast(editando ? "Post atualizado." : status === "ideia" ? "Ideia guardada no calendário." : "Post adicionado ao calendário.");
      void qc.invalidateQueries({ queryKey: ["conteudos"] });
      void qc.invalidateQueries({ queryKey: ["conteudo"] });
      void qc.invalidateQueries({ queryKey: ["notificacoes"] });
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  function alternarRede(r: Rede) {
    set("redes", f.redes.includes(r) ? f.redes.filter((x) => x !== r) : [...f.redes, r]);
  }

  const pedeAprovacao = f.status === "aprovacao";
  const valido = Boolean(f.titulo.trim() && f.data);
  // Enquanto uma arte sobe, salvar gravaria a lista sem ela.
  const ocupado = salvar.isPending || enviando > 0;
  const formatoFora = !FORMATOS_PRINCIPAIS.includes(f.formato);

  return (
    <ModalDegrade
      aberto
      onFechar={cancelar}
      livre
      icone={editando ? <Pencil size={26} strokeWidth={1.8} aria-hidden /> : <CalendarPlus size={26} strokeWidth={1.8} aria-hidden />}
      titulo={editando ? "Editar postagem" : "Nova postagem"}
      selo={projeto.nome}
      contexto={editando ? "As mudanças valem assim que você salvar" : "Entra direto no calendário do cliente"}
      rodape={
        <>
          <button
            type="button"
            onClick={cancelar}
            className="min-h-11 rounded-[12px] border-0 bg-transparent px-1.5 text-[14px] font-semibold text-texto-2 transition-colors hover:text-marinho"
          >
            Cancelar
          </button>
          <div className="flex flex-wrap gap-2.5">
            {!editando && (
              <button
                type="button"
                onClick={() => salvar.mutate("ideia")}
                disabled={!valido || ocupado}
                className="btn btn-secundario text-[14px] font-bold"
              >
                Salvar como ideia
              </button>
            )}
            <button
              type="button"
              onClick={() => salvar.mutate(f.status)}
              disabled={!valido || ocupado}
              className="btn btn-primario px-5 text-[14px]"
            >
              {salvar.isPending ? "Salvando…" : editando ? "Salvar alterações" : "Adicionar ao calendário"}
              {!editando && <ArrowRight size={16} strokeWidth={2} aria-hidden />}
            </button>
          </div>
        </>
      }
    >
      <ModalColunas colunas="minmax(0,1fr) 380px 330px">
        {/* Coluna 1: o formulário */}
        <ModalColuna className="!gap-4">
          <div className="flex flex-col gap-2">
            <span className="flex items-center justify-between gap-3 text-[13px] font-bold">
              Formato
              <label className="flex items-center gap-1.5 text-[12px] font-semibold text-texto-3">
                Outro formato
                <select
                  value={formatoFora ? f.formato : ""}
                  onChange={(e) => e.target.value && set("formato", e.target.value as Formato)}
                  className="cursor-pointer rounded-lg border border-borda-campo bg-white px-1.5 py-0.5 text-[12px] font-bold text-marinho"
                >
                  <option value="">Escolher</option>
                  {OUTROS_FORMATOS.map((o) => (
                    <option key={o} value={o}>
                      {FORMATO_LABEL[o]}
                    </option>
                  ))}
                </select>
              </label>
            </span>
            <div role="radiogroup" aria-label="Formato" className="grid grid-cols-2 gap-1 rounded-[14px] bg-gelo p-1 sm:grid-cols-4">
              {FORMATOS_PRINCIPAIS.map((o) => {
                const marcado = f.formato === o;
                return (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    onClick={() => set("formato", o)}
                    className={`min-h-10 rounded-[11px] border-0 text-[13px] font-bold transition-[background-color,color,box-shadow] focus-visible:outline-offset-0 ${
                      marcado ? "bg-white text-marinho shadow-[0_1px_3px_rgba(28,46,69,0.14)]" : "bg-transparent text-texto-3 hover:text-marinho"
                    }`}
                  >
                    {FORMATO_LABEL[o]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-bold">Redes</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {REDES.map((r) => {
                const marcada = f.redes.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={marcada}
                    onClick={() => alternarRede(r)}
                    className={`flex min-h-10 items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] px-1.5 text-[12px] font-semibold text-marinho transition-colors ${
                      marcada ? "border-azul bg-azul-claro" : "border-borda-campo bg-white hover:border-borda-campo-hover"
                    }`}
                  >
                    <span
                      className={`box-border flex h-4 w-4 flex-none items-center justify-center rounded-[5px] border-[1.5px] text-white ${
                        marcada ? "border-azul bg-azul" : "border-nevoa bg-white"
                      }`}
                    >
                      {marcada && <Check size={10} strokeWidth={3.5} aria-hidden />}
                    </span>
                    <span className="truncate">{REDE_LABEL[r]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Data">
              <input type="date" required value={f.data} onChange={(e) => set("data", e.target.value)} className="campo px-3" />
            </Campo>
            <Campo rotulo="Horário">
              <input
                type="time"
                value={hhmm(f.hora) ?? ""}
                onChange={(e) => set("hora", e.target.value || null)}
                className="campo px-3"
              />
            </Campo>
            <Campo rotulo="Status">
              <select
                value={f.status}
                onChange={(e) => set("status", e.target.value as StatusConteudo)}
                className="campo cursor-pointer px-2.5"
              >
                {(editando ? TODOS_OS_STATUS : STATUS_INICIAIS).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_CONTEUDO_LABEL[s]}
                  </option>
                ))}
              </select>
            </Campo>
          </div>

          {/* Com evento para escolher, ele divide a linha com o título: a coluna não cresce. */}
          <div className={`grid gap-3 ${(eventos.length > 0 || Boolean(f.evento_id)) ? "sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : ""}`}>
            <Campo rotulo="Título interno">
              <input
                type="text"
                autoFocus
                value={f.titulo}
                onChange={(e) => set("titulo", e.target.value)}
                placeholder="Ex.: 5 mitos sobre bioestimulador"
                className="campo"
              />
            </Campo>
            {(eventos.length > 0 || Boolean(f.evento_id)) && (
              <Campo rotulo="Evento que divulga">
                <select
                  value={f.evento_id ?? ""}
                  onChange={(e) => set("evento_id", e.target.value || null)}
                  className="campo cursor-pointer px-2.5"
                >
                  <option value="">Nenhum (post avulso)</option>
                  {eventos.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
          </div>

          <label className="flex flex-col gap-2 text-[13px] font-bold">
            <span className="flex justify-between">
              Legenda
              <span className="font-semibold text-texto-3">
                {(f.legenda ?? "").length.toLocaleString("pt-BR")} / {LIMITE_LEGENDA.toLocaleString("pt-BR")}
              </span>
            </span>
            <textarea
              rows={4}
              maxLength={LIMITE_LEGENDA}
              value={f.legenda ?? ""}
              onChange={(e) => set("legenda", e.target.value)}
              placeholder="Escreva a legenda que vai para a rede"
              className="campo h-auto resize-none py-3 font-normal leading-normal"
            />
          </label>

          <button
            type="button"
            role="switch"
            aria-checked={pedeAprovacao}
            // O pedido de aprovação É o status "Aprovação": ligar leva o post
            // para lá; desligar devolve para Produção.
            onClick={() => set("status", pedeAprovacao ? "producao" : "aprovacao")}
            className="flex min-h-14 flex-none items-center justify-between gap-4 rounded-[14px] border-0 bg-superficie-2 px-4 py-2.5 text-left text-marinho transition-colors hover:bg-gelo"
          >
            <span className="flex flex-col gap-[3px]">
              <span className="text-[14px] font-bold">Pedir aprovação do cliente</span>
              <span className="text-[12px] font-normal text-texto-3">O post fica em Aprovação até o cliente aprovar ou comentar</span>
            </span>
            <span
              className={`box-border flex h-6 w-11 flex-none items-center rounded-full p-0.5 transition-colors ${
                pedeAprovacao ? "justify-end bg-azul" : "justify-start bg-nevoa-2"
              }`}
            >
              <span className="h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)]" />
            </span>
          </button>
        </ModalColuna>

        {/* Coluna 2: a prévia em cima, a arte embaixo */}
        <ModalColuna aria-label="Prévia e arte" className="!gap-3">
          <PostPreview
            cliente={projeto.nome}
            data={f.data}
            hora={f.hora}
            formato={f.formato}
            midias={f.midias}
            ativo={arteAtiva}
            onAtivo={setArteAtiva}
            legenda={f.legenda}
          />
          <CampoArtes
            projectId={projeto.id}
            midias={f.midias}
            onChange={(m) => set("midias", m)}
            ativo={arteAtiva}
            onAtivo={setArteAtiva}
            enviando={enviando}
            setEnviando={setEnviando}
            onEnviada={(caminho) => enviadas.current.push(caminho)}
          />
          {/* Vídeo e pasta do Drive não sobem para o portal: entram como link. */}
          <label className="flex flex-col">
            <span className="sr-only">Link do vídeo ou da pasta de artes (opcional)</span>
            <input
              type="url"
              value={f.link ?? ""}
              onChange={(e) => set("link", e.target.value)}
              placeholder="Link do vídeo ou da pasta de artes (opcional)"
              className="campo text-[13px]"
            />
          </label>
        </ModalColuna>

        {/* Coluna 3: comentários */}
        <CommentThread
          variante="coluna"
          conteudoId={editando?.id}
          observacaoAntiga={editando?.observacoes ?? null}
          pendentes={pendentes}
          onPendentes={setPendentes}
        />
      </ModalColunas>
    </ModalDegrade>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-[13px] font-bold [&>.campo]:font-medium">
      {rotulo}
      {children}
    </label>
  );
}
