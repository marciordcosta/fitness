// --------- Estado/global -------------
const sb = window.sb;
let progressoChart = null;
let chartCtx = null;
const selecionadosParaComparacao = new Set();
let currentUserId = null;
const CACHE = { baseExercicio: null, relacionados: [], registros: {} };

// ----- Modal Progresso (edição/inserção) -----
let PROG_exercicioId = null;
let PROG_dataOriginal = null;

// --------- utilitários -------------
function removerAcento(str){ if(!str) return str; return str.normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function normalizarTexto(str){ if(!str) return null; return removerAcento(String(str).trim().toLowerCase()); }
function formatNum(v){ return v==null || isNaN(v) ? '-' : (Number(v).toFixed(1)); }
function formatSignPct(v){ if (v==null || isNaN(v)) return ''; const r = Number(v).toFixed(1); if (r>0) return `(+${r}%)`; if (r<0) return `(${r}%)`; return `(0%)`; }
function formatDateLabel(d){ if (!d) return '-'; try { const dt = new Date(d); return dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){ return d; } }

function calcular1RM(peso, reps){ if (!peso || !reps) return null; return Number(peso) * (1 + Number(reps)/30); }
function tonagemSerie(peso, reps){ if (!peso || !reps) return 0; return Number(peso) * Number(reps); }

function agruparPorData(registros){
  const byDate = {};
  (registros||[]).forEach(r => {
    const d = r.data;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(r);
  });
  // garante ordenação por data asc (tempos sem hora)
  return Object.keys(byDate).sort((a,b) => {
    const da = parseLocalDate(a);
    const db = parseLocalDate(b);
    return da - db;
  }).map(k => ({ data: k, regs: byDate[k] }));
}

function somaTonelagemPorData(regs){ let total = 0; (regs||[]).forEach(s => { total += tonagemSerie(s.peso, s.repeticoes); }); return total; }

function lastValuePeso(regs){
  if (!regs || !regs.length) return null;
  let mx = null;
  regs.forEach(r => { if (r.peso != null && r.peso !== '') { const v = Number(r.peso); if (!isNaN(v) && (mx===null || v>mx)) mx = v; } });
  return mx;
}
function lastValueReps(regs){
  if (!regs || !regs.length) return null;
  let mxPeso = null, rep = null;
  regs.forEach(r => {
    if (r.peso != null && r.peso !== '') {
      const vp = Number(r.peso), vr = Number(r.repeticoes);
      if (!isNaN(vp) && !isNaN(vr)) {
        if (mxPeso === null || vp > mxPeso){ mxPeso = vp; rep = vr; }
      }
    }
  });
  return rep;
}

function normalizeSeries(series){
  if (!series || !series.length) return [];
  return series.map(s => {
    const nums = (s.values||[]).map(v => (v==null||isNaN(v)?null:Number(v))).filter(v => v!==null);
    if (!nums.length) return { label: s.label, values: (s.values||[]).map(()=>null) };
    const min = Math.min(...nums), max = Math.max(...nums), range = (max-min)||1;
    return { label: s.label, values: (s.values||[]).map(v => (v==null||isNaN(v)?null:((Number(v)-min)/range)*100)) };
  });
}

// Usado para as bolinhas (5 bolinhas)
function getCorProgresso(pct) {
  if (pct > 0) return "#4CAF50";     // verde
  if (pct < 0) return "#F44336";     // vermelho
  return "#CCCCCC";                  // cinza neutro
}

// Usado para o texto de percentual no histórico
function getCorTextoProgresso(pct) {
    if (pct == null || isNaN(pct)) return "#333333";
    const v = Number(pct);
    if (v > 0) return "#27AE60"; // Verde escuro
    if (v < 0) return "#C0392B"; // Vermelho escuro
    return "#666666";            // Cinza neutro
}

// utilitário: parsear YYYY-MM-DD como data local (meia-noite)
function parseLocalDate(dateStr) {
  if (!dateStr) return new Date(NaN);
  // se já vier com hora, tenta usar diretamente
  if (dateStr.includes('T')) return new Date(dateStr);
  return new Date(`${dateStr}T00:00:00`);
}

function criarLinhaSerie(i, peso="", reps="") {
  return `
    <div class="prog-serie" data-i="${i}">
      <input type="number" class="prog-peso" placeholder="Peso" value="${peso}">
      <input type="number" class="prog-reps" placeholder="Reps" value="${reps}">
      <button class="btn-del-serie">X</button>
    </div>
  `;
}

// ------------------------------------------
// AUTH
// ------------------------------------------
async function initUser(){
  try {
    const { data, error } = await sb.auth.getUser();
    if (error){ currentUserId = null; return; }
    currentUserId = data?.user?.id || null;
  } catch(e){ currentUserId = null; }
}

// --------- Supabase queries (RLS) -------------
async function buscarExercicioPorId(id){
  try {
    let q = sb.from('exercicios').select('id, exercicio, grupo1, grupo2, grupo3').eq('id', id);
    if (currentUserId) q = q.eq('user_id', currentUserId);
    const { data, error } = await q.maybeSingle();
    if (error) return null;
    return data;
  } catch(e){ return null; }
}

async function buscarExerciciosRelacionadosViaTreinoExs(gruposNormalizados){
  if (!gruposNormalizados || !gruposNormalizados.length) return [];
  try {
    let q = sb.from('treino_exercicios').select('exercicio_id, exercicios(id, exercicio, grupo1, grupo2, grupo3)').order('ordem',{ascending:true});
    if (currentUserId) q = q.eq('user_id', currentUserId);
    const { data, error } = await q;
    if (error) return [];
    const rows = data || [];
    const map = new Map();
    rows.forEach(r => {
      const ex = r.exercicios; if (!ex) return;
      const g1 = ex.grupo1 ? normalizarTexto(ex.grupo1) : null;
      const g2 = ex.grupo2 ? normalizarTexto(ex.grupo2) : null;
      const g3 = ex.grupo3 ? normalizarTexto(ex.grupo3) : null;
      if (gruposNormalizados.includes(g1) || gruposNormalizados.includes(g2) || gruposNormalizados.includes(g3)){
        if (!map.has(ex.id)) map.set(ex.id, ex);
      }
    });
    return Array.from(map.values());
  } catch(e){ return []; }
}

async function buscarRegistrosPeriodo(exercicioId, periodo) {
  try {
    // 1) busca TODOS os registros primeiro
    let q = sb.from('treino_registros')
              .select('data, peso, repeticoes, serie, treino_id')
              .eq('exercicio_id', exercicioId)
              .order('data', { ascending: true });

    if (currentUserId) q = q.eq('user_id', currentUserId);

    const { data, error } = await q;
    if (error || !data) return [];

    // se for ALL → devolve tudo, sem filtro
    if (periodo === 'all') return data;

    // converte periodo para dias de forma robusta
    let periodoStr = String(periodo);
    let dias = Number(periodoStr);
    if (isNaN(dias)) {
      if (periodoStr.endsWith('m')) {
        dias = Number(periodoStr.replace('m','')) * 30;
      }
    }
    if (isNaN(dias) || dias <= 0) dias = 30;

    // pega a última data REAL dos registros, sem depender do filtro anterior
    const datas = data.map(r => parseLocalDate(r.data).getTime()).filter(t => !isNaN(t));
    if (!datas.length) return [];
    const ultimaData = new Date(Math.max(...datas));
    ultimaData.setHours(0, 0, 0, 0);

    // 3) calcula o início (últimaData - (dias-1))
    const inicio = new Date(ultimaData.getTime() - (Number(dias) - 1) * 24 * 60 * 60 * 1000);

    // 4) filtra SOMENTE AQUI (apenas 1 vez)
    return data.filter(r => {
      const d = parseLocalDate(r.data);
      return d >= inicio && d <= ultimaData;
    });

  } catch(e) {
    console.error(e);
    return [];
  }
}

// --------- UI e lógica -------------
async function montarListaECalcular(baseExercicioId){
  const container = document.getElementById('exerciciosList');
  if (!container) return;
  container.innerHTML = 'Carregando...';
  if (!currentUserId){ container.innerHTML='Erro: usuário não autenticado.'; return; }

  const base = await buscarExercicioPorId(baseExercicioId);
  if (!base){ container.innerHTML='Exercício base não encontrado.'; return; }
  CACHE.baseExercicio = base;

  const grupos = [base.grupo1, base.grupo2, base.grupo3].filter(Boolean).map(g => normalizarTexto(g));
  const relacionados = await buscarExerciciosRelacionadosViaTreinoExs(grupos);
  CACHE.relacionados = relacionados;
  if (!relacionados.length){ container.innerHTML='Nenhum exercício relacionado.'; return; }

  const periodo = document.getElementById('filtroPeriodo')?.value || '30';
  container.innerHTML = '';

  // Cria itens da lista, pré-carrega registros (await em série para evitar concorrência excessiva)
  for (const ex of relacionados) {
    // carrega registros (cache) — usa chave string consistente
    const registros = await (async () => {
      const key = String(ex.id);
      if (CACHE.registros[key]) return CACHE.registros[key];
      const r = await buscarRegistrosPeriodo(ex.id, periodo);
      CACHE.registros[key] = r;
      return r;
    })();

    // agrupa por data e calcula o maior 1RM por dia
    const agrup = agruparPorData(registros);
    const dias = agrup.map(g => {
      const maior = g.regs.reduce((best, r) => {
        const rm = calcular1RM(r.peso, r.repeticoes);
        return (rm > best ? rm : best);
      }, 0);
      return { data: g.data, rm: maior };
    });

    // pegar últimos 6 dias (para 5 comparações)
    const ultimos = dias.slice(-6);
    const comparacoes = [];

    for (let i = 1; i < ultimos.length; i++) {

        // Usa exatamente o mesmo cálculo do histórico, sem || 0
        const prevRM = ultimos[i - 1].rm;
        const atualRM = ultimos[i].rm;

        let pct = null;

        // Se ambos existirem e forem números válidos
        if (
            prevRM != null && !isNaN(prevRM) &&
            atualRM != null && !isNaN(atualRM) &&
            prevRM > 0
        ) {
            pct = ((atualRM - prevRM) / prevRM) * 100;
        }

      comparacoes.push(pct);
    }


    const div = document.createElement('div');
    div.className = 'ex-item';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '8px';
    div.style.padding = '8px';
    div.style.borderBottom = '1px solid #eee';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.id = ex.id;
    cb.className = 'checkbox';
    if (selecionadosParaComparacao.has(String(ex.id))) cb.checked = true;

    // Marca automaticamente o exercício vindo do botão 1RM (se for o caso)
    const exSelecionado = localStorage.getItem("progresso_exercicio_id");
    if (exSelecionado && Number(exSelecionado) === Number(ex.id)) {
        cb.checked = true;
        selecionadosParaComparacao.add(String(ex.id));
    }

    cb.addEventListener('change', async (e) => {
      const id = String(e.target.dataset.id);
      if (e.target.checked) selecionadosParaComparacao.add(id);
      else selecionadosParaComparacao.delete(id);
      await atualizarGraficoComparacao();
      await atualizarDetalhesComparacao();
    });

    const label = document.createElement('div');
    label.textContent = ex.exercicio;
    label.className = 'ex-name';

    
    // --- 5 bolinhas alinhadas à direita ---
    const bolinhas = document.createElement('div');
    bolinhas.style.display = 'flex';
    bolinhas.style.gap = '6px';

    // array de 5 posições, todas iniciam null
    const displayDots = new Array(5).fill(null);

    // alinhar as comparacoes para a direita
    if (comparacoes && comparacoes.length) {
      const start = Math.max(0, 5 - comparacoes.length);
      for (let j = 0; j < Math.min(comparacoes.length, 5); j++) {
        displayDots[start + j] = comparacoes[j];
      }
    }

    // montar as bolinhas com base em displayDots
    for (let i = 0; i < 5; i++){
      const pct = displayDots[i];
      const cor = (pct == null) ? '#DDDDDD' : getCorProgresso(pct);

      const s = document.createElement('span');
      s.style.width = '10px';
      s.style.height = '10px';
      s.style.borderRadius = '50%';
      s.style.display = 'inline-block';
      s.style.background = cor;

      bolinhas.appendChild(s);
    }


    div.appendChild(cb);
    div.appendChild(label);
    div.appendChild(bolinhas);

    container.appendChild(div);
  }
}

// ---------------------------------------------------
// getMetricsByDateFull - retorna 1RM, volume total e média por rep
// ---------------------------------------------------
async function getMetricsByDateFull(registros){
    const agrup = agruparPorData(registros);
    const map = new Map();

    agrup.forEach(a => {

        // === 1RM EXATAMENTE COMO NO HISTÓRICO ===
        const rmDia = a.regs.reduce((m, r) => {
            const x = calcular1RM(r.peso, r.repeticoes);
            return x > m ? x : m;
        }, 0);

        // === VOLUME TOTAL EXATAMENTE COMO NO HISTÓRICO ===
        const volDia = somaTonelagemPorData(a.regs);

        map.set(a.data, {
            '1rm': rmDia,
            'vol_total': volDia
        });
    });

    return map;
}

async function buscarDatasUnion(ids, periodo){
  const sets = [];
  for (const idStr of ids){
    const id = Number(idStr);
    let regs = CACHE.registros[String(id)];
    if (!regs) { regs = await buscarRegistrosPeriodo(id, periodo); CACHE.registros[String(id)] = regs; }
    const agrup = agruparPorData(regs);
    sets.push(agrup.map(a => a.data));
  }
  // ordenação temporal (evita sort lexicográfico)
  const union = Array.from(new Set(sets.flat())).sort((a,b) => parseLocalDate(a) - parseLocalDate(b));
  return union;
}

async function atualizarGraficoComparacao(){
  // remove botão comparar se existir (por segurança caso HTML ainda contenha)
  const btnComp = document.getElementById('btn-comparar'); if (btnComp) btnComp.remove();

  const periodo = document.getElementById('filtroPeriodo')?.value || '30';
  if (!selecionadosParaComparacao.size) {
    if (progressoChart) progressoChart.destroy();
    const detalhes = document.getElementById('detalhes'); if (detalhes) detalhes.innerHTML = '';
    return;
  }

  const ids = Array.from(selecionadosParaComparacao);
  const datasUnion = await buscarDatasUnion(ids, periodo); // labels
  if (!datasUnion.length) {
    if (progressoChart) progressoChart.destroy();
    return;
  }

  // Para cada exercício selecionado, obter séries alinhadas a datasUnion (1RM e Vol)
  const exerciseMap = new Map(CACHE.relacionados.map(ex => [String(ex.id), ex.exercicio]));
  const seriesList = []; // armazenará { nome, values1, valuesVol }

  for (const idStr of ids) {
    const id = Number(idStr);
    let registros = CACHE.registros[String(id)];
    if (!registros) { registros = await buscarRegistrosPeriodo(id, periodo); CACHE.registros[String(id)] = registros; }
    const metrics = await getMetricsByDateFull(registros);
    const aligned1 = datasUnion.map(d => metrics.get(d)?.['1rm'] ?? null);
    const alignedVol = datasUnion.map(d => metrics.get(d)?.['vol_total'] ?? null);
    seriesList.push({ nome: exerciseMap.get(idStr) || `ID ${id}`, values1: aligned1, valuesVol: alignedVol });
  }
 
// --------------------------------------------------------
// GRÁFICO REAL — sem normalização; um eixo Y independente por dataset (invisíveis)
// --------------------------------------------------------

  // montar datasets reais (1RM sólido, Vol tracejado). cada dataset recebe yAxisID = y{index}
  const datasets = [];

  seriesList.forEach((s, idx) => {
      const hue = (idx * 60) % 360;
      const baseColor = `hsl(${hue} 70% 45%)`;

      // 1RM — sólida
      datasets.push({
          label: `${s.nome} — 1RM`,
          data: s.values1.map(v => (v == null ? null : Number(v))),
          borderColor: baseColor,
          borderWidth: 2,
          tension: 0.3,
          fill: false,
          yAxisID: `y${datasets.length}`,
          pointRadius: 0,
          pointHoverRadius: 0,
          spanGaps: true,
          meta: { rawValues: s.values1 }
      });

      // Volume total — tracejada
      datasets.push({
          label: `${s.nome} — Vol`,
          data: s.valuesVol.map(v => (v == null ? null : Number(v))),
          borderColor: baseColor,
          borderWidth: 2,
          borderDash: [5, 4],
          tension: 0.3,
          fill: false,
          yAxisID: `y${datasets.length}`,
          pointRadius: 0,
          pointHoverRadius: 0,
          spanGaps: true,
          meta: { rawValues: s.valuesVol }
      });
  });

  // === Garantir canvas/contexto e ordem correta ===
  const canvas = document.getElementById('chartProgresso');
  if (!canvas) { console.error('canvas #chartProgresso não encontrado'); return; }
  if (!chartCtx) chartCtx = canvas.getContext('2d');

  if (progressoChart) progressoChart.destroy();

  // criar um objeto scales com um eixo Y para cada dataset (todos invisíveis),
  // e manter o eixo X com grid visível para linhas verticais de data.
  const scales = datasets.reduce((acc, ds, i) => {
      acc[`y${i}`] = {
          type: 'linear',
          display: false,        // eixo invisível
          beginAtZero: false,
          ticks: { display: false },
          grid: { drawOnChartArea: false } // evita desenhar grids vindos desses eixos
      };
      return acc;
  }, {});

  // eixo X
  scales.x = {
      title: { display: false },
      grid: { display: true, drawOnChartArea: true, drawTicks: true }
  };

  // animação: manter fade (evita "deslocamento" ao trocar escalas)
  const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
          duration: 400,
          easing: 'easeOutQuad',
          animations: {
              y: { type: 'number', duration: 0 },
              x: { type: 'number', duration: 0 },
              tension: { duration: 300 }
          }
      },
      transitions: {
          active: { animation: { duration: 0 } },
          resize: { animation: { duration: 0 } }
      },
      scales,
      plugins: {
          legend: {
              display: true,
              position: 'bottom',
              labels: { boxWidth: 30, boxHeight: 2, padding: 10 }
          },
          tooltip: {
              callbacks: {
                  label: function(context) {
                      const ds = context.dataset;
                      const idx = context.dataIndex;
                      const raw = ds.meta && ds.meta.rawValues ? ds.meta.rawValues[idx] : null;
                      const label = ds.label || '';
                      if (raw == null || isNaN(raw)) return `${label}: -`;
                      // mostrar valor real (kg) no tooltip
                      // se quiser também mostrar unidade/descrição, ajuste aqui
                      return `${label}: ${Number(raw).toFixed(1)}kg`;
                  }
              }
          }
      },
      elements: {
          point: { radius: 0, hoverRadius: 0 }
      }
  };

  progressoChart = new Chart(chartCtx, {
      type: 'line',
      data: { labels: datasUnion, datasets },
      options: chartOptions
  });

}

