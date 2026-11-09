import { AlertTriangle, CheckCircle2, Eye, FileSpreadsheet, Plus, Trash2, Upload, XCircle } from "lucide-react";
import type { ClipboardEvent, DragEvent } from "react";
import { useMemo, useRef, useState } from "react";

import { Switch, Tabs } from "@/components/ds/controles";
import { Modal } from "@/components/modal";
import type { Campo, DadosMes, Linha, MesRelatorio, Rascunho, Relatorio } from "@/lib/relatorios";
import {
  CAMPOS_GOOGLE,
  CAMPOS_META,
  COLS_CONCORRENTES,
  COLS_ENTREGAS,
  COLS_GOOGLE_CAMPANHAS,
  COLS_IDADES,
  COLS_META_CAMPANHAS,
  COLS_PARCELA,
  COLS_POSICIONAMENTOS,
  conferir,
  estruturaDoAnterior,
  nomeDoMes,
  paraDados,
  paraRascunho,
  salvarMes,
} from "@/lib/relatorios";
import type { Leitura } from "@/lib/relatorio-planilhas";
import { lerPlanilha } from "@/lib/relatorio-planilhas";
import { toast } from "@/lib/toast";

type Aba = "mes" | "google" | "meta" | "social" | "conferir";

function Grupo({ titulo, dica, children }: { titulo: string; dica?: string | undefined; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <div>
        <h3 className="text-[14px] font-bold text-ink">{titulo}</h3>
        {dica && <p className="text-[12px] text-texto-2">{dica}</p>}
      </div>
      {children}
    </section>
  );
}

function Campos({ defs, valores, onChange }: { defs: Campo[]; valores: Linha; onChange: (k: string, v: string) => void }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
      {defs.map((c) => (
        <label key={c.k} className="flex flex-col gap-1.5 text-[12px] font-semibold text-texto-2">
          {c.r}
          <input
            value={valores[c.k] ?? ""}
            onChange={(e) => onChange(c.k, e.target.value)}
            placeholder={c.calc ? "Calculado" : ""}
            inputMode={c.t === "texto" ? "text" : "decimal"}
            className="campo min-h-[42px] text-[14px] font-medium"
          />
        </label>
      ))}
    </div>
  );
}

/**
 * Tabela digitável. Colar um trecho de planilha numa célula preenche a partir
 * dela, com novas linhas se precisar: é o jeito rápido de lançar um mês.
 */
function TabelaEditavel({ cols, linhas, onChange, novoRotulo }: { cols: Campo[]; linhas: Linha[]; onChange: (l: Linha[]) => void; novoRotulo: string }) {
  const vazia = (): Linha => Object.fromEntries(cols.map((c) => [c.k, ""]));
  const muda = (i: number, k: string, v: string) => onChange(linhas.map((l, n) => (n === i ? { ...l, [k]: v } : l)));

  function colar(e: ClipboardEvent<HTMLInputElement>, i: number, j: number) {
    const texto = e.clipboardData.getData("text");
    if (!texto.includes("\t") && !texto.includes("\n")) return;
    e.preventDefault();
    const blocos = texto.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
    const nova = [...linhas];
    blocos.forEach((celulas, di) => {
      const alvo = i + di;
      const atual = { ...(nova[alvo] ?? vazia()) };
      celulas.forEach((v, dj) => {
        const c = cols[j + dj];
        if (c) atual[c.k] = v.trim();
      });
      nova[alvo] = atual;
    });
    onChange(nova);
  }

  return (
    <div className="flex flex-col gap-2">
      {linhas.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-borda">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.k} className={`whitespace-nowrap px-2 py-2 text-left text-[11px] font-semibold text-texto-2 ${c.larg ?? ""}`}>
                    {c.r}
                  </th>
                ))}
                <th className="w-9" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="border-t border-borda">
                  {cols.map((c, j) => (
                    <td key={c.k} className="p-1">
                      <input
                        aria-label={`${c.r}, linha ${i + 1}`}
                        value={l[c.k] ?? ""}
                        onChange={(e) => muda(i, c.k, e.target.value)}
                        onPaste={(e) => colar(e, i, j)}
                        className="w-full min-w-16 rounded-lg border border-transparent bg-transparent px-2 py-1.5 outline-none hover:border-borda focus:border-azul"
                      />
                    </td>
                  ))}
                  <td className="p-1 text-center">
                    <button type="button" aria-label={`Remover linha ${i + 1}`} onClick={() => onChange(linhas.filter((_, n) => n !== i))} className="rounded-lg p-1.5 text-texto-3 hover:text-erro-texto">
                      <Trash2 size={15} strokeWidth={1.8} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button type="button" onClick={() => onChange([...linhas, vazia()])} className="btn btn-secundario btn-36 self-start">
        <Plus size={15} strokeWidth={2.2} aria-hidden />
        {novoRotulo}
      </button>
    </div>
  );
}

