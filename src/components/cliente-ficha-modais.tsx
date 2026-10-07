import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Code2, Copy, Megaphone, Pencil, Trash2, UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { CampanhasCliente } from "@/components/campanhas-cliente";
import { ModalDegrade } from "@/components/ds/modal";
import { contarLeadsQuery, removerCliente, renomearCliente, salvarPerfilCliente } from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { toast } from "@/lib/toast";
import type { PerfilCliente } from "@/lib/types";

/** Os popups da ficha do cliente: editar dados, script, pessoa, campanhas e remoção. */

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-bold text-texto-2">{rotulo}</span>
      {children}
      {dica && <span className="text-[11px] text-texto-3">{dica}</span>}
    </label>
  );
}

/* ── Editar dados ───────────────────────────────────────────────────── */

export function EditarDadosModal({
  perfil,
  podeRenomear,
  onFechar,
  onSalvo,
}: {
  perfil: PerfilCliente;
  /** Trocar o nome do cliente é da equipe OVERSO. */
  podeRenomear: boolean;
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}) {
  const [nome, setNome] = useState(perfil.nome);
  const [segmento, setSegmento] = useState(perfil.segmento ?? "");
  const [responsavel, setResponsavel] = useState(perfil.contato_nome ?? "");
  const [telefone, setTelefone] = useState(perfil.contato_telefone ?? "");
  const [email, setEmail] = useState(perfil.contato_email ?? "");
  const [observacoes, setObservacoes] = useState(perfil.observacoes ?? "");

  const salvar = useMutation({
    mutationFn: async () => {
      if (podeRenomear && nome.trim() !== perfil.nome) await renomearCliente(perfil.id, nome.trim());
      await salvarPerfilCliente(perfil.id, {
        contato_nome: responsavel.trim() || null,
        contato_telefone: telefone.trim() || null,
        contato_email: email.trim() || null,
        observacoes: observacoes.trim() || null,
        links: perfil.links ?? [],
        segmento: segmento.trim() || null,
      });
    },
    onSuccess: async () => {
      await onSalvo();
      toast("Dados do cliente atualizados.");
      onFechar();
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      icone={<Pencil size={26} strokeWidth={1.8} aria-hidden />}
      titulo="Editar dados"
      selo={perfil.nome}
      contexto="Contato e combinados deste cliente"
      largura={720}
      rodape={
        <>
          <button type="button" onClick={onFechar} className="btn btn-secundario font-bold">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => salvar.mutate()}
            disabled={!nome.trim() || salvar.isPending}
            className="btn btn-primario font-bold"
          >
            {salvar.isPending ? "Salvando…" : "Salvar dados"}
          </button>
        </>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-[2fr_1fr]">
        {podeRenomear && (
          <Campo rotulo="Nome do cliente">
            <input value={nome} onChange={(e) => setNome(e.target.value)} className="campo" />
          </Campo>
        )}
        <Campo rotulo="Segmento">
          <input value={segmento} onChange={(e) => setSegmento(e.target.value)} placeholder="Ex.: Estética" className="campo" />
        </Campo>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-3">
        <Campo rotulo="Responsável">
          <input
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Com quem a gente fala"
            className="campo"
          />
        </Campo>
        <Campo rotulo="WhatsApp">
          <input
            type="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(11) 90000-0000"
            className="campo"
          />
        </Campo>
        <Campo rotulo="E-mail">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nome@cliente.com.br"
            className="campo"
          />
        </Campo>
      </div>
      <Campo rotulo="Observações" dica="Tom de voz, o que pode e o que não pode, datas importantes. É o que a equipe lê antes de produzir.">
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          rows={6}
          className="campo h-auto resize-y py-3 leading-relaxed"
        />
      </Campo>
    </ModalDegrade>
  );
}

/* ── Script da landing page ─────────────────────────────────────────── */

export function BotaoCopiar({ texto, rotulo, copiado: rotuloCopiado }: { texto: string; rotulo: string; copiado: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1800);
      }}
      className={`btn btn-40 whitespace-nowrap border px-3 text-[12px] font-bold ${
        copiado ? "border-sucesso bg-sucesso-fundo text-sucesso" : "border-borda-campo bg-white text-marinho hover:bg-superficie-2"
      }`}
    >
      {copiado ? <Check size={14} strokeWidth={2.4} aria-hidden /> : <Copy size={14} strokeWidth={1.8} aria-hidden />}
      {copiado ? rotuloCopiado : rotulo}
    </button>
  );
}

/**
 * O script pronto do cliente. Vem de public/ (uma cópia só, sem risco de
 * divergir do que está no disco) e só a configuração é trocada pela dele.
 */
