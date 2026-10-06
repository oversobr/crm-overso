import { acessosPorCliente } from "./guardado";
import { receberDaConta } from "./notificacoes";
import { getSupabaseBrowserClient } from "./supabase/client";

/**
 * O que é de cada conta e antes vivia só no navegador: notificações lidas,
 * avisos desligados e o último acesso a cada cliente (tabelas do
 * 30_portal_novo.sql). O navegador continua sendo a cópia de uso imediato;
 * o banco é o que faz valer no celular e no computador ao mesmo tempo.
 *
 * Tudo aqui é "melhor esforço": num banco sem essas tabelas, ou sem rede,
 * nada quebra. O portal segue com o que está guardado no navegador.
 */

/** Traz do banco o que a conta já tem e junta com o que está neste navegador. */
export async function sincronizarConta() {
  const sb = getSupabaseBrowserClient();
  const [lidas, preferencias, acessos] = await Promise.all([
    sb.from("notificacoes_lidas").select("chave").order("lida_em", { ascending: false }).limit(400),
    sb.from("preferencias_usuario").select("avisos_desligados").maybeSingle(),
    sb.from("acessos_cliente").select("project_id, ultimo_em"),
  ]);

  receberDaConta({
    lidas: lidas.error ? null : ((lidas.data ?? []) as { chave: string }[]).map((l) => l.chave),
    desligadas: preferencias.error || !preferencias.data ? null : ((preferencias.data as { avisos_desligados: string[] }).avisos_desligados ?? []),
  });

  if (!acessos.error) {
    const juntos = { ...acessosPorCliente.ler() };
    for (const a of (acessos.data ?? []) as { project_id: string; ultimo_em: string }[]) {
      // Vale o mais recente entre este navegador e o que veio da conta.
      if (!juntos[a.project_id] || new Date(a.ultimo_em) > new Date(juntos[a.project_id]!)) juntos[a.project_id] = a.ultimo_em;
    }
    acessosPorCliente.gravar(juntos);
  }
}

/** Anota na conta que este cliente foi aberto agora. */
export function registrarAcesso(projectId: string) {
  void (async () => {
    const sb = getSupabaseBrowserClient();
    const { data } = await sb.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    await sb
      .from("acessos_cliente")
      .upsert({ user_id: userId, project_id: projectId, ultimo_em: new Date().toISOString() }, { onConflict: "user_id,project_id" });
  })().catch(() => {});
}
