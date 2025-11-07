let data1 = localStorage.getItem("comp_data1");
let data2 = localStorage.getItem("comp_data2");

let selecionada1 = null;
let selecionada2 = null;
let fotoParaExcluir = null;

window.addEventListener("load", () => {
  carregarFotos();
});

/* Carrega fotos das duas datas */
async function carregarFotos() {
  const { data, error } = await supabase
    .from("fotos")
    .select("id, data_foto, url");

  if (error) {
    console.error(error);
    return;
  }

  const fotos1 = (data || []).filter(x => (x.data_foto || "").startsWith(data1));
  const fotos2 = (data || []).filter(x => (x.data_foto || "").startsWith(data2));

  renderColuna("coluna1", fotos1, 1);
  renderColuna("coluna2", fotos2, 2);
}

function renderColuna(id, lista, lado) {
  const el = document.getElementById(id);
  el.innerHTML = "";

  if (!lista.length) {
    el.innerHTML = `<small>Nenhuma foto nessa data.</small>`;
    return;
  }

  lista.forEach(f => {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";
    wrap.style.marginBottom = "10px";

    const img = document.createElement("img");
    img.src = f.url + "?v=" + Date.now();
    img.className = "foto-item";
    img.onclick = () => selecionar(f, lado, img);

    const btn = document.createElement("button");
    btn.className = "btn-mini btn-danger";
    btn.innerText = "Excluir";
    btn.style.position = "absolute";
    btn.style.top = "8px";
    btn.style.right = "8px";
    btn.onclick = (e) => { e.stopPropagation(); abrirModalExcluir(f); };

    wrap.appendChild(img);
    wrap.appendChild(btn);
    el.appendChild(wrap);
  });
}

function selecionar(foto, lado, el) {
  if (lado === 1) {
    selecionada1 = foto;
    document.querySelectorAll("#coluna1 .foto-item").forEach(i => i.classList.remove("selecionada"));
  } else {
    selecionada2 = foto;
    document.querySelectorAll("#coluna2 .foto-item").forEach(i => i.classList.remove("selecionada"));
  }
  el.classList.add("selecionada");
  document.getElementById("btnComparar").disabled = !(selecionada1 && selecionada2);
}

/* Exclusão */
function abrirModalExcluir(foto) {
  fotoParaExcluir = foto;
  document.getElementById("modalExcluirFoto").setAttribute("aria-hidden", "false");
}
function fecharModalExcluir() {
  fotoParaExcluir = null;
  document.getElementById("modalExcluirFoto").setAttribute("aria-hidden", "true");
}
async function confirmarExclusaoFoto() {
  if (!fotoParaExcluir) return;
  const caminho = fotoParaExcluir.url.split("/").pop();
  await supabase.storage.from("fotos").remove([caminho]);
  await supabase.from("fotos").delete().eq("id", fotoParaExcluir.id);
  fecharModalExcluir();
  carregarFotos();
}

/* Comparação final */
function mostrarComparacaoFinal() {
  const nova = window.open("", "_blank");
  nova.document.write(`
    <html>
    <head>
      <title>Comparação</title>
      <style>
        body { margin:0; padding:20px; background:#f5f5f7; text-align:center; font-family:-apple-system; }
        .wrap { display:flex; gap:10px; }
        img { width:50%; border-radius:12px; }
        @media(max-width:700px){ .wrap{flex-direction:column;} img{width:100%;} }
        button { margin-top:20px; padding:12px 20px; border:none; border-radius:10px; background:#007aff; color:#fff; }
      </style>
    </head>
    <body>
      <h2>Comparação</h2>
      <div class="wrap">
        <img src="${selecionada1.url}">
        <img src="${selecionada2.url}">
      </div>
      <button onclick="window.close()">Voltar</button>
    </body>
    </html>
  `);
}