// Detalhes — histórico por data (colunas)
async function atualizarDetalhesComparacao(){
  const painel = document.getElementById('detalhes');
  if (!painel) return;
  painel.innerHTML = '';

  const selecionados = Array.from(selecionadosParaComparacao);
  if (!selecionados.length) {
    painel.innerHTML = "<em>Selecione exercícios.</em>";
    return;
  }

  let html = `<table style="width:100%; border-collapse:collapse;
"><tbody><tr>`;

  for (const id of selecionados) {

    const nome = CACHE.relacionados.find(e => e.id == id)?.exercicio || id;

    const agrupado = agruparPorData(CACHE.registros[String(id)] || [])
                      .sort((a,b) => parseLocalDate(b.data) - parseLocalDate(a.data));

    let col = `
      <div style="font-weight:600; margin-bottom:6px; display:flex; align-items:center; gap:6px; font-size:16px;">
        ${nome}
        <span style="cursor:pointer; font-size:16px;"
          onclick="window.dispatchEvent(new CustomEvent('abrirModalInserirRegistro',{detail:{exercicioId:${id}}}))">+</span>
      </div>
    `;

    for (let i = 0; i < agrupado.length; i++) {

      const atual = agrupado[i];
      const anterior = agrupado[i + 1];

      const rmAtual = atual.regs.reduce((m,r)=>{
        const x = calcular1RM(r.peso, r.repeticoes);
        return x > m ? x : m;
      }, 0);

      const volAtual = somaTonelagemPorData(atual.regs);

      let pctRM = null, pctVol = null;
      let pctRMSign = '', pctVolSign = '';

      if (anterior) {

        const rmAnt = anterior.regs.reduce((m,r)=>{
          const x = calcular1RM(r.peso, r.repeticoes);
          return x > m ? x : m;
        }, 0);

        const volAnt = somaTonelagemPorData(anterior.regs);

        if (rmAnt > 0) pctRM = ((rmAtual - rmAnt)/rmAnt)*100;
        if (volAnt > 0) pctVol = ((volAtual - volAnt)/volAnt)*100;

        // Aplica formatação de sinal (+X%) e cor
        if (pctRM !== null) pctRMSign = `<span style="color:${getCorTextoProgresso(pctRM)};">${formatSignPct(pctRM)}</span>`;
        if (pctVol !== null) pctVolSign = `<span style="color:${getCorTextoProgresso(pctVol)};">${formatSignPct(pctVol)}</span>`;
      }
      
      // Se não houver anterior ou percentual for null/0, mostra valor sem cor/sinal.
      if (pctRMSign === '') pctRMSign = formatSignPct(pctRM);
      if (pctVolSign === '') pctVolSign = formatSignPct(pctVol);

      col += `
        <div 
          onclick="abrirModalProgresso(${id}, '${atual.data}')"
          class="historico-registro">

          <span style="cursor:pointer; margin-right:6px;"
            onclick="event.stopPropagation(); abrirPainelProgresso(${id}, '${atual.data}')">
            📊
          </span>

          <span class="data-registro">${atual.data}</span>
          — 1RM: ${formatNum(rmAtual)}kg ${pctRMSign}
          | Vol: ${formatNum(volAtual)}kg ${pctVolSign}
        </div>
      `;

    }

    html += `<td style="vertical-align:top; padding:8px; width:200px;">${col}</td>`;
  }

  html += `</tr></tbody></table>`;
  painel.innerHTML = html;
}

