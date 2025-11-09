let grafico;
let dadosPesos = [];
let periodoAtual = 7;
let idEditar = null;

/* ===================== UTIL ===================== */
function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().substring(0, 10);
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

function abrirFotoComDataDe(idInputData) {
  const v = document.getElementById(idInputData).value || hojeISO();
  fecharModals();
  document.getElementById("dataFoto").value = v;
  document.getElementById("modalFoto").setAttribute("aria-hidden", "false");
}

function abrirPeriodo() {
  fecharModals();
  document.getElementById("modalPeriodo").setAttribute("aria-hidden", "false");
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

/* ===================== SALVAR FOTO ===================== */
async function salvarFoto() {
  const data = document.getElementById("dataFoto").value;
  const files = document.getElementById("arquivoFoto").files;

  if (!data || !files.length) return alert("Selecione foto(s).");

  for (let file of files) {
    const nome = `${Date.now()}-${file.name}`;

    const { error: upErr } = await supabase.storage.from("fotos").upload(nome, file);
    if (upErr) {
      console.error(upErr);
      alert("Erro ao enviar imagem.");
      continue;
    }

    const { data: pub } = supabase.storage.from("fotos").getPublicUrl(nome);
    await supabase.from("fotos").insert({ data_foto: data, url: pub.publicUrl });
  }

  fecharModals();
}

/* ===================== CARREGAR PESOS ===================== */
async function carregarPesos(filtrar = false) {
  const { data, error } = await supabase
    .from("pesos")
    .select("id, data, peso")
    .order("data", { ascending: false });   // ✅ ORDEM DECRESCENTE

  if (error) return console.error(error);

  dadosPesos = data || [];

  if (filtrar) aplicarPeriodo();
  else {
    montarGrafico(dadosPesos);
    renderHistorico(dadosPesos);
  }

  calcularMedias();
}

function aplicarPeriodo() {
  const hoje = new Date();
  const limite = new Date(hoje.getTime() - periodoAtual * 86400000);

  const filtrado = dadosPesos.filter(p => new Date(p.data) >= limite);

  montarGrafico(filtrado);
  renderHistorico(filtrado);
}

function filtroPeriodo(dias) {
  periodoAtual = Number(dias);
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

      <button class="btn-mini" style="border:1px solid #e5e5ea;background:#f7f7f7"
        onclick="abrirEditarDireto(${item.id})">Opções</button>
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
  const labels = lista.map(x => x.data);
  const pesos = lista.map(x => x.peso);

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
      plugins: { legend: { display: false } }
    }
  });
}

/* ===================== MÉDIAS ===================== */
function calcularMedias() {
  const hoje = new Date();

  const segundaAtual = new Date(hoje);
  segundaAtual.setDate(segundaAtual.getDate() - ((segundaAtual.getDay() + 6) % 7));
  segundaAtual.setHours(0,0,0,0);

  const segundaAnterior = new Date(segundaAtual);
  segundaAnterior.setDate(segundaAnterior.getDate() - 7);

  const domingoAnterior = new Date(segundaAtual);
  domingoAnterior.setDate(domingoAnterior.getDate() - 1);
  domingoAnterior.setHours(23,59,59,999);

  const atual = dadosPesos.filter(p => new Date(p.data) >= segundaAtual);
  const anterior = dadosPesos.filter(p => {
    const d = new Date(p.data);
    return d >= segundaAnterior && d <= domingoAnterior;
  });

  const mediaAtual = atual.length ? atual.reduce((a,b)=>a+b.peso,0)/atual.length : null;
  const mediaAnterior = anterior.length ? anterior.reduce((a,b)=>a+b.peso,0)/anterior.length : null;

  document.getElementById("mediaSemanalValor").innerText =
    mediaAtual ? mediaAtual.toFixed(1) + " kg" : "--";

  if (!mediaAtual || !mediaAnterior)
    return document.getElementById("mediaProgressoValor").innerText = "--";

  const variacao = ((mediaAtual - mediaAnterior) / mediaAnterior) * 100;
  document.getElementById("mediaProgressoValor").innerText = variacao.toFixed(1) + "%";
}
