// index.js — versão com correções de duplicidade, bugs e Ordem do Treino
const sb = window.sb;
let listaFiltradaGlobal = [];
let grafico;
let dadosPesos = [];
let periodoAtual = 7;
let idEditar = null;

// Meta: persistida em localStorage
const META_KEY = "meta_config";
let metaConfig = null; // { tipo: 'percent'|'manutencao', percentual: -1|..., metaKg: 67.3 }
let ultimaMediaSemanaAnterior = null; // atualizada em calcularSemanasEMedias

// Variáveis para Treino
let padroesTreinoCache = [];
let exerciciosTreinoCache = [];
let dataFotoSelecionada = null; 
let treinoSelecionado = null;

/* ======= FUNÇÕES AUXILIARES ======= */
function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().substring(0, 10);
}

function parseISODateLocal(iso) {
  return new Date(iso + "T00:00:00");
}

function formatarData(iso) {
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun",
                 "jul", "ago", "set", "out", "nov", "dez"];

  const d = new Date(iso + "T00:00:00");
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = meses[d.getMonth()];
  const ano = d.getFullYear();

  return `${dia} ${mes} ${ano}`;
}

/* ======= MODAIS ======= */
function fecharModals() {
  document.querySelectorAll(".modal").forEach(m => m.setAttribute("aria-hidden", "true"));
  removerMenuFlutuante();
}

function abrirAddPeso() {
  fecharModals();
  const dataInput = document.getElementById("dataNovoPeso");
  const valorInput = document.getElementById("valorNovoPeso");
  const modal = document.getElementById("modalPeso");
  
  if (!modal || !dataInput || !valorInput) {
      console.error("ERRO: Elementos do modalPeso não encontrados.");
      return; 
  }
  
  dataInput.value = hojeISO();
  valorInput.value = "";
  modal.setAttribute("aria-hidden", "false");
}

function abrirPeriodo() {
  fecharModals();
  const modal = document.getElementById("modalPeriodo");
  
  if (!modal) {
      console.error("ERRO: Elemento do modalPeriodo não encontrado.");
      return; 
  }
  
  modal.setAttribute("aria-hidden", "false");
}

/* ======= UPLOAD PELO HISTÓRICO ======= */
function abrirFotoComDataDireto(data) {
  fecharModals();
  const modal = document.getElementById("modalFoto");
  const dataInput = document.getElementById("dataFoto");
  const fileInput = document.getElementById("arquivoFoto");

  if (!modal || !dataInput || !fileInput) {
    console.error("modalFoto ou seus inputs não encontrados.");
    return;
  }

  dataFotoSelecionada = data; 
  dataInput.value = data;
  fileInput.value = "";
  fileInput.setAttribute("multiple", "true");

  modal.setAttribute("aria-hidden", "false");
}

/* ======= MODAL TREINO ======= */
async function abrirModalTreino() {
  fecharModals();

  const painelDetalhe = document.getElementById("painelTreinoDetalhe");
  const painelSelecao = document.getElementById("painelTreinoSelecao");
  const modalTreino = document.getElementById("modalTreino");

  if (!painelDetalhe || !painelSelecao || !modalTreino) {
      console.error("ERRO: Elementos do modalTreino não encontrados. Verifique os IDs no index.html.");
      return; 
  }
  
  if (!padroesTreinoCache.length) {
    await carregarRotinasDeTreino(); 
  }
  
  renderBotoesTreino();
  
  painelDetalhe.style.display = 'none';
  painelSelecao.style.display = 'block';

  modalTreino.setAttribute("aria-hidden", "false");
}

function fecharModalTreino() {
  const modalTreino = document.getElementById("modalTreino");
  if (modalTreino) {
      modalTreino.setAttribute("aria-hidden", "true");
  }
}

async function carregarRotinasDeTreino() {
  const { data, error } = await sb
    .from("treinos")
    .select("id, nome_treino")
    .order("ordem", { ascending: true });

  if (error) {
    console.error("Erro ao carregar treinos:", error);
    padroesTreinoCache = [];
    return;
  }

  padroesTreinoCache = data || [];
}
  
async function carregarExerciciosPorPadrao(treinoId) {
  // CORREÇÃO: Usamos o nome 'exercicios' na coluna do join (supostamente o nome da tabela)
  const { data, error } = await sb
    .from("treino_exercicios")
    .select("*, exercicios(id, exercicio, grupo1, grupo2, grupo3, descanso)")
    .eq("treino_id", treinoId)
    .order("ordem", { ascending: true });

  if (error) {
    console.error("Erro ao carregar exercícios do treino:", error);
    return [];
  }
  return data || [];
}

