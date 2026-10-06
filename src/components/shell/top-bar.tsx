import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { Menu, RefreshCw, Search } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { setAtualizando, useAtualizando } from "@/lib/refresh";
import { toast } from "@/lib/toast";
import { useUsuario } from "@/lib/usuario";

import { useShell } from "./contexto";
import { Sino } from "./notificacoes-popover";

/**
 * Topo de cada tela: título à esquerda; busca, atualizar, sino e avatar à direita.
 * Não é uma barra fixa do shell: no design ele faz parte da página e rola
 * com ela, e o título muda a cada tela.
 */
export function TopBar({
  titulo,
  caminho,
  selo,
  seloTom = "azul",
  subtitulo,
  acoes,
  noLugarDoAvatar,
}: {
  titulo: string;
  /**
   * Trilha de navegação ("Clientes / Sáli Estética") no lugar do título
   * grande. Usada pela ficha do cliente, que tem o nome dele na capa.
   * O `titulo` continua valendo para leitor de tela.
   */
  caminho?: ReactNode;
  /** Pílula ao lado do título: o total da lista ("488"). */
  selo?: ReactNode;
  /** Azul para contagem neutra; "erro" quando o número pede atenção (não lidas). */
  seloTom?: "azul" | "erro";
  subtitulo?: ReactNode;
  /**
   * Botões próprios da tela. Quando existem, ocupam o lugar da busca do
   * topo, como no design (a tela de Leads tem a busca dela na tabela).
   */
  acoes?: ReactNode;
  /**
   * Entra depois do sino, no lugar do avatar. Só a tela de Perfil usa: lá o
   * avatar levaria para a própria tela, e o design põe o "Sair" ali.
   */
  noLugarDoAvatar?: ReactNode;
}) {
  const { abrirMenu } = useShell();
  const usuario = useUsuario();

  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      {/* Base de 320px que encolhe e cresce: um subtítulo comprido quebra em
          duas linhas em vez de empurrar as ações para a linha de baixo. */}
      <div className="flex min-w-0 flex-[1_1_320px] items-center gap-3">
        {/* O menu vira gaveta abaixo de 1024px; este é o único acesso a ele. */}
        <button type="button" onClick={abrirMenu} aria-label="Abrir menu" className="btn-icone lg:hidden">
          <Menu size={20} strokeWidth={1.8} aria-hidden />
        </button>
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2.5">
            {caminho ? (
              <>
                <h1 className="sr-only">{titulo}</h1>
                {caminho}
              </>
            ) : (
              <h1 className="m-0 text-[24px] font-extrabold leading-tight tracking-[-0.01em]">{titulo}</h1>
            )}
            {selo != null && (
              <span
                className={`whitespace-nowrap rounded-full px-[9px] py-[3px] text-[12px] font-bold ${
                  seloTom === "erro" ? "bg-erro-fundo text-erro-texto" : "bg-azul-claro-2 text-[#1A57A6]"
                }`}
              >
                {selo}
              </span>
            )}
          </div>
          {subtitulo && <span className="text-[13px] text-texto-3">{subtitulo}</span>}
        </div>
      </div>

      <div className="flex max-w-full flex-wrap items-center gap-2.5">
        {acoes}
        {!acoes && !noLugarDoAvatar && <Busca />}
        <Atualizar />
        <Sino />
        {noLugarDoAvatar ?? (
        <Link
          to="/perfil"
          aria-label="Meu perfil"
          title={usuario.nome || "Meu perfil"}
          className="flex h-11 w-11 flex-none items-center justify-center overflow-hidden rounded-full bg-marinho text-[13px] font-bold text-white no-underline transition-colors hover:bg-marinho-hover"
        >
          {usuario.avatarUrl ? <img src={usuario.avatarUrl} alt="" className="h-full w-full object-cover" /> : usuario.iniciais}
        </Link>
        )}
      </div>
    </header>
  );
}

/**
 * Busca de novo tudo o que a tela mostra, sem recarregar a página (o F5).
 * O ícone gira só neste pedido manual: as cargas de fundo não o movem.
 */
function Atualizar() {
  const qc = useQueryClient();
  const atualizando = useAtualizando();

  async function atualizar() {
    setAtualizando(true);
    try {
      // Resolve só quando as buscas terminam: o aviso sai no momento certo.
      // O tempo mínimo garante que a animação apareça mesmo com resposta instantânea.
      await Promise.all([qc.invalidateQueries(), new Promise((r) => setTimeout(r, 600))]);
      toast("Dados atualizados.");
    } catch {
      toast("Não consegui atualizar. Confira a conexão e tente de novo.", "error");
    } finally {
      setAtualizando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void atualizar()}
      disabled={atualizando}
      title="Busca os dados mais recentes, sem recarregar a página"
      className="btn btn-secundario font-bold"
    >
      <RefreshCw size={16} strokeWidth={2} aria-hidden className={atualizando ? "animate-spin" : ""} />
      {atualizando ? "Atualizando…" : "Atualizar"}
    </button>
  );
}

/**
 * Busca do topo. Enter leva o termo para a tela de Leads, que já busca em
 * nome, email e WhatsApp. Posts e clientes entram junto com as telas deles.
 */
function Busca() {
  const router = useRouter();
  const [termo, setTermo] = useState("");

  return (
    <form
      role="search"
      className="hidden sm:block"
      onSubmit={(e) => {
        e.preventDefault();
        const busca = termo.trim();
        if (!busca) return;
        void router.navigate({ to: "/leads", search: { busca } });
        setTermo("");
      }}
    >
      <label className="campo flex w-[300px] max-w-full items-center gap-2.5 pl-3.5 pr-2 text-texto-3">
        <Search size={18} strokeWidth={1.8} aria-hidden className="shrink-0" />
        <span className="sr-only">Buscar</span>
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar lead, post ou cliente"
          className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-marinho"
        />
      </label>
    </form>
  );
}