export function ScriptDaLanding({
  chave,
  nome,
  largo = false,
}: {
  chave: string;
  nome: string;
  /**
   * Só o bloco do script, ocupando a altura que sobrar (passo 3 do cadastro,
   * que mostra as dicas ao lado da chave). Sem isto, o bloco tem altura fixa
   * e as dicas vêm embaixo.
   */
  largo?: boolean;
}) {
  const { data: bruto, isError } = useQuery({
    queryKey: ["script-wp"],
    queryFn: async () => {
      const r = await fetch("/overso-lead-wp.js");
      if (!r.ok) throw new Error("não consegui ler o script");
      return r.text();
    },
    staleTime: Infinity,
  });

  const script = bruto?.replace(
    /var CFG = \{[\s\S]*?\};/,
    `var CFG = {\n    url: "${supabaseUrl()}",\n    anonKey: "${supabaseAnonKey()}",\n    key: "${chave}",\n  };`,
  );

  if (isError) return <p className="m-0 text-[13px] text-erro-texto">Não consegui montar o script. Recarregue a página e tente de novo.</p>;
  if (!script) return <p className="m-0 text-[13px] text-texto-3">Montando o script…</p>;

  return (
    <div className={`flex flex-col gap-3 ${largo ? "min-h-[240px] flex-[1_1_0px]" : ""}`}>
      <div className={`flex flex-col overflow-hidden rounded-[14px] border border-marinho ${largo ? "min-h-[240px] flex-[1_1_0px]" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-marinho py-2.5 pl-4 pr-3 text-azul-claro-2">
          <span className="text-[12px]">
            Script de <strong className="text-white">{nome}</strong> · copie tudo ({script.split("\n").length} linhas)
          </span>
          <CopiarScript texto={script} />
        </div>
        <pre
          className={`rolagem-fina m-0 overflow-auto bg-[#14202F] px-4 py-3.5 font-mono text-[12px] leading-[1.65] text-[#C9D6E6] ${
            largo ? "min-h-0 flex-[1_1_0px]" : "h-[170px]"
          }`}
        >
          {script}
        </pre>
      </div>
      {!largo && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          <DicasDeInstalacao />
        </div>
      )}
    </div>
  );
}

/** Onde colar o script: uma caixa para o WPCode e outra para o Elementor. */
export function DicasDeInstalacao() {
  const caixa = "flex flex-col gap-1.5 rounded-[14px] bg-superficie-2 px-4 py-3.5 text-[12px] leading-normal text-texto-2";
  return (
    <>
      <div className={caixa}>
        <strong className="text-[13px] text-marinho">WPCode</strong>
        JavaScript Snippet, local Site Wide Footer. Cole sem as tags &lt;script&gt;.
      </div>
      <div className={caixa}>
        <strong className="text-[13px] text-marinho">Elementor</strong>
        Custom Code ou widget HTML, envolva com &lt;script&gt;. Nos campos, use os IDs nome, whatsapp e email em Avançado → ID.
      </div>
    </>
  );
}

function CopiarScript({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1800);
      }}
      className={`btn btn-36 border-0 px-3 text-[12px] font-bold text-white ${copiado ? "bg-sucesso" : "bg-azul hover:bg-azul-hover"}`}
    >
      {copiado ? <Check size={14} strokeWidth={2.4} aria-hidden /> : <Copy size={14} strokeWidth={2} aria-hidden />}
      {copiado ? "Copiado" : "Copiar script"}
    </button>
  );
}

export function ScriptModal({ nome, chave, onFechar }: { nome: string; chave: string; onFechar: () => void }) {
  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      icone={<Code2 size={26} strokeWidth={1.8} aria-hidden />}
      titulo="Script da landing page"
      selo={nome}
      contexto="Os leads da página caem no CRM deste cliente"
      largura={760}
    >
      <ScriptDaLanding chave={chave} nome={nome} />
    </ModalDegrade>
  );
}

/* ── Adicionar pessoa ───────────────────────────────────────────────── */

export function AdicionarPessoaModal({
  clienteId,
  nome,
  onFechar,
}: {
  clienteId: string;
  nome: string;
  onFechar: () => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<"membro" | "admin">("membro");

  const conceder = useMutation({
    mutationFn: async () => {
      const { error } = await getSupabaseBrowserClient().rpc("equipe_conceder", {
        p_email: email.trim(),
        p_project: clienteId,
        p_papel: papel,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["equipe", clienteId] });
      toast("Acesso concedido.");
      onFechar();
    },
  });

  const NIVEIS = [
    { id: "membro" as const, rotulo: "Membro", dica: "Trabalha leads e conteúdo" },
    { id: "admin" as const, rotulo: "Admin do cliente", dica: "Também apaga lead e gerencia acessos" },
  ];

  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      icone={<UserPlus size={26} strokeWidth={1.8} aria-hidden />}
      titulo="Adicionar pessoa"
      selo={nome}
      contexto="A pessoa precisa já ter conta no portal"
      largura={560}
      rodape={
        <>
          <button type="button" onClick={onFechar} className="btn btn-secundario font-bold">
            Cancelar
          </button>
          <button
            type="submit"
            form="form-adicionar-pessoa"
            disabled={!email.trim() || conceder.isPending}
            className="btn btn-primario font-bold"
          >
            {conceder.isPending ? "Liberando…" : "Dar acesso"}
          </button>
        </>
      }
    >
      <form
        id="form-adicionar-pessoa"
        className="flex flex-col gap-[18px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) conceder.mutate();
        }}
      >
        <Campo rotulo="E-mail da pessoa">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@dapessoa.com"
            className="campo"
            aria-invalid={conceder.isError || undefined}
          />
        </Campo>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-bold text-texto-2">Nível</span>
          <div role="radiogroup" aria-label="Nível" className="grid gap-2.5 sm:grid-cols-2">
            {NIVEIS.map((n) => (
              <button
                key={n.id}
                type="button"
                role="radio"
                aria-checked={papel === n.id}
                onClick={() => setPapel(n.id)}
                className={`flex min-h-[60px] flex-col justify-center gap-0.5 rounded-[14px] border-[1.5px] px-3.5 py-2.5 text-left text-marinho transition-colors ${
                  papel === n.id ? "border-azul bg-azul-claro" : "border-borda bg-white hover:border-nevoa"
                }`}
              >
                <span className="text-[14px] font-bold">{n.rotulo}</span>
                <span className="text-[11px] text-texto-3">{n.dica}</span>
              </button>
            ))}
          </div>
        </div>
        {conceder.isError && <p className="m-0 text-[12px] font-semibold text-erro-texto">{(conceder.error as Error).message}</p>}
      </form>
    </ModalDegrade>
  );
}

/* ── Campanhas ──────────────────────────────────────────────────────── */

/** A lista de campanhas do cliente, com edição. Ainda no visual anterior. */
export function CampanhasModal({ clienteId, nome, onFechar }: { clienteId: string; nome: string; onFechar: () => void }) {
  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      icone={<Megaphone size={26} strokeWidth={1.8} aria-hidden />}
      titulo="Campanhas"
      selo={nome}
      contexto="Criar, editar e excluir as campanhas deste cliente"
      largura={760}
    >
      <CampanhasCliente projectId={clienteId} nome={nome} />
    </ModalDegrade>
  );
}

/* ── Remover cliente ────────────────────────────────────────────────── */

/** Remoção com segunda verificação: digitar o nome exato do cliente. */
export function RemoverClienteModal({
  clienteId,
  nome,
  onFechar,
  onRemovido,
}: {
  clienteId: string;
  nome: string;
  onFechar: () => void;
  onRemovido: () => Promise<void>;
}) {
  const [confirmacao, setConfirmacao] = useState("");
  const { data: qtdLeads } = useQuery(contarLeadsQuery(clienteId));
  const confere = confirmacao.trim() === nome.trim();

  const remover = useMutation({
    mutationFn: () => removerCliente(clienteId),
    onSuccess: async (arquivos) => {
      await onRemovido();
      toast(
        arquivos
          ? `Cliente "${nome}" removido, com ${arquivos.toLocaleString("pt-BR")} ${arquivos === 1 ? "arquivo" : "arquivos"}.`
          : `Cliente "${nome}" removido.`,
      );
    },
  });

  return (
    <ModalDegrade
      aberto
      onFechar={onFechar}
      icone={<Trash2 size={26} strokeWidth={1.8} color="#C8372D" aria-hidden />}
      titulo="Remover cliente"
      selo={nome}
      contexto="Não dá para desfazer"
      largura={560}
      rodape={
        <>
          <button type="button" onClick={onFechar} className="btn btn-secundario font-bold">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => remover.mutate()}
            disabled={!confere || remover.isPending}
            className="btn bg-erro font-bold text-white hover:bg-erro-texto disabled:bg-nevoa-2 disabled:text-texto-3"
          >
            <Trash2 size={16} strokeWidth={1.8} aria-hidden />
            {remover.isPending ? "Removendo dados e arquivos…" : "Remover cliente"}
          </button>
        </>
      }
    >
      <p className="m-0 text-[14px] leading-relaxed text-marinho">
        Isto remove <strong>{nome}</strong>
        {qtdLeads != null && (
          <>
            {" "}
            e apaga{" "}
            <strong className="text-erro-texto">
              {qtdLeads.toLocaleString("pt-BR")} {qtdLeads === 1 ? "lead" : "leads"}
            </strong>
          </>
        )}
        , junto com os posts, as artes, os materiais e os acessos. A landing page para de enviar leads.
      </p>
      <Campo rotulo={`Para confirmar, digite o nome do cliente: ${nome}`}>
        <input
          autoFocus
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && confere && !remover.isPending) remover.mutate();
          }}
          placeholder="Digite o nome exatamente"
          className="campo"
        />
      </Campo>
      {remover.isError && <p className="m-0 text-[12px] font-semibold text-erro-texto">{(remover.error as Error).message}</p>}
    </ModalDegrade>
  );
}