function renderBotoesTreino() {
  const container = document.getElementById("listaBotoesTreino");
  if (!container) return; 
  
  container.innerHTML = "";
  
  if (!padroesTreinoCache.length) {
    container.innerHTML = "Nenhuma rotina de treino (A, B, C...) encontrada.";
    return;
  }
  
  padroesTreinoCache.forEach(rotina => {
    const btn = document.createElement("button");
    btn.className = "btn-secondary";
    btn.textContent = rotina.nome_treino || rotina.nome || "Treino"; 
    btn.style.margin = "4px";
    btn.onclick = () => visualizarTreino(rotina.id, rotina.nome_treino || rotina.nome || "Treino");
    container.appendChild(btn);
  });
}

/**
 * Cria o container HTML básico de um exercício de treino, com título, botão de remover e container de séries.
 * @param {string|number} exercicioId ID do exercício.
 * @param {string} nomeEx Nome do exercício.
 * @returns {HTMLDivElement} O elemento div completo do item de treino.
 */
function criarElementoExercicioBase(exercicioId, nomeEx) {
    const item = document.createElement("div");
    item.className = "treino-item";
    item.dataset.exercicioId = exercicioId;
    item.style.display = "flex";
    item.style.flexDirection = "column";
    item.style.gap = "6px";
    item.style.position = "relative";

    item.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${nomeEx}</strong>
            <button class="btn-remove-ex"
                    style="width:26px;height:26px;border-radius:6px;
                           border:none;background:#ff0000;
                           display:flex;align-items:center;justify-content:center;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="#fff" stroke-width="2" stroke-linecap="round">
                    <line x1="5" y1="5" x2="19" y2="19" />
                    <line x1="5" y1="19" x2="19" y2="5" />
                </svg>
            </button>
        </div>
        <div class="series-container" style="display:flex; flex-direction:column; gap:0px;">
        </div>
        <button class="btn-add-serie"
                style="margin-bottom:10px;width:26px;height:26px;border-radius:6px;
                       border:none;background:#ededed;
                       display:flex;justify-content:center;align-items:center;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                 stroke="#444" stroke-width="2" stroke-linecap="round">
                <line x1="12" y1="5"  x2="12" y2="19" />
                <line x1="5"  y1="12" x2="19" y2="12" />
            </svg>
        </button>
    `;
    
    // Configura o handler de remoção simples (item.remove())
    item.querySelector(".btn-remove-ex").onclick = () => item.remove();
    
    return item;
}

async function visualizarTreino(treinoId, nomeTreino) {
  treinoSelecionado = treinoId;
  const dataHoje = dataFotoSelecionada || hojeISO();

  // ===== 1) CARREGA O PADRÃO DE EXERCÍCIOS PARA OBTER A ORDEM CORRETA =====
  const padrao = await carregarExerciciosPorPadrao(treinoId);
  
  // 2) BUSCA REGISTROS EXISTENTES DO DIA (se houver)
  const { data: regs, error: erroReg } = await sb
    .from("treino_registros")
    .select("*")
    .eq("data", dataHoje)
    .eq("treino_id", treinoId)
    .order("exercicio_id, serie", { ascending: true });

  if (erroReg) console.error("Erro ao carregar registros do treino:", erroReg);

  const painelDetalhe = document.getElementById("painelTreinoDetalhe");
  const painelSelecao = document.getElementById("painelTreinoSelecao");
  const lista = document.getElementById("listaExerciciosTreino");
  const titulo = document.getElementById("treinoDetalheTitulo");

  lista.innerHTML = "";
  titulo.textContent = `Treino: ${nomeTreino} (${formatarData(dataHoje)})`; 

  // ====================================================
  // 3) CONSTROI A LISTA BASEADA NO PADRÃO (ORDEM CORRETA)
  // ====================================================

  padrao.forEach(e => {
      const exercicioId = e.exercicios?.id || e.exercicio_id;
      const nomeEx = e.exercicios?.exercicio || "Exercício";

      // 3.1) Cria o elemento HTML base, usando a ordem do padrão
      const item = criarElementoExercicioBase(exercicioId, nomeEx);
      const cont = item.querySelector(".series-container");

      let linhasDoEx = [];
      if (regs && regs.length > 0) {
          // Filtra os registros salvos para este exercício
          linhasDoEx = regs.filter(r => r.exercicio_id === exercicioId);
      }
      
      // 3.2) Popula com dados salvos ou com 2 linhas vazias (padrão)
      if (linhasDoEx.length > 0) {
          linhasDoEx.forEach(r => {
              const linha = criarLinhaSerie();
              linha.querySelector(".serie-peso").value = r.peso ?? "";
              linha.querySelector(".serie-rep").value = r.repeticoes ?? "";
              cont.appendChild(linha);
          });
      } else {
          // Se não há registro (ou se o registro for vazio), adiciona 2 linhas para preenchimento
          cont.appendChild(criarLinhaSerie());
          cont.appendChild(criarLinhaSerie());
      }

      // 3.3) Configura o botão de adicionar série
      item.querySelector(".btn-add-serie").onclick = () => cont.appendChild(criarLinhaSerie());
      
      lista.appendChild(item);
  });

  painelSelecao.style.display = "none";
  painelDetalhe.style.display = "block";
}

function criarLinhaSerie() {
  const linha = document.createElement("div");
  linha.className = "linha-serie";
  linha.style.display = "flex";
  linha.style.gap = "6px";
  linha.style.alignItems = "center";

  linha.innerHTML = `
    <input type="number" class="serie-peso" step="0.5" placeholder="Peso"
           style="width:70px;margin-bottom:5px;padding:6px;border-radius:6px;border:1px solid #ddd;">

    <input type="number" class="serie-rep" step="1" min="0" placeholder="Reps"
           style="width:70px;margin-bottom:5px;padding:6px;border-radius:6px;border:1px solid #ddd;">

    <button class="remover-linha"
            style="width:22px;height:22px;border-radius:6px;
                   display:flex;justify-content:center;align-items:center;
                   border:none;background:none;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="#c33" stroke-width="2" stroke-linecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    </button>
  `;

  linha.querySelector(".remover-linha").onclick = () => linha.remove();

  return linha;
}


async function salvarTreinoDoDia() {
  try {
    const u = await sb.auth.getUser();
    const userId = u?.data?.user?.id;
    if (!treinoSelecionado || !userId) return alert("Erro: usuário ou treino não encontrado.");

    const dataHoje = dataFotoSelecionada || hojeISO();
    const inserts = [];

    document.querySelectorAll("#listaExerciciosTreino .treino-item").forEach(ex => {
      const exercicioId = ex.dataset.exercicioId;
      const series = ex.querySelectorAll(".linha-serie");
      let num = 1;
      series.forEach(linha => {
        const pesoVal = linha.querySelector(".serie-peso")?.value;
        const repVal = linha.querySelector(".serie-rep")?.value;
        const peso = pesoVal !== undefined && pesoVal !== '' ? parseFloat(pesoVal) : null;
        const rep = repVal !== undefined && repVal !== '' ? parseInt(repVal) : null;

        if ((peso !== null && !isNaN(peso)) || (rep !== null && !isNaN(rep))) {
          inserts.push({
            user_id: userId,
            data: dataHoje,
            treino_id: treinoSelecionado,
            exercicio_id: exercicioId,
            serie: num++,
            peso: peso,
            repeticoes: rep
          });
        }
      });
    });

    if (!inserts.length) {
      alert("Nenhuma série preenchida.");
      return;
    }

    // apagar registros anteriores da mesma data + treino
    await sb
    .from("treino_registros")
    .delete()
    .eq("data", dataHoje)
    .eq("treino_id", treinoSelecionado);


    const { error } = await sb.from("treino_registros").insert(inserts);
    if (error) {
      console.error(error);
      alert("Erro ao salvar.");
      return;
    }

    fecharModalTreino();
    alert("Treino salvo com sucesso.");
  } catch (err) {
    console.error(err);
    alert("Erro inesperado ao salvar treino.");
  }
}

function voltarSelecaoTreino() {
  const painelDetalhe = document.getElementById("painelTreinoDetalhe");
  const painelSelecao = document.getElementById("painelTreinoSelecao");

  if (!painelDetalhe || !painelSelecao) {
      console.error("ERRO: Elementos de seleção de treino não encontrados para voltar.");
      return;
  }

  painelDetalhe.style.display = 'none';
  painelSelecao.style.display = 'block';
}

/* ======= LOAD INICIAL ======= */
window.addEventListener("load", () => {
  carregarMetaLocal();
  carregarPesos(true);

  // evento para abrir modal meta ao clicar no bloco
  const metaBloco = document.getElementById("metaBloco");
  if (metaBloco) {
    metaBloco.addEventListener("click", () => {
      abrirModalMeta();
    });
  }

  // controle do modal meta: mostrar campo de manutenção quando selecionado
  document.addEventListener("change", (e) => {
    if (e.target && e.target.name === "metaOpt") {
      const wrap = document.getElementById("metaManutencaoWrap");
      if (e.target.value === "manutencao") {
        wrap.style.display = "block";
      } else {
        wrap.style.display = "none";
      }
    }
  });

  // fechar menu flutuante clicando fora
  document.addEventListener("click", (ev) => {
    const isMenu = ev.target.closest && ev.target.closest('.menu-flutuante');
    const isTrigger = ev.target.closest && ev.target.closest('.menu-trigger');
    if (!isMenu && !isTrigger) removerMenuFlutuante();
  }, true);
});

/* ======= SALVAR PESO, FOTO, CARREGAR PESOS E ETC. ======= */

async function salvarPesoNovo() {
  const data = document.getElementById("dataNovoPeso")?.value;
  const peso = parseFloat(document.getElementById("valorNovoPeso")?.value);

  if (!data || isNaN(peso)) return alert("Preencha todos os campos.");

  await sb.from("pesos").insert({ data, peso });
  fecharModals();
  carregarPesos(true);
}

async function salvarFoto() {
  const data = document.getElementById("dataFoto")?.value;
  const files = document.getElementById("arquivoFoto")?.files;

  if (!data || !files || files.length === 0) {
    alert("Selecione a data e pelo menos uma foto.");
    return;
  }

  for (let file of files) {
    const nome = `${Date.now()}-${file.name}`;
    const { error: upErr } = await sb.storage.from("fotos").upload(nome, file);
    if (upErr) continue;

    const { data: pub } = sb.storage.from("fotos").getPublicUrl(nome);
    await sb.from("fotos").insert({ data_foto: data, url: pub.publicUrl });
  }

  fecharModals();
}

async function carregarPesos(filtrar = false) {
  const { data, error } = await sb
    .from("pesos")
    .select("id, data, peso")
    .order("data", { ascending: false });

  if (error) return console.error(error);

  dadosPesos = data || [];

  if (filtrar) {
    aplicarPeriodo();
  } else {
    montarGrafico(dadosPesos);
    renderHistorico(dadosPesos);
    calcularSemanasEMedias();
  }
}

function aplicarPeriodo() {
  // Correção de inconsistência: a lógica anterior falhava ao tratar o valor '8'
  // que era injetado no lugar de '7', caindo no default de '7'.
  // Agora, usamos um switch/default mais claro.
  if (periodoAtual === "all") {
    listaFiltradaGlobal = dadosPesos;
    montarGrafico(dadosPesos);
    renderHistorico(dadosPesos);
    calcularSemanasEMedias();
    return;
  }
  
  let numDias;
  switch (periodoAtual) {
    case 30: numDias = 30; break;
    case 90: numDias = 90; break;
    case 180: numDias = 180; break;
    case 365: numDias = 365; break;
    case 7: 
    default: numDias = 7; break; // Se for 7 ou qualquer outro valor inesperado, usa 7.
  }
  
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // O cálculo (numDias - 1) garante que a filtragem inclua o dia de hoje
  const limite = new Date(hoje.getTime() - (numDias - 1) * 86400000);

  const filtrado = dadosPesos.filter(p => {
    const d = parseISODateLocal(p.data);
    return d >= limite;
  });

  listaFiltradaGlobal = filtrado;

  montarGrafico(filtrado);
  renderHistorico(filtrado);
  calcularSemanasEMedias();
}

function filtroPeriodo(dias) {
  periodoAtual = dias;
  atualizarTextoFiltro();
  fecharModals();
  aplicarPeriodo();
}

function atualizarTextoFiltro() {
  const el = document.getElementById("textoFiltroSelecionado");
  if (!el) return;

  let nome = "";

  switch (periodoAtual) {
    case 7:
      nome = "1 semana";
      break;
    case 30:
      nome = "1 mês";
      break;
    case 90:
      nome = "3 meses";
      break;  
    case 180:
      nome = "6 meses";
      break;
    case 365:
      nome = "1 ano";
      break;
    case "all":
      nome = "Tudo";
      break;
    default:
      nome = periodoAtual + " dias";
  }

  el.innerText = nome;
}

function renderHistorico(lista) {
  const el = document.getElementById("listaPesos");
  if (!el) return;
  if (!lista.length) return (el.innerHTML = "Nenhum registro.");

  el.innerHTML = "";

  lista.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";
    div.style.justifyContent = "space-between";
    div.style.position = "relative";

    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="item-title">${item.peso.toFixed(1)} kg</div>
        <div class="item-sub">${formatarData(item.data)}</div>
      </div>

      <div style="display:flex;gap:8px;">
        <button class="btn-mini menu-trigger" style="border:1px solid #ffffffff;background:#fff" aria-label="Mais opções"> 
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="5" r="1.5" fill="#1c1c1e"></circle>
            <circle cx="12" cy="12" r="1.5" fill="#1c1c1e"></circle>
            <circle cx="12" cy="19" r="1.5" fill="#1c1c1e"></circle>
          </svg>
        </button>
      </div>
    `;

    // append and then attach menu handler
    el.appendChild(div);

    const trigger = div.querySelector('.menu-trigger');
    if (trigger) {
      trigger.addEventListener('click', (ev) => {
        ev.stopPropagation();
        abrirMenuFlutuanteParaItem(ev.currentTarget, item);
      });
    }
  });
}

async function abrirEditarDireto(id) {
  const achou = dadosPesos.find(p => p.id === id);
  if (!achou) return;

  idEditar = id;
  const dataInput = document.getElementById("dataEditar");
  const pesoInput = document.getElementById("pesoEditar");
  const modal = document.getElementById("modalEditar");
  
  if (dataInput) dataInput.value = achou.data;
  if (pesoInput) pesoInput.value = achou.peso;

  if (modal) modal.setAttribute("aria-hidden", "false");
}

async function salvarEdicao() {
  const data = document.getElementById("dataEditar")?.value;
  const peso = parseFloat(document.getElementById("pesoEditar")?.value);

  await sb.from("pesos").update({ data, peso }).eq("id", idEditar);
  fecharModals();
  carregarPesos(true);
}

async function excluirPeso() {
  await sb.from("pesos").delete().eq("id", idEditar);
  fecharModals();
  carregarPesos(true);
}

/* ======= MENU FLUTUANTE (3 pontos) ======= */
function removerMenuFlutuante() {
  const existing = document.querySelector(".menu-flutuante");
  if (existing) existing.remove();
}

function abrirMenuFlutuanteParaItem(triggerEl, item) {
  removerMenuFlutuante();

  const rect = triggerEl.getBoundingClientRect();
  const menu = document.createElement("div");
  menu.className = "menu-flutuante";
  menu.innerHTML = `
    <button data-action="editar">Editar peso</button>
    <button data-action="foto">Carregar foto</button>
    <button data-action="treino">Treino</button>
  `;

  // posicionamento simples: abaixo e alinhado à direita do trigger
  menu.style.top = (window.scrollY + rect.top + rect.height + 8) + "px";
  menu.style.left = (window.scrollX + rect.left - 120 + rect.width) + "px";

  document.body.appendChild(menu);

  menu.querySelector('[data-action="editar"]').onclick = () => {
    removerMenuFlutuante();
    abrirEditarDireto(item.id);
  };
  menu.querySelector('[data-action="foto"]').onclick = () => {
    removerMenuFlutuante();
    abrirFotoComDataDireto(item.data);
  };
  menu.querySelector('[data-action="treino"]').onclick = () => {
    removerMenuFlutuante();
    dataFotoSelecionada = item.data;
    abrirModalTreino();
  };
}

