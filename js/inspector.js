// ─── Inspector Mode ──────────────────────────────────────────────

let quiltImage = null;
let cols = 11, rows = 6;
let tileW = 0, tileH = 0;
let tiles = [];
let activeTileIndex = 0;
let mouseX = 0.5, mouseY = 0.5;
let animFrame = null;
let selectedTile = null;

const dropZone        = document.getElementById('dropZone');
const fileInput       = document.getElementById('fileInput');
const colInput        = document.getElementById('colInput');
const rowInput        = document.getElementById('rowInput');
const applyGridBtn    = document.getElementById('applyGridBtn');
const tileGridEl      = document.getElementById('tileGrid');
const quiltPreview    = document.getElementById('quiltPreview');
const viewPreview     = document.getElementById('viewPreview');
const parallaxCanvas  = document.getElementById('parallaxCanvas');
const viewerOverlay   = document.getElementById('viewerOverlay');
const viewIndicator   = document.getElementById('viewIndicator');
const viewerContainer = document.getElementById('viewerContainer');

// ─── File Loading ────────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files.length) loadInspectorFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => { if (fileInput.files.length) loadInspectorFile(fileInput.files[0]); });

function loadInspectorFile(file) {
  if (!file.type.startsWith('image/')) return alert('Please select an image file.');
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      quiltImage = img;
      processInspectorQuilt(file.name);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function processInspectorQuilt(filename) {
  const match = filename.match(/qs(\d+)x(\d+)a([\d.]+)/i);
  if (match) {
    cols = parseInt(match[1]);
    rows = parseInt(match[2]);
  } else {
    const best = detectDevice(quiltImage.naturalWidth, quiltImage.naturalHeight);
    if (best) { cols = best.cols; rows = best.rows; }
  }

  colInput.value = cols;
  rowInput.value = rows;
  computeInspectorTiles();
  updateInspectorMetadata(filename);
  renderInspectorAll();
  setStatus('ready', 'Loaded: ' + filename);
  applyGridBtn.disabled = false;
  document.getElementById('recordBtn').disabled = false;
}

function computeInspectorTiles() {
  tileW = Math.floor(quiltImage.naturalWidth / cols);
  tileH = Math.floor(quiltImage.naturalHeight / rows);
  tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const canvas = document.createElement('canvas');
      canvas.width = tileW;
      canvas.height = tileH;
      const ctx = canvas.getContext('2d');
      const srcRow = rows - 1 - r;
      ctx.drawImage(quiltImage, c * tileW, srcRow * tileH, tileW, tileH, 0, 0, tileW, tileH);
      tiles.push(canvas);
    }
  }
}

function updateInspectorMetadata(filename) {
  const name = filename.split('.').slice(0, -1).join('.');
  document.getElementById('metaFile').textContent = name.length > 20 ? name.slice(0, 17) + '…' : name;
  document.getElementById('metaDims').textContent = quiltImage.naturalWidth + ' × ' + quiltImage.naturalHeight;
  const device = detectDevice(quiltImage.naturalWidth, quiltImage.naturalHeight);
  document.getElementById('metaDevice').textContent = device ? device.name : 'Unknown';
  document.getElementById('metaGrid').textContent = cols + ' × ' + rows;
  document.getElementById('metaTile').textContent = tileW + ' × ' + tileH;
  document.getElementById('metaViews').textContent = cols * rows;
  document.getElementById('metaAspect').textContent = (tileW / tileH).toFixed(3);
  document.getElementById('tileCount').textContent = '(' + (cols * rows) + ' tiles)';
}

// ─── Grid Override ───────────────────────────────────────────────
applyGridBtn.addEventListener('click', () => {
  cols = Math.max(2, Math.min(32, parseInt(colInput.value) || cols));
  rows = Math.max(2, Math.min(32, parseInt(rowInput.value) || rows));
  computeInspectorTiles();
  document.getElementById('metaGrid').textContent = cols + ' × ' + rows;
  document.getElementById('metaTile').textContent = tileW + ' × ' + tileH;
  document.getElementById('metaViews').textContent = cols * rows;
  document.getElementById('metaAspect').textContent = (tileW / tileH).toFixed(3);
  document.getElementById('tileCount').textContent = '(' + (cols * rows) + ' tiles)';
  renderInspectorAll();
});

