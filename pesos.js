let grafico;
let dadosPesos = [];
let periodoAtual = 7; // padrão = 1 semana
let idEditar = null;

/* ===================== UTIL ===================== */
function hojeISO() {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}

/* ===================== MODAIS ===================== */
function fecharModals() {
  document.querySelectorAll(".modal").forEach(m =>
    m.setAttribute("aria-hidden","true")
  );
}

function abrirMenuAdicionar() {
  fecharModals();
  document.getElementById("modalMenu").setAttribute("aria-hidden","false");
}

function abrirAddPeso() {
  fecharModals();
  document.getElementById("dataNovoPeso").value = hojeISO();
  document.getElementById("valorNovoPeso").value = "";
  document.getElementById("modalPeso").setAttribute("aria-hidden","false");
}

function abrirAddFoto() {
  fecharModals();
  document.getElementById("dataFoto").value = hojeISO();
  document.getElementById("modalFoto").setAttribute("aria-hidden","false");
}

function abrirPeriodo() {
  fecharModals();
  document.getElementById("modalPeriodo").setAttribute("aria-hidden","false");
}

function abrirEditar(item) {
  idEditar = item.id;
  document.getElementById("tituloEditar").innerText = `Editar ${item.peso.toFixed(1)} kg`;
  document.getElementById("dataEditar").value = item.data;
  document.getElementById("pesoEditar").value = item.peso;

  fecharModals();
  document.getElementById("modalEditar").setAttribute("aria-hidden","false");
}

/* ===================== LOAD ===================== */
window.addEventListener("load", () => {
  carregarPesos(true);
});

/* ===================== SALVAR PESO ===================== */
async function salvarPesoNovo() {
  const data = document.getElementById("dataNovoPeso").value;
  const peso = parseFloat(document.getElementById("valorNovoPeso").value);

  if (!data || isNaN(peso)) {
    alert("Preencha os dados.");
    return;
  }

  const { error } = await supabase.from("pesos").insert({ data, peso });
  if (error) {
    alert("Erro ao salvar peso.");
    console.error(error);
    return;
  }

  fecharModals();
  carregarPesos(true);
}

/* ===================== SALVAR FOTO ===================== */
async function salvarFoto() {
  const data = document.getElementById("dataFoto").value;
  const file = document.getElementById("arquivoFoto").files[0];

  if (!data || !file) {
    alert("Preencha data e arquivo.");
    return;
  }

  const nome = `${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage
    .from("fotos")
    .upload(nome, file);

  if (upErr) {
    alert("Erro ao enviar foto.");
    return;
  }

  const url = supabase.storage.from("fotos").getPublicUrl(nome).data.publicUrl;

  await supabase.from("fotos")
    .insert({ data_foto: data, url });

  fecharModals();
  alert("Foto enviada.");
}

/* ===================== CARREGAR E FILTRAR ===================== */
async function carregarPesos(filtrar = false) {
  const { data, error } = await supabase
    .from("pesos")
    .select("id, data, peso")
    .order("data", { ascending: true });

  if (error) {
    console.error(error);
    return;
  }

  dadosPesos = data || [];

  if (filtrar) aplicarPeriodo();
  else {
    montarGrafico(dadosPesos);
    renderHistorico(dadosPesos);
  }
}

function aplicarPeriodo() {
  const dias = periodoAtual;
  const hoje = new Date();
  const limite = new Date(hoje.getTime() - dias * 86400000);

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

  if (!lista.length) {
    el.innerHTML = `<div>Nenhum registro no período.</div>`;
    return;
  }

  el.innerHTML = "";

  lista.forEach(item => {
    let div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="item-title">${item.peso.toFixed(1)} kg</div>
      <div class="item-sub">${item.data}</div>
    `;
    div.onclick = () => abrirEditar(item);
    el.appendChild(div);
  });
}

/* ===================== EDITAR / EXCLUIR ===================== */
async function salvarEdicao() {
  const novaData = document.getElementById("dataEditar").value;
  const novoPeso = parseFloat(document.getElementById("pesoEditar").value);

  if (!novaData || isNaN(novoPeso)) {
    alert("Dados inválidos.");
    return;
  }

  const { error } = await supabase
    .from("pesos")
    .update({ data: novaData, peso: novoPeso })
    .eq("id", idEditar);

  if (error) {
    alert("Erro ao salvar edição.");
    return;
  }

  fecharModals();
  carregarPesos(true);
}

async function excluirPeso() {
  if (!confirm("Excluir este registro?")) return;

  const { error } = await supabase
    .from("pesos")
    .delete()
    .eq("id", idEditar);

  if (error) {
    alert("Erro ao excluir.");
    return;
  }

  fecharModals();
  carregarPesos(true);
}

/* ===================== GRÁFICO ===================== */
function montarGrafico(lista) {
  const ctx = document.getElementById("graficoPeso");

  const labels = lista.map(x => x.data);
  const pesos = lista.map(x => x.peso);

  if (grafico) grafico.destroy();

  grafico = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        data: pesos,
        borderWidth: 3,
        tension: 0.25
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } }
    }
  });
}

/* ==========================================================
   ✅ FUNÇÕES — COMPARAÇÃO (datas → nova tela)
========================================================== */

/* ===================== CARREGAR DATAS COM FOTO ===================== */
async function carregarDatasComFoto() {
  const { data } = await supabase.from("fotos").select("data_foto");

  const unicas = [...new Set(data.map(x => x.data_foto))];

  let s1 = document.getElementById("compData1");
  let s2 = document.getElementById("compData2");

  s1.innerHTML = "";
  s2.innerHTML = "";

  unicas.forEach(d => {
    s1.innerHTML += `<option value="${d}">${d}</option>`;
    s2.innerHTML += `<option value="${d}">${d}</option>`;
  });
}

/* abrir comparação */
function abrirComparacao() {
  fecharModals();
  carregarDatasComFoto();
  document.getElementById("modalComparacao").setAttribute("aria-hidden","false");
}

/* abrir nova tela de comparação */
function abrirTelaComparacao() {
  const d1 = document.getElementById("compData1").value;
  const d2 = document.getElementById("compData2").value;

  if (!d1 || !d2) {
    alert("Selecione as duas datas.");
    return;
  }

  localStorage.setItem("comp_data1", d1);
  localStorage.setItem("comp_data2", d2);

  window.location.href = "comparacao.html";
}
