let grafico;
let dadosPesos = [];
let periodoAtual = 7;  // "1 semana" no UI
let idEditar = null;

/* ===================== UTIL ===================== */
function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().substring(0, 10);
}

// Robusto: aceita "YYYY-MM-DD" e "YYYY-MM-DDTHH:mm:ssZ"
function parseISODateLocal(iso) {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/* ===================== MODAIS ===================== */
function fecharModals() {
  document.querySelectorAll(".modal").forEach(m => m.setAttribute("aria-hidden", "true"));
}

function abrirAddPeso() {
  fecharModals();
  document.getElementById("dataNovoPeso").value = hojeISO();
  document.getElementById("valorNovoPeso").value = "";
  document.getElementById("modalPeso").setAttribute("aria-hidden", "false");
}

function abrirPeriodo() {
  fecharModals();
  document.getElementById("modalPeriodo").setAttribute("aria-hidden", "false");
}

/* ========= UPLOAD pelo HISTÓRICO (usa o modal já existente no index) =========
   - Abre o modalFoto
   - Preenche a data
   - Ativa múltiplos arquivos no input existente
*/
function abrirFotoComDataDireto(data) {
  fecharModals();

  const dataInput = document.getElementById("dataFoto");
  const fileInput = document.getElementById("arquivoFoto");
  const modal = document.getElementById("modalFoto");

  if (!dataInput || !fileInput || !modal) {
    console.error("Modal de foto não encontrado no index.html");
    return;
  }

  dataInput.value = data || hojeISO();

  // Garante múltiplos arquivos no input do index
  fileInput.setAttribute("multiple", "true");
  fileInput.value = ""; // limpa seleção anterior

  modal.setAttribute("aria-hidden", "false");
}

/* ===================== LOAD ===================== */
window.addEventListener("load", () => {
  carregarPesos(true);
});

/* ===================== SALVAR PESO ===================== */
async function salvarPesoNovo() {
  const data = document.getElementById("dataNovoPeso").value;
  const peso = parseFloat(document.getElementById("valorNovoPeso").value);

  if (!data || isNaN(peso)) return alert("Preencha todos os campos.");

  await supabase.from("pesos").insert({ data, peso });

  fecharModals();
  carregarPesos(true);
}

/* ===================== SALVAR FOTO (AGORA MÚLTIPLAS) ===================== */
async function salvarFoto() {
  const data = document.getElementById("dataFoto").value;
  const files = document.getElementById("arquivoFoto").files;

  if (!data || !files || files.length === 0) {
    alert("Selecione a data e pelo menos 1 foto.");
    return;
  }

  for (let file of files) {
    const nome = `${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("fotos").upload(nome, file);
    if (upErr) {
      console.error(upErr);
      continue;
    }

    const { data: pub } = supabase.storage.from("fotos").getPublicUrl(nome);
    await supabase.from("fotos").insert({
      data_foto: data,
      url: pub.publicUrl
    });
  }

  fecharModals();
}

/* ===================== CARREGAR PESOS / FILTROS ===================== */
async function carregarPesos(filtrar = false) {
  const { data, error } = await supabase
    .from("pesos")
    .select("id, data, peso")
    .order("data", { ascending: false }); // histórico decrescente

  if (error) return console.error(error);

  dadosPesos = data || [];

  if (filtrar) aplicarPeriodo();
  else {
    montarGrafico(dadosPesos);
    renderHistorico(dadosPesos);
  }

  calcularSemanasEMedias();
}

function aplicarPeriodo() {
  // Quando o usuário escolhe "1 semana" (7), usamos 8 dias para permitir comparação do mesmo dia
  let diasFiltro = periodoAtual;
  if (diasFiltro === 7) diasFiltro = 8;

  if (diasFiltro === "all") {
    montarGrafico(dadosPesos);
    renderHistorico(dadosPesos);
    return;
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const limite = new Date(hoje.getTime() - Number(diasFiltro) * 86400000);

  const filtrado = dadosPesos.filter(p => parseISODateLocal(p.data) >= limite);

  montarGrafico(filtrado);
  renderHistorico(filtrado);
}

function filtroPeriodo(dias) {
  periodoAtual = dias; // 7, 30, 180, 365, "all"
  fecharModals();
  aplicarPeriodo();
}

/* ===================== HISTÓRICO ===================== */
function renderHistorico(lista) {
  const el = document.getElementById("listaPesos");
  if (!lista.length) return el.innerHTML = "Nenhum registro.";

  el.innerHTML = "";

  lista.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="item-title">${item.peso.toFixed(1)} kg</div>
        <div class="item-sub">${item.data}</div>
      </div>

      <!-- Upload múltiplo (usa modal do index) -->
      <button class="btn-mini" style="border:1px solid #e5e5ea;background:#f7f7f7"
        onclick="abrirFotoComDataDireto('${item.data}')" aria-label="Enviar Foto">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M12 16V4m0 0l4 4m-4-4L8 8M4 16h16v4H4z"
            stroke="#1c1c1e" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>

      <!-- Editar -->
      <button class="btn-mini" style="border:1px solid #e5e5ea;background:#f7f7f7"
        onclick="abrirEditarDireto(${item.id})" aria-label="Editar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z" stroke="#1c1c1e" stroke-width="2"/>
          <path d="M14.06 6.19l3.75 3.75" stroke="#1c1c1e" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    el.appendChild(div);
  });
}

/* ===================== EDITAR PESO ===================== */
async function abrirEditarDireto(id) {
  const achou = dadosPesos.find(p => p.id === id);
  if (!achou) return;

  idEditar = id;
  document.getElementById("dataEditar").value = achou.data;
  document.getElementById("pesoEditar").value = achou.peso;

  document.getElementById("modalEditar").setAttribute("aria-hidden", "false");
}

async function salvarEdicao() {
  const data = document.getElementById("dataEditar").value;
  const peso = parseFloat(document.getElementById("pesoEditar").value);

  await supabase.from("pesos").update({ data, peso }).eq("id", idEditar);

  fecharModals();
  carregarPesos(true);
}

async function excluirPeso() {
  await supabase.from("pesos").delete().eq("id", idEditar);
  fecharModals();
  carregarPesos(true);
}

/* ===================== GRÁFICO ===================== */
function montarGrafico(lista) {
  // No gráfico, ordem crescente
  const asc = [...lista].sort((a, b) => parseISODateLocal(a.data) - parseISODateLocal(b.data));

  const labels = asc.map(x => x.data);
  const pesos = asc.map(x => x.peso);

  if (grafico) grafico.destroy();

  grafico = new Chart(document.getElementById("graficoPeso"), {
    type: "line",
    data: {
      labels,
      datasets: [{ data: pesos, borderWidth: 3, tension: 0.25 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      // eixo X oculto (sem datas)
      scales: { x: { display: false } }
    }
  });
}

/* ===================== MÉDIAS E PROGRESSÃO ===================== */
/*
  Semana = Terça -> Segunda
  Média = soma dos registros reais / quantidade de registros reais
  Progressão (%) = ((média_atual - média_anterior) / média_anterior) * 100
*/
function calcularSemanasEMedias() {
  const elAnt = document.getElementById("mediaSemanaAnterior");
  const elAtu = document.getElementById("mediaSemanaAtual");
  const elProg = document.getElementById("mediaProgressoValor");

  if (!dadosPesos.length) {
    elAnt.innerText = "--";
    elAtu.innerText = "--";
    elProg.innerText = "--";
    return;
  }

  const hoje = new Date(); hoje.setHours(0,0,0,0);

  // terça da semana atual (mais recente Terça <= hoje)
  const day = hoje.getDay(); // 0=Dom..6=Sáb
  const deltaAteTerca = (day - 2 + 7) % 7;
  const tercaAtual = new Date(hoje);
  tercaAtual.setDate(tercaAtual.getDate() - deltaAteTerca);
  tercaAtual.setHours(0,0,0,0);

  const segundaAtual = new Date(tercaAtual);
  segundaAtual.setDate(segundaAtual.getDate() + 6);
  segundaAtual.setHours(23,59,59,999);

  const tercaAnterior = new Date(tercaAtual);
  tercaAnterior.setDate(tercaAnterior.getDate() - 7);
  tercaAnterior.setHours(0,0,0,0);

  const segundaAnterior = new Date(tercaAtual);
  segundaAnterior.setDate(segundaAnterior.getDate() - 1);
  segundaAnterior.setHours(23,59,59,999);

  function registrosPeriodo(inicio, fim) {
    return dadosPesos.filter(p => {
      const d = parseISODateLocal(p.data);
      return d >= inicio && d <= fim;
    });
  }

  function media(lista) {
    if (!lista.length) return null;
    const soma = lista.reduce((a,b)=>a + b.peso, 0);
    return soma / lista.length; // divide pelo nº real de registros
  }

  const listaAtual = registrosPeriodo(tercaAtual, segundaAtual);
  const listaAnterior = registrosPeriodo(tercaAnterior, segundaAnterior);

  const mAtu = media(listaAtual);
  const mAnt = media(listaAnterior);

  elAnt.innerText = mAnt != null ? mAnt.toFixed(1) + " kg" : "--";
  elAtu.innerText = mAtu != null ? mAtu.toFixed(1) + " kg" : "--";

  if (mAtu == null || mAnt == null || mAnt === 0) {
    elProg.innerText = "--";
  } else {
    const variacao = ((mAtu - mAnt) / mAnt) * 100;
    elProg.innerText = variacao.toFixed(1) + "%";
  }
}
