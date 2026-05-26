// ─── VR Viewer Mode ──────────────────────────────────────────────
// Quest-compatible WebXR viewer for Looking Glass quilt inspection

let vrQuiltImage = null;
let vrCols = 11, vrRows = 6;
let vrTileW = 0, vrTileH = 0;
let vrTiles = [];
let vrScene, vrCamera, vrRenderer;
let vrScreenMesh, vrScreenTexture, vrScreenMaterial;
let vrScreenCanvas = null;
let vrDebugCanvas = null;
let vrDebugTexture = null;
let vrDebugMesh = null;
let vrOrbitAngle = { x: 0, y: 0 };
let vrIsDragging = false;
let vrLastMouse = { x: 0, y: 0 };
let vrReady = false;
let vrFrameCount = 0;
let currentXrSession = null;

function initVRModule() {
  if (typeof THREE === 'undefined') {
    setTimeout(initVRModule, 100);
    return;
  }

  console.log('[VR] Three.js loaded');
  vrReady = true;

  const vrUrlInput     = document.getElementById('vrUrl');
  const vrLoadBtn      = document.getElementById('vrLoadBtn');
  const vrDropZone     = document.getElementById('vrDropZone');
  const vrFileInput    = document.getElementById('vrFileInput');
  const vrEnterBtn     = document.getElementById('vrEnterBtn');
  const vrStatus       = document.getElementById('vrStatus');
  const vrOverlay      = document.getElementById('vrOverlay');
  const vrCanvas       = document.getElementById('vr-canvas');

  // ─── File Loading ──────────────────────────────────────────────
  vrDropZone.addEventListener('click', () => vrFileInput.click());
  vrDropZone.addEventListener('dragover', e => { e.preventDefault(); vrDropZone.classList.add('drag-over'); });
  vrDropZone.addEventListener('dragleave', () => vrDropZone.classList.remove('drag-over'));
  vrDropZone.addEventListener('drop', e => {
    e.preventDefault();
    vrDropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) loadVRQuiltFile(e.dataTransfer.files[0]);
  });
  vrFileInput.addEventListener('change', () => { if (vrFileInput.files.length) loadVRQuiltFile(vrFileInput.files[0]); });

  // ─── Load from blocks.glass URL ────────────────────────────────
  vrLoadBtn.addEventListener('click', async () => {
    const url = vrUrlInput.value.trim();
    if (!url) return alert('Please enter a blocks.glass URL');

    vrStatus.textContent = 'Loading from blocks.glass...';
    vrStatus.className = 'vr-status';

    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error('Failed to fetch page');
      const html = await response.text();
      const quiltUrlMatch = html.match(/(https?:\/\/[^"'<>\s]+\.(png|jpg|jpeg|webp))/i);
      if (!quiltUrlMatch) {
        const allUrls = html.match(/(https?:\/\/dl\.blocks\.glass\/[^"'<>\s]+)/gi);
        if (allUrls && allUrls.length > 0) { loadVRQuiltFromUrl(allUrls[0]); return; }
        throw new Error('Could not find quilt image URL');
      }
      loadVRQuiltFromUrl(quiltUrlMatch[1]);
    } catch (err) {
      vrStatus.textContent = 'Error: ' + err.message;
      vrStatus.className = 'vr-status unsupported';
      if (url.match(/\.(png|jpg|jpeg|webp)$/i)) loadVRQuiltFromUrl(url);
    }
  });

  function loadVRQuiltFromUrl(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { vrQuiltImage = img; processVRQuilt('blocks.glass quilt'); };
    img.onerror = () => { vrStatus.textContent = 'Failed to load image (CORS)'; vrStatus.className = 'vr-status unsupported'; };
    img.src = url;
  }

  function loadVRQuiltFile(file) {
    if (!file.type.startsWith('image/')) return alert('Please select an image file.');
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => { vrQuiltImage = img; processVRQuilt(file.name); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function processVRQuilt(filename) {
    console.log('[VR] Processing quilt:', filename);

    const match = filename.match(/qs(\d+)x(\d+)a([\d.]+)/i);
    if (match) {
      vrCols = parseInt(match[1]);
      vrRows = parseInt(match[2]);
    } else {
      const best = detectDevice(vrQuiltImage.naturalWidth, vrQuiltImage.naturalHeight);
      if (best) { vrCols = best.cols; vrRows = best.rows; }
    }

    vrTileW = Math.floor(vrQuiltImage.naturalWidth / vrCols);
    vrTileH = Math.floor(vrQuiltImage.naturalHeight / vrRows);
    console.log('[VR] Grid:', vrCols, 'x', vrRows, 'Tile:', vrTileW, 'x', vrTileH);

    vrTiles = [];
    for (let r = 0; r < vrRows; r++) {
      for (let c = 0; c < vrCols; c++) {
        const canvas = document.createElement('canvas');
        canvas.width = vrTileW;
        canvas.height = vrTileH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(vrQuiltImage, c * vrTileW, (vrRows - 1 - r) * vrTileH, vrTileW, vrTileH, 0, 0, vrTileW, vrTileH);
        vrTiles.push(canvas);
      }
    }
    console.log('[VR] Extracted', vrTiles.length, 'tiles');

    document.getElementById('vrQuiltName').textContent = filename.split('.').slice(0, -1).join('.');
    document.getElementById('vrGrid').textContent = vrCols + ' x ' + vrRows;
    document.getElementById('vrTiles').textContent = vrCols * vrRows;
    vrEnterBtn.disabled = false;
    if (vrOverlay) vrOverlay.style.display = 'none';
    setStatus('ready', 'VR quilt loaded');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!vrRenderer) {
          initVRScene();
        } else {
          rebuildScreenTexture();
        }
      });
    });
  }

  // ─── Three.js Scene ────────────────────────────────────────────
  function initVRScene() {
    try {
      console.log('[VR] initVRScene called');

      const container = vrCanvas.parentElement;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;

      vrCanvas.width = w;
      vrCanvas.height = h;
      console.log('[VR] Canvas set to', w, 'x', h);

      if (w === 0 || h === 0) {
        console.warn('[VR] Zero dimensions, deferring');
        setTimeout(initVRScene, 200);
        return;
      }

      // Dispose old renderer
      if (vrRenderer) {
        try { const s = vrRenderer.xr.getSession(); if (s) s.end(); } catch(e) {}
        vrRenderer.dispose();
        vrRenderer = null;
      }

      // Scene
      vrScene = new THREE.Scene();
      vrScene.background = new THREE.Color(0x111118);

      // Camera — positioned at eye height for VR
      vrCamera = new THREE.PerspectiveCamera(70, w / h, 0.01, 100);
      vrCamera.position.set(0, 1.6, 0);

      // Renderer — xrCompatible: true is REQUIRED for Quest browser
      vrRenderer = new THREE.WebGLRenderer({
        canvas: vrCanvas,
        antialias: false,
        alpha: false,
        xrCompatible: true
      });
      vrRenderer.setPixelRatio(1);
      vrRenderer.setSize(w, h); // third param (antialias) removed in r152+
      vrRenderer.xr.enabled = true;
      console.log('[VR] Renderer created with xrCompatible: true');

      // Verify WebGL context
      const gl = vrRenderer.getContext();
      if (!gl) throw new Error('Failed to get WebGL context');
      console.log('[VR] WebGL context OK');

      // ─── Scene Objects ─────────────────────────────────────────

      // Bright test cube — positioned in front of camera
      const testGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const testMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const testCube = new THREE.Mesh(testGeo, testMat);
      testCube.position.set(0, 1.6, -2);
      vrScene.add(testCube);

      // Screen — positioned at eye height, 2 meters in front
      const screenSize = parseFloat(document.getElementById('vrScreenSize').value) || 2;
      const aspect = vrTileW / vrTileH;
      const screenW = screenSize;
      const screenH = screenSize / aspect;
      const screenZ = -2;

      // Persistent texture canvas
      vrScreenCanvas = document.createElement('canvas');
      vrScreenCanvas.width = vrTileW;
      vrScreenCanvas.height = vrTileH;

      vrScreenTexture = new THREE.CanvasTexture(vrScreenCanvas);
      vrScreenTexture.minFilter = THREE.LinearFilter;
      vrScreenTexture.magFilter = THREE.LinearFilter;

      vrScreenMaterial = new THREE.MeshBasicMaterial({ map: vrScreenTexture, side: THREE.DoubleSide });

      vrScreenMesh = new THREE.Mesh(new THREE.PlaneGeometry(screenW, screenH), vrScreenMaterial);
      vrScreenMesh.position.set(0, 1.6, screenZ);
      vrScreenMesh.userData.screenCenter = new THREE.Vector3(0, 1.6, screenZ);
      vrScreenMesh.userData.screenW = screenW;
      vrScreenMesh.userData.screenH = screenH;
      vrScene.add(vrScreenMesh);

      // Frame border
      const frameMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(screenW + 0.08, screenH + 0.08),
        new THREE.MeshBasicMaterial({ color: 0x6c63ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
      );
      frameMesh.position.set(0, 1.6, screenZ - 0.01);
      vrScene.add(frameMesh);

      // Floor
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshBasicMaterial({ color: 0x1a1a2e, side: THREE.DoubleSide })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, 0, screenZ);
      vrScene.add(floor);

      // Grid
      const gridHelper = new THREE.GridHelper(10, 20, 0x2a2a4e, 0x1a1a2e);
      gridHelper.position.set(0, 0.01, screenZ);
      vrScene.add(gridHelper);

      // Debug panel — positioned above screen
      vrDebugCanvas = document.createElement('canvas');
      vrDebugCanvas.width = 512;
      vrDebugCanvas.height = 256;
      vrDebugTexture = new THREE.CanvasTexture(vrDebugCanvas);
      vrDebugTexture.minFilter = THREE.LinearFilter;
      vrDebugTexture.magFilter = THREE.LinearFilter;
      vrDebugMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 0.6),
        new THREE.MeshBasicMaterial({ map: vrDebugTexture, transparent: true, side: THREE.DoubleSide })
      );
      vrDebugMesh.position.set(0, 2.8, screenZ + 0.02);
      vrScene.add(vrDebugMesh);

      // Initial texture
      rebuildScreenTexture();

      // ─── Render Loop ───────────────────────────────────────────
      vrRenderer.setAnimationLoop(renderVRFrame);
      console.log('[VR] setAnimationLoop registered');

      // Force one render immediately
      vrRenderer.render(vrScene, vrCamera);
      console.log('[VR] Scene initialized');

      // ─── Desktop Orbit Controls ────────────────────────────────
      vrCanvas.addEventListener('mousedown', e => { vrIsDragging = true; vrLastMouse = { x: e.clientX, y: e.clientY }; });
      vrCanvas.addEventListener('mousemove', e => {
        if (!vrIsDragging) return;
        vrOrbitAngle.x -= (e.clientX - vrLastMouse.x) * 0.005;
        vrOrbitAngle.y -= (e.clientY - vrLastMouse.y) * 0.005;
        vrOrbitAngle.y = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, vrOrbitAngle.y));
        vrLastMouse = { x: e.clientX, y: e.clientY };
      });
      vrCanvas.addEventListener('mouseup', () => { vrIsDragging = false; });
      vrCanvas.addEventListener('mouseleave', () => { vrIsDragging = false; });
      vrCanvas.addEventListener('touchstart', e => { vrIsDragging = true; vrLastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
      vrCanvas.addEventListener('touchmove', e => {
        if (!vrIsDragging) return;
        vrOrbitAngle.x -= (e.touches[0].clientX - vrLastMouse.x) * 0.005;
        vrOrbitAngle.y -= (e.touches[0].clientY - vrLastMouse.y) * 0.005;
        vrOrbitAngle.y = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, vrOrbitAngle.y));
        vrLastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }, { passive: true });
      vrCanvas.addEventListener('touchend', () => { vrIsDragging = false; });

      vrEnterBtn.onclick = enterVR;
      checkWebXRSupport();

    } catch (err) {
      console.error('[VR] initVRScene FAILED:', err);
      vrStatus.textContent = 'Init error: ' + err.message;
      vrStatus.className = 'vr-status unsupported';
    }
  }

  function rebuildScreenTexture() {
    if (!vrScreenCanvas || vrTiles.length === 0) return;
    const ctx = vrScreenCanvas.getContext('2d');
    ctx.clearRect(0, 0, vrTileW, vrTileH);
    const centerIdx = Math.floor((vrRows * vrCols) / 2);
    if (vrTiles[centerIdx]) {
      ctx.drawImage(vrTiles[centerIdx], 0, 0);
    } else {
      ctx.fillStyle = '#6c63ff';
      ctx.fillRect(0, 0, vrTileW, vrTileH);
    }
    if (vrScreenTexture) vrScreenTexture.needsUpdate = true;
  }

  // ─── Render Frame ──────────────────────────────────────────────
  function renderVRFrame(timestamp, frame) {
    try {
      vrFrameCount++;

      // Update debug panel every 30 frames
      if (vrFrameCount % 30 === 0) updateDebugPanel();

      // Desktop orbit camera — only when NOT in XR
      if (!vrRenderer.xr.isPresenting) {
        const dist = parseFloat(document.getElementById('vrDistance').value) || 2;
        vrCamera.position.set(
          Math.sin(vrOrbitAngle.x) * Math.cos(vrOrbitAngle.y) * dist,
          1.6 + Math.sin(vrOrbitAngle.y) * dist * 0.3,
          Math.cos(vrOrbitAngle.x) * Math.cos(vrOrbitAngle.y) * dist
        );
        vrCamera.lookAt(0, 1.6, -2);
      }

      // Update screen texture
      if (vrScreenMesh && vrScreenCanvas && vrTiles.length > 0) {
        updateScreenTexture();
      }

      // ALWAYS render
      vrRenderer.render(vrScene, vrCamera);
    } catch (e) {
      console.error('[VR] renderVRFrame error:', e);
    }
  }

  function updateScreenTexture() {
    const camPos = vrCamera.position;
    const screenW = vrScreenMesh.userData.screenW;
    const screenH = vrScreenMesh.userData.screenH;

    const normX = Math.max(0, Math.min(1, 0.5 - (camPos.x / screenW) * 0.5));
    const normY = Math.max(0, Math.min(1, 0.5 + (camPos.y / screenH) * 0.5));

    const viewCol = normX * (vrCols - 1);
    const viewRow = (1 - normY) * (vrRows - 1);

    const c0 = Math.floor(viewCol), r0 = Math.floor(viewRow);
    const c1 = Math.min(c0 + 1, vrCols - 1), r1 = Math.min(r0 + 1, vrRows - 1);
    const fc = viewCol - c0, fr = viewRow - r0;

    const ctx = vrScreenCanvas.getContext('2d');
    ctx.clearRect(0, 0, vrTileW, vrTileH);

    const t00 = r0 * vrCols + c0, t10 = r0 * vrCols + c1;
    const t01 = r1 * vrCols + c0, t11 = r1 * vrCols + c1;

    ctx.globalAlpha = (1 - fc) * (1 - fr); ctx.drawImage(vrTiles[t00], 0, 0);
    ctx.globalAlpha = fc * (1 - fr); ctx.drawImage(vrTiles[t10], 0, 0);
    ctx.globalAlpha = (1 - fc) * fr; ctx.drawImage(vrTiles[t01], 0, 0);
    ctx.globalAlpha = fc * fr; ctx.drawImage(vrTiles[t11], 0, 0);
    ctx.globalAlpha = 1;

    vrScreenTexture.needsUpdate = true;
  }

  function updateDebugPanel() {
    if (!vrDebugCanvas) return;
    const ctx = vrDebugCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#6c63ff'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 510, 254);

    ctx.fillStyle = '#6c63ff'; ctx.font = 'bold 16px monospace';
    ctx.fillText('VR DEBUG', 12, 24);

    ctx.fillStyle = '#e0e0e8'; ctx.font = '13px monospace';
    const lines = [
      'Quilt: ' + (vrQuiltImage ? vrQuiltImage.naturalWidth + 'x' + vrQuiltImage.naturalHeight : 'NONE'),
      'Grid: ' + vrCols + 'x' + vrRows + '  Tile: ' + vrTileW + 'x' + vrTileH,
      'Tiles: ' + vrTiles.length,
      'Texture: ' + (vrScreenTexture ? 'OK' : 'NONE'),
      'Presenting: ' + (vrRenderer && vrRenderer.xr.isPresenting ? 'YES' : 'NO'),
      'Frames: ' + vrFrameCount,
    ];
    if (vrCamera) lines.push('Cam: ' + vrCamera.position.x.toFixed(2) + ' ' + vrCamera.position.y.toFixed(2) + ' ' + vrCamera.position.z.toFixed(2));
    if (vrScreenMesh) lines.push('Screen: ' + vrScreenMesh.position.x + ' ' + vrScreenMesh.position.y + ' ' + vrScreenMesh.position.z);

    let y = 48;
    for (const line of lines) { ctx.fillText(line, 12, y); y += 18; }
    if (vrDebugTexture) vrDebugTexture.needsUpdate = true;
  }

  // ─── Enter VR ──────────────────────────────────────────────────
  async function enterVR() {
    if (!navigator.xr) {
      vrStatus.textContent = 'WebXR not supported';
      vrStatus.className = 'vr-status unsupported';
      return;
    }
    try {
      const supported = await navigator.xr.isSessionSupported('immersive-vr');
      if (!supported) {
        vrStatus.textContent = 'Immersive VR not supported';
        vrStatus.className = 'vr-status unsupported';
        return;
      }

      console.log('[VR] Requesting XR session...');

      // CRITICAL: Ensure canvas has valid dimensions before XR session
      const container = vrCanvas.parentElement;
      vrCanvas.width = container.clientWidth || 800;
      vrCanvas.height = container.clientHeight || 600;
      vrRenderer.setSize(vrCanvas.width, vrCanvas.height); // third param removed in r152+
      console.log('[VR] Canvas resized to', vrCanvas.width, 'x', vrCanvas.height);

      // Make context XR compatible explicitly
      const gl = vrRenderer.getContext();
      if (gl && gl.makeXRCompatible) {
        try {
          await gl.makeXRCompatible();
          console.log('[VR] makeXRCompatible succeeded');
        } catch (e) {
          console.warn('[VR] makeXRCompatible failed (may already be compatible):', e);
        }
      }

      // Request XR session
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor']
      });
      currentXrSession = session;
      console.log('[VR] Session obtained');

      // Set up XR render state — r152 API
      const refSpace = await session.requestReferenceSpace('local');
      vrRenderer.xr.setReferenceSpace(refSpace);
      vrRenderer.xr.setSession(session);
      console.log('[VR] XR session and reference space set');

      vrStatus.textContent = 'In VR session';
      vrStatus.className = 'vr-status supported';

      session.addEventListener('end', () => {
        currentXrSession = null;
        console.log('[VR] Session ended');
        vrStatus.textContent = 'VR session ended';
        vrStatus.className = 'vr-status';
      });
    } catch (err) {
      console.error('[VR] XR session failed:', err);
      vrStatus.textContent = 'XR Error: ' + err.message;
      vrStatus.className = 'vr-status unsupported';
    }
  }

  function checkWebXRSupport() {
    if (!navigator.xr) {
      vrStatus.textContent = 'WebXR not available';
      vrStatus.className = 'vr-status unsupported';
      vrEnterBtn.disabled = true;
      return;
    }
    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      if (supported) {
        vrStatus.textContent = 'WebXR supported';
        vrStatus.className = 'vr-status supported';
      } else {
        vrStatus.textContent = 'Desktop preview only';
        vrStatus.className = 'vr-status unsupported';
        vrEnterBtn.disabled = true;
      }
    }).catch(() => {
      vrStatus.textContent = 'Desktop preview mode';
    });
  }
}

// Start
initVRModule();
