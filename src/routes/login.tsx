import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CircleAlert, CircleCheck, Eye, EyeOff, Info, LoaderCircle, Lock, Mail } from "lucide-react";
import type { FormEvent, InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";

import { Checkbox } from "@/components/ds/controles";
import { LogoOverso } from "@/components/logo";
import { IconeCalendario, IconeEventos, IconeLeads, MarcaOverso } from "@/components/shell/icones-menu";
import { primeiraTela } from "@/lib/guardado";
import { definirDuracaoDaSessao } from "@/lib/sessao";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const Route = createFileRoute("/login")({
  // `recuperar` vem no link do e-mail de "Esqueci minha senha": a tela abre
  // direto no passo de escolher a senha nova.
  validateSearch: (s: Record<string, unknown>): { recuperar?: true } => (s.recuperar === true ? { recuperar: true } : {}),
  component: Login,
});

/** Os três momentos da tela. */
type Passo = "entrar" | "esqueci" | "nova-senha";

const MIN_SENHA = 8;

const MODULOS = [
  { Icone: IconeLeads, titulo: "CRM", texto: "Leads das landing pages, parciais e funil" },
  { Icone: IconeCalendario, titulo: "Conteúdo", texto: "Calendário, aprovação e comentários do cliente" },
  { Icone: IconeEventos, titulo: "Eventos", texto: "Demandas, materiais e divulgação" },
];

/** Mensagens do Supabase vêm em inglês; as comuns viram português aqui. */
function traduzir(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "E-mail ou senha não conferem. Tente de novo.";
  if (/email not confirmed/i.test(msg)) return "Confirme seu e-mail antes de entrar. O link está na sua caixa de entrada.";
  if (/rate limit|too many/i.test(msg)) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  if (/different from the old/i.test(msg)) return "A nova senha precisa ser diferente da atual.";
  return msg;
}

function Login() {
  const router = useRouter();
  const sb = getSupabaseBrowserClient();
  const { recuperar } = Route.useSearch();

  const [passo, setPasso] = useState<Passo>(recuperar ? "nova-senha" : "entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [verSenha, setVerSenha] = useState(false);
  const [manter, setManter] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // O link de recuperação entra no portal já com uma sessão temporária e o
  // Supabase avisa por este evento: é a deixa para pedir a senha nova, mesmo
  // que o endereço tenha chegado sem o `?recuperar`.
  useEffect(() => {
    const { data } = sb.auth.onAuthStateChange((evento: string) => {
      if (evento === "PASSWORD_RECOVERY") setPasso("nova-senha");
    });
    return () => data.subscription.unsubscribe();
  }, [sb]);

  function irPara(p: Passo) {
    setPasso(p);
    setErro(null);
    setAviso(null);
    setSenha("");
  }

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);

    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setErro(traduzir(error.message));
      setCarregando(false);
      return;
    }

    definirDuracaoDaSessao(manter);
    // invalidate() refaz o beforeLoad do /_authed com a sessão já gravada no
    // cookie — sem isso o guard ainda enxergaria o usuário deslogado.
    await router.invalidate();
    await router.navigate({ to: (await vaiEscolherCliente()) ? "/escolher-cliente" : "/" });
  }

  /**
   * Quem é da equipe OVERSO escolhe o cliente ao entrar, a não ser que tenha
   * pedido para abrir sempre o último. Se a pergunta ao banco falhar, a
   * pessoa só cai no painel: a escolha continua no menu lateral.
   */
  async function vaiEscolherCliente(): Promise<boolean> {
    if (primeiraTela.ler() === "ultimo") return false;
    const { data, error } = await sb.rpc("is_super_admin");
    return !error && Boolean(data);
  }

  async function pedirLink(e: FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);

    const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login?recuperar=true`,
    });
    setCarregando(false);
    if (error) return setErro(traduzir(error.message));
    // A mesma resposta exista a conta ou não: a tela não revela quem tem cadastro.
    setAviso("Se este e-mail tiver conta no portal, o link para criar uma senha nova chega em alguns minutos.");
  }

  async function salvarNovaSenha(e: FormEvent) {
    e.preventDefault();
    if (senha.length < MIN_SENHA) return setErro(`A senha precisa ter ao menos ${MIN_SENHA} caracteres.`);
    setCarregando(true);
    setErro(null);

    const { error } = await sb.auth.updateUser({ password: senha });
    if (error) {
      setCarregando(false);
      return setErro(
        /session|jwt|not authenticated/i.test(error.message)
          ? "Este link já foi usado ou venceu. Peça um novo em Esqueci minha senha."
          : traduzir(error.message),
      );
    }
    definirDuracaoDaSessao(true);
    await router.invalidate();
    await router.navigate({ to: "/" });
  }

  const campoSenha = (rotulo: ReactNode, preenchimento: "current-password" | "new-password", dica?: string) => (
    <Campo
      rotulo={rotulo}
      icone={<Lock size={18} strokeWidth={1.8} aria-hidden />}
      invalido={Boolean(erro)}
      type={verSenha ? "text" : "password"}
      autoComplete={preenchimento}
      placeholder={dica}
      value={senha}
      onChange={(ev) => setSenha(ev.target.value)}
      required
      fim={
        <button
          type="button"
          onClick={() => setVerSenha((v) => !v)}
          aria-label={verSenha ? "Esconder senha" : "Mostrar senha"}
          className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border-0 bg-superficie-2 p-0 text-texto-2 transition-colors hover:bg-gelo"
        >
          {verSenha ? <EyeOff size={18} strokeWidth={1.8} aria-hidden /> : <Eye size={18} strokeWidth={1.8} aria-hidden />}
        </button>
      }
    />
  );

  return (
    <main className="flex min-h-dvh flex-wrap bg-gelo text-marinho">
      <PainelDaMarca />

      <section aria-label="Entrar" className="box-border flex flex-[1_1_480px] items-center justify-center px-6 py-12 sm:px-8">
        <div className="flex w-full max-w-[420px] flex-col gap-[22px]">
          {/* Abaixo de 1024px o painel azul some; a marca aparece aqui. */}
          <div className="flex items-center gap-3 lg:hidden">
            <LogoOverso className="h-5 w-auto" />
            <span className="rounded-md bg-borda-campo px-[7px] py-[3px] text-[10px] font-bold tracking-[0.1em] text-texto-2">PORTAL</span>
          </div>

          {passo === "entrar" && (
            <form onSubmit={(e) => void entrar(e)} className="flex flex-col gap-[22px]">
              <Titulo titulo="Entrar" texto="Use o e-mail que a OVERSO cadastrou para você." />
              <Alerta erro={erro} />

              <Campo
                rotulo="E-mail"
                icone={<Mail size={18} strokeWidth={1.8} aria-hidden />}
                invalido={Boolean(erro)}
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
                autoFocus
              />

              {campoSenha(
                <span className="flex items-baseline justify-between">
                  Senha
                  <button type="button" onClick={() => irPara("esqueci")} className="link border-0 bg-transparent p-0 text-[12px] font-bold">
                    Esqueci minha senha
                  </button>
                </span>,
                "current-password",
              )}

              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-texto-2">
                <Checkbox checked={manter} onChange={(ev) => setManter(ev.target.checked)} />
                Manter conectado neste computador
              </label>

              <Enviar carregando={carregando} rotulo="Entrar" ocupado="Entrando…" />

              <div className="flex gap-3 rounded-[16px] border border-borda bg-white p-4">
                <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-azul-claro-2 text-azul">
                  <Info size={18} strokeWidth={1.8} aria-hidden />
                </span>
                <span className="flex flex-col gap-1 text-[13px] leading-normal text-texto-2">
                  <strong className="text-marinho">Ainda não tem acesso?</strong>A conta é criada pela equipe OVERSO. Fale com o seu
                  contato na agência.
                </span>
              </div>
            </form>
          )}

          {passo === "esqueci" && (
            <form onSubmit={(e) => void pedirLink(e)} className="flex flex-col gap-[22px]">
              <Titulo titulo="Esqueci minha senha" texto="Informe o e-mail da sua conta. Mandamos um link para você criar uma senha nova." />
              <Alerta erro={erro} aviso={aviso} />

              <Campo
                rotulo="E-mail"
                icone={<Mail size={18} strokeWidth={1.8} aria-hidden />}
                invalido={Boolean(erro)}
                type="email"
                autoComplete="email"
                placeholder="voce@empresa.com.br"
                value={email}
                onChange={(ev) => setEmail(ev.target.value)}
                required
                autoFocus
              />

              <Enviar carregando={carregando} rotulo={aviso ? "Enviar de novo" : "Enviar link"} ocupado="Enviando…" />
              <Voltar onClick={() => irPara("entrar")} />
            </form>
          )}

          {passo === "nova-senha" && (
            <form onSubmit={(e) => void salvarNovaSenha(e)} className="flex flex-col gap-[22px]">
              <Titulo titulo="Criar senha nova" texto="Escolha a senha que você vai usar para entrar daqui em diante." />
              <Alerta erro={erro} />
              {campoSenha("Nova senha", "new-password", `Mínimo de ${MIN_SENHA} caracteres`)}
              <Enviar carregando={carregando} rotulo="Salvar e entrar" ocupado="Salvando…" />
              <Voltar onClick={() => irPara("entrar")} />
            </form>
          )}
        </div>
      </section>
    </main>
  );
}

/* ── Painel da marca (some abaixo de 1024px) ────────────────────── */

function PainelDaMarca() {
  return (
    <section
      aria-label="Portal OVERSO"
      className="relative box-border hidden flex-[1_1_520px] flex-col justify-between gap-10 overflow-hidden px-14 py-12 text-white lg:flex"
      style={{ background: "linear-gradient(140deg, #0F3A70 0%, #1757A6 55%, #1A66C2 100%)" }}
    >
      <MarcaOverso largura={620} altura={560} className="pointer-events-none absolute -bottom-[120px] -right-[140px] opacity-[0.07]" />

      <div className="relative flex items-center gap-3.5">
        <LogoOverso className="h-7 w-auto" />
        <span className="rounded-md border border-white/[0.24] bg-white/[0.16] px-2 py-1 text-[11px] font-bold tracking-[0.1em]">PORTAL</span>
      </div>

      <div className="relative flex max-w-[520px] flex-col gap-[22px]">
        <h1 className="m-0 text-[44px] font-extrabold leading-[1.12] tracking-[-0.02em]">
          Leads, conteúdo e eventos de cada cliente num lugar só.
        </h1>
        <p className="m-0 text-[16px] leading-[1.6] text-[#DCE8F7]">
          Escolha o cliente no menu e a tela inteira passa a ser dele: quem chegou pela landing page, o que vai para as redes e o
          que está esperando alguém agir.
        </p>
        <div className="flex flex-col gap-2.5">
          {MODULOS.map(({ Icone, titulo, texto }) => (
            <div
              key={titulo}
              className="flex items-center gap-3.5 rounded-[16px] border border-white/20 bg-white/[0.12] px-4 py-3.5 backdrop-blur-[10px]"
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[12px] bg-white text-[#1A57A6]">
                <Icone tamanho={20} />
              </span>
              <span className="flex flex-col gap-0.5">
                <strong className="text-[14px] font-bold">{titulo}</strong>
                <span className="text-[12px] text-[#DCE8F7]">{texto}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <span className="relative text-[12px] text-[#C9D6E6]">portal.overso.co</span>
    </section>
  );
}

/* ── Peças do formulário ────────────────────────────────────────── */

function Titulo({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="m-0 text-[30px] font-extrabold leading-tight tracking-[-0.01em]">{titulo}</h2>
      <span className="text-[14px] leading-normal text-texto-3">{texto}</span>
    </div>
  );
}

/** Erro em vermelho ou confirmação em verde. aria-live: o leitor de tela anuncia sem precisar navegar até lá. */
function Alerta({ erro, aviso }: { erro: string | null; aviso?: string | null }) {
  return (
    <div aria-live="polite" className="empty:hidden">
      {erro ? (
        <div role="alert" className="flex items-center gap-2.5 rounded-[12px] bg-erro-fundo px-3.5 py-3 text-[13px] font-semibold text-erro-texto">
          <CircleAlert size={18} strokeWidth={2} aria-hidden className="flex-none" />
          {erro}
        </div>
      ) : aviso ? (
        <div className="flex items-center gap-2.5 rounded-[12px] bg-sucesso-fundo px-3.5 py-3 text-[13px] font-semibold text-sucesso">
          <CircleCheck size={18} strokeWidth={2} aria-hidden className="flex-none" />
          {aviso}
        </div>
      ) : null}
    </div>
  );
}

/** Campo do login: mais alto que o padrão (52px), com ícone e espaço para um botão no fim. */
function Campo({
  rotulo,
  icone,
  fim,
  invalido,
  ...props
}: {
  rotulo: ReactNode;
  icone: ReactNode;
  /** Botão no fim do campo (mostrar senha). */
  fim?: ReactNode;
  invalido: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-2 text-[13px] font-bold">
      {rotulo}
      <span
        aria-invalid={invalido}
        className={`campo flex min-h-[52px] items-center gap-2.5 rounded-[14px] border-[1.5px] text-texto-3 ${fim ? "pl-3.5 pr-1.5" : "px-3.5"}`}
      >
        {icone}
        <input {...props} className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium text-marinho" />
        {fim}
      </span>
    </label>
  );
}

function Enviar({ carregando, rotulo, ocupado }: { carregando: boolean; rotulo: string; ocupado: string }) {
  return (
    <button
      type="submit"
      disabled={carregando}
      className="btn btn-primario min-h-[52px] rounded-[14px] text-[15px] shadow-[0_8px_20px_rgba(26,102,194,0.28)]"
    >
      {carregando ? ocupado : rotulo}
      {carregando ? (
        <LoaderCircle size={18} className="animate-spin" aria-hidden />
      ) : (
        <ArrowRight size={18} strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}

function Voltar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="link flex items-center gap-1.5 self-start border-0 bg-transparent p-0 text-[13px]">
      <ArrowLeft size={16} strokeWidth={2} aria-hidden />
      Voltar para o login
    </button>
  );
}