/* ======= GRÁFICO ======= */
function montarGrafico(lista) {
  const asc = [...lista].sort((a, b) => parseISODateLocal(a.data) - parseISODateLocal(b.data));

  const labels = asc.map(x => formatarData(x.data));
  const pesos = asc.map(x => x.peso);

  const mediaSuave = pesos.map((_, i) => {
    const inicio = Math.max(0, i - 3);
    const fim = Math.min(pesos.length - 1, i + 3);
    const subset = pesos.slice(inicio, fim + 1);
    return subset.reduce((a, b) => a + b, 0) / subset.length;
  });

  if (grafico) grafico.destroy();
  
  const graficoElement = document.getElementById("graficoPeso");
  if (!graficoElement) return;

  // Registro seguro do plugin de anotação — evita ReferenceError
  if (typeof annotationPlugin !== "undefined") {
      Chart.register(annotationPlugin);
  } else if (typeof ChartAnnotation !== "undefined") {
      Chart.register(ChartAnnotation);
  } else {
      console.warn("Plugin chartjs-plugin-annotation não encontrado.");
  }

  // datasets base
  const datasets = [
    {
      label: "Tendência",
      data: mediaSuave,
      borderColor: "#75a7ff",
      borderWidth: 2,
      tension: 0.4,
      cubicInterpolationMode: "monotone",
      pointRadius: 0
    },
    {
      data: pesos,
      borderWidth: 3,
      tension: 0.25,
      borderColor: "#eaeaec"
    }
  ];

  // adicionar linha de meta (se houver)
  const metaKg = obterMetaKgCalculada();
  if (metaKg != null && labels.length) {
    const linhaMeta = labels.map(() => metaKg);
    datasets.push({
      label: "Meta",
      data: linhaMeta,
      borderWidth: 1.5,
      borderColor: "#ff0202ff",
      borderDash: [4,4],
      pointRadius: 0,
      tension: 0
    });
  }

  grafico = new Chart(graficoElement, {
    type: "line",
    data: {
      labels,
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
            legend: { display: false },
            annotation: {
                annotations: gerarLinhasMensais(lista)
            }
        },
      scales: { x: { display: false } }
    }
  });
  
  if (typeof atualizarTextoFiltro === "function") {
    atualizarTextoFiltro();
  }
}

function gerarLinhasMensais(lista) {
    if (!lista || lista.length < 2) return {};

    // 1 mês → separar semanas
    if (periodoAtual === 30) {
        return gerarLinhasSemanais(lista);
    }

    // se filtro <= 30 dias, não desenhar as linhas
    if (periodoAtual <= 30) return {};

    const anotacoes = {};
    const sorted = [...lista].sort((a, b) => parseISODateLocal(a.data) - parseISODateLocal(b.data));

    for (let i = 1; i < sorted.length; i++) {
        const dAnt = parseISODateLocal(sorted[i - 1].data);
        const dAtu = parseISODateLocal(sorted[i].data);

        // mudou de mês?
        if (dAnt.getMonth() !== dAtu.getMonth() || dAnt.getFullYear() !== dAtu.getFullYear()) {

            anotacoes["mes_" + i] = {
                type: "line",
                xMin: i,
                xMax: i,
                borderColor: "rgba(150,150,150,0.35)",
                borderWidth: 1,
                borderDash: [4,4]
            };
        }
    }

    return anotacoes;
}

function gerarLinhasSemanais(lista) {
    const anotacoes = {};
    const sorted = [...lista].sort((a, b) => parseISODateLocal(a.data) - parseISODateLocal(b.data));

    for (let i = 1; i < sorted.length; i++) {
        const dAnt = parseISODateLocal(sorted[i - 1].data);
        const dAtu = parseISODateLocal(sorted[i].data);

        // mudou de semana? (comparação ISO real)
        const semanaAnt = `${dAnt.getFullYear()}-${dAnt.getWeek?.() ?? ''}`;
        const semanaAtu = `${dAtu.getFullYear()}-${dAtu.getWeek?.() ?? ''}`;

        if (semanaAnt !== semanaAtu) {
            anotacoes["semana_" + i] = {
                type: "line",
                xMin: i,
                xMax: i,
                borderColor: "rgba(120,120,120,0.35)",
                borderWidth: 1,
                borderDash: [4, 4]
            };
        }
    }

    return anotacoes;
}

