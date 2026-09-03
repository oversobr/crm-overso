import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // 3000 é a Site URL padrão do Supabase: porta fixa faz os links de
  // confirmação de email caírem no app em vez de numa porta morta.
  server: { port: 3000 },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    // SPA: o build sai como arquivos estáticos (dist/client), sem servidor
    // Node — é o que a hospedagem serve na raiz do portal.overso.co.
    // outputPath /index faz o shell sair como index.html — o arquivo que o
    // Apache serve por padrão na raiz do domínio (o default seria _shell.html).
    tanstackStart({ spa: { enabled: true, prerender: { outputPath: "/index" } } }),
    viteReact(),
  ],
});
