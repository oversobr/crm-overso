import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink, Image as ImageIcon, Link2, Lock, Mail, Phone, Plus, Trash2, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import { ajustarLogo } from "@/lib/imagem";
import { perfilClienteQuery, podeGerenciarQuery, salvarLogoCliente, salvarPerfilCliente } from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { LinkCliente, PerfilCliente } from "@/lib/types";

const BUCKET_LOGO = "logos-cliente";

export const Route = createFileRoute("/_authed/cliente")({ component: PerfilDoCliente });

/**
 * Ficha de trabalho do cliente selecionado.
 *
 * O isolamento é a regra desta tela, e ele se apoia em três coisas:
 *  1. a consulta é por id (`.eq("id", projeto.id)`), nunca uma leitura da
 *     tabela filtrada depois no navegador;
 *  2. a RLS recusa no banco qualquer cliente que a sessão não alcance;
 *  3. o Outlet remonta a cada troca de cliente (o `key={trocas}` do layout),
 *     então nem rascunho de formulário atravessa de um cliente pro outro.
 */
function PerfilDoCliente() {
  const { projeto } = usePainel();
  const qc = useQueryClient();

  const { data: perfil, isLoading, error } = useQuery(perfilClienteQuery(projeto?.id));
  const { data: podeEditar = false } = useQuery(podeGerenciarQuery(projeto?.id));

  if (!projeto) {
    return (
      <>
        <Cabecalho titulo="Perfil do cliente" comCampanha={false} />
        <Card>
          <Vazio>Escolha um cliente no menu lateral para ver a ficha dele.</Vazio>
        </Card>
      </>
    );
  }

  return (
    <>
      <Cabecalho
        titulo="Perfil do cliente"
        subtitulo={`Ficha de ${projeto.nome}. Vale só para este cliente.`}
        comCampanha={false}
      />

      {error ? (
        <Card>
          <Vazio>
            {/* Coluna inexistente = banco sem a 28. Vale dizer qual arquivo
                rodar, em vez de só repetir a mensagem crua do Postgres. */}
            {/column|does not exist|schema cache/i.test((error as Error).message)
              ? "A ficha do cliente ainda não foi ativada no banco (supabase/28_perfil_cliente.sql)."
              : `Não consegui carregar a ficha: ${(error as Error).message}`}
          </Vazio>
        </Card>
      ) : isLoading || !perfil ? (
        <Card>
          <Vazio>Carregando…</Vazio>
        </Card>
      ) : (
        <Ficha
          // key pelo id: trocar de cliente joga fora o formulário inteiro em
          // vez de reaproveitar o estado, que é como dado de um vazaria no outro.
          key={perfil.id}
          perfil={perfil}
          podeEditar={podeEditar}
          onSalvo={() => qc.invalidateQueries({ queryKey: ["perfil-cliente", projeto.id] })}
        />
      )}
    </>
  );
}