// ─── Render ──────────────────────────────────────────────────────
function renderInspectorAll() {
  renderQuiltPreview();
  renderTileThumbnails();
  renderViewPreview(0);
  startParallaxLoop();
  viewerOverlay.style.display = 'none';
  viewIndicator.style.display = 'block';
}

function renderQuiltPreview() {
  quiltPreview.width = quiltImage.naturalWidth;
  quiltPreview.height = quiltImage.naturalHeight;
  quiltPreview.getContext('2d').drawImage(quiltImage, 0, 0);
  const maxW = quiltPreview.parentElement.clientWidth - 32;
  const scale = Math.min(1, maxW / quiltPreview.width);
  quiltPreview.style.width = (quiltPreview.width * scale) + 'px';
  quiltPreview.style.height = (quiltPreview.height * scale) + 'px';
}

function renderTileThumbnails() {
  tileGridEl.innerHTML = '';
  tiles.forEach((tile, i) => {
    const img = document.createElement('img');
    img.src = tile.toDataURL('image/jpeg', 0.7);
    img.className = 'tile-thumb' + (i === activeTileIndex ? ' active' : '');
    img.title = 'View ' + i + ' [col ' + (i % cols) + ', row ' + Math.floor(i / cols) + ']';
    img.addEventListener('click', () => {
      selectedTile = i;
      activeTileIndex = i;
      renderViewPreview(i);
      renderTileThumbnails();
    });
    tileGridEl.appendChild(img);
  });
}

function renderViewPreview(index) {
  viewPreview.width = tileW;
  viewPreview.height = tileH;
  viewPreview.getContext('2d').drawImage(tiles[index], 0, 0);
  const maxW = viewPreview.parentElement.clientWidth - 48;
  const scale = Math.min(1, maxW / viewPreview.width);
  viewPreview.style.width = (viewPreview.width * scale) + 'px';
  viewPreview.style.height = (viewPreview.height * scale) + 'px';
}

function startParallaxLoop() {
  if (animFrame) cancelAnimationFrame(animFrame);
  const loop = () => { renderParallax(); animFrame = requestAnimationFrame(loop); };
  loop();
}

function renderParallax() {
  const canvas = parallaxCanvas;
  const ctx = canvas.getContext('2d');

  if (selectedTile !== null) {
    canvas.width = tileW;
    canvas.height = tileH;
    ctx.drawImage(tiles[selectedTile], 0, 0);
    viewIndicator.textContent = 'View ' + selectedTile + ' [col ' + (selectedTile % cols) + ', row ' + Math.floor(selectedTile / cols) + ']';
    fitCanvas(canvas, viewerContainer);
    return;
  }

  const viewCol = (1 - mouseX) * (cols - 1);
  const viewRow = mouseY * (rows - 1);
  const c0 = Math.floor(viewCol), r0 = Math.floor(viewRow);
  const c1 = Math.min(c0 + 1, cols - 1), r1 = Math.min(r0 + 1, rows - 1);
  const fc = viewCol - c0, fr = viewRow - r0;

  canvas.width = tileW;
  canvas.height = tileH;

  ctx.globalAlpha = (1 - fc) * (1 - fr);
  ctx.drawImage(tiles[r0 * cols + c0], 0, 0);
  ctx.globalAlpha = fc * (1 - fr);
  ctx.drawImage(tiles[r0 * cols + c1], 0, 0);
  ctx.globalAlpha = (1 - fc) * fr;
  ctx.drawImage(tiles[r1 * cols + c0], 0, 0);
  ctx.globalAlpha = fc * fr;
  ctx.drawImage(tiles[r1 * cols + c1], 0, 0);
  ctx.globalAlpha = 1;

  viewIndicator.textContent = 'View ' + (r0 * cols + c0) + '–' + (r1 * cols + c1) + ' | col ' + viewCol.toFixed(1) + ' row ' + viewRow.toFixed(1);
  fitCanvas(canvas, viewerContainer);
}

function fitCanvas(canvas, container) {
  const maxW = container.clientWidth - 32;
  const maxH = container.clientHeight - 32;
  const scale = Math.min(1, maxW / canvas.width, maxH / canvas.height);
  canvas.style.width = (canvas.width * scale) + 'px';
  canvas.style.height = (canvas.height * scale) + 'px';
}

// ─── Mouse Interaction ───────────────────────────────────────────
viewerContainer.addEventListener('mousemove', e => {
  const rect = viewerContainer.getBoundingClientRect();
  mouseX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  mouseY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
});
viewerContainer.addEventListener('mouseleave', () => { mouseX = 0.5; mouseY = 0.5; });
viewerContainer.addEventListener('touchmove', e => {
  e.preventDefault();
  const rect = viewerContainer.getBoundingClientRect();
  const touch = e.touches[0];
  mouseX = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
  mouseY = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
}, { passive: false });

