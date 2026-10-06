/**
 * Cores que o Recharts precisa como string (não aceita classe Tailwind).
 * Batem com os tokens do styles.css. O portal é só claro: o design não tem
 * versão escura, então não existe mais troca de tema.
 */
export function coresGrafico() {
  return {
    fill: "#1A66C2",
    fill2: "#B5BEC4",
    grade: "#EDF1F4",
    eixo: "#55657A",
    tooltipBg: "#FFFFFF",
    tooltipLinha: "#E1E6EB",
    ink: "#1C2E45",
  };
}