function Ficha({
  perfil,
  podeEditar,
  onSalvo,
}: {
  perfil: PerfilCliente;
  podeEditar: boolean;
  onSalvo: () => Promise<void> | void;
}) {
  const [responsavel, setResponsavel] = useState(perfil.responsavel ?? "");
  const [contatoNome, setContatoNome] = useState(perfil.contato_nome ?? "");
  const [contatoEmail, setContatoEmail] = useState(perfil.contato_email ?? "");
  const [contatoTelefone, setContatoTelefone] = useState(perfil.contato_telefone ?? "");
  const [observacoes, setObservacoes] = useState(perfil.observacoes ?? "");
  const [links, setLinks] = useState<LinkCliente[]>(perfil.links ?? []);

  // "Salvar" só acende quando há o que salvar.
  const original = JSON.stringify({
    responsavel: perfil.responsavel ?? "",
    contatoNome: perfil.contato_nome ?? "",
    contatoEmail: perfil.contato_email ?? "",
    contatoTelefone: perfil.contato_telefone ?? "",
    observacoes: perfil.observacoes ?? "",
    links: perfil.links ?? [],
  });
  const atual = JSON.stringify({
    responsavel,
    contatoNome,
    contatoEmail,
    contatoTelefone,
    observacoes,
    links,
  });
  const mudou = original !== atual;

  // Aviso do navegador ao fechar a aba com alteração pendente.
  useEffect(() => {
    if (!mudou) return;
    const avisar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [mudou]);

  const salvar = useMutation({
    mutationFn: () =>
      salvarPerfilCliente(perfil.id, {
        responsavel: responsavel.trim() || null,
        contato_nome: contatoNome.trim() || null,
        contato_email: contatoEmail.trim() || null,
        contato_telefone: contatoTelefone.trim() || null,
        observacoes: observacoes.trim() || null,
        links: links.filter((l) => l.url.trim()),
      }),
    onSuccess: async () => {
      await onSalvo();
      toast("Ficha atualizada.", "success");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const campo =
    "w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition focus:border-accent/70 disabled:opacity-60";

  return (
    <>
      {!podeEditar && (
        <p className="mb-4 flex items-center gap-2 rounded-xl border border-line/70 bg-surface-2/50 px-4 py-2.5 text-sm text-muted">
          <Lock size={14} className="shrink-0" />
          Você vê a ficha, mas alterar é de um admin deste cliente.
        </p>
      )}

      <LogoCliente perfil={perfil} podeEditar={podeEditar} onSalvo={onSalvo} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card titulo="Quem cuida">
          <Rotulo texto="Responsável na OVERSO">
            <input
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              disabled={!podeEditar}
              placeholder="Ex.: José"
              className={campo}
            />
          </Rotulo>

          <div className="mt-4 border-t border-line/70 pt-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted">
              Contato do cliente
            </p>
            <Rotulo texto="Nome">
              <input
                value={contatoNome}
                onChange={(e) => setContatoNome(e.target.value)}
                disabled={!podeEditar}
                placeholder="Com quem a gente fala"
                className={campo}
              />
            </Rotulo>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Rotulo texto="Email">
                <input
                  type="email"
                  value={contatoEmail}
                  onChange={(e) => setContatoEmail(e.target.value)}
                  disabled={!podeEditar}
                  className={campo}
                />
              </Rotulo>
              <Rotulo texto="Telefone / WhatsApp">
                <input
                  value={contatoTelefone}
                  onChange={(e) => setContatoTelefone(e.target.value)}
                  disabled={!podeEditar}
                  className={campo}
                />
              </Rotulo>
            </div>

            {/* Com o dado salvo, o contato vira ação em vez de texto. */}
            {(perfil.contato_email || perfil.contato_telefone) && (
              <div className="mt-3 flex flex-wrap gap-2">
                {perfil.contato_email && (
                  <Atalho href={`mailto:${perfil.contato_email}`} Icone={Mail}>
                    {perfil.contato_email}
                  </Atalho>
                )}
                {perfil.contato_telefone && (
                  <Atalho
                    href={`https://wa.me/${perfil.contato_telefone.replace(/\D/g, "")}`}
                    Icone={Phone}
                  >
                    WhatsApp
                  </Atalho>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card titulo="Lugares do cliente" className="flex flex-col">
          <Links links={links} onMudar={setLinks} podeEditar={podeEditar} />
        </Card>
      </div>

      <Card titulo="Observações" className="mt-4">
        <p className="mb-2 text-xs text-muted">
          Combinados, tom de voz, o que pode e o que não pode. É o que a equipe lê antes de
          produzir.
        </p>
        <textarea
          value={observacoes}
          onChange={(e) => setObservacoes(e.target.value)}
          disabled={!podeEditar}
          rows={7}
          placeholder="Ex.: cliente aprova post por WhatsApp; não usar emoji; logo sempre no canto direito."
          className={`${campo} resize-y leading-relaxed`}
        />
      </Card>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Cadastrado em {new Date(perfil.criado_em).toLocaleDateString("pt-BR")}
          {perfil.atualizado_em &&
            ` · ficha atualizada em ${new Date(perfil.atualizado_em).toLocaleDateString("pt-BR")}`}
        </p>

        {podeEditar && (
          <button
            onClick={() => salvar.mutate()}
            disabled={!mudou || salvar.isPending}
            className="rounded-xl bg-gold px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gold-dim disabled:opacity-40"
          >
            {salvar.isPending ? "Salvando…" : mudou ? "Salvar ficha" : "Tudo salvo"}
          </button>
        )}
      </div>
    </>
  );
}

/** Até onde o logo é encolhido antes de subir. */
const LADO_LOGO = 512;

/**
 * Logo do cliente, no topo da ficha. A imagem fica num bucket público
 * (29_logo_cliente.sql) e a linha do cliente guarda a URL e o caminho — o
 * caminho é o que permite apagar o arquivo antigo quando troca.
 */
function LogoCliente({
  perfil,
  podeEditar,
  onSalvo,
}: {
  perfil: PerfilCliente;
  podeEditar: boolean;
  onSalvo: () => Promise<void> | void;
}) {
  const sb = getSupabaseBrowserClient();
  const entrada = useRef<HTMLInputElement>(null);

  const trocar = useMutation({
    mutationFn: async (arquivo: File) => {
      if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
      const imagem = await ajustarLogo(arquivo, LADO_LOGO);
      // Nome novo a cada troca: o endereço muda e nenhum cache insiste no
      // logo antigo. A pasta é o id do cliente — é o que a policy confere.
      const caminho = `${perfil.id}/${Date.now()}.png`;

      const up = await sb.storage.from(BUCKET_LOGO).upload(caminho, imagem, {
        contentType: "image/png",
      });
      if (up.error) {
        if (/bucket not found/i.test(up.error.message)) {
          throw new Error("O logo do cliente ainda não foi ativado: rode o supabase/29_logo_cliente.sql.");
        }
        throw up.error;
      }

      const url = sb.storage.from(BUCKET_LOGO).getPublicUrl(caminho).data.publicUrl;
      await salvarLogoCliente(perfil.id, { logo_url: url, logo_caminho: caminho });
      // O antigo sai só depois que o novo já está valendo na linha.
      if (perfil.logo_caminho) await sb.storage.from(BUCKET_LOGO).remove([perfil.logo_caminho]);
    },
    onSuccess: async () => {
      await onSalvo();
      toast("Logo atualizado.", "success");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const remover = useMutation({
    mutationFn: async () => {
      await salvarLogoCliente(perfil.id, { logo_url: null, logo_caminho: null });
      if (perfil.logo_caminho) await sb.storage.from(BUCKET_LOGO).remove([perfil.logo_caminho]);
    },
    onSuccess: async () => {
      await onSalvo();
      toast("Logo removido.", "success");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const ocupado = trocar.isPending || remover.isPending;

  return (
    <Card className="mb-4">
      <div className="flex flex-wrap items-center gap-5">
        {/* Xadrez por baixo: logo com transparência precisa de um fundo que
            denuncie o que é transparente, nos dois temas. */}
        <div
          className="flex h-24 w-40 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line/70 bg-surface-2"
          style={{
            backgroundImage:
              "linear-gradient(45deg, rgba(128,128,128,0.12) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.12) 75%), linear-gradient(45deg, rgba(128,128,128,0.12) 25%, transparent 25%, transparent 75%, rgba(128,128,128,0.12) 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 8px 8px",
          }}
        >
          {perfil.logo_url ? (
            <img
              src={perfil.logo_url}
              alt={`Logo de ${perfil.nome}`}
              className="max-h-full max-w-full object-contain p-2"
            />
          ) : (
            <ImageIcon size={22} className="text-muted" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="display truncate text-lg font-semibold text-ink">{perfil.nome}</h2>
          <p className="truncate text-xs text-muted">{perfil.slug}</p>

          {podeEditar && (
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                ref={entrada}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const a = e.target.files?.[0];
                  // Zera o input: escolher o MESMO arquivo de novo precisa
                  // disparar o evento, e sem isto o navegador não dispara.
                  e.target.value = "";
                  if (a) trocar.mutate(a);
                }}
              />
              <button
                onClick={() => entrada.current?.click()}
                disabled={ocupado}
                className="flex items-center gap-2 rounded-xl border border-line/70 px-3 py-2 text-sm text-ink transition hover:border-accent/50 disabled:opacity-60"
              >
                <Upload size={14} />
                {trocar.isPending ? "Enviando…" : perfil.logo_url ? "Trocar logo" : "Enviar logo"}
              </button>

              {perfil.logo_url && (
                <button
                  onClick={() => remover.mutate()}
                  disabled={ocupado}
                  className="flex items-center gap-2 rounded-xl border border-rose-500/30 px-3 py-2 text-sm text-rose-600 transition hover:bg-rose-500/10 disabled:opacity-60 dark:text-rose-400"
                >
                  <Trash2 size={14} /> Remover
                </button>
              )}
            </div>
          )}

          <p className="mt-2 text-xs text-muted">
            PNG, JPEG ou WebP, até 2 MB. A transparência do PNG é preservada.
          </p>
        </div>
      </div>
    </Card>
  );
}

function Links({
  links,
  onMudar,
  podeEditar,
}: {
  links: LinkCliente[];
  onMudar: (l: LinkCliente[]) => void;
  podeEditar: boolean;
}) {
  // Sem largura na classe base, de propósito: quem define é cada campo na
  // linha. Misturar `w-full` aqui com `w-28` lá vira disputa entre duas
  // utilities de largura, e quem vence é a ordem do CSS gerado, não a ordem
  // em que foram escritas — foi o que quebrou esta lista.
  const campo =
    "rounded-lg border border-line/70 bg-surface-2 px-2.5 py-2 text-sm text-ink outline-none transition focus:border-accent/70";

  const trocar = (i: number, parte: Partial<LinkCliente>) =>
    onMudar(links.map((l, j) => (j === i ? { ...l, ...parte } : l)));

  if (!podeEditar) {
    const validos = links.filter((l) => l.url.trim());
    if (!validos.length) return <Vazio>Nenhum link cadastrado.</Vazio>;
    return (
      <div className="space-y-2">
        {validos.map((l, i) => (
          <a
            key={i}
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-line/70 bg-surface-2/40 px-3 py-2.5 text-sm text-ink transition hover:border-accent/50"
          >
            <Link2 size={14} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate">{l.rotulo || l.url}</span>
            <ExternalLink size={13} className="shrink-0 text-muted" />
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="mb-3 text-xs text-muted">
        Site, drive das artes, perfil nas redes — onde a equipe precisa chegar.
      </p>

      <div className="space-y-2">
        {links.map((l, i) => (
          // flex-wrap + basis: no card estreito o endereço desce pra linha de
          // baixo em vez de virar um talo espremido. min-w-0 é obrigatório —
          // input tem largura intrínseca e, sem isso, se recusa a encolher e
          // empurra a lixeira pra fora do card.
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={l.rotulo}
              onChange={(e) => trocar(i, { rotulo: e.target.value })}
              placeholder="Nome"
              className={`${campo} w-24 shrink-0`}
            />
            <input
              value={l.url}
              onChange={(e) => trocar(i, { url: e.target.value })}
              placeholder="https://"
              className={`${campo} min-w-0 flex-1 basis-40`}
            />
            <button
              onClick={() => onMudar(links.filter((_, j) => j !== i))}
              aria-label="Remover link"
              title="Remover link"
              className="shrink-0 rounded-lg p-2 text-muted transition hover:bg-rose-500/10 hover:text-rose-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() => onMudar([...links, { rotulo: "", url: "" }])}
        className="mt-3 flex items-center gap-1.5 self-start rounded-xl border border-line/70 px-3 py-2 text-sm text-muted transition hover:border-accent/50 hover:text-ink"
      >
        <Plus size={14} /> Adicionar link
      </button>
    </div>
  );
}

function Rotulo({ texto, children }: { texto: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{texto}</span>
      {children}
    </label>
  );
}

function Atalho({
  href,
  Icone,
  children,
}: {
  href: string;
  Icone: typeof Mail;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex max-w-full items-center gap-1.5 rounded-full border border-line/70 px-3 py-1.5 text-xs text-ink transition hover:border-accent/50"
    >
      <Icone size={12} className="shrink-0" />
      <span className="truncate">{children}</span>
    </a>
  );
}
