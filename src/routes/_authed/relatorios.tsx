import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Copy, ExternalLink, FileText, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";

import { Card, EmptyState } from "@/components/ds/card";
import { usePainel } from "@/components/painel";
import { RelatorioMes } from "@/components/relatorio-mes";
import { TopBar } from "@/components/shell/top-bar";
import { podeConectarQuery } from "@/lib/queries";
import type { MesRelatorio } from "@/lib/relatorios";
import { alterarEndereco, apagarMes, criarRelatorio, definirPublicado, logoClienteQuery, mesesRelatorioQuery, nomeDoMes, paraEndereco, relatorioQuery } from "@/lib/relatorios";
import { toast } from "@/lib/toast";

/**
 * Relatório mensal de cada cliente. Só a equipe OVERSO entra: a equipe lança
 * os meses aqui e envia o link; o cliente abre o link, sem login, e vê só os
 * meses publicados. O cliente da tela é o escolhido no seletor do menu.
 */
export const Route = createFileRoute("/_authed/relatorios")({ component: Relatorios });

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function Relatorios() {
  const { projeto } = usePainel();
  const { data: podeEntrar, isLoading: verificando } = useQuery(podeConectarQuery());
  const { data: relatorio, isLoading } = useQuery({ ...relatorioQuery(projeto?.id), enabled: Boolean(podeEntrar && projeto?.id) });
  const { data: meses = [] } = useQuery(mesesRelatorioQuery(relatorio?.id));
  const { data: logoCliente } = useQuery(logoClienteQuery(projeto?.id));
  const qc = useQueryClient();
  const [editor, setEditor] = useState<{ mes: MesRelatorio | null } | null>(null);

  // Portão que falha fechado, como em Clientes: sem a resposta, a tela não abre.
  if (!podeEntrar) {
    return (
      <div className="flex flex-col gap-5">
        <TopBar titulo="Relatórios" />
        <Card>
          <EmptyState icone={<ShieldAlert size={20} strokeWidth={1.8} aria-hidden />} titulo={verificando ? "Verificando seu acesso…" : "Área da equipe OVERSO"}>
            {verificando ? undefined : "Fale com o responsável pelo portal para lançar relatórios."}
          </EmptyState>
        </Card>
      </div>
    );
  }

  const link = relatorio ? `${window.location.origin}/relatorio/${relatorio.slug}` : "";
  const atualizar = async () => {
    await qc.invalidateQueries({ queryKey: ["relatorio", projeto?.id] });
    await qc.invalidateQueries({ queryKey: ["relatorio-meses", relatorio?.id] });
  };
  const executar = async (acao: () => Promise<unknown>, ok: string) => {
    try {
      await acao();
      await atualizar();
      toast(ok);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível concluir.", "error");
    }
  };
  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copiado.");
    } catch {
      toast("Copie o link direto do campo.", "info");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <TopBar
        titulo="Relatórios"
        subtitulo={projeto ? `Relatório mensal de ${projeto.nome}. Troque de cliente no seletor do menu.` : undefined}
        acoes={
          relatorio ? (
            <button type="button" onClick={() => setEditor({ mes: null })} className="btn btn-primario">
              <Plus size={16} strokeWidth={2.2} aria-hidden />
              Novo mês
            </button>
          ) : undefined
        }
      />

      {!projeto || isLoading ? (
        <Card>
          <EmptyState icone={<FileText size={20} strokeWidth={1.8} aria-hidden />} titulo="Carregando…" />
        </Card>
      ) : !relatorio ? (
        <Card>
          <EmptyState icone={<FileText size={20} strokeWidth={1.8} aria-hidden />} titulo={`${projeto.nome} ainda não tem relatório`}>
            <span className="flex flex-col items-center gap-3">
              Crie o relatório para gerar o link deste cliente e lançar o primeiro mês.
              <button type="button" onClick={() => void executar(() => criarRelatorio(projeto.id, projeto.nome), "Relatório criado.")} className="btn btn-primario">
                Criar relatório
              </button>
            </span>
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-[15px] font-bold text-ink">Link do cliente</h2>
                <p className="text-[13px] text-texto-2">Quem abrir este endereço vê os meses publicados, sem login. Ele usa o nome do cliente, então pode ser adivinhado.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input readOnly value={link} aria-label="Link do relatório" onFocus={(e) => e.target.select()} className="campo min-h-[42px] min-w-0 flex-[1_1_320px] text-[13px]" />
                <button type="button" onClick={() => void copiar()} className="btn btn-secundario">
                  <Copy size={15} strokeWidth={2} aria-hidden /> Copiar
                </button>
                <a href={link} target="_blank" rel="noreferrer" className="btn btn-secundario">
                  <ExternalLink size={15} strokeWidth={2} aria-hidden /> Abrir
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const novo = window.prompt("Novo endereço do relatório. O endereço atual deixará de funcionar.", relatorio.slug);
                    if (novo && paraEndereco(novo) !== relatorio.slug) void executar(() => alterarEndereco(relatorio.id, paraEndereco(novo)), "Endereço alterado.");
                  }}
                  className="btn btn-secundario"
                >
                  <Pencil size={15} strokeWidth={2} aria-hidden /> Alterar endereço
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-3">
              <h2 className="text-[15px] font-bold text-ink">Meses</h2>
              {meses.length === 0 ? (
                <EmptyState icone={<FileText size={20} strokeWidth={1.8} aria-hidden />} titulo="Nenhum mês lançado">
                  Clique em Novo mês para começar.
                </EmptyState>
              ) : (
                <ul className="flex flex-col">
                  {meses.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 border-t border-borda py-3 first:border-t-0">
                      <div className="min-w-44 flex-1">
                        <p className="text-[15px] font-semibold text-ink">
                          {maiuscula(nomeDoMes(m.referencia))} de {m.referencia.slice(0, 4)}
                        </p>
                        <p className="text-[12px] text-texto-2">Atualizado em {dataCurta(m.atualizado_em)}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${m.publicado ? "bg-[var(--selected)] text-azul" : "bg-[var(--neutral-strong)] text-texto-2"}`}>{m.publicado ? "Publicado" : "Rascunho"}</span>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => setEditor({ mes: m })} className="btn btn-secundario btn-36">
                          <Pencil size={14} strokeWidth={2} aria-hidden /> Editar
                        </button>
                        <button type="button" onClick={() => void executar(() => definirPublicado(m.id, !m.publicado), m.publicado ? "Mês tirado do relatório." : "Mês publicado.")} className="btn btn-secundario btn-36">
                          {m.publicado ? "Despublicar" : "Publicar"}
                        </button>
                        <button
                          type="button"
                          aria-label={`Apagar ${nomeDoMes(m.referencia)}`}
                          onClick={() => {
                            if (window.confirm(`Apagar ${nomeDoMes(m.referencia)} de ${m.referencia.slice(0, 4)}? Essa ação não pode ser desfeita.`)) void executar(() => apagarMes(m.id), "Mês apagado.");
                          }}
                          className="btn btn-secundario btn-36"
                        >
                          <Trash2 size={14} strokeWidth={2} aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      )}

      {editor && relatorio && projeto && (
        <RelatorioMes
          key={editor.mes?.id ?? "novo"}
          relatorio={relatorio}
          nomeCliente={projeto.nome}
          logoCliente={logoCliente ?? null}
          meses={meses}
          editando={editor.mes}
          onFechar={() => setEditor(null)}
          onSalvo={() => {
            setEditor(null);
            void atualizar();
          }}
        />
      )}
    </div>
  );
}
