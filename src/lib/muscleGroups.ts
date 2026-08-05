/**
 * Fonte única da fusão de grupos musculares (antes copiada, literalmente
 * idêntica, em 3 lugares: painel_grafico.js x2 e painel_progresso.js x1).
 * Define quais subgrupos são somados sob um grupo "pai" nas visualizações
 * agregadas de séries por grupo muscular.
 */
export const FUSOES_GRUPOS_MUSCULARES: Record<string, string[]> = {
  Peito: ["Peito Superior", "Peito Inferior"],
  Costas: ["Costas Superior", "Costas Latíssimo"],
};

export interface DetalheGrupo {
  [exercicio: string]: number;
}

export interface DadosFundidos {
  semanaMap: Record<string, number>;
  detalhe: Record<string, DetalheGrupo>;
}

/** Aplica FUSOES_GRUPOS_MUSCULARES sobre um mapa grupo->total (e, opcionalmente, seu detalhe por exercício). */
export function fundirGruposMusculares(
  semanaMap: Record<string, number>,
  detalhe: Record<string, DetalheGrupo> = {}
): DadosFundidos {
  const novoSemanaMap = { ...semanaMap };
  const novoDetalhe: Record<string, DetalheGrupo> = Object.fromEntries(
    Object.entries(detalhe).map(([grupo, d]) => [grupo, { ...d }])
  );

  for (const [novoNome, originais] of Object.entries(FUSOES_GRUPOS_MUSCULARES)) {
    let somaTotal = 0;
    const somaDetalhe: DetalheGrupo = {};

    for (const grp of originais) {
      if (novoSemanaMap[grp]) {
        somaTotal += novoSemanaMap[grp];
        delete novoSemanaMap[grp];
      }
      if (novoDetalhe[grp]) {
        for (const [exercicio, series] of Object.entries(novoDetalhe[grp])) {
          somaDetalhe[exercicio] = (somaDetalhe[exercicio] ?? 0) + series;
        }
        delete novoDetalhe[grp];
      }
    }

    if (somaTotal > 0) {
      novoSemanaMap[novoNome] = somaTotal;
      novoDetalhe[novoNome] = somaDetalhe;
    }
  }

  return { semanaMap: novoSemanaMap, detalhe: novoDetalhe };
}
