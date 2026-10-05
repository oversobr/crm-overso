/* ── Preparo de imagem antes do upload ──────────────────────────────
   Duas operações, porque os dois usos pedem coisas opostas:

   • foto de perfil → RECORTA no quadrado. O avatar é redondo e de tamanho
     fixo; sobra de imagem só pesaria.
   • logo do cliente → CABE dentro da caixa, sem recortar. Logo é quase
     sempre horizontal, e cortar um logo é estragá-lo. Também sai em PNG,
     pra transparência sobreviver — logo em JPEG ganha fundo branco e fica
     com um retângulo em volta no tema escuro. */

async function carregar(arquivo: File): Promise<{ img: HTMLImageElement; liberar: () => void }> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error("Não consegui ler essa imagem."));
      i.src = url;
    });
    return { img, liberar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((ok, falha) =>
    canvas.toBlob(
      (b) => (b ? ok(b) : falha(new Error("Não consegui processar a imagem."))),
      tipo,
      qualidade,
    ),
  );
}

/** Recorta o centro num quadrado de `lado` px. Usado na foto de perfil. */
export async function recortarQuadrado(arquivo: File, lado: number): Promise<Blob> {
  const { img, liberar } = await carregar(arquivo);
  try {
    const menor = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = lado;
    canvas.height = lado;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      img,
      (img.naturalWidth - menor) / 2,
      (img.naturalHeight - menor) / 2,
      menor,
      menor,
      0,
      0,
      lado,
      lado,
    );
    return await paraBlob(canvas, "image/jpeg", 0.88);
  } finally {
    liberar();
  }
}

/**
 * Encolhe pra caber numa caixa de `maxLado`, mantendo a proporção. Nunca
 * amplia: logo pequeno subindo esticado ficaria borrado.
 */
export async function ajustarLogo(arquivo: File, maxLado: number): Promise<Blob> {
  const { img, liberar } = await carregar(arquivo);
  try {
    const { naturalWidth: w, naturalHeight: h } = img;
    const escala = Math.min(1, maxLado / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * escala));
    canvas.height = Math.max(1, Math.round(h * escala));
    // Sem fundo pintado: o que era transparente continua transparente.
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await paraBlob(canvas, "image/png");
  } finally {
    liberar();
  }
}