// ─── Video Export ────────────────────────────────────────────────
const recordBtn   = document.getElementById('recordBtn');
const stopBtn     = document.getElementById('stopBtn');
const progressFill = document.getElementById('progressFill');
const exportStatus = document.getElementById('exportStatus');
const sweepTypeEl = document.getElementById('sweepType');
const sweepDurEl  = document.getElementById('sweepDuration');
const sweepFpsEl  = document.getElementById('sweepFps');
const sweepFormatEl = document.getElementById('sweepFormat');

let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];

recordBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

async function startRecording() {
  if (!quiltImage || isRecording) return;
  isRecording = true;
  recordBtn.disabled = true;
  stopBtn.disabled = false;
  progressFill.style.width = '0%';
  progressFill.classList.add('recording');
  exportStatus.textContent = 'Recording...';

  const duration = parseFloat(sweepDurEl.value) || 4;
  const fps = parseInt(sweepFpsEl.value) || 30;
  const format = sweepFormatEl.value;
  const sweepType = sweepTypeEl.value;
  const totalFrames = Math.round(duration * fps);
  const interval = 1000 / fps;

  if (format === 'webm') {
    await recordWebM(sweepType, totalFrames, interval, fps);
  } else {
    await recordPNGSequence(sweepType, totalFrames, interval);
  }

  finishRecording();
}

async function recordWebM(sweepType, totalFrames, interval, fps) {
  const offscreen = document.createElement('canvas');
  offscreen.width = tileW;
  offscreen.height = tileH;

  const stream = offscreen.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';

  mediaRecorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8000000
  });
  recordedChunks = [];

  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.start();

  for (let i = 0; i < totalFrames; i++) {
    if (!isRecording) { mediaRecorder.stop(); return; }
    const t = i / (totalFrames - 1);
    const frame = renderFrameToCanvas(sweepType, t, tiles, cols, rows, tileW, tileH);
    offscreen.getContext('2d').drawImage(frame, 0, 0);

    progressFill.style.width = ((i + 1) / totalFrames * 100).toFixed(0) + '%';
    exportStatus.textContent = 'Recording... ' + (i + 1) + '/' + totalFrames;
    await new Promise(r => setTimeout(r, interval));
  }

  return new Promise(resolve => {
    mediaRecorder.onstop = resolve;
    mediaRecorder.stop();
  });
}

async function recordPNGSequence(sweepType, totalFrames, interval) {
  const pngFrames = [];
  for (let i = 0; i < totalFrames; i++) {
    if (!isRecording) return;
    const t = i / (totalFrames - 1);
    const frame = renderFrameToCanvas(sweepType, t, tiles, cols, rows, tileW, tileH);
    pngFrames.push(frame.toDataURL('image/png'));

    progressFill.style.width = ((i + 1) / totalFrames * 100).toFixed(0) + '%';
    exportStatus.textContent = 'Capturing... ' + (i + 1) + '/' + totalFrames;
    await new Promise(r => setTimeout(r, interval));
  }

  for (let i = 0; i < pngFrames.length; i++) {
    downloadDataUrl(pngFrames[i], (document.getElementById('metaFile').textContent || 'quilt') + '_parallax_frame_' + String(i).padStart(4, '0') + '.png');
    await new Promise(r => setTimeout(r, 100));
  }
  exportStatus.textContent = 'Exported ' + pngFrames.length + ' frames';
}

function finishRecording() {
  isRecording = false;
  recordBtn.disabled = false;
  stopBtn.disabled = true;
  progressFill.classList.remove('recording');

  if (sweepFormatEl.value === 'webm' && recordedChunks.length > 0) {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const base = document.getElementById('metaFile').textContent || 'quilt';
    downloadBlob(blob, base + '_parallax_' + sweepTypeEl.value + '_' + sweepDurEl.value + 's.webm');
    exportStatus.textContent = 'Exported WebM';
    recordedChunks = [];
  }
}

function stopRecording() {
  isRecording = false;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    mediaRecorder = null;
  }
  recordBtn.disabled = false;
  stopBtn.disabled = true;
  progressFill.classList.remove('recording');
  exportStatus.textContent = 'Recording stopped';
}
