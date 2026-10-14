// Page behaviour around the figure: theme toggle, "show on the line" buttons, active station in the nav.
{
  const body = document.body;
  try { const saved = localStorage.getItem("cd-theme"); if (saved === "dark" || saved === "light") body.dataset.theme = saved; } catch {}
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    body.dataset.theme = body.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("cd-theme", body.dataset.theme); } catch {}
  });
  const figure = document.getElementById("line");
  document.querySelectorAll("[data-show]").forEach((b) => b.addEventListener("click", () => {
    window.__cd.focus(b.dataset.show);
    figure.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }));
  const STEP_OF = { commit: "commit", build: "build", test: "test", package: "package", staging: "staging", production: "deploy", monitor: "monitor", rollback: "rollback", failed: "test" };
  const navs = [...document.querySelectorAll("[data-nav]")];
  document.addEventListener("cd-stage", (e) => {
    const id = STEP_OF[e.detail];
    navs.forEach((a) => { if (a.dataset.nav === id) a.dataset.active = ""; else delete a.dataset.active; });
  });
}
