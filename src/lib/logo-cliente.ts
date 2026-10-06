import { ajustarLogo } from "./imagem";
import { salvarLogoCliente } from "./queries";
import { getSupabaseBrowserClient } from "./supabase/client";

const BUCKET_LOGO = "logos-cliente";
/** Até onde o logo é encolhido antes de subir. */
const LADO_LOGO = 512;

/** Os formatos que o campo de logo aceita. */
export const TIPOS_DE_LOGO = "image/png,image/jpeg,image/webp";

/**
 * Sobe o logo do cliente e grava o endereço na linha dele. A imagem fica num
 * bucket público (29_logo_cliente.sql); a linha guarda a URL e o caminho, e o
 * caminho é o que permite apagar o arquivo antigo quando troca.
 */
export async function enviarLogoCliente(projectId: string, arquivo: File, caminhoAntigo?: string | null) {
  if (!arquivo.type.startsWith("image/")) throw new Error("Escolha um arquivo de imagem.");
  const sb = getSupabaseBrowserClient();
  const imagem = await ajustarLogo(arquivo, LADO_LOGO);
  // Nome novo a cada troca: o endereço muda e nenhum cache insiste no logo
  // antigo. A pasta é o id do cliente, que é o que a policy confere.
  const caminho = `${projectId}/${Date.now()}.png`;
  const up = await sb.storage.from(BUCKET_LOGO).upload(caminho, imagem, { contentType: "image/png" });
  if (up.error) {
    if (/bucket not found/i.test(up.error.message)) {
      throw new Error("O logo do cliente ainda não foi ativado no banco (supabase/29_logo_cliente.sql).");
    }
    throw up.error;
  }
  const url = sb.storage.from(BUCKET_LOGO).getPublicUrl(caminho).data.publicUrl;
  await salvarLogoCliente(projectId, { logo_url: url, logo_caminho: caminho });
  // O antigo sai só depois que o novo já está valendo na linha.
  if (caminhoAntigo) await sb.storage.from(BUCKET_LOGO).remove([caminhoAntigo]);
}
