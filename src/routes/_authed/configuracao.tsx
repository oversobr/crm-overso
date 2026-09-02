import { createFileRoute } from "@tanstack/react-router";
import { Moon, Sun } from "lucide-react";

import { Cabecalho } from "@/components/painel";
import { Card } from "@/components/ui";
import { trocarTema, useTema } from "@/lib/theme";

export const Route = createFileRoute("/_authed/configuracao")({ component: Configuracao });

function Configuracao() {
  const tema = useTema();

  return (
    <>
      <Cabecalho titulo="Configuração" />

      <Card titulo="Aparência">
        <p className="mb-3 text-sm text-muted">Escolha o tema do painel.</p>
        <div className="flex gap-3">
          {(
            [
              { id: "light" as const, rotulo: "Claro", Icone: Sun },
              { id: "dark" as const, rotulo: "Escuro", Icone: Moon },
            ]
          ).map(({ id, rotulo, Icone }) => (
            <button
              key={id}
              onClick={() => trocarTema(id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-4 text-sm transition ${
                tema === id
                  ? "border-gold/50 bg-gold/10 font-semibold text-gold"
                  : "border-line/70 text-muted hover:text-ink"
              }`}
            >
              <Icone size={18} strokeWidth={1.75} />
              {rotulo}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}