// =================================================
// ABRIR MODAL DE EDIÇÃO/INSERÇÃO
// =================================================
async function abrirModalProgresso(exercicioId, data=null) {
  PROG_exercicioId = exercicioId;
  PROG_dataOriginal = data;

  const modal = document.getElementById("modalProgresso");
  const titulo = document.getElementById("modalProgressoTitulo");
 
  // Busca o nome do exercício direto no Supabase (mais seguro)
  let nomeEx = "";
  try {
    const { data: exData } = await sb
      .from("exercicios")
      .select("exercicio")
      .eq("id", exercicioId)
      .maybeSingle();

    nomeEx = exData?.exercicio || "";
  } catch (_) {}

  // Determina título una única vez (corrigido: antes havia atribuições conflitantes)
  if (titulo) {
    titulo.textContent = data ? `Editar Registro — ${nomeEx}` : `Novo Registro — ${nomeEx}`;
  }

  const inputData = document.getElementById("progData");
  const contSeries = document.getElementById("progSeriesContainer");
  const btnExcluir = document.getElementById("btnProgressoExcluir");

  if (contSeries) contSeries.innerHTML = "";

  if (data) {
    if (titulo) titulo.textContent = `Editar Registro — ${nomeEx}`;
    if (inputData) {
      inputData.value = data;
      // BLOQUEAR A DATA NO MODO EDITAR
      inputData.readOnly = true;
      inputData.style.pointerEvents = "none";
      inputData.style.opacity = "0.6";
    }
    if (btnExcluir) btnExcluir.style.display = "inline-block";

    const registros = (CACHE.registros[String(exercicioId)] || []).filter(r => r.data === data);

    registros.forEach((r, i) => {
      if (contSeries) contSeries.insertAdjacentHTML("beforeend",
        criarLinhaSerie(i, r.peso, r.repeticoes)
      );
    });

  } else {
    // MODO NOVO REGISTRO — LIBERAR DATA
    if (inputData) {
      inputData.readOnly = false;
      inputData.style.pointerEvents = "auto";
      inputData.style.opacity = "1";
      try { inputData.valueAsDate = new Date(); } catch(e){ /* ignore se tipo diferente */ }
    }
    if (btnExcluir) btnExcluir.style.display = "none";

    if (contSeries) contSeries.insertAdjacentHTML("beforeend", criarLinhaSerie(0));
  }

  if (modal) modal.style.display = "flex"; 
}

