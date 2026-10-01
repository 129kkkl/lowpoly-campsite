/**
 * UI 绑定：昼夜切换、篝火开关、重置视角。
 */

export function createUI({ onTogglePhase, onToggleFire, onResetView, getState }) {
  const btnPhase = document.getElementById('btn-phase');
  const btnFire = document.getElementById('btn-fire');
  const btnView = document.getElementById('btn-view');
  const iconPhase = document.getElementById('icon-phase');
  const txtPhase = document.getElementById('txt-phase');
  const iconFire = document.getElementById('icon-fire');
  const txtFire = document.getElementById('txt-fire');
  const dotPhase = document.getElementById('dot-phase');
  const labelPhase = document.getElementById('label-phase');
  const dotFire = document.getElementById('dot-fire');
  const labelFire = document.getElementById('label-fire');
  const labelPerf = document.getElementById('label-perf');
  const loader = document.getElementById('loader');

  btnPhase.addEventListener('click', () => onTogglePhase());
  btnFire.addEventListener('click', () => onToggleFire());
  btnView.addEventListener('click', () => onResetView());

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'n') onTogglePhase();
    else if (k === 'f') onToggleFire();
    else if (k === 'r') onResetView();
  });

  let lastLit = null;
  let lastNight = null;

  return {
    hideLoader() {
      loader.classList.add('hidden');
    },
    setFps(fps) {
      labelPerf.textContent = `${Math.round(fps)} fps`;
    },
    sync() {
      const { isNight, fireLit } = getState();
      if (isNight !== lastNight) {
        lastNight = isNight;
        iconPhase.textContent = isNight ? '☀️' : '🌙';
        txtPhase.textContent = isNight ? '切换白天' : '切换夜晚';
        btnPhase.classList.toggle('on', isNight);
        labelPhase.textContent = isNight ? '夜晚' : '白天';
        dotPhase.classList.toggle('night', isNight);
      }
      if (fireLit !== lastLit) {
        lastLit = fireLit;
        iconFire.textContent = fireLit ? '🔥' : '💨';
        txtFire.textContent = fireLit ? '熄灭篝火' : '点燃篝火';
        btnFire.classList.toggle('on', !fireLit);
        labelFire.textContent = fireLit ? '篝火燃烧中' : '篝火已熄灭';
        dotFire.classList.toggle('fire', fireLit);
        dotFire.classList.toggle('off', !fireLit);
      }
    }
  };
}
