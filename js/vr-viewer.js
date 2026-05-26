// VR Viewer Mode - Quest-compatible WebXR viewer for Looking Glass quilt inspection

let vrQuiltImage = null;
let vrCols = 11, vrRows = 6;
let vrTileW = 0, vrTileH = 0;
let vrTiles = [];
let vrScene, vrCamera, vrRenderer;
let vrScreenMesh, vrScreenTexture, vrScreenMaterial;
let vrScreenCanvas = null;
let vrOrbitAngle = { x: 0, y: 0 };
let vrIsDragging = false;
let vrLastMouse = { x: 0, y: 0 };
let vrReady = false;
let currentXrSession = null;

function initVRModule() {
  if (typeof THREE === 'undefined') { setTimeout(initVRModule, 100); return; }
  console.log('[VR] Three.js loaded');
  vrReady = true;

  const vrUrlInput = document.getElementById('vrUrl');
  const vrLoadBtn = document.getElementById('vrLoadBtn');
  const vrDropZone = document.getElementById('vrDropZone');
  const vrFileInput = document.getElementById('vrFileInput');
  const vrEnterBtn = document.getElementById('vrEnterBtn');
  const vrStatus = document.getElementById('vrStatus');
  const vrOverlay = document.getElementById('vrOverlay');
  const vrCanvas = document.getElementById('vr-canvas');

  // File Loading
  vrDropZone.addEventListener('click', () => vrFileInput.click());
  vrDropZone.addEventListener('dragover', e => { e.preventDefault(); vrDropZone.classList.add('drag-over'); });
  vrDropZone.addEventListener('dragleave', () => vrDropZone.classList.remove('drag-over'));
  vrDropZone.addEventListener('drop', e => {
    e.preventDefault(); vrDropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) loadVRQuiltFile(e.dataTransfer.files[0]);
  });
  vrFileInput.addEventListener('change', () => { if (vrFileInput.files.length) loadVRQuiltFile(vrFileInput.files[0]); });

  // Load from blocks.glass URL
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
    if (match) { vrCols = parseInt(match[1]); vrRows = parseInt(match[2]); }
    else {
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
        canvas.width = vrTileW; canvas.height = vrTileH;
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
        if (!vrRenderer) initVRScene(); else rebuildScreenTexture();
      });
    });
  }

  // Three.js Scene
  function initVRScene() {
    try {
      console.log('[VR] initVRScene called');
      const container = vrCanvas.parentElement;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      vrCanvas.width = w; vrCanvas.height = h;
      if (w === 0 || h === 0) { setTimeout(initVRScene, 200); return; }

      // Dispose old renderer
      if (vrRenderer) {
        try { const s = vrRenderer.xr.getSession(); if (s) s.end(); } catch(e) {}
        vrRenderer.dispose(); vrRenderer = null;
      }

      vrScene = new THREE.Scene();
      vrScene.background = new THREE.Color(0x111118);
      vrCamera = new THREE.PerspectiveCamera(70, w / h, 0.01, 100);
      vrCamera.position.set(0, 1.6, 0);

      vrRenderer = new THREE.WebGLRenderer({ canvas: vrCanvas, antialias: false, alpha: false, xrCompatible: true });
      vrRenderer.setPixelRatio(1);
      vrRenderer.setSize(w, h);
      vrRenderer.xr.enabled = true;

      // Screen
      const screenSize = parseFloat(document.getElementById('vrScreenSize').value) || 2;
      const aspect = vrTileW / vrTileH;
      const screenW = screenSize;
      const screenH = screenSize / aspect;
      const screenZ = -2;

      vrScreenCanvas = document.createElement('canvas');
      vrScreenCanvas.width = vrTileW; vrScreenCanvas.height = vrTileH;
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

      // Floor
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: 0x1a1a2e, side: THREE.DoubleSide }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, 0, screenZ);
      vrScene.add(floor);

      const gridHelper = new THREE.GridHelper(10, 20, 0x2a2a4e, 0x1a1a2e);
      gridHelper.position.set(0, 0.01, screenZ);
      vrScene.add(gridHelper);

      rebuildScreenTexture();
      vrRenderer.setAnimationLoop(renderVRFrame);
      vrRenderer.render(vrScene, vrCamera);

      // Desktop orbit controls
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
    if (!vrScreenCanvas || !vrScreenTexture || vrTiles.length === 0) return;
    const ctx = vrScreenCanvas.getContext('2d');
    ctx.clearRect(0, 0, vrTileW, vrTileH);
    ctx.drawImage(vrTiles[0], 0, 0);
    vrScreenTexture.needsUpdate = true;
  }

  function updateScreenTexture(cameraPosition) {
    if (!vrScreenCanvas || !vrScreenTexture || vrTiles.length === 0) return;
    const screenCenter = vrScreenMesh.userData.screenCenter;
    const screenW = vrScreenMesh.userData.screenW;
    const screenH = vrScreenMesh.userData.screenH;
    const relX = cameraPosition.x - screenCenter.x;
    const relY = cameraPosition.y - screenCenter.y;
    const offsetX = (relX / screenW) * (vrCols - 1) * 0.5;
    const offsetY = (relY / screenH) * (vrRows - 1) * 0.5;
    let tileCol = Math.round((vrCols - 1) / 2 + offsetX);
    let tileRow = Math.round((vrRows - 1) / 2 + offsetY);
    tileCol = Math.max(0, Math.min(vrCols - 1, tileCol));
    tileRow = Math.max(0, Math.min(vrRows - 1, tileRow));
    const tileIndex = tileRow * vrCols + tileCol;
    if (tileIndex >= 0 && tileIndex < vrTiles.length) {
      const ctx = vrScreenCanvas.getContext('2d');
      ctx.clearRect(0, 0, vrTileW, vrTileH);
      ctx.drawImage(vrTiles[tileIndex], 0, 0);
      vrScreenTexture.needsUpdate = true;
    }
  }

  function renderVRFrame(timestamp, frame) {
    if (!vrRenderer || !vrScene || !vrCamera) return;

    if (frame) {
      // XR mode: use head position from XR pose for parallax
      const refSpace = vrRenderer.xr.getReferenceSpace();
      if (refSpace) {
        const pose = frame.getViewerPose(refSpace);
        if (pose && pose.views && pose.views.length > 0) {
          const view = pose.views[0];
          if (view && view.transform) {
            updateScreenTexture(view.transform.position);
          }
        }
      }
    } else {
      // Desktop mode: orbit controls
      const radius = 2.5;
      const screenCenter = vrScreenMesh ? vrScreenMesh.userData.screenCenter : new THREE.Vector3(0, 1.6, -2);
      vrCamera.position.x = screenCenter.x + Math.sin(vrOrbitAngle.x) * radius;
      vrCamera.position.y = screenCenter.y + vrOrbitAngle.y * radius * 0.5;
      vrCamera.position.z = screenCenter.z + Math.cos(vrOrbitAngle.x) * radius;
      vrCamera.lookAt(screenCenter);
      updateScreenTexture(vrCamera.position);
    }

    vrRenderer.render(vrScene, vrCamera);
  }

  async function enterVR() {
    try {
      console.log('[VR] Requesting XR session...');
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor']
      });
      currentXrSession = session;
      console.log('[VR] Session started');

      const refSpace = await session.requestReferenceSpace('local');
      vrRenderer.xr.setReferenceSpace(refSpace);
      vrRenderer.xr.setSession(session);

      session.addEventListener('end', () => {
        console.log('[VR] Session ended');
        currentXrSession = null;
      });

      const container = vrCanvas.parentElement;
      vrCanvas.width = container.clientWidth || 800;
      vrCanvas.height = container.clientHeight || 600;
      vrRenderer.setSize(vrCanvas.width, vrCanvas.height);
      console.log('[VR] Ready for immersive rendering');
    } catch (err) {
      console.error('[VR] Failed to enter VR:', err);
      vrStatus.textContent = 'VR Error: ' + err.message;
      vrStatus.className = 'vr-status unsupported';
    }
  }

  function checkWebXRSupport() {
    if (!navigator.xr) { setStatus('unsupported', 'WebXR not supported in this browser'); return; }
    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      if (supported) setStatus('ready', 'WebXR ready');
      else setStatus('unsupported', 'Immersive VR not supported');
    }).catch(() => { setStatus('unsupported', 'WebXR check failed'); });
  }

  function setStatus(type, message) {
    if (!vrStatus) return;
    vrStatus.textContent = message;
    vrStatus.className = 'vr-status ' + type;
  }

  function cleanupVR() {
    if (vrRenderer) {
      try { const s = vrRenderer.xr.getSession(); if (s) s.end(); } catch(e) {}
      vrRenderer.dispose(); vrRenderer = null;
    }
    if (vrScreenTexture) { vrScreenTexture.dispose(); vrScreenTexture = null; }
    if (vrScreenMaterial) { vrScreenMaterial.dispose(); vrScreenMaterial = null; }
    vrTiles = []; vrQuiltImage = null; vrReady = false;
  }

  window.cleanupVR = cleanupVR;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initVRModule);
} else {
  initVRModule();
}