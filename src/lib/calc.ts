import { parseLocalDate } from "./dates";

export interface RegistroSerie {
  data: string;
  peso: number | string | null;
  repeticoes: number | string | null;
  [key: string]: unknown;
}

export interface GrupoPorData {
  data: string;
  regs: RegistroSerie[];
}

/** Fórmula de Epley — fonte única (antes copiada em treino.js e treino_progresso.js). */
export function calcular1RM(
  peso: number | string | null | undefined,
  reps: number | string | null | undefined
): number | null {
  if (!peso || !reps) return null;
  return Number(peso) * (1 + Number(reps) / 30);
}

export function tonagemSerie(
  peso: number | string | null | undefined,
  reps: number | string | null | undefined
): number {
  if (!peso || !reps) return 0;
  return Number(peso) * Number(reps);
}

/** Agrupa registros por data, ordenado ascendente. Fonte única (antes 2 implementações). */
export function agruparPorData(registros: RegistroSerie[]): GrupoPorData[] {
  const porData = new Map<string, RegistroSerie[]>();
  for (const r of registros) {
    const lista = porData.get(r.data) ?? [];
    lista.push(r);
    porData.set(r.data, lista);
  }
  return [...porData.entries()]
    .map(([data, regs]) => ({ data, regs }))
    .sort((a, b) => parseLocalDate(a.data).getTime() - parseLocalDate(b.data).getTime());
}

/** Maior peso registrado no conjunto de séries. */
export function lastValuePeso(regs: RegistroSerie[]): number | null {
  let max: number | null = null;
  for (const r of regs) {
    if (r.peso == null || r.peso === "") continue;
    const v = Number(r.peso);
    if (!Number.isNaN(v) && (max === null || v > max)) max = v;
  }
  return max;
}

/** Repetições correspondentes ao maior peso registrado no conjunto de séries. */
export function lastValueReps(regs: RegistroSerie[]): number | null {
  let maxPeso: number | null = null;
  let reps: number | null = null;
  for (const r of regs) {
    if (r.peso == null || r.peso === "") continue;
    const vp = Number(r.peso);
    const vr = Number(r.repeticoes);
    if (Number.isNaN(vp) || Number.isNaN(vr)) continue;
    if (maxPeso === null || vp > maxPeso) {
      maxPeso = vp;
      reps = vr;
    }
  }
  return reps;
}

export interface Dia1RM {
  data: string;
  rm: number;
}

export function maior1RMPorDia(grupos: GrupoPorData[]): Dia1RM[] {
  return grupos.map((g) => {
    const maior = g.regs.reduce((best, r) => {
      const rm = calcular1RM(r.peso, r.repeticoes);
      return rm != null && rm > best ? rm : best;
    }, 0);
    return { data: g.data, rm: maior };
  });
}

export interface ComparacaoProgresso {
  data: string;
  pct: number | null;
}

/**
 * Definição única de "% de progresso" adotada em toda a app: compara o 1RM
 * de cada dia com o do dia imediatamente anterior, dentro de uma janela dos
 * últimos N dias com registro (padrão 6, gerando até 5 comparações).
 *
 * Antes existiam 2 definições divergentes: treino.js comparava só o
 * primeiro vs. o último dia da janela (progresso líquido do período);
 * treino_progresso.js já fazia a comparação dia-a-dia. Ficamos com a
 * dia-a-dia — decisão do usuário ao planejar a reescrita.
 */
export function calcularProgressoDiaADia(
  registros: RegistroSerie[],
  janela = 6
): ComparacaoProgresso[] {
  const dias = maior1RMPorDia(agruparPorData(registros)).slice(-janela);
  const comparacoes: ComparacaoProgresso[] = [];
  for (let i = 1; i < dias.length; i++) {
    const anterior = dias[i - 1].rm;
    const atual = dias[i].rm;
    const pct = anterior > 0 ? ((atual - anterior) / anterior) * 100 : null;
    comparacoes.push({ data: dias[i].data, pct });
  }
  return comparacoes;
}

export type Tendencia = "positiva" | "negativa" | "neutra";

/**
 * Classifica um % de progresso numa tendência semântica. Os componentes
 * mapeiam isso para os tokens --color-success/--color-negative/--color-neutral
 * do design system, em vez de hex hardcoded (antes getCorProgresso tinha 2
 * paletas diferentes para o mesmo conceito, uma em cada tela).
 */
export function tendenciaDeProgresso(pct: number | null | undefined): Tendencia {
  if (pct == null || Number.isNaN(pct)) return "neutra";
  if (pct > 0) return "positiva";
  if (pct < 0) return "negativa";
  return "neutra";
}