const btnFecharModal = document.getElementById("modalProgressoFechar");
if (btnFecharModal) {
  btnFecharModal.onclick = () => {
    const m = document.getElementById("modalProgresso");
    if (m) m.style.display = "none";
  };
}

const btnAddSerie = document.getElementById("btnProgressoAddSerie");
if (btnAddSerie) {
  btnAddSerie.onclick = () => {
    const cont = document.getElementById("progSeriesContainer");
    if (!cont) return;
    const i = cont.querySelectorAll(".prog-serie").length;
    cont.insertAdjacentHTML("beforeend", criarLinhaSerie(i));
  };
}

document.addEventListener("click", (e) => {
  if (e.target.classList && e.target.classList.contains("btn-del-serie")) {
    const row = e.target.closest(".prog-serie");
    if (row) row.remove();
  }
});

const btnSalvarProg = document.getElementById("btnProgressoSalvar");
if (btnSalvarProg) {
  btnSalvarProg.onclick = async () => {
    const data = document.getElementById("progData")?.value;
    const cont = document.getElementById("progSeriesContainer");
    const linhas = cont ? [...cont.querySelectorAll(".prog-serie")] : [];

    if (!data || !linhas.length) {
      alert("Preencha data e séries.");
      return;
    }

    if (PROG_dataOriginal) {
      // incluir treino_id na deleção para evitar apagar registros de outros treinos
      await sb.from("treino_registros")
        .delete()
        .eq("exercicio_id", PROG_exercicioId)
        .eq("data", PROG_dataOriginal)
        .eq("user_id", currentUserId)
        .eq("treino_id", Number(localStorage.getItem("progresso_treino_id")));
    }

    const payload = linhas
      .map((div, idx) => {
        const peso = Number(div.querySelector(".prog-peso").value);
        const repeticoes = Number(div.querySelector(".prog-reps").value);
        
        // Garante que só insere linhas com dados válidos
        if (peso > 0 || repeticoes > 0) {
            return {
              exercicio_id: PROG_exercicioId,
              user_id: currentUserId,
              treino_id: Number(localStorage.getItem("progresso_treino_id")), // <-- inserido aqui
              data,
              serie: idx + 1,
              peso: peso,
              repeticoes: repeticoes
            };
        }
        return null;
      })
      .filter(r => r !== null); // Filtra as linhas vazias

    console.log("PAYLOAD ENVIADO:", JSON.stringify(payload, null, 2));

    if (payload.length > 0) {
        await sb.from("treino_registros").insert(payload);
    } else if (!PROG_dataOriginal) {
        // Se era um novo registro e estava vazio
        alert("Nenhuma série válida para salvar.");
        return; 
    }

    const modal = document.getElementById("modalProgresso");
    if (modal) modal.style.display = "none";

    // Recarregar UI
    CACHE.registros = {};
    const id = Number(localStorage.getItem("progresso_exercicio_id"));
    await montarListaECalcular(id);
    await atualizarGraficoComparacao();
    await atualizarDetalhesComparacao();
  };
}

