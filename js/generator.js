// ─── Generator Mode ──────────────────────────────────────────────

let sbsImage = null;
let leftView = null, rightView = null;
let genQuiltCanvas = null;
let genTiles = [];
let genMouseX = 0.5, genMouseY = 0.5;
let genAnimFrame = null;
let genSelectedTile = null;

const genDropZone    = document.getElementById('genDropZone');
const genFileInput   = document.getElementById('genFileInput');
const sbsPreview     = document.getElementById('sbsPreview');
const splitPreview   = document.getElementById('splitPreview');
const genPreviewCanvas = document.getElementById('genPreviewCanvas');
const genViewerOverlay = document.getElementById('genViewerOverlay');
const genViewerContainer = document.getElementById('genViewerContainer');
const genViewIndicator = document.getElementById('genViewIndicator');
const deviceSelect   = document.getElementById('deviceSelect');
const genColsInput   = document.getElementById('genCols');
const genRowsInput   = document.getElementById('genRows');
const parallaxStrength = document.getElementById('parallaxStrength');
const verticalTilt   = document.getElementById('verticalTilt');
const generateBtn    = document.getElementById('generateBtn');
const genProgress    = document.getElementById('genProgress');
const genStatus      = document.getElementById('genStatus');
const downloadQuiltBtn = document.getElementById('downloadQuiltBtn');

// ─── File Loading ────────────────────────────────────────────────
genDropZone.addEventListener('click', () => genFileInput.click());
genDropZone.addEventListener('dragover', e => { e.preventDefault(); genDropZone.classList.add('drag-over'); });
genDropZone.addEventListener('dragleave', () => genDropZone.classList.remove('drag-over'));
genDropZone.addEventListener('drop', e => {
  e.preventDefault();
  genDropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) loadSBSImage(e.dataTransfer.files[0]);
});
genFileInput.addEventListener('change', () => { if (genFileInput.files.length) loadSBSImage(genFileInput.files[0]); });

function loadSBSImage(file) {
  if (!file.type.startsWith('image/')) return alert('Please select an image file.');
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      sbsImage = img;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const halfW = Math.floor(w / 2);

      document.getElementById('genFile').textContent = file.name.split('.').slice(0, -1).join('.');
      document.getElementById('genDims').textContent = w + ' × ' + h;
      document.getElementById('genViewSize').textContent = halfW + ' × ' + h;

      leftView = document.createElement('canvas');
      leftView.width = halfW;
      leftView.height = h;
      leftView.getContext('2d').drawImage(img, 0, 0, halfW, h, 0, 0, halfW, h);

      rightView = document.createElement('canvas');
      rightView.width = halfW;
      rightView.height = h;
      rightView.getContext('2d').drawImage(img, halfW, 0, halfW, h, 0, 0, halfW, h);

      sbsPreview.width = w;
      sbsPreview.height = h;
      sbsPreview.getContext('2d').drawImage(img, 0, 0);
      scaleCanvas(sbsPreview, sbsPreview.parentElement);

      renderSplitPreview(halfW, h);
      updateGenOutput();

      generateBtn.disabled = false;
      setStatus('ready', 'SBS loaded: ' + file.name);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function renderSplitPreview(w, h) {
  splitPreview.width = w;
  splitPreview.height = h;
  const ctx = splitPreview.getContext('2d');

  ctx.globalAlpha = 0.5;
  ctx.drawImage(leftView, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(255,0,0,0.3)';
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(rightView, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(0,255,255,0.3)';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  ctx.setLineDash([]);

  scaleCanvas(splitPreview, splitPreview.parentElement);
}

// ─── Controls ────────────────────────────────────────────────────
deviceSelect.addEventListener('change', () => {
  const preset = deviceSelect.value;
  if (preset !== 'custom' && DEVICES[preset]) {
    genColsInput.value = DEVICES[preset].cols;
    genRowsInput.value = DEVICES[preset].rows;
  }
});

parallaxStrength.addEventListener('input', () => {
  document.getElementById('parallaxVal').textContent = parallaxStrength.value;
});
verticalTilt.addEventListener('input', () => {
  document.getElementById('tiltVal').textContent = verticalTilt.value;
});

function updateGenOutput() {
  if (!leftView) return;
  const c = parseInt(genColsInput.value) || 11;
  const r = parseInt(genRowsInput.value) || 6;
  const tw = leftView.width;
  const th = leftView.height;
  document.getElementById('genQuiltSize').textContent = (c * tw) + ' × ' + (r * th);
  document.getElementById('genTileSize').textContent = tw + ' × ' + th;
  const base = document.getElementById('genFile').textContent || 'quilt';
  document.getElementById('genFilename').textContent = base + '_qs' + c + 'x' + r + 'a1.0.png';
}

genColsInput.addEventListener('input', updateGenOutput);
genRowsInput.addEventListener('input', updateGenOutput);

// ─── Quilt Generation ────────────────────────────────────────────
generateBtn.addEventListener('click', async () => {
  if (!leftView || !rightView) return;

  const targetCols = parseInt(genColsInput.value) || 11;
  const targetRows = parseInt(genRowsInput.value) || 6;
  const strength = parseInt(parallaxStrength.value) / 100;
  const tilt = parseInt(verticalTilt.value) / 100;

  const srcW = leftView.width;
  const srcH = leftView.height;

  generateBtn.disabled = true;
  generateBtn.textContent = '⏳ Generating...';
  genProgress.style.width = '0%';
  genStatus.textContent = 'Generating ' + (targetCols * targetRows) + ' view tiles...';

  genTiles = [];
  const totalTiles = targetCols * targetRows;

  for (let i = 0; i < totalTiles; i++) {
    const colIdx = i % targetCols;
    const rowIdx = Math.floor(i / targetCols);
    const normCol = (colIdx / (targetCols - 1)) * 2 - 1;
    const normRow = (rowIdx / (targetRows - 1)) * 2 - 1;

    const hOffset = normCol * strength * srcW * 0.5;
    const vOffset = normRow * tilt * srcH * 0.15;

    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = srcW;
    tileCanvas.height = srcH;
    const ctx = tileCanvas.getContext('2d');

    const blend = (normCol + 1) / 2;

    ctx.globalAlpha = 1 - blend;
    ctx.drawImage(leftView, -hOffset, vOffset);
    ctx.globalAlpha = blend;
    ctx.drawImage(rightView, -hOffset, vOffset);
    ctx.globalAlpha = 1;

    genTiles.push(tileCanvas);

    const pct = ((i + 1) / totalTiles * 100).toFixed(0);
    genProgress.style.width = pct + '%';
    genStatus.textContent = 'Generating... ' + (i + 1) + '/' + totalTiles;

    if (i % 10 === 0) await new Promise(r => setTimeout(r, 0));
  }

  genStatus.textContent = 'Assembling quilt...';
  genQuiltCanvas = document.createElement('canvas');
  genQuiltCanvas.width = targetCols * srcW;
  genQuiltCanvas.height = targetRows * srcH;
  const quiltCtx = genQuiltCanvas.getContext('2d');

  for (let r = 0; r < targetRows; r++) {
    for (let c = 0; c < targetCols; c++) {
      const tileIdx = (targetRows - 1 - r) * targetCols + c;
      quiltCtx.drawImage(genTiles[tileIdx], c * srcW, r * srcH);
    }
  }

  genViewerOverlay.style.display = 'none';
  genViewIndicator.style.display = 'block';
  startGenParallaxLoop(targetCols, targetRows, srcW, srcH);

  genStatus.textContent = '✓ Quilt generated (' + totalTiles + ' tiles)';
  genProgress.style.width = '100%';
  generateBtn.textContent = '⚡ Generate Quilt';
  generateBtn.disabled = false;
  downloadQuiltBtn.disabled = false;

  setStatus('ready', 'Quilt generated');
});

function startGenParallaxLoop(c, r, tw, th) {
  if (genAnimFrame) cancelAnimationFrame(genAnimFrame);
  const loop = () => {
    renderGenParallax(c, r, tw, th);
    genAnimFrame = requestAnimationFrame(loop);
  };
  loop();
}

function renderGenParallax(c, r, tw, th) {
  const canvas = genPreviewCanvas;
  const ctx = canvas.getContext('2d');

  if (genSelectedTile !== null) {
    canvas.width = tw;
    canvas.height = th;
    ctx.drawImage(genTiles[genSelectedTile], 0, 0);
    genViewIndicator.textContent = 'View ' + genSelectedTile;
    fitCanvas(canvas, genViewerContainer);
    return;
  }

  const viewCol = (1 - genMouseX) * (c - 1);
  const viewRow = genMouseY * (r - 1);
  const c0 = Math.floor(viewCol), r0 = Math.floor(viewRow);
  const c1 = Math.min(c0 + 1, c - 1), r1 = Math.min(r0 + 1, r - 1);
  const fc = viewCol - c0, fr = viewRow - r0;

  canvas.width = tw;
  canvas.height = th;

  ctx.globalAlpha = (1 - fc) * (1 - fr);
  ctx.drawImage(genTiles[r0 * c + c0], 0, 0);
  ctx.globalAlpha = fc * (1 - fr);
  ctx.drawImage(genTiles[r0 * c + c1], 0, 0);
  ctx.globalAlpha = (1 - fc) * fr;
  ctx.drawImage(genTiles[r1 * c + c0], 0, 0);
  ctx.globalAlpha = fc * fr;
  ctx.drawImage(genTiles[r1 * c + c1], 0, 0);
  ctx.globalAlpha = 1;

  genViewIndicator.textContent = 'View ' + (r0 * c + c0) + '–' + (r1 * c + c1) + ' | col ' + viewCol.toFixed(1) + ' row ' + viewRow.toFixed(1);
  fitCanvas(canvas, genViewerContainer);
}

genViewerContainer.addEventListener('mousemove', e => {
  const rect = genViewerContainer.getBoundingClientRect();
  genMouseX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  genMouseY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
});
genViewerContainer.addEventListener('mouseleave', () => { genMouseX = 0.5; genMouseY = 0.5; });
genViewerContainer.addEventListener('touchmove', e => {
  e.preventDefault();
  const rect = genViewerContainer.getBoundingClientRect();
  const touch = e.touches[0];
  genMouseX = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
  genMouseY = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
}, { passive: false });

// ─── Download Quilt ──────────────────────────────────────────────
downloadQuiltBtn.addEventListener('click', () => {
  if (!genQuiltCanvas) return;
  const base = document.getElementById('genFile').textContent || 'quilt';
  const c = parseInt(genColsInput.value) || 11;
  const r = parseInt(genRowsInput.value) || 6;
  const filename = base + '_qs' + c + 'x' + r + 'a1.0.png';

  genQuiltCanvas.toBlob(blob => {
    downloadBlob(blob, filename);
    genStatus.textContent = 'Downloaded: ' + filename;
  }, 'image/png');
});
