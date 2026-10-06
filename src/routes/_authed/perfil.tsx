import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Camera, LoaderCircle, LogOut, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { Card } from "@/components/ds/card";
import { usePainel } from "@/components/painel";
import { MarcaOverso } from "@/components/shell/icones-menu";
import { TopBar } from "@/components/shell/top-bar";
import { useAcesso } from "@/lib/acesso";
import type { Nivel } from "@/lib/acesso";
import { recortarQuadrado } from "@/lib/imagem";
import { esquecerSessaoCurta } from "@/lib/sessao";
import { CORES_CAMPANHA } from "@/lib/status";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { toast } from "@/lib/toast";
import type { Modulo, Project } from "@/lib/types";
import { MODULO_LABEL, modulosDe } from "@/lib/types";
import { iniciais } from "@/lib/usuario";

export const Route = createFileRoute("/_authed/perfil")({ component: Perfil });

/** O que a conta guarda sobre a pessoa (user_metadata do login). */
type Meta = {
  full_name?: string;
  name?: string;
  avatar_url?: string | null;
  avatar_caminho?: string | null;
  whatsapp?: string;
  cargo?: string;
};

const BUCKET = "avatares";
/** Lado da foto salva: o suficiente pra tela Retina, leve pra carregar. */
const LADO_FOTO = 320;
const MIN_SENHA = 8;
const MODULOS: Modulo[] = ["crm", "conteudo", "eventos"];

const NIVEL: Record<Nivel, { rotulo: string; descricao: (cliente: string) => string }> = {
  super: {
    rotulo: "Super-admin",
    descricao: () => "Equipe OVERSO · enxerga todos os clientes, cadastra contas e liga módulos",
  },
  admin: {
    rotulo: "Admin do cliente",
    descricao: (c) => `Admin de ${c} · apaga leads, edita a ficha e gerencia os acessos`,
  },
  membro: {
    rotulo: "Membro",
    descricao: (c) => `Membro de ${c} · vê e trabalha os leads e o conteúdo`,
  },
};

function Perfil() {
  const qc = useQueryClient();
  const sb = getSupabaseBrowserClient();
  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => (await sb.auth.getUser()).data.user,
  });
  const meta = (user?.user_metadata ?? {}) as Meta;
  const email = user?.email ?? "";

  // Atualiza o topo (e quem mais lê "auth-user") com o que acabou de salvar.
  const recarregar = () => qc.invalidateQueries({ queryKey: ["auth-user"] });

  return (
    <div className="flex flex-col gap-5">
      <TopBar
        titulo="Perfil"
        subtitulo="Seus dados, sua senha e os clientes que você acessa"
        noLugarDoAvatar={<Sair />}
      />

      <Capa meta={meta} email={email} userId={user?.id} onSalvo={recarregar} />

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[1_1_466px] flex-col gap-4">
          <DadosPessoais meta={meta} email={email} onSalvo={recarregar} />
          <Senha email={email} />
        </div>
        <Clientes />
      </div>
    </div>
  );
}

/** Encerra a sessão neste navegador. Mora no topo da tela da conta. */
function Sair() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    await getSupabaseBrowserClient().auth.signOut();
    esquecerSessaoCurta();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  }

  return (
    <button type="button" onClick={() => void sair()} disabled={saindo} className="btn btn-secundario px-4">
      <LogOut size={16} strokeWidth={1.8} aria-hidden />
      {saindo ? "Saindo…" : "Sair"}
    </button>
  );
}

const nomeDe = (meta: Meta, email: string) => meta.full_name || meta.name || (email ? email.split("@")[0]! : "Usuário");

/* ── Capa: foto, nome, nível e os números da conta ──────────────── */