const btnExcluirProg = document.getElementById("btnProgressoExcluir");
if (btnExcluirProg) {
  btnExcluirProg.onclick = async () => {
    if (!PROG_dataOriginal) return;

    if (!confirm("Excluir todas as séries deste dia?")) return;

    await sb.from("treino_registros")
      .delete()
      .eq("exercicio_id", PROG_exercicioId)
      .eq("data", PROG_dataOriginal)
      .eq("user_id", currentUserId)
      .eq("treino_id", Number(localStorage.getItem("progresso_treino_id")));

    const modal = document.getElementById("modalProgresso");
    if (modal) modal.style.display = "none";

    CACHE.registros = {};
    const id = Number(localStorage.getItem("progresso_exercicio_id"));
    await montarListaECalcular(id);
    await atualizarGraficoComparacao();
    await atualizarDetalhesComparacao();
  };
}

// ---------------------------------------------------
// Inicialização
// ---------------------------------------------------
window.addEventListener('load', async () => {

  const btnComp = document.getElementById('btn-comparar');
  if (btnComp) btnComp.remove();

  await initUser();

  const id = Number(localStorage.getItem('progresso_exercicio_id'));
  const cont = document.getElementById('exerciciosList');

  if (!cont) return;
  if (!id || isNaN(id)) {
    cont.innerHTML = '<em>Nenhum exercício selecionado.</em>';
    return;
  }

  CACHE.registros = {};
  await montarListaECalcular(id);
  await atualizarGraficoComparacao();
  await atualizarDetalhesComparacao();

  const filtro = document.getElementById('filtroPeriodo');
  if (filtro) {
    filtro.addEventListener('change', async () => {
      CACHE.registros = {};
      await montarListaECalcular(id);
      await atualizarGraficoComparacao();
      await atualizarDetalhesComparacao();
    });
  }
});


// ---------------------------------------------------
// BOTÃO + AO LADO DO EXERCÍCIO → ABRIR MODAL
// ---------------------------------------------------
window.addEventListener("abrirModalInserirRegistro", (ev) => {
  const id = ev.detail.exercicioId;
  // Chama a função central que trata tanto edição quanto inserção (data=null for novo registro)
  abrirModalProgresso(id, null); 
});


  window.addEventListener('editarRegistro', async (ev) => {
    // Mantido para compatibilidade; atualmente não faz ação adicional
    console.log('editarRegistro', ev.detail);
    
  });

  window.addEventListener('excluirRegistro', async (ev) => {
    // Mantido para compatibilidade; atualmente não faz ação adicional
    console.log('excluirRegistro', ev.detail);
    const { data } = ev.detail || {};
  });

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnVoltarProgresso');
  if (!btn) return;
  btn.onclick = () => {
    if (history.length > 1) {
      history.back();
    } else {
      window.location.href = 'treino.html';
    }
  };
});