Date.prototype.getWeek = function () {
    const d = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};


/* ======= CÁLCULO DE SEMANAS E MÉDIAS ======= */
function calcularSemanasEMedias() {
  const elAnt = document.getElementById("mediaSemanaAnterior");
  const elAtu = document.getElementById("mediaSemanaAtual");
  const elProg = document.getElementById("mediaProgressoValor");

  if (!elAnt || !elAtu || !elProg) return;

  if (!dadosPesos.length) { 
    elAnt.innerText="--"; elAtu.innerText="--"; elProg.innerText="--"; 
    ultimaMediaSemanaAnterior = null;
    atualizarMetaExibicao();
    return; 
  }

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const day = hoje.getDay(); 
  const delta = (day - 2 + 7) % 7;
  const tA = new Date(hoje); tA.setDate(tA.getDate()-delta); tA.setHours(0,0,0,0);
  const sA = new Date(tA); sA.setDate(tA.getDate()+6); sA.setHours(23,59,59,999);

  function registrosEm(lista, inicio, fim) {
    return (lista || []).filter(p => {
      const d = parseISODateLocal(p.data);
      return d >= inicio && d <= fim;
    });
  }
  function media(lst){ if(!lst || !lst.length) return null; return lst.reduce((a,b)=>a+b.peso,0)/lst.length; }

  const mAtu = media(registrosEm(dadosPesos, tA, sA));

  let mAnt = null;
  const baseFiltrada = listaFiltradaGlobal && listaFiltradaGlobal.length ? listaFiltradaGlobal : dadosPesos;

  if (periodoAtual === 7) {
    const tP = new Date(tA); tP.setDate(tP.getDate()-7); tP.setHours(0,0,0,0);
    const sP = new Date(sA); sP.setDate(sP.getDate()-7); sP.setHours(23,59,59,999);
    mAnt = media(registrosEm(dadosPesos, tP, sP));
  } else {
    if (baseFiltrada.length) {
      const sorted = [...baseFiltrada].sort((a,b)=>parseISODateLocal(a.data)-parseISODateLocal(b.data));
      const firstDate = parseISODateLocal(sorted[0].data);
      
      const dow = firstDate.getDay();
      const deltaStart = (dow - 2 + 7) % 7;
      const iniT = new Date(firstDate); iniT.setDate(iniT.getDate()-deltaStart); iniT.setHours(0,0,0,0);
      
      const iniS = new Date(iniT); iniS.setDate(iniT.getDate()+6); iniS.setHours(23,59,59,999);
      
      mAnt = media(registrosEm(dadosPesos, iniT, iniS));
    }
  }

  elAtu.innerText = mAtu!=null? mAtu.toFixed(1)+" kg":"--";
  elAnt.innerText = mAnt!=null? mAnt.toFixed(1)+" kg":"--";

  // Correção mínima: evita divisão por zero quando mAnt === 0
  let progresso = "--";
  if (mAtu != null && mAnt != null) {
    if (mAnt === 0) {
      progresso = "--";
    } else {
      const percent = ((mAtu - mAnt) / mAnt * 100).toFixed(1);
      progresso = `${percent}%`;
    }
  }
  elProg.innerText = progresso;


  // guardar a última média da semana anterior para cálculo de meta percentual
  ultimaMediaSemanaAnterior = mAnt;
  atualizarMetaExibicao();
}

