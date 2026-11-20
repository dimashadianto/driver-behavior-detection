(function () {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const menu = [
    { href: "/", label: "Beranda" },
    { href: "/tentang", label: "Tentang" },
  ];

  document.getElementById("navbar").innerHTML = `
    <nav><div class="wrap">
      <a href="/" class="logo"><span class="mark">🚗</span>DriverWatch</a>
      <ul>${menu.map(m => `<li><a href="${m.href}" class="${m.href === path ? "on" : ""}">${m.label}</a></li>`).join("")}</ul>
    </div></nav>`;

  document.getElementById("footer").innerHTML = `
    <footer><div class="wrap">
      <div class="fcols">
        <div>
          <div class="logo"><span class="mark">🚗</span>DriverWatch</div>
          <p class="muted" style="margin-top:10px;font-size:14px">Klasifikasi ekspresi pengendara mobil dengan YOLOv8-cls.</p>
        </div>
        <div><h4>Navigasi</h4><ul>${menu.map(m => `<li><a href="${m.href}">${m.label}</a></li>`).join("")}</ul></div>
        <div><h4>Teknologi</h4><ul><li>Python · FastAPI</li><li>Ultralytics YOLOv8</li><li>HTML · CSS · JavaScript</li></ul></div>
      </div>
      <div class="copy">© 2026 Dimas Hadianto · Teknik Informatika, Universitas Tarumanagara</div>
    </div></footer>`;
})();
