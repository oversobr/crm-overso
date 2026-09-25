/* ── Datas ──────────────────────────────────────────────────────────
   Tudo em "dia de calendário" (YYYY-MM-DD), igual ao banco. O meio-dia no
   parse evita que o horário de verão ou o fuso empurre a data um dia. */

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const deYmd = (s: string) => new Date(`${s}T12:00:00`);

export const SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmt = (s: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", o).format(deYmd(s));

export const diaExtenso = (s: string) => capitalizar(fmt(s, { weekday: "long", day: "numeric", month: "long" }));

export function somarDias(s: string, n: number) {
  const d = deYmd(s);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** Domingo a sábado da semana que contém o dia. */
export function semanaDe(dia: string): string[] {
  const domingo = somarDias(dia, -deYmd(dia).getDay());
  return Array.from({ length: 7 }, (_, i) => somarDias(domingo, i));
}

/** Hora cheia de um "HH:MM:SS" — é a faixa em que o conteúdo cai na grade. */
export const horaDe = (hora: string) => Number(hora.slice(0, 2));

export const hhmm = (hora: string | null) => (hora ? hora.slice(0, 5) : null);

/** "Setembro de 2026" · "20 – 26 de set. de 2026" · "Sexta-feira, 25 de setembro de 2026" */
export function tituloPeriodo(visao: "mes" | "semana" | "dia", ref: string) {
  if (visao === "mes") return capitalizar(fmt(ref, { month: "long", year: "numeric" }));
  if (visao === "dia") return capitalizar(fmt(ref, { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  const dias = semanaDe(ref);
  const [a, b] = [dias[0]!, dias[6]!];
  // Semana que vira o mês (ou o ano) precisa dizer o mês nas duas pontas.
  if (a.slice(0, 7) === b.slice(0, 7)) {
    return `${deYmd(a).getDate()} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return `${fmt(a, { day: "numeric", month: "short" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** Semanas inteiras (domingo a sábado) que cobrem o mês. */
export function gradeDoMes(mes: Date): string[] {
  const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1);
  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
  const semanas = Math.ceil((inicio.getDay() + diasNoMes) / 7);
  inicio.setDate(1 - inicio.getDay());
  return Array.from({ length: semanas * 7 }, (_, i) => {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    return ymd(d);
  });
}
