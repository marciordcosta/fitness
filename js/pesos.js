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

function abrirMenuAdicionar() {
  fecharModals();
  document.getElementById("modalMenu").setAttribute("aria-hidden", "false");
}

function abrirAddPeso() {
  fecharModals();
  document.getElementById("dataNovoPeso").value = hojeISO();
  document.getElementById("valorNovoPeso").value = "";
  document.getElementById("modalPeso").setAttribute("aria-hidden", "false");
}

function abrirAddFoto() {
  fecharModals();
  document.getElementById("dataFoto").value = hojeISO();
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

  const { error } = await supabase.from("pesos").insert({ data, peso });
  if (error) return alert("Erro ao salvar peso.");

  fecharModals();
  carregarPesos(true);
}

/* ===================== SALVAR FOTO ===================== */
async function salvarFoto() {
  const data = document.getElementById("dataFoto").value;
  const file = document.getElementById("arquivoFoto").files[0];

  if (!data || !file) return alert("Selecione a data e a foto.");

  const nome = `${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage.from("fotos").upload(nome, file);
  if (upErr) return alert("Erro ao enviar imagem.");

  const url = supabase.storage.from("fotos").getPublicUrl(nome).data.publicUrl;

  await supabase.from("fotos").insert({
    data_foto: data,
    url
  });

  fecharModals();
}

/* ===================== CARREGAR E FILTRAR ===================== */
async function carregarPesos(filtrar = false) {
  const { data, error } = await supabase
    .from("pesos")
    .select("id, data, peso")
    .order("data", { ascending: true });

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
  if (!lista.length) return (el.innerHTML = "Nenhum registro.");

  el.innerHTML = "";

  lista.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";

    div.innerHTML = `
      <div class="item-title">${item.peso.toFixed(1)} kg</div>
      <div class="item-sub">${item.data}</div>
    `;

    div.onclick = () => abrirEditar(item);
    el.appendChild(div);
  });
}

/* ===================== EDITAR PESO ===================== */
function abrirEditar(item) {
  idEditar = item.id;
  document.getElementById("dataEditar").value = item.data;
  document.getElementById("pesoEditar").value = item.peso;
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
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
  });
}

/* ===================== MÉDIAS ===================== */
function calcularMedias() {
  const hoje = new Date();

  const segundaAtual = new Date(hoje);
  segundaAtual.setDate(segundaAtual.getDate() - segundaAtual.getDay() + 1);

  const segundaAnterior = new Date(segundaAtual);
  segundaAnterior.setDate(segundaAnterior.getDate() - 7);

  const domingoAnterior = new Date(segundaAtual);
  domingoAnterior.setDate(domingoAnterior.getDate() - 1);

  const atual = dadosPesos.filter(p => new Date(p.data) >= segundaAtual);
  const anterior = dadosPesos.filter(p => {
    const d = new Date(p.data);
    return d >= segundaAnterior && d <= domingoAnterior;
  });

  const mediaAtual = atual.length ? atual.reduce((a,b)=>a+b.peso,0)/atual.length : null;
  const mediaAnterior = anterior.length ? anterior.reduce((a,b)=>a+b.peso,0)/anterior.length : null;

  document.getElementById("mediaSemanalValor").innerText =
    mediaAtual ? mediaAtual.toFixed(1) + " kg" : "--";

  if (!mediaAtual || !mediaAnterior) {
    document.getElementById("mediaProgressoValor").innerText = "--";
    return;
  }

  const variacao = ((mediaAtual - mediaAnterior) / mediaAnterior) * 100;
  document.getElementById("mediaProgressoValor").innerText =
    variacao.toFixed(1) + "%";
}

/* ===================== GALERIA ===================== */
async function abrirGaleria() {
  fecharModals();
  document.getElementById("modalGaleria").setAttribute("aria-hidden", "false");

  const { data } = await supabase
    .from("fotos")
    .select("id, data_foto, url")
    .order("data_foto", { ascending: false });

  const area = document.getElementById("listaFotosGaleria");
  area.innerHTML = "";

  data.forEach(f => {
    area.innerHTML += `
      <div style="margin-bottom:15px;">
        <img src="${f.url}" style="width:100%;border-radius:12px;margin-bottom:6px;">
        <div style="display:flex;justify-content:space-between;">
          <small>${f.data_foto}</small>
          <button class="btn-mini" onclick="editarFoto(${f.id}, '${f.url}', '${f.data_foto}')">Editar</button>
        </div>
      </div>
    `;
  });
}

let fotoEditando = null;

function editarFoto(id, url, dataFoto) {
  fotoEditando = { id, url };
  document.getElementById("fotoEditarPreview").src = url;
  document.getElementById("fotoEditarData").value = dataFoto;

  fecharModals();
  document.getElementById("modalFotoEditar").setAttribute("aria-hidden", "false");
}

async function salvarEdicaoFoto() {
  const novaData = document.getElementById("fotoEditarData").value;

  await supabase.from("fotos")
    .update({ data_foto: novaData })
    .eq("id", fotoEditando.id);

  fecharModals();
  abrirGaleria();
}

async function excluirFotoSelecionada() {
  const caminho = fotoEditando.url.split("/").pop();

  await supabase.storage.from("fotos").remove([caminho]);
  await supabase.from("fotos").delete().eq("id", fotoEditando.id);

  fecharModals();
  abrirGaleria();
}

/* ===================== COMPARAÇÃO ===================== */
async function carregarDatasComFoto() {
  const { data } = await supabase
    .from("fotos")
    .select("data_foto")
    .order("data_foto");

  const unicas = [...new Set(data.map(x => x.data_foto))];

  const s1 = document.getElementById("compData1");
  const s2 = document.getElementById("compData2");

  s1.innerHTML = "";
  s2.innerHTML = "";

  unicas.forEach(d => {
    s1.innerHTML += `<option value="${d}">${d}</option>`;
    s2.innerHTML += `<option value="${d}">${d}</option>`;
  });
}

function abrirComparacao() {
  fecharModals();
  carregarDatasComFoto();
  document.getElementById("modalComparacao").setAttribute("aria-hidden", "false");
}

function abrirTelaComparacao() {
  const d1 = document.getElementById("compData1").value;
  const d2 = document.getElementById("compData2").value;

  localStorage.setItem("comp_data1", d1);
  localStorage.setItem("comp_data2", d2);

  window.location.href = "comparacao.html";
}
