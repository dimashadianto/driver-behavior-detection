const $ = id => document.getElementById(id);

const META = {
  fokus: { label: "Fokus", icon: "🎯", color: "#16a34a", level: "Aman", note: "Pengendara terlihat fokus ke jalan." },
  mengantuk: { label: "Mengantuk", icon: "😴", color: "#d97706", level: "Waspada", note: "Terdeteksi tanda kelelahan. Sebaiknya beristirahat." },
  merokok: { label: "Merokok", icon: "🚬", color: "#dc2626", level: "Berisiko", note: "Pengendara terdeteksi sedang merokok." },
  dengan_hp: { label: "Dengan HP", icon: "📱", color: "#7c3aed", level: "Berisiko", note: "Pengendara terdeteksi memakai ponsel." },
};
const meta = k => META[k] || { label: k.replace(/_/g, " "), icon: "🔍", color: "#2563eb", level: "", note: "" };

let berkas = null;
const drop = $("drop"), input = $("file");

drop.onclick = () => input.click();
input.onchange = () => pilih(input.files[0]);
["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => pilih(e.dataTransfer.files[0]));

function pilih(f) {
  if (!f) return;
  berkas = f;
  const img = $("preview");
  img.src = URL.createObjectURL(f);
  img.style.display = "block";
  $("ph").style.display = "none";
  $("go").disabled = false;
}

$("reset").onclick = () => {
  berkas = null;
  input.value = "";
  $("preview").style.display = "none";
  $("ph").style.display = "block";
  $("go").disabled = true;
  $("hasil").innerHTML = '<div class="empty">Hasil prediksi akan tampil di sini.</div>';
};

$("go").onclick = async () => {
  if (!berkas) return;
  $("go").disabled = true;
  $("hasil").innerHTML = '<div class="empty">Memproses...</div>';
  const fd = new FormData();
  fd.append("file", berkas);
  try {
    const res = await fetch("/api/predict", { method: "POST", body: fd });
    const d = await res.json();
    if (!res.ok) throw new Error(d.detail || "Gagal memproses");
    tampil(d);
  } catch (err) {
    $("hasil").innerHTML = `<div class="empty">⚠️ ${err.message}</div>`;
  }
  $("go").disabled = false;
};

function tampil(d) {
  const m = meta(d.prediksi), top = d.confidence[d.prediksi];
  let html = `<div class="top">
    <div class="ring" style="background:conic-gradient(${m.color} ${top}%,var(--line) 0)"><b>${top.toFixed(1)}%</b></div>
    <div><span class="pill" style="background:${m.color}">${m.level}</span>
    <h3>${m.icon} ${m.label}</h3><p class="muted" style="font-size:14px">${m.note}</p></div></div>`;
  let teks = "";
  for (const [k, v] of Object.entries(d.confidence)) {
    const mk = meta(k);
    html += `<div class="row"><div class="lbl"><span>${mk.icon} ${mk.label}</span><span>${v.toFixed(2)}%</span></div>
      <div class="bar"><span style="width:${v}%;background:${mk.color}"></span></div></div>`;
    teks += `${mk.label}: ${v.toFixed(2)}%\n`;
  }
  teks += `Prediksi: ${m.label}`;
  html += `<pre>${teks}</pre>
    <div class="actions"><button class="btn ghost sm" id="salin">📋 Salin teks</button></div>`;
  $("hasil").innerHTML = html;

  $("salin").onclick = () => navigator.clipboard.writeText(teks).then(() => {
    $("salin").textContent = "Teks Tersalin";
    setTimeout(() => ($("salin").textContent = "Salin Teks"), 2000);
  });
}

fetch("/api/metrics")
  .then(r => (r.ok ? r.json() : Promise.reject()))
  .then(m => {
    $("hAcc").textContent = (m.akurasi * 100).toFixed(1) + "%";
    const k = m.kelas;

    let cm = '<table class="cm"><tr><th>Aktual / Prediksi</th>' + k.map(x => `<th>${meta(x).label}</th>`).join("") + "</tr>";
    m.matriks.forEach((row, i) => {
      const tot = row.reduce((a, b) => a + b, 0) || 1;
      cm += `<tr><th>${meta(k[i]).label}</th>` + row.map((v, j) =>
        `<td style="background:rgba(${i === j ? "22,163,74" : "220,38,38"},${((v / tot) * 0.85).toFixed(2)})">${v}</td>`).join("") + "</tr>";
    });
    cm += "</table>";

    let rep = '<table class="rep"><tr><th>Kelas</th><th>Precision</th><th>Recall</th><th>F1-score</th><th>Jumlah</th></tr>';
    k.forEach(n => {
      const r = m.per_kelas[n];
      rep += `<tr><td>${meta(n).icon} ${meta(n).label}</td><td>${(r.precision * 100).toFixed(1)}%</td><td>${(r.recall * 100).toFixed(1)}%</td><td>${(r["f1-score"] * 100).toFixed(1)}%</td><td>${r.support}</td></tr>`;
    });
    rep += "</table>";

    $("evalBox").innerHTML = `
      <div class="stats">
        <div class="card stat"><b>${(m.akurasi * 100).toFixed(2)}%</b><span>Akurasi</span></div>
        <div class="card stat"><b>${(m.macro_f1 * 100).toFixed(2)}%</b><span>Macro F1-score</span></div>
        <div class="card stat"><b>${m.jumlah_test}</b><span>Gambar data test</span></div>
      </div>
      <div class="grid2">
        <div class="card"><h3>Confusion Matrix</h3><div class="scroll">${cm}</div>
          <div class="actions"><button class="btn ghost sm" id="bukaCm">🖼️ Buka sebagai gambar</button></div></div>
        <div class="card"><h3>Laporan per kelas</h3><div class="scroll">${rep}</div></div>
      </div>`;
    $("bukaCm").onclick = bukaModal;
  })
  .catch(() => {
    $("evalBox").innerHTML = '<div class="card empty">Evaluasi belum tersedia. Salin <b>laporan.json</b> ke folder <b>model/</b>.</div>';
  });

const modal = $("modal");

function bukaModal() {
  const img = $("cmImg");
  $("cmErr").hidden = true;
  img.hidden = false;
  if (!img.getAttribute("src")) img.src = "/api/confusion-matrix";
  modal.showModal();
}

$("cmImg").onerror = () => {
  $("cmImg").hidden = true;
  $("cmErr").hidden = false;
  $("cmImg").removeAttribute("src");
};
$("tutup").onclick = () => modal.close();
modal.addEventListener("click", e => { if (e.target === modal) modal.close(); });

document.querySelectorAll("[data-scroll]").forEach(a => a.addEventListener("click", e => {
  e.preventDefault();
  document.querySelector(a.dataset.scroll)?.scrollIntoView({ behavior: "smooth" });
}));
