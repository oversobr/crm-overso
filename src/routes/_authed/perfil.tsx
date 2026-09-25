import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  Camera,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Cabecalho } from "@/components/painel";
import { Card } from "@/components/ui";
import { podeConectarQuery, projectsQuery } from "@/lib/queries";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";

export const Route = createFileRoute("/_authed/perfil")({ component: Perfil });

type Meta = { full_name?: string; name?: string; avatar_url?: string; avatar_caminho?: string };

const BUCKET = "avatares";
/** Lado da foto salva: o suficiente pra tela Retina, leve pra carregar. */
const LADO_FOTO = 320;

/**
 * Recorta a imagem no quadrado central e reduz pra LADO_FOTO. Assim a foto
 * enviada tem sempre o mesmo tamanho e poucos KB, venha de onde vier (celular
 * manda fotos de 5 MB). Sai em JPEG.
 */
async function prepararFoto(arquivo: File): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não consegui ler essa imagem."));
      i.src = url;
    });
    const lado = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = LADO_FOTO;
    canvas.height = LADO_FOTO;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      img,
      (img.naturalWidth - lado) / 2,
      (img.naturalHeight - lado) / 2,
      lado,
      lado,
      0,
      0,
      LADO_FOTO,
      LADO_FOTO,
    );
    return await new Promise<Blob>((ok, falha) =>
      canvas.toBlob((b) => (b ? ok(b) : falha(new Error("Não consegui processar a imagem."))), "image/jpeg", 0.88),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Perfil() {
  const qc = useQueryClient();
  const sb = getSupabaseBrowserClient();
  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await sb.auth.getUser()).data.user,
  });
  const meta = (user?.user_metadata ?? {}) as Meta;
  const email = user?.email ?? "";

  // Atualiza o menu (e quem mais lê \"auth-user\") com o que acabou de salvar.
  const recarregar = () => qc.invalidateQueries({ queryKey: ["auth-user"] });

  return (
    <>
      <Cabecalho titulo="Meu perfil" comCampanha={false} />
      {/* Capa em largura total com a foto e os dados da conta; embaixo,
          os dois formulários lado a lado e da mesma altura. */}
      <Capa
        meta={meta}
        email={email}
        userId={user?.id}
        criadoEm={user?.created_at}
        ultimoAcesso={user?.last_sign_in_at}
        onSalvo={recarregar}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Nome meta={meta} email={email} onSalvo={recarregar} />
        <Senha />
      </div>
    </>
  );
}

function nomeDe(meta: Meta, email: string) {
  return meta.full_name || meta.name || (email ? email.split("@")[0]! : "Usuário");
}

/* ── Foto ───────────────────────────────────────────────────────── */

