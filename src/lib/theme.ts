/**
 * Cores que o Recharts precisa como string (não aceita classe Tailwind).
 * São as variáveis do tema (styles.css): um atributo de SVG aceita var(),
 * então o gráfico acompanha o claro e o escuro sem precisar redesenhar.
 */
export function coresGrafico() {
  return {
    fill: "#1A66C2",
    fill2: "var(--neutral-strong)",
    grade: "var(--grafico-grade)",
    eixo: "var(--text-3)",
    tooltipBg: "var(--surface)",
    tooltipLinha: "var(--border)",
    ink: "var(--text)",
  };
}