/* ======= META: armazenamento local ======= */
function carregarMetaLocal() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      metaConfig = JSON.parse(raw);
    } else {
      metaConfig = null;
    }
  } catch (err) {
    console.error("Erro ao carregar meta do localStorage", err);
    metaConfig = null;
  }
  atualizarMetaExibicao();
}

function salvarMetaLocal() {
  try {
    if (metaConfig) localStorage.setItem(META_KEY, JSON.stringify(metaConfig));
    else localStorage.removeItem(META_KEY);
  } catch (err) {
    console.error("Erro ao salvar meta no localStorage", err);
  }
  atualizarMetaExibicao();
}

function abrirModalMeta() {
  fecharModals();
  const modal = document.getElementById("modalMeta");
  if (!modal) return;
  // preencher opções com meta atual
  if (metaConfig) {
    const tipo = metaConfig.tipo;
    if (tipo === "manutencao") {
      document.querySelectorAll('input[name="metaOpt"]').forEach(r => r.checked = (r.value === "manutencao"));
      document.getElementById("metaManutencao").value = metaConfig.metaKg != null ? metaConfig.metaKg : "";
      document.getElementById("metaManutencaoWrap").style.display = "block";
    } else if (tipo === "percent") {
      document.querySelectorAll('input[name="metaOpt"]').forEach(r => r.checked = (Number(r.value) === Number(metaConfig.percentual)));
      document.getElementById("metaManutencaoWrap").style.display = "none";
    }
  } else {
    // limpar seleção
    document.querySelectorAll('input[name="metaOpt"]').forEach(r => r.checked = false);
    document.getElementById("metaManutencaoWrap").style.display = "none";
    document.getElementById("metaManutencao").value = "";
  }

  modal.setAttribute("aria-hidden", "false");
}

function salvarMeta() {
  const radios = document.querySelectorAll('input[name="metaOpt"]');
  let sel = null;
  radios.forEach(r => { if (r.checked) sel = r.value; });
  if (!sel) return alert("Selecione uma opção de meta.");

  if (sel === "manutencao") {
    const val = parseFloat(document.getElementById("metaManutencao")?.value);
    if (isNaN(val)) return alert("Informe o peso de manutenção (kg).");
    metaConfig = { tipo: "manutencao", metaKg: val };
  } else {
    const percentual = parseFloat(sel);
    // precisa de ultimaMediaSemanaAnterior para calcular
    if (ultimaMediaSemanaAnterior == null) {
      // calcular semanas e medias para obter valor
      calcularSemanasEMedias();
    }
    const base = ultimaMediaSemanaAnterior;
    if (base == null) return alert("Não é possível calcular a meta agora (média anterior indisponível).");
    const metaKg = +(base * (1 + percentual/100)).toFixed(1);
    metaConfig = { tipo: "percent", percentual: percentual, metaKg };
  }

  salvarMetaLocal();
  fecharModals();
  // redesenhar gráfico
  aplicarPeriodo();
}

/* retorna metaKg calculada (number) ou null */
function obterMetaKgCalculada() {
  if (!metaConfig) return null;
  if (metaConfig.tipo === "manutencao") {
    return typeof metaConfig.metaKg === "number" ? metaConfig.metaKg : null;
  }
  if (metaConfig.tipo === "percent") {
    // metaConfig.metaKg já armazenado ao salvar, mas recalcular caso falta e exista ultimaMediaSemanaAnterior
    if (typeof metaConfig.metaKg === "number") return metaConfig.metaKg;
    if (ultimaMediaSemanaAnterior != null && typeof metaConfig.percentual === "number") {
      return +(ultimaMediaSemanaAnterior * (1 + metaConfig.percentual/100)).toFixed(1);
    }
  }
  return null;
}