function Capa({
  meta,
  email,
  userId,
  criadoEm,
  ultimoAcesso,
  onSalvo,
}: {
  meta: Meta;
  email: string;
  userId: string | undefined;
  criadoEm: string | undefined;
  ultimoAcesso: string | undefined;
  onSalvo: () => Promise<void>;
}) {
  const sb = getSupabaseBrowserClient();
  const { data: projetos = [] } = useQuery(projectsQuery());
  const { data: equipe } = useQuery(podeConectarQuery());
  const input = useRef<HTMLInputElement>(null);
  const nome = nomeDe(meta, email);

  const trocar = useMutation({
    mutationFn: async (arquivo: File) => {
      if (!userId) throw new Error("Sessão não encontrada. Entre de novo.");
      if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
      const foto = await prepararFoto(arquivo);
      // Nome novo a cada troca: o link muda e nenhum cache mostra a foto velha.
      const caminho = `${userId}/${Date.now()}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(caminho, foto, { contentType: "image/jpeg" });
      if (up.error) {
        if (/bucket not found/i.test(up.error.message)) {
          throw new Error("As fotos de perfil ainda não foram ativadas: rode o supabase/27_avatares.sql.");
        }
        throw up.error;
      }
      const url = sb.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
      const { error } = await sb.auth.updateUser({ data: { avatar_url: url, avatar_caminho: caminho } });
      if (error) throw error;
      // A anterior sai do bucket depois que a nova já está valendo.
      if (meta.avatar_caminho) await sb.storage.from(BUCKET).remove([meta.avatar_caminho]);
    },
    onSuccess: async () => {
      await onSalvo();
      toast("Foto atualizada.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const remover = useMutation({
    mutationFn: async () => {
      const { error } = await sb.auth.updateUser({ data: { avatar_url: null, avatar_caminho: null } });
      if (error) throw error;
      if (meta.avatar_caminho) await sb.storage.from(BUCKET).remove([meta.avatar_caminho]);
    },
    onSuccess: async () => {
      await onSalvo();
      toast("Foto removida.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const ocupado = trocar.isPending || remover.isPending;
  const data = (iso: string | undefined, hora = false) =>
    iso
      ? new Date(iso).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          ...(hora ? { hour: "2-digit", minute: "2-digit" } : {}),
        })
      : "—";

  return (
    <section className="overflow-hidden rounded-2xl border border-line/70 bg-surface shadow-sm shadow-black/5">
      {/* Faixa da marca (a mesma identidade do login). */}
      <div className="relative h-28 overflow-hidden bg-brand-950 sm:h-32">
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full bg-brand-500/40 blur-[90px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-10 h-64 w-64 rounded-full bg-brand-700/60 blur-[100px]" />
      </div>

      {/* Linha única que quebra sozinha em tela estreita: foto e nome sempre à
          esquerda, botões empurrados pra direita (ml-auto). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 pb-10 sm:px-6">
        {/* Foto sobreposta à faixa; clicar troca. */}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={ocupado}
          title="Trocar foto"
          className="group relative -mt-4 h-28 w-28 shrink-0 overflow-hidden rounded-full bg-gold text-4xl font-semibold text-white shadow-lg shadow-black/20 ring-4 ring-surface"
        >
          {meta.avatar_url ? (
            <img src={meta.avatar_url} alt={nome} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center">{(nome.trim()[0] ?? "?").toUpperCase()}</span>
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-[11px] font-medium text-white opacity-0 transition group-hover:opacity-100">
            {ocupado ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
            {ocupado ? "Enviando…" : "Trocar foto"}
          </span>
        </button>

        <div className="min-w-[12rem] flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="display truncate text-xl font-bold text-ink">{nome}</h2>
            {equipe && (
              <span className="inline-flex h-5 items-center gap-1 rounded-full bg-gold/10 px-2 text-[10px] font-medium leading-none text-gold">
                <ShieldCheck size={10} /> Equipe OVERSO
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted">{email}</p>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={ocupado}
            className="flex items-center gap-1.5 rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-60"
          >
            <Camera size={14} /> {meta.avatar_url ? "Trocar foto" : "Enviar foto"}
          </button>
          {meta.avatar_url && (
            <button
              type="button"
              onClick={() => remover.mutate()}
              disabled={ocupado}
              className="flex items-center gap-1.5 rounded-full border border-line/70 px-4 py-2 text-sm text-muted transition hover:border-rose-400/60 hover:text-rose-500 disabled:opacity-60"
            >
              <Trash2 size={14} /> Remover
            </button>
          )}
        </div>
      </div>

      {/* Dados da conta: dão contexto e ocupam a faixa com o que importa. */}
      <dl className="grid grid-cols-1 divide-y divide-line/50 border-t border-line/50 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Dado icone={<Building2 size={15} />} rotulo="Clientes com acesso" valor={String(projetos.length)} />
        <Dado icone={<CalendarDays size={15} />} rotulo="Membro desde" valor={data(criadoEm)} />
        <Dado icone={<Clock size={15} />} rotulo="Último acesso" valor={data(ultimoAcesso, true)} />
      </dl>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const a = e.target.files?.[0];
          if (a) trocar.mutate(a);
          e.target.value = "";
        }}
      />
    </section>
  );
}

function Dado({ icone, rotulo, valor }: { icone: ReactNode; rotulo: string; valor: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5 sm:px-6">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">{icone}</span>
      <div className="min-w-0">
        <dt className="text-[11px] font-medium uppercase tracking-wider text-muted">{rotulo}</dt>
        <dd className="truncate text-sm font-semibold text-ink">{valor}</dd>
      </div>
    </div>
  );
}

/* ── Nome ───────────────────────────────────────────────────────── */

const campo =
  "w-full rounded-xl border border-line/70 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-gold/50";

function Rotulo({ texto, children, dica }: { texto: string; children: ReactNode; dica?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{texto}</span>
      {children}
      {dica && <span className="mt-1.5 block text-[11px] text-muted">{dica}</span>}
    </label>
  );
}

function Nome({ meta, email, onSalvo }: { meta: Meta; email: string; onSalvo: () => Promise<void> }) {
  const sb = getSupabaseBrowserClient();
  const atual = meta.full_name || meta.name || "";
  const [nome, setNome] = useState(atual);
  // Quando os dados chegam (ou mudam por outra aba), o campo acompanha.
  useEffect(() => setNome(atual), [atual]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await sb.auth.updateUser({ data: { full_name: nome.trim() } });
      if (error) throw error;
    },
    onSuccess: async () => {
      await onSalvo();
      toast("Nome atualizado.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const mudou = nome.trim() !== atual && nome.trim().length > 0;

  return (
    <Card titulo="Dados do perfil" className="flex flex-col">
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (mudou) salvar.mutate();
        }}
      >
        <Rotulo
          texto="Nome de exibição"
          dica="É o nome que aparece no menu, nos comentários e em “Criado por” nas próximas coisas que você criar."
        >
          <div className="relative">
            <UserRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Carol Oliveira"
              className={`${campo} pl-9`}
            />
          </div>
        </Rotulo>
        <Rotulo texto="Email" dica="O email é o login da conta e não muda por aqui.">
          <input value={email} disabled className={`${campo} cursor-not-allowed opacity-70`} />
        </Rotulo>
        <div className="mt-auto flex justify-end">
          <button
            type="submit"
            disabled={!mudou || salvar.isPending}
            className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-40"
          >
            {salvar.isPending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Card>
  );
}

/* ── Senha ──────────────────────────────────────────────────────── */

const MIN_SENHA = 8;

function Senha() {
  const sb = getSupabaseBrowserClient();
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [ver, setVer] = useState(false);

  const curta = senha.length > 0 && senha.length < MIN_SENHA;
  const diferente = confirma.length > 0 && confirma !== senha;
  const valida = senha.length >= MIN_SENHA && senha === confirma;

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await sb.auth.updateUser({ password: senha });
      if (error) {
        if (/different from the old/i.test(error.message)) throw new Error("A nova senha precisa ser diferente da atual.");
        throw error;
      }
    },
    onSuccess: () => {
      setSenha("");
      setConfirma("");
      toast("Senha alterada. Use a nova no próximo login.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <Card titulo="Senha" className="flex flex-col">
      <form
        className="flex flex-1 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valida) salvar.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Rotulo texto="Nova senha">
            <div className="relative">
              <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type={ver ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                className={`${campo} pl-9 pr-10`}
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? "Esconder senha" : "Mostrar senha"}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-ink"
              >
                {ver ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </Rotulo>
          <Rotulo texto="Confirmar nova senha">
            <input
              type={ver ? "text" : "password"}
              value={confirma}
              onChange={(e) => setConfirma(e.target.value)}
              autoComplete="new-password"
              className={campo}
            />
          </Rotulo>
        </div>
        {(curta || diferente) && (
          <p className="text-xs text-rose-500">
            {curta ? `A senha precisa ter ao menos ${MIN_SENHA} caracteres.` : "As duas senhas não são iguais."}
          </p>
        )}
        <div className="mt-auto flex justify-end">
          <button
            type="submit"
            disabled={!valida || salvar.isPending}
            className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-white transition hover:bg-gold-dim disabled:opacity-40"
          >
            {salvar.isPending ? "Alterando…" : "Alterar senha"}
          </button>
        </div>
      </form>
    </Card>
  );
}
