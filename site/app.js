/* =========================================================
   omni-presence demo site — storyboard animation
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------------- storyboard (auto-advancing highlight) ---------------- */
const sbSteps = $$(".sb-step");
const sbFill = $("#sbProgressFill");
let sbTimer = null;

function runStoryboard() {
  if (sbTimer) clearInterval(sbTimer);
  sbSteps.forEach((s) => s.classList.remove("lit"));
  if (sbFill) sbFill.style.width = "0%";
  let i = 0;
  const lightStep = () => {
    if (i >= sbSteps.length) {
      clearInterval(sbTimer);
      sbTimer = null;
      return;
    }
    sbSteps[i].classList.add("lit");
    if (sbFill) sbFill.style.width = `${((i + 1) / sbSteps.length) * 100}%`;
    i++;
  };
  lightStep();
  sbTimer = setInterval(lightStep, 1400);
}

$("#sbReplay")?.addEventListener("click", runStoryboard);

/* ---------------- play once when the demo scrolls into view ---------------- */
let played = false;
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !played) {
        played = true;
        runStoryboard();
      }
    });
  },
  { threshold: 0.35 }
);
const demoSection = $("#demo");
if (demoSection) io.observe(demoSection);