/* atualiza exibição do bloco meta (apenas peso em kg) */
function atualizarMetaExibicao() {
  const el = document.getElementById("metaValor");
  if (!el) return;
  const kg = obterMetaKgCalculada();
  if (kg == null) {
    el.innerText = "--";
  } else {
    el.innerText = `${kg.toFixed(1)} kg`;
  }

  // redesenhar gráfico para garantir linha atualizada
  if (Array.isArray(listaFiltradaGlobal) && listaFiltradaGlobal.length) montarGrafico(listaFiltradaGlobal);
  else montarGrafico(dadosPesos);

  // ===== TÍTULO COM DIFERENÇA =====
  const titulo = document.getElementById("metaTitulo");
  if (titulo) {
      let mediaAtualNum = null;
      const mediaAtualEl = document.getElementById("mediaSemanaAtual");

      if (mediaAtualEl && mediaAtualEl.innerText.includes("kg")) {
          mediaAtualNum = parseFloat(mediaAtualEl.innerText.replace("kg",""));
      }

      const metaKg = obterMetaKgCalculada();

      // Não calcula se faltar dados
      if (metaKg == null || mediaAtualNum == null || isNaN(mediaAtualNum)) {
          titulo.innerHTML = "Meta";
      } else {
          const dif = +(metaKg - mediaAtualNum).toFixed(1);

          let cor = "#888";
          if (dif > 0) cor = "#1ca93a";    // verde
          if (dif < 0) cor = "#f0422fff";    // vermelho

          titulo.innerHTML = `Meta <span style="color:${cor}; font-weight:500;">(${dif > 0 ? "+" : ""}${dif} kg)</span>`;
      }
  }
}

/* ============================================
   ADICIONAR / REMOVER EXERCÍCIOS NO MODAL TREINO
   (Refatorado com a função auxiliar criarElementoExercicioBase)
   ============================================ */

// cache de todos os exercícios globais
let exerciciosGlobaisCache = [];

// Carrega exercícios de exercicios.js (tabela exercicios)
async function carregarTodosExerciciosGlobais() {
    if (exerciciosGlobaisCache.length) return exerciciosGlobaisCache;

    const { data, error } = await sb
        .from("exercicios")
        .select("id, exercicio")
        .order("exercicio", { ascending: true });

    if (error) {
        console.error("Erro ao carregar exercícios globais:", error);
        return [];
    }

    exerciciosGlobaisCache = data || [];
    return exerciciosGlobaisCache;
}

// Mini-modal simples para escolher exercício
function abrirSelectorExercicio() {

    const wrap = document.createElement("div");
    wrap.className = "modal";
    wrap.setAttribute("aria-hidden", "false");
    wrap.style.zIndex = 99999;

    wrap.addEventListener("click", (ev) => ev.stopPropagation());

    wrap.innerHTML = `
        <div class="modal-backdrop" onclick="this.closest('.modal').remove()"></div>
        <div class="modal-box" style="max-height:80vh; overflow:auto;">
            <h3>Adicionar Exercício</h3>
            <div id="listaExSelector" style="display:flex; flex-direction:column; gap:6px;"></div>
            <button class="btn-primary" onclick="this.closest('.modal').remove()">Sair</button>
        </div>
    `;

    document.body.appendChild(wrap);

    carregarTodosExerciciosGlobais().then(lista => {
        const box = wrap.querySelector("#listaExSelector");

        lista.forEach(ex => {
            const btn = document.createElement("button");
            btn.className = "btn-secondary";
            btn.style.marginTop = "4px";
            btn.textContent = ex.exercicio;
            btn.onclick = () => {
                adicionarExercicioAoTreino(ex.id, ex.exercicio);
                wrap.remove();
            };
            box.appendChild(btn);
        });
    });
}

// Insere o exercício no painel, com 2 linhas iniciais
function adicionarExercicioAoTreino(exercicioId, nomeEx) {
    const lista = document.getElementById("listaExerciciosTreino");
    if (!lista) return;

    // *** REFATORADO: Uso de criarElementoExercicioBase ***
    const item = criarElementoExercicioBase(exercicioId, nomeEx);

    // O handler de remoção padrão já está no item, mas adicionamos a confirmação aqui
    item.querySelector(".btn-remove-ex").onclick = () => {
        if (confirm("Remover este exercício do treino de hoje?")) {
            item.remove();
        }
    };

    // cria duas séries automáticas
    const cont = item.querySelector(".series-container");
    cont.appendChild(criarLinhaSerie());
    cont.appendChild(criarLinhaSerie());

    // botão adicionar série
    item.querySelector(".btn-add-serie").onclick = () => {
        cont.appendChild(criarLinhaSerie());
    };

    // O novo exercício é inserido no final da lista do treino
    lista.appendChild(item);
}

// evento do botão "Adicionar exercício"
const btnAdd = document.getElementById("btnAddExercicioTreino");
if (btnAdd) {
    btnAdd.onclick = abrirSelectorExercicio;
}