function CanalDesligado({ nome, ligar }: { nome: string; ligar: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-borda p-5">
      <p className="text-[14px] text-texto-2">Este mês não terá a seção {nome} no relatório.</p>
      <button type="button" onClick={ligar} className="btn btn-secundario btn-36">
        Incluir {nome}
      </button>
    </div>
  );
}

export function RelatorioMes({
  relatorio,
  nomeCliente,
  logoCliente,
  meses,
  editando,
  onFechar,
  onSalvo,
}: {
  relatorio: Relatorio;
  nomeCliente: string;
  logoCliente: string | null;
  meses: MesRelatorio[];
  /** Mês aberto para edição; null = novo mês. */
  editando: MesRelatorio | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const ultimo = meses[0];
  const [r, setR] = useState<Rascunho>(() => {
    if (editando) return paraRascunho(editando.dados, editando.referencia);
    return ultimo ? estruturaDoAnterior(ultimo.dados, "") : paraRascunho(null, "");
  });
  const [aba, setAba] = useState<Aba>(editando ? "google" : "mes");
  const [conferido, setConferido] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const alertas = useMemo(() => conferir(r), [r]);
  const erros = alertas.filter((a) => a.nivel === "erro");
  const avisos = alertas.filter((a) => a.nivel === "aviso");
  const jaExiste = !editando && meses.some((m) => m.referencia === r.referencia);
  const base: DadosMes | null = editando?.dados ?? null;

  const g = r.google;
  const a = r.meta;
  const s = r.social;
  const setG = (p: Partial<Rascunho["google"]>) => setR((v) => ({ ...v, google: { ...v.google, ...p } }));
  const setA = (p: Partial<Rascunho["meta"]>) => setR((v) => ({ ...v, meta: { ...v.meta, ...p } }));
  const setS = (p: Partial<Rascunho["social"]>) => setR((v) => ({ ...v, social: { ...v.social, ...p } }));

  const bloqueado = erros.length > 0 || jaExiste || !r.referencia;

  function previa() {
    const atual = paraDados(r, base);
    const outros = meses.filter((m) => m.publicado && m.referencia !== r.referencia).map((m) => m.dados);
    const lista = [...outros, atual].sort((x, y) => String(x.id).localeCompare(String(y.id)));
    try {
      localStorage.setItem(
        "overso-relatorio-previa",
        JSON.stringify({ exemplo: false, cliente: relatorio.nome_exibicao || nomeCliente, logoCliente, logoCores: relatorio.logo_cores, destaque: relatorio.destaque, conversaoGoogle: relatorio.conversao_google, subtitulo: relatorio.subtitulo, fontes: relatorio.fontes, meses: lista }),
      );
      window.open("/relatorio/previa", "_blank", "noopener");
    } catch {
      toast("Não foi possível abrir a prévia neste navegador.", "error");
    }
  }

  async function salvar(publicar: boolean) {
    setSalvando(true);
    try {
      await salvarMes(relatorio.id, paraDados(r, base), publicar);
      toast(publicar ? `${nomeDoMes(r.referencia)} publicado no relatório.` : "Rascunho salvo.");
      onSalvo();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível salvar.", "error");
    } finally {
      setSalvando(false);
    }
  }

  const abas: { id: Aba; rotulo: string }[] = [
    { id: "mes", rotulo: "Mês" },
    { id: "google", rotulo: "Google Ads" },
    { id: "meta", rotulo: "Meta ADS" },
    { id: "social", rotulo: "Social Media" },
    { id: "conferir", rotulo: alertas.length ? `Conferência (${alertas.length})` : "Conferência" },
  ];

  return (
    <Modal aberto onFechar={onFechar} titulo={editando ? `${nomeDoMes(editando.referencia).replace(/^./, (l) => l.toUpperCase())} de ${editando.referencia.slice(0, 4)}` : "Novo mês do relatório"} maxW="max-w-6xl">
      <div className="flex flex-col gap-5">
        <ImportarPlanilhas
          onLido={(leituras) => {
            const certas = leituras.filter((l) => l.aplicar);
            if (!certas.length) return;
            setR((v) => {
              let n = certas.reduce((acc, l) => l.aplicar!(acc), v);
              // Mês novo sem referência: vem do período da planilha.
              const ref = certas.map((l) => l.referencia).find(Boolean);
              if (!editando && !n.referencia && ref) n = { ...n, referencia: ref };
              return n;
            });
            toast(`${certas.length} ${certas.length === 1 ? "planilha importada" : "planilhas importadas"}. Confira os números nas abas.`);
            setConferido(false);
          }}
          referencia={r.referencia}
        />
        <Tabs abas={abas} valor={aba} onChange={setAba} rotulo="Partes do mês" />

        {aba === "mes" && (
          <Grupo titulo="Mês do relatório" dica={ultimo && !editando ? "Campanhas, posicionamentos e entregas vêm do último mês, com os números em branco." : undefined}>
            <label className="flex max-w-60 flex-col gap-1.5 text-[12px] font-semibold text-texto-2">
              Referência
              <input type="month" disabled={Boolean(editando)} value={r.referencia} onChange={(e) => setR((v) => ({ ...v, referencia: e.target.value }))} className="campo min-h-[42px] text-[14px] font-medium" />
            </label>
            {jaExiste && <p className="text-[13px] font-semibold text-erro-texto">Este mês já existe. Abra ele na lista para editar.</p>}
            <div className="flex flex-col gap-2 pt-2">
              {[
                { n: "Google Ads", v: g.ativo, f: (x: boolean) => setG({ ativo: x }) },
                { n: "Meta ADS", v: a.ativo, f: (x: boolean) => setA({ ativo: x }) },
                { n: "Social Media", v: s.ativo, f: (x: boolean) => setS({ ativo: x }) },
              ].map((c) => (
                <div key={c.n} className="flex max-w-60 items-center justify-between gap-3 text-[14px] font-medium">
                  {c.n}
                  <Switch ligado={c.v} onChange={c.f} rotulo={`Incluir ${c.n}`} />
                </div>
              ))}
            </div>
          </Grupo>
        )}

        {aba === "google" &&
          (g.ativo ? (
            <>
              <Grupo titulo="Números do mês" dica="Campos com “Calculado” podem ficar vazios: o portal calcula ao salvar.">
                <Campos defs={CAMPOS_GOOGLE} valores={g.campos} onChange={(k, v) => setG({ campos: { ...g.campos, [k]: v } })} />
              </Grupo>
              <Grupo titulo="Campanhas" dica="Dica: copie as linhas da planilha e cole na primeira célula.">
                <TabelaEditavel cols={COLS_GOOGLE_CAMPANHAS} linhas={g.campanhas} onChange={(campanhas) => setG({ campanhas })} novoRotulo="Adicionar campanha" />
              </Grupo>
              <Grupo titulo="Informações do leilão · Concorrentes" dica="Opcional. Copie como aparece na plataforma, inclusive “< 10%”.">
                <TabelaEditavel cols={COLS_CONCORRENTES} linhas={g.concorrentes} onChange={(concorrentes) => setG({ concorrentes })} novoRotulo="Adicionar concorrente" />
              </Grupo>
              <Grupo titulo="Parcela de impressões · Leilão" dica="Opcional. Se preenchido, aparece ao lado do funil no lugar do gráfico de custo.">
                <TabelaEditavel cols={COLS_PARCELA} linhas={g.parcela} onChange={(parcela) => setG({ parcela })} novoRotulo="Adicionar posição" />
              </Grupo>
              <Grupo titulo="Observação">
                <textarea value={g.observacao} onChange={(e) => setG({ observacao: e.target.value })} rows={2} className="campo text-[14px]" aria-label="Observação do Google Ads" />
              </Grupo>
            </>
          ) : (
            <CanalDesligado nome="Google Ads" ligar={() => setG({ ativo: true })} />
          ))}

        {aba === "meta" &&
          (a.ativo ? (
            <>
              <Grupo titulo="Números do mês" dica="Deixe em branco o que este cliente não usa: o card não aparece no relatório.">
                <Campos defs={CAMPOS_META} valores={a.campos} onChange={(k, v) => setA({ campos: { ...a.campos, [k]: v } })} />
              </Grupo>
              <Grupo titulo="Campanhas">
                <TabelaEditavel cols={COLS_META_CAMPANHAS} linhas={a.campanhas} onChange={(campanhas) => setA({ campanhas })} novoRotulo="Adicionar campanha" />
              </Grupo>
              <Grupo titulo="Desempenho por posicionamento" dica="Opcional.">
                <TabelaEditavel cols={COLS_POSICIONAMENTOS} linhas={a.posicionamentos} onChange={(posicionamentos) => setA({ posicionamentos })} novoRotulo="Adicionar posicionamento" />
              </Grupo>
              <Grupo titulo="Gasto por faixa etária e gênero" dica="Opcional. Total e percentuais são calculados.">
                <TabelaEditavel cols={COLS_IDADES} linhas={a.idades} onChange={(idades) => setA({ idades })} novoRotulo="Adicionar faixa" />
              </Grupo>
              <Grupo titulo="Observação">
                <textarea value={a.observacao} onChange={(e) => setA({ observacao: e.target.value })} rows={2} className="campo text-[14px]" aria-label="Observação do Meta ADS" />
              </Grupo>
            </>
          ) : (
            <CanalDesligado nome="Meta ADS" ligar={() => setA({ ativo: true })} />
          ))}

        {aba === "social" &&
          (s.ativo ? (
            <>
              <Grupo titulo="Entregas" dica="O total do mês é a soma das quantidades.">
                <TabelaEditavel cols={COLS_ENTREGAS} linhas={s.entregas} onChange={(entregas) => setS({ entregas })} novoRotulo="Adicionar entrega" />
              </Grupo>
              <Grupo titulo="Resumo" dica="Destaque opcional: por exemplo, Artes · 7 · Evento e calendário.">
                <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">
                  {(
                    [
                      ["Stories", "stories"],
                      ["Feed", "feed"],
                      ["Destaque: nome", "extraRotulo"],
                      ["Destaque: quantidade", "extraValor"],
                      ["Destaque: descrição", "extraNota"],
                    ] as const
                  ).map(([rot, k]) => (
                    <label key={k} className="flex flex-col gap-1.5 text-[12px] font-semibold text-texto-2">
                      {rot}
                      <input value={s[k]} onChange={(e) => setS({ [k]: e.target.value })} className="campo min-h-[42px] text-[14px] font-medium" />
                    </label>
                  ))}
                </div>
              </Grupo>
            </>
          ) : (
            <CanalDesligado nome="Social Media" ligar={() => setS({ ativo: true })} />
          ))}

        {aba === "conferir" && (
          <Grupo titulo="Conferência" dica="As partes precisam fechar com os totais. Erros impedem salvar; avisos pedem sua confirmação para publicar.">
            {alertas.length === 0 ? (
              <p className="flex items-center gap-2 text-[14px] font-semibold text-azul">
                <CheckCircle2 size={18} strokeWidth={2} aria-hidden /> Tudo fecha. Pode publicar.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {alertas.map((al, i) => (
                  <li key={i} className={`flex items-start gap-2 text-[14px] ${al.nivel === "erro" ? "text-erro-texto" : "text-ink"}`}>
                    {al.nivel === "erro" ? <XCircle size={17} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" /> : <AlertTriangle size={17} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />}
                    {al.msg}
                  </li>
                ))}
              </ul>
            )}
          </Grupo>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-borda pt-4">
          <div className="text-[13px]">
            {erros.length > 0 ? (
              <button type="button" onClick={() => setAba("conferir")} className="font-semibold text-erro-texto underline">
                {erros.length} {erros.length === 1 ? "erro" : "erros"} para corrigir
              </button>
            ) : avisos.length > 0 ? (
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={conferido} onChange={(e) => setConferido(e.target.checked)} />
                <button type="button" onClick={() => setAba("conferir")} className="underline">
                  {avisos.length} {avisos.length === 1 ? "aviso" : "avisos"}
                </button>
                conferido{avisos.length === 1 ? "" : "s"}
              </label>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={previa} disabled={bloqueado} className="btn btn-secundario">
              <Eye size={16} strokeWidth={2} aria-hidden /> Prévia
            </button>
            <button type="button" onClick={() => void salvar(false)} disabled={bloqueado || salvando} className="btn btn-secundario">
              Salvar rascunho
            </button>
            <button type="button" onClick={() => void salvar(true)} disabled={bloqueado || salvando || (avisos.length > 0 && !conferido)} className="btn btn-primario">
              Publicar mês
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

/* ── Importar planilhas ───────────────────────────────────────────────── */

/**
 * Arraste (ou escolha) os CSVs exportados do Google Ads e do Meta Ads: cada
 * um é reconhecido pelo cabeçalho e preenche a parte dele do mês. Os números
 * entram nas abas, onde dá para conferir e ajustar antes de salvar.
 */
function ImportarPlanilhas({ onLido, referencia }: { onLido: (l: Leitura[]) => void; referencia: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [lidas, setLidas] = useState<Leitura[]>([]);
  const [lendo, setLendo] = useState(false);
  const [arrastando, setArrastando] = useState(false);

  async function ler(arquivos: FileList | File[]) {
    const lista = [...arquivos];
    if (!lista.length) return;
    setLendo(true);
    try {
      const leituras = await Promise.all(lista.map(lerPlanilha));
      setLidas(leituras);
      onLido(leituras);
    } finally {
      setLendo(false);
    }
  }

  function soltar(e: DragEvent) {
    e.preventDefault();
    setArrastando(false);
    void ler(e.dataTransfer.files);
  }

  const mesDiferente = (l: Leitura) => Boolean(referencia && l.referencia && l.referencia !== referencia);

  return (
    <section className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={soltar}
        className={`flex min-h-16 items-center gap-3.5 rounded-[14px] border-[1.5px] border-dashed px-4 py-3 text-left text-marinho transition-colors ${
          arrastando ? "border-azul bg-azul-claro-2" : "border-azul-borda bg-azul-claro hover:border-azul"
        }`}
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] bg-superficie text-link">
          <Upload size={18} strokeWidth={2} aria-hidden />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-[14px]">{lendo ? "Lendo as planilhas…" : "Importar planilhas do mês"}</strong>
          <span className="text-[12px] text-texto-3">
            Arraste ou escolha os CSVs do Google Ads (Relatório de campanha, Informações do leilão) e do Meta Ads (campanhas, posicionamento, idade e gênero). Dá para mandar
            vários de uma vez.
          </span>
        </span>
      </button>
      <input
        ref={entrada}
        type="file"
        accept=".csv,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void ler(e.target.files);
          e.target.value = "";
        }}
      />

      {lidas.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          {lidas.map((l, i) => (
            <li key={`${l.arquivo}-${i}`} className="flex items-start gap-2.5 rounded-[12px] bg-superficie-2 px-3.5 py-2.5 text-[13px]">
              {l.aplicar ? (
                <CheckCircle2 size={16} strokeWidth={2} aria-hidden className="mt-0.5 flex-none text-sucesso" />
              ) : (
                <XCircle size={16} strokeWidth={2} aria-hidden className="mt-0.5 flex-none text-erro-texto" />
              )}
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-x-2">
                  <FileSpreadsheet size={13} strokeWidth={2} aria-hidden className="text-texto-3" />
                  <strong className="truncate">{l.tipo ?? l.arquivo}</strong>
                  {l.tipo && <span className="truncate text-[12px] text-texto-3">{l.arquivo}</span>}
                </span>
                {l.resumo && <span className="text-texto-2">{l.resumo}</span>}
                {mesDiferente(l) && (
                  <span className="font-semibold text-erro-texto">
                    Esta planilha é de {nomeDoMes(l.referencia!)} de {l.referencia!.slice(0, 4)}, e o relatório é de {nomeDoMes(referencia)} de {referencia.slice(0, 4)}.
                  </span>
                )}
                {l.avisos.map((a) => (
                  <span key={a} className="flex items-start gap-1.5 text-[12px] text-texto-3">
                    <AlertTriangle size={12} strokeWidth={2} aria-hidden className="mt-0.5 flex-none text-alerta" />
                    {a}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