function Capa({
  meta,
  email,
  userId,
  onSalvo,
}: {
  meta: Meta;
  email: string;
  userId: string | undefined;
  onSalvo: () => Promise<void>;
}) {
  const sb = getSupabaseBrowserClient();
  const { projeto, projetos } = usePainel();
  const { nivel } = useAcesso(projeto?.id);
  const input = useRef<HTMLInputElement>(null);
  const nome = nomeDe(meta, email);

  const trocar = useMutation({
    mutationFn: async (arquivo: File) => {
      if (!userId) throw new Error("Sessão não encontrada. Entre de novo.");
      if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
      const foto = await recortarQuadrado(arquivo, LADO_FOTO);
      // Nome novo a cada troca: o link muda e nenhum cache mostra a foto velha.
      const caminho = `${userId}/${Date.now()}.jpg`;
      const up = await sb.storage.from(BUCKET).upload(caminho, foto, { contentType: "image/jpeg" });
      if (up.error) {
        if (/bucket not found/i.test(up.error.message)) {
          throw new Error("As fotos de perfil ainda não foram ativadas no banco deste portal.");
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
  const modulosAtivos = projetos.reduce((t, p) => t + MODULOS.filter((m) => modulosDe(p)[m]).length, 0);

  return (
    <section
      className="relative flex flex-wrap items-center gap-[22px] overflow-hidden rounded-[20px] p-7 text-white"
      style={{ background: "var(--degrade-profundo)" }}
    >
      <MarcaOverso largura={260} altura={235} className="pointer-events-none absolute -top-[30px] right-[30px] opacity-[0.08]" />

      <div className="relative flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={ocupado}
          aria-label={meta.avatar_url ? "Trocar foto de perfil" : "Enviar foto de perfil"}
          title={meta.avatar_url ? "Trocar foto" : "Enviar foto"}
          className="group relative flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full border-4 border-white/35 bg-nevoa p-0 text-[28px] font-extrabold text-marinho focus-visible:outline-white"
        >
          {meta.avatar_url ? <img src={meta.avatar_url} alt="" className="h-full w-full object-cover" /> : iniciais(nome)}
          <span className="absolute inset-0 flex items-center justify-center bg-[rgba(28,46,69,0.6)] text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {ocupado ? <LoaderCircle size={22} className="animate-spin" aria-hidden /> : <Camera size={22} strokeWidth={1.8} aria-hidden />}
          </span>
        </button>
        {meta.avatar_url && (
          <button
            type="button"
            onClick={() => remover.mutate()}
            disabled={ocupado}
            className="border-0 bg-transparent p-0 text-[11px] font-semibold text-azul-claro-2 underline underline-offset-2 hover:text-white focus-visible:outline-white"
          >
            Remover foto
          </button>
        )}
      </div>

      <div className="relative flex min-w-[220px] flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[24px] font-extrabold leading-tight">{nome}</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[12px] font-bold text-[#1A57A6]">{NIVEL[nivel].rotulo}</span>
        </div>
        <span className="text-[14px] text-azul-claro-2">{NIVEL[nivel].descricao(projeto?.nome ?? "seu cliente")}</span>
      </div>

      <div className="relative flex gap-3">
        <Numero valor={projetos.length} rotulo={projetos.length === 1 ? "cliente" : "clientes"} />
        <Numero valor={modulosAtivos} rotulo={modulosAtivos === 1 ? "módulo ativo" : "módulos ativos"} />
      </div>

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

function Numero({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] border border-white/[0.22] bg-white/[0.14] px-4 py-3 backdrop-blur-md">
      <span className="text-[22px] font-extrabold leading-tight">{valor}</span>
      <span className="text-[12px] text-azul-claro-2">{rotulo}</span>
    </div>
  );
}

/* ── Dados pessoais ─────────────────────────────────────────────── */

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2 text-[13px] font-bold [&>.campo]:font-medium">
      {rotulo}
      {children}
      {dica && <span className="-mt-1 text-[11px] font-normal text-texto-3">{dica}</span>}
    </label>
  );
}

function DadosPessoais({ meta, email, onSalvo }: { meta: Meta; email: string; onSalvo: () => Promise<void> }) {
  const sb = getSupabaseBrowserClient();
  const atual = { nome: meta.full_name || meta.name || "", whatsapp: meta.whatsapp ?? "", cargo: meta.cargo ?? "" };
  const [f, setF] = useState(atual);
  // Quando os dados chegam (ou mudam por outra aba), os campos acompanham.
  useEffect(() => setF(atual), [atual.nome, atual.whatsapp, atual.cargo]);

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await sb.auth.updateUser({
        data: { full_name: f.nome.trim(), whatsapp: f.whatsapp.trim(), cargo: f.cargo.trim() },
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await onSalvo();
      toast("Dados atualizados.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  const mudou =
    f.nome.trim().length > 0 &&
    (f.nome.trim() !== atual.nome || f.whatsapp.trim() !== atual.whatsapp || f.cargo.trim() !== atual.cargo);

  return (
    <Card titulo="Dados pessoais" className="gap-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (mudou) salvar.mutate();
        }}
      >
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
          <Campo rotulo="Nome">
            <input
              type="text"
              value={f.nome}
              onChange={(e) => setF({ ...f, nome: e.target.value })}
              placeholder="Como você quer aparecer"
              autoComplete="name"
              className="campo"
            />
          </Campo>
          <Campo rotulo="E-mail de acesso">
            <input type="email" value={email} disabled title="O e-mail é o login da conta e não muda por aqui" className="campo" />
          </Campo>
          <Campo rotulo="WhatsApp">
            <input
              type="tel"
              value={f.whatsapp}
              onChange={(e) => setF({ ...f, whatsapp: e.target.value })}
              placeholder="(11) 90000-0000"
              autoComplete="tel"
              className="campo"
            />
          </Campo>
          <Campo rotulo="Cargo">
            <input
              type="text"
              value={f.cargo}
              onChange={(e) => setF({ ...f, cargo: e.target.value })}
              placeholder="Ex.: Social media"
              autoComplete="organization-title"
              className="campo"
            />
          </Campo>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12px] text-texto-3">O nome aparece nos comentários e no que você criar daqui em diante.</span>
          <button type="submit" disabled={!mudou || salvar.isPending} className="btn btn-primario ml-auto px-5">
            {salvar.isPending ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </form>
    </Card>
  );
}

/* ── Senha ──────────────────────────────────────────────────────── */

function Senha({ email }: { email: string }) {
  const sb = getSupabaseBrowserClient();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");

  const curta = nova.length > 0 && nova.length < MIN_SENHA;
  const igual = nova.length >= MIN_SENHA && nova === atual;
  const valida = atual.length > 0 && nova.length >= MIN_SENHA && !igual;

  const trocar = useMutation({
    mutationFn: async () => {
      // A senha atual é conferida entrando de novo com ela: sem isso, quem
      // pegasse o computador aberto trocaria a senha sem saber a antiga.
      const login = await sb.auth.signInWithPassword({ email, password: atual });
      if (login.error) throw new Error("A senha atual não confere.");
      const { error } = await sb.auth.updateUser({ password: nova });
      if (error) {
        if (/different from the old/i.test(error.message)) throw new Error("A nova senha precisa ser diferente da atual.");
        throw error;
      }
    },
    onSuccess: () => {
      setAtual("");
      setNova("");
      toast("Senha trocada. Use a nova no próximo login.");
    },
    onError: (e) => toast((e as Error).message, "error"),
  });

  return (
    <Card titulo="Senha" className="gap-4">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (valida) trocar.mutate();
        }}
      >
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(min(220px,100%),1fr))]">
          <Campo rotulo="Senha atual">
            <input
              type="password"
              value={atual}
              onChange={(e) => setAtual(e.target.value)}
              autoComplete="current-password"
              className="campo"
            />
          </Campo>
          <Campo rotulo="Nova senha">
            <input
              type="password"
              value={nova}
              onChange={(e) => setNova(e.target.value)}
              placeholder={`Mínimo de ${MIN_SENHA} caracteres`}
              autoComplete="new-password"
              aria-invalid={curta || igual}
              className="campo"
            />
          </Campo>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12px] font-semibold text-erro-texto" role="status">
            {curta
              ? `A senha precisa ter ao menos ${MIN_SENHA} caracteres.`
              : igual
                ? "A nova senha precisa ser diferente da atual."
                : ""}
          </span>
          <button type="submit" disabled={!valida || trocar.isPending} className="btn btn-secundario ml-auto px-5 font-bold">
            {trocar.isPending ? "Trocando…" : "Trocar senha"}
          </button>
        </div>
      </form>
    </Card>
  );
}

/* ── Clientes que a conta acessa ────────────────────────────────── */

function Clientes() {
  const router = useRouter();
  const { projeto, projetos, trocarCliente } = usePainel();
  const { superAdmin } = useAcesso(projeto?.id);

  function abrir(p: Project) {
    // Trocar de cliente recarrega a tela inteira e volta para o Dashboard.
    void router.navigate({ to: "/" });
    trocarCliente(p.id);
  }

  return (
    <section className="flex min-w-0 flex-[1_1_466px] flex-col gap-3 rounded-[20px] border border-borda bg-white p-[22px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-[16px] font-bold">Clientes que você acessa</h2>
        {superAdmin && (
          <Link to="/clientes" className="btn btn-secundario btn-40 font-bold">
            <Plus size={14} strokeWidth={2.2} aria-hidden />
            Novo cliente
          </Link>
        )}
      </div>

      {projetos.length === 0 && (
        <p className="m-0 text-[13px] text-texto-3">Sua conta ainda não tem acesso a nenhum cliente. Fale com a equipe OVERSO.</p>
      )}

      {projetos.map((p, i) => {
        const aberto = p.id === projeto?.id;
        const mods = modulosDe(p);
        const miolo = (
          <>
            <span
              className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] text-[13px] font-bold text-white"
              style={{ background: CORES_CAMPANHA[i % CORES_CAMPANHA.length] }}
            >
              {iniciais(p.nome)}
            </span>
            <span className="flex min-w-[160px] flex-1 flex-col gap-[3px]">
              <span className="text-[14px] font-bold">{p.nome}</span>
              <span className="text-[12px] font-normal text-texto-3">{aberto ? "Cliente aberto agora" : "Clique para abrir este cliente"}</span>
            </span>
            <span className="flex flex-wrap gap-1.5">
              {MODULOS.map((m) => (
                <span
                  key={m}
                  className={`rounded-lg px-[9px] py-1 text-[11px] font-bold ${
                    mods[m] ? "bg-azul-claro-2 text-[#1A57A6]" : "bg-[#ECEEF1] text-texto-3"
                  }`}
                >
                  {MODULO_LABEL[m]}
                  {mods[m] ? "" : " · bloqueado"}
                </span>
              ))}
            </span>
          </>
        );
        const classe = "flex flex-wrap items-center gap-3 rounded-[16px] p-3.5 text-left text-marinho";
        return aberto ? (
          <div key={p.id} aria-current="true" className={`${classe} border-[1.5px] border-azul bg-azul-claro`}>
            {miolo}
          </div>
        ) : (
          <button key={p.id} type="button" onClick={() => abrir(p)} className={`card-clicavel ${classe}`}>
            {miolo}
          </button>
        );
      })}

      <p className="m-0 mt-1.5 rounded-[12px] bg-superficie-2 px-3.5 py-3 text-[12px] leading-normal text-texto-2">
        Módulos bloqueados ficam no menu do cliente com cadeado. Membros e admins de cada cliente só enxergam a própria conta.
      </p>
    </section>
  );
}
