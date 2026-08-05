/**
 * Fonte única de parsing de datas "YYYY-MM-DD" como data local (meia-noite).
 * Substitui as 3 versões (index.js, treino.js, treino_progresso.js) que
 * existiam antes, todas resolvendo o mesmo bug do `new Date("YYYY-MM-DD")`
 * nativo (que interpreta a string como UTC e desloca o dia conforme o fuso).
 */
export function parseLocalDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date(NaN);
  if (dateStr.includes("T")) return new Date(dateStr);
  return new Date(`${dateStr}T00:00:00`);
}

export function formatDateLabel(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  const d = parseLocalDate(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
