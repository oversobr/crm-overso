import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowSquareOut, Camera, CircleNotch, Envelope, LinkSimple, Lock, Phone, Plus, Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Cabecalho, usePainel } from "@/components/painel";
import { Card, Vazio } from "@/components/ui";
import { ajustarLogo } from "@/lib/imagem";
import { perfilClienteQuery, podeGerenciarQuery, salvarLogoCliente, salvarPerfilCliente } from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import { urlSegura } from "@/lib/url";
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
  const [contatoNome, setContatoNome] = useState(perfil.contato_nome ?? "");
  const [contatoEmail, setContatoEmail] = useState(perfil.contato_email ?? "");
  const [contatoTelefone, setContatoTelefone] = useState(perfil.contato_telefone ?? "");
  const [observacoes, setObservacoes] = useState(perfil.observacoes ?? "");
  const [links, setLinks] = useState<LinkCliente[]>(perfil.links ?? []);

  // "Salvar" só acende quando há o que salvar.
  const original = JSON.stringify({
    contatoNome: perfil.contato_nome ?? "",
    contatoEmail: perfil.contato_email ?? "",
    contatoTelefone: perfil.contato_telefone ?? "",
    observacoes: perfil.observacoes ?? "",
    links: perfil.links ?? [],
  });
  const atual = JSON.stringify({
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
        <Card titulo="Contato do cliente">
          <div>
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
                  <Atalho href={`mailto:${perfil.contato_email}`} Icone={Envelope}>
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
    <section className="mb-4 overflow-hidden rounded-3xl border border-line/70 bg-surface shadow-sm shadow-black/5">
      {/* Faixa da marca, igual à capa do perfil de usuário e à do login:
          é ela que faz o bloco ler como identidade e não como formulário. */}
      <div className="relative h-24 overflow-hidden bg-brand-950 sm:h-28">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-brand-500/40 blur-[90px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-brand-700/60 blur-[100px]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 pb-6 sm:px-6">
        {/* Quadrado arredondado, e não círculo: logo é quase sempre horizontal,
            e num círculo ele teria que encolher muito pra caber. A inicial no
            azul da marca cobre quem ainda não tem logo — o cliente se
            identifica de cara de um jeito ou de outro.
            `object-contain`: o logo cabe inteiro, nunca é cortado. */}
        <button
          type="button"
          onClick={() => podeEditar && entrada.current?.click()}
          disabled={!podeEditar || ocupado}
          title={podeEditar ? "Trocar logo" : perfil.nome}
          className="group relative -mt-10 h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-gold text-3xl font-semibold text-white shadow-lg shadow-black/20 ring-4 ring-surface disabled:cursor-default"
        >
          {perfil.logo_url ? (
            <img
              src={perfil.logo_url}
              alt={perfil.nome}
              className="h-full w-full bg-surface object-contain p-1.5"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              {(perfil.nome.trim()[0] ?? "?").toUpperCase()}
            </span>
          )}

          {podeEditar && (
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100">
              {ocupado ? <CircleNotch size={18} className="animate-spin" /> : <Camera size={18} />}
              {ocupado ? "Enviando…" : "Trocar"}
            </span>
          )}
        </button>

        <div className="min-w-[10rem] flex-1">
          <h2 className="display truncate text-xl font-bold text-ink">{perfil.nome}</h2>
          <p className="truncate text-sm text-muted">
            {perfil.slug} · cliente desde{" "}
            {new Date(perfil.criado_em).toLocaleDateString("pt-BR", {
              month: "short",
              year: "numeric",
            })}
          </p>
        </div>

        {podeEditar && (
          <div className="ml-auto flex shrink-0 flex-wrap gap-2">
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
              type="button"
              onClick={() => entrada.current?.click()}
              disabled={ocupado}
              className="flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-60"
            >
              <Camera size={14} /> {perfil.logo_url ? "Trocar logo" : "Enviar logo"}
            </button>
            {perfil.logo_url && (
              <button
                type="button"
                onClick={() => remover.mutate()}
                disabled={ocupado}
                className="flex items-center gap-1.5 rounded-full border border-line/70 px-4 py-2 text-sm text-muted transition hover:border-rose-400/60 hover:text-rose-500 disabled:opacity-60"
              >
                <Trash size={14} /> Remover
              </button>
            )}
          </div>
        )}
      </div>
    </section>
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
            href={urlSegura(l.url) ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-line/70 bg-surface-2/40 px-3 py-2.5 text-sm text-ink transition hover:border-accent/50"
          >
            <LinkSimple size={14} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate">{l.rotulo || l.url}</span>
            <ArrowSquareOut size={13} className="shrink-0 text-muted" />
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
              <Trash size={14} />
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
  Icone: typeof Envelope;
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
