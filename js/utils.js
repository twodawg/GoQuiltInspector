// ─── Device Presets ──────────────────────────────────────────────
const DEVICES = {
  go:     { name: 'Looking Glass Go',        cols: 11, rows: 6 },
  portrait: { name: 'Looking Glass Portrait', cols: 8,  rows: 6 },
  '16l':  { name: 'Looking Glass 16" (L)',   cols: 7,  rows: 7 },
  '16p':  { name: 'Looking Glass 16" (P)',   cols: 11, rows: 6 },
  '27l':  { name: 'Looking Glass 27" (L)',   cols: 8,  rows: 6 },
  '27p':  { name: 'Looking Glass 27" (P)',   cols: 12, rows: 4 },
  '32l':  { name: 'Looking Glass 32" (L)',   cols: 7,  rows: 7 },
  '32p':  { name: 'Looking Glass 32" (P)',   cols: 11, rows: 6 },
  '65':   { name: 'Looking Glass 65"',       cols: 8,  rows: 9 },
};

// ─── Utility Functions ───────────────────────────────────────────

function detectDevice(w, h) {
  let best = null, bestScore = Infinity;
  for (const key in DEVICES) {
    const d = DEVICES[key];
    const tw = w / d.cols, th = h / d.rows;
    const score = Math.abs(tw / th - 1) + Math.abs(tw - th) / Math.max(tw, th);
    if (score < bestScore) { bestScore = score; best = d; }
  }
  return bestScore < 0.1 ? best : null;
}

function scaleCanvas(canvas, parent) {
  const maxW = parent.clientWidth - 32;
  const scale = Math.min(1, maxW / canvas.width);
  canvas.style.width = (canvas.width * scale) + 'px';
  canvas.style.height = (canvas.height * scale) + 'px';
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl, filename) {
  const byteString = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  downloadBlob(new Blob([bytes], { type: 'image/png' }), filename);
}

// ─── Tab Switching ───────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const mode = tab.dataset.tab;

    document.getElementById('inspectorSidebar').classList.toggle('hidden', mode !== 'inspector');
    document.getElementById('generatorSidebar').classList.toggle('hidden', mode !== 'generator');
    document.getElementById('vrSidebar').classList.toggle('hidden', mode !== 'vr');
    document.getElementById('inspectorMain').classList.toggle('hidden', mode !== 'inspector');
    document.getElementById('generatorMain').classList.toggle('hidden', mode !== 'generator');
    document.getElementById('vrMain').classList.toggle('hidden', mode !== 'vr');

    // Initialize VR scene when VR tab becomes active
    if (mode === 'vr' && typeof initVRScene === 'function') {
      requestAnimationFrame(() => {
        if (vrQuiltImage && !vrRenderer) {
          initVRScene();
        } else if (vrRenderer) {
          // Resize renderer when tab becomes visible
          const container = document.getElementById('vr-canvas').parentElement;
          if (container && vrRenderer && vrCamera) {
            vrRenderer.setSize(container.clientWidth, container.clientHeight);
            vrCamera.aspect = container.clientWidth / container.clientHeight;
            vrCamera.updateProjectionMatrix();
          }
        }
      });
    }
  });
});

// ─── Window Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (quiltImage) renderQuiltPreview();
  if (sbsImage) {
    scaleCanvas(sbsPreview, sbsPreview.parentElement);
    scaleCanvas(splitPreview, splitPreview.parentElement);
  }
  if (vrRenderer && vrCamera) {
    const container = document.getElementById('vr-canvas').parentElement;
    if (container) {
      vrRenderer.setSize(container.clientWidth, container.clientHeight);
      vrCamera.aspect = container.clientWidth / container.clientHeight;
      vrCamera.updateProjectionMatrix();
    }
  }
});

function setStatus(state, text) {
  const dot = document.getElementById('statusDot');
  const label = document.getElementById('statusText');
  if (dot) dot.className = 'status-dot ' + state;
  if (label) label.textContent = text;
}

function getEasing(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function getSweepCoords(type, t) {
  const eased = getEasing(t);
  switch (type) {
    case 'horizontal': return { x: eased, y: 0.5 };
    case 'vertical': return { x: 0.5, y: eased };
    case 'diagonal': return { x: eased, y: eased };
    case 'pingpong': {
      const cycle = t < 0.5 ? t * 2 : 2 - t * 2;
      return { x: getEasing(cycle), y: 0.5 };
    }
    default: return { x: eased, y: 0.5 };
  }
}

function renderFrameToCanvas(type, t, tileArr, c, r, tw, th) {
  const coords = getSweepCoords(type, t);
  const viewCol = (1 - coords.x) * (c - 1);
  const viewRow = coords.y * (r - 1);
  const c0 = Math.floor(viewCol), r0 = Math.floor(viewRow);
  const c1 = Math.min(c0 + 1, c - 1), r1 = Math.min(r0 + 1, r - 1);
  const fc = viewCol - c0, fr = viewRow - r0;

  const offscreen = document.createElement('canvas');
  offscreen.width = tw;
  offscreen.height = th;
  const ctx = offscreen.getContext('2d');

  ctx.globalAlpha = (1 - fc) * (1 - fr);
  ctx.drawImage(tileArr[r0 * c + c0], 0, 0);
  ctx.globalAlpha = fc * (1 - fr);
  ctx.drawImage(tileArr[r0 * c + c1], 0, 0);
  ctx.globalAlpha = (1 - fc) * fr;
  ctx.drawImage(tileArr[r1 * c + c0], 0, 0);
  ctx.globalAlpha = fc * fr;
  ctx.drawImage(tileArr[r1 * c + c1], 0, 0);
  ctx.globalAlpha = 1;

  return offscreen;
}
