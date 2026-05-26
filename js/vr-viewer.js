// ─── VR Viewer Mode ──────────────────────────────────────────────

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
let vrDebugLines = [];
let vrIsVRMode = false;
let vrOrbitAngle = { x: 0, y: 0 };
let vrIsDragging = false;
let vrLastMouse = { x: 0, y: 0 };
let vrReady = false;

// ─── Wait for Three.js ───────────────────────────────────────────
function initVRModule() {
  if (typeof THREE === 'undefined') {
    setTimeout(initVRModule, 100);
    return;
  }

  console.log('[VR] Three.js loaded, initializing VR module');
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
        if (allUrls && allUrls.length > 0) {
          loadVRQuiltFromUrl(allUrls[0]);
          return;
        }
        throw new Error('Could not find quilt image URL on the page');
      }

      loadVRQuiltFromUrl(quiltUrlMatch[1]);
    } catch (err) {
      vrStatus.textContent = 'Error: ' + err.message;
      vrStatus.className = 'vr-status unsupported';
      console.error('[VR] Failed to load from blocks.glass:', err);

      if (url.match(/\.(png|jpg|jpeg|webp)$/i)) {
        loadVRQuiltFromUrl(url);
      } else {
        alert('Could not extract quilt URL. Try copying the direct image URL from the page, or download the quilt and use the drop zone.');
      }
    }
  });

  function loadVRQuiltFromUrl(url) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      vrQuiltImage = img;
      processVRQuilt('blocks.glass quilt');
    };
    img.onerror = () => {
      vrStatus.textContent = 'Failed to load image (CORS or invalid URL)';
      vrStatus.className = 'vr-status unsupported';
    };
    img.src = url;
  }

  function loadVRQuiltFile(file) {
    if (!file.type.startsWith('image/')) return alert('Please select an image file.');
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        vrQuiltImage = img;
        processVRQuilt(file.name);
      };
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

    // Clear old tiles
    vrTiles = [];
    for (let r = 0; r < vrRows; r++) {
      for (let c = 0; c < vrCols; c++) {
        const canvas = document.createElement('canvas');
        canvas.width = vrTileW;
        canvas.height = vrTileH;
        const ctx = canvas.getContext('2d');
        const srcRow = vrRows - 1 - r;
        ctx.drawImage(vrQuiltImage, c * vrTileW, srcRow * vrTileH, vrTileW, vrTileH, 0, 0, vrTileW, vrTileH);
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

    // Init scene after tab is visible
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!vrRenderer) {
          console.log('[VR] First scene init');
          initVRScene();
        } else {
          console.log('[VR] Rebuilding texture on existing scene');
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
      const w = container.clientWidth;
      const h = container.clientHeight;

      if (!w || !h || w === 0 || h === 0) {
        console.warn('[VR] Container has zero dimensions, deferring init');
        setTimeout(initVRScene, 200);
        return;
      }

      console.log('[VR] Container size:', w, 'x', h);

      // Clean up old renderer
      if (vrRenderer) {
        try {
          const session = vrRenderer.xr.getSession();
          if (session) session.end();
        } catch(e) {}
        vrRenderer.dispose();
        vrRenderer = null;
      }

      // Scene
      vrScene = new THREE.Scene();
      vrScene.background = new THREE.Color(0x111118);

      // Camera — positioned in front of screen (positive z)
      vrCamera = new THREE.PerspectiveCamera(70, w / h, 0.01, 100);
      vrCamera.position.set(0, 0, 1.5);

      // Renderer
      vrRenderer = new THREE.WebGLRenderer({
        canvas: vrCanvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      vrRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      vrRenderer.setSize(w, h);
      vrRenderer.xr.enabled = true;
      console.log('[VR] Renderer created, size:', w, 'x', h);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      vrScene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
      dirLight.position.set(0, 0, 3);
      vrScene.add(dirLight);

      // Screen dimensions
      const screenSize = parseFloat(document.getElementById('vrScreenSize').value) || 2;
      const aspect = vrTileW / vrTileH;
      const screenW = screenSize;
      const screenH = screenSize / aspect;
      const screenZ = -1.5;

      console.log('[VR] Screen: ', screenW, 'x', screenH, 'at z=', screenZ);

      // Screen mesh
      const screenGeometry = new THREE.PlaneGeometry(screenW, screenH);

      // Persistent canvas for texture
      vrScreenCanvas = document.createElement('canvas');
      vrScreenCanvas.width = vrTileW;
      vrScreenCanvas.height = vrTileH;
      console.log('[VR] Texture canvas:', vrTileW, 'x', vrTileH);

      vrScreenTexture = new THREE.CanvasTexture(vrScreenCanvas);
      vrScreenTexture.minFilter = THREE.LinearFilter;
      vrScreenTexture.magFilter = THREE.LinearFilter;

      vrScreenMaterial = new THREE.MeshBasicMaterial({
        map: vrScreenTexture,
        side: THREE.DoubleSide
      });

      vrScreenMesh = new THREE.Mesh(screenGeometry, vrScreenMaterial);
      vrScreenMesh.position.set(0, 0, screenZ);
      vrScreenMesh.userData.screenCenter = new THREE.Vector3(0, 0, screenZ);
      vrScreenMesh.userData.screenW = screenW;
      vrScreenMesh.userData.screenH = screenH;
      vrScene.add(vrScreenMesh);
      console.log('[VR] Screen mesh added at (0, 0,', screenZ, ')');

      // Frame border (behind screen)
      const frameGeometry = new THREE.PlaneGeometry(screenW + 0.08, screenH + 0.08);
      const frameMaterial = new THREE.MeshBasicMaterial({
        color: 0x6c63ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5
      });
      const frameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
      frameMesh.position.set(0, 0, screenZ - 0.01);
      vrScene.add(frameMesh);

      // Floor
      const floorGeo = new THREE.PlaneGeometry(10, 10);
      const floorMat = new THREE.MeshBasicMaterial({
        color: 0x1a1a2e,
        side: THREE.DoubleSide
      });
      const floor = new THREE.Mesh(floorGeo, floorMat);
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(0, -2, screenZ);
      vrScene.add(floor);

      // Grid on floor
      const gridHelper = new THREE.GridHelper(10, 20, 0x2a2a4e, 0x1a1a2e);
      gridHelper.position.set(0, -1.99, screenZ);
      vrScene.add(gridHelper);

      // Draw initial frame on texture
      rebuildScreenTexture();
      console.log('[VR] Initial texture drawn');

      // Start render loop
      vrRenderer.setAnimationLoop(renderVRFrame);
      console.log('[VR] Animation loop started');

      // Desktop orbit controls
      vrCanvas.addEventListener('mousedown', e => {
        vrIsDragging = true;
        vrLastMouse = { x: e.clientX, y: e.clientY };
      });
      vrCanvas.addEventListener('mousemove', e => {
        if (!vrIsDragging) return;
        const dx = e.clientX - vrLastMouse.x;
        const dy = e.clientY - vrLastMouse.y;
        vrOrbitAngle.x -= dx * 0.005;
        vrOrbitAngle.y -= dy * 0.005;
        vrOrbitAngle.y = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, vrOrbitAngle.y));
        vrLastMouse = { x: e.clientX, y: e.clientY };
      });
      vrCanvas.addEventListener('mouseup', () => { vrIsDragging = false; });
      vrCanvas.addEventListener('mouseleave', () => { vrIsDragging = false; });

      vrCanvas.addEventListener('touchstart', e => {
        vrIsDragging = true;
        vrLastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }, { passive: true });
      vrCanvas.addEventListener('touchmove', e => {
        if (!vrIsDragging) return;
        const dx = e.touches[0].clientX - vrLastMouse.x;
        const dy = e.touches[0].clientY - vrLastMouse.y;
        vrOrbitAngle.x -= dx * 0.005;
        vrOrbitAngle.y -= dy * 0.005;
        vrOrbitAngle.y = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, vrOrbitAngle.y));
        vrLastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }, { passive: true });
      vrCanvas.addEventListener('touchend', () => { vrIsDragging = false; });

      // VR enter button
      vrEnterBtn.onclick = enterVR;

      checkWebXRSupport();
      // ─── In-VR Debug Panel ─────────────────────────────────────
      vrDebugCanvas = document.createElement('canvas');
      vrDebugCanvas.width = 512;
      vrDebugCanvas.height = 256;

      vrDebugTexture = new THREE.CanvasTexture(vrDebugCanvas);
      vrDebugTexture.minFilter = THREE.LinearFilter;
      vrDebugTexture.magFilter = THREE.LinearFilter;

      const debugMat = new THREE.MeshBasicMaterial({
        map: vrDebugTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: true
      });

      const debugGeo = new THREE.PlaneGeometry(1.2, 0.6);
      vrDebugMesh = new THREE.Mesh(debugGeo, debugMat);
      vrDebugMesh.position.set(0, 1.3, screenZ + 0.02);
      vrScene.add(vrDebugMesh);

      updateDebugPanel();

      console.log('[VR] Scene initialized successfully');
    } catch (err) {
      console.error('[VR] Failed to initialize VR scene:', err);
      vrStatus.textContent = 'Error: ' + err.message;
      vrStatus.className = 'vr-status unsupported';
    }
  }

  function rebuildScreenTexture() {
    if (!vrScreenCanvas || vrTiles.length === 0) {
      console.warn('[VR] rebuildScreenTexture: no canvas or tiles');
      return;
    }
    const ctx = vrScreenCanvas.getContext('2d');
    const centerIdx = Math.floor((vrRows * vrCols) / 2);
    ctx.clearRect(0, 0, vrTileW, vrTileH);
    if (vrTiles[centerIdx]) {
      ctx.drawImage(vrTiles[centerIdx], 0, 0);
      console.log('[VR] Drew center tile', centerIdx, 'to texture');
    } else {
      ctx.fillStyle = '#6c63ff';
      ctx.fillRect(0, 0, vrTileW, vrTileH);
      console.warn('[VR] No center tile found, drew fallback color');
    }
    if (vrScreenTexture) {
      vrScreenTexture.needsUpdate = true;
    }
  }

  function renderVRFrame() {
    if (!vrScene || !vrCamera || !vrRenderer || !vrScreenMesh) return;

    const screenCenter = vrScreenMesh.userData.screenCenter;

    if (vrRenderer.xr.isPresenting) {
      // VR mode: use headset camera position
      const xrCamera = vrRenderer.xr.getCamera();
      const camPos = xrCamera.position;
      const relX = camPos.x - screenCenter.x;
      const relY = camPos.y - screenCenter.y;
      updateScreenTexture(relX, relY);
    } else {
      // Desktop mode: orbit camera IN FRONT of screen
      const distance = parseFloat(document.getElementById('vrDistance').value) || 1.5;
      const x = Math.sin(vrOrbitAngle.x) * Math.cos(vrOrbitAngle.y) * distance;
      const y = Math.sin(vrOrbitAngle.y) * distance;
      const z = Math.cos(vrOrbitAngle.x) * Math.cos(vrOrbitAngle.y) * distance;

      // Camera at positive z, looking at screen at negative z
      vrCamera.position.set(x, y, z);
      vrCamera.lookAt(screenCenter);

      updateScreenTexture(x, y);
    }

    // Update in-VR debug panel
    updateDebugPanel();

    vrRenderer.render(vrScene, vrCamera);
  }

  function updateScreenTexture(cameraX, cameraY) {
    if (!vrScreenCanvas || vrTiles.length === 0) return;

    const screenW = vrScreenMesh.userData.screenW;
    const screenH = vrScreenMesh.userData.screenH;

    // Map camera position to normalized viewport (0..1)
    // Camera at positive X = looking from right = show left view
    const normX = 0.5 - (cameraX / screenW) * 0.5;
    const normY = 0.5 + (cameraY / screenH) * 0.5;

    // Clamp
    const clampedX = Math.max(0, Math.min(1, normX));
    const clampedY = Math.max(0, Math.min(1, normY));

    // Convert to grid coordinates
    const viewCol = clampedX * (vrCols - 1);
    const viewRow = (1 - clampedY) * (vrRows - 1);

    // Bilinear interpolation between 4 adjacent tiles
    const c0 = Math.floor(viewCol);
    const r0 = Math.floor(viewRow);
    const c1 = Math.min(c0 + 1, vrCols - 1);
    const r1 = Math.min(r0 + 1, vrRows - 1);
    const fc = viewCol - c0;
    const fr = viewRow - r0;

    const tileIdx00 = r0 * vrCols + c0;
    const tileIdx10 = r0 * vrCols + c1;
    const tileIdx01 = r1 * vrCols + c0;
    const tileIdx11 = r1 * vrCols + c1;

    // Validate tile indices
    if (tileIdx00 >= vrTiles.length || tileIdx10 >= vrTiles.length ||
        tileIdx01 >= vrTiles.length || tileIdx11 >= vrTiles.length) {
      console.warn('[VR] Tile index out of bounds:', tileIdx00, tileIdx10, tileIdx01, tileIdx11, 'total:', vrTiles.length);
      return;
    }

    const ctx = vrScreenCanvas.getContext('2d');
    ctx.clearRect(0, 0, vrTileW, vrTileH);

    // Blend 4 tiles
    ctx.globalAlpha = (1 - fc) * (1 - fr);
    ctx.drawImage(vrTiles[tileIdx00], 0, 0);
    ctx.globalAlpha = fc * (1 - fr);
    ctx.drawImage(vrTiles[tileIdx10], 0, 0);
    ctx.globalAlpha = (1 - fc) * fr;
    ctx.drawImage(vrTiles[tileIdx01], 0, 0);
    ctx.globalAlpha = fc * fr;
    ctx.drawImage(vrTiles[tileIdx11], 0, 0);
    ctx.globalAlpha = 1.0;

    // Mark texture for GPU upload
    vrScreenTexture.needsUpdate = true;
  }

  function updateDebugPanel() {
    if (!vrDebugCanvas) return;
    const ctx = vrDebugCanvas.getContext('2d');
    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#6c63ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, 510, 254);

    ctx.fillStyle = '#6c63ff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('VR DEBUG', 12, 24);

    ctx.fillStyle = '#e0e0e8';
    ctx.font = '13px monospace';
    const lines = [
      'Quilt: ' + (vrQuiltImage ? vrQuiltImage.naturalWidth + 'x' + vrQuiltImage.naturalHeight : 'NONE'),
      'Grid: ' + vrCols + 'x' + vrRows + '  Tile: ' + vrTileW + 'x' + vrTileH,
      'Tiles: ' + vrTiles.length,
      'Screen: ' + (vrScreenCanvas ? vrScreenCanvas.width + 'x' + vrScreenCanvas.height : 'NONE'),
      'Texture: ' + (vrScreenTexture ? 'OK' : 'NONE'),
      'Scene: ' + (vrScene ? 'OK' : 'NONE'),
      'Camera: ' + (vrCamera ? 'OK' : 'NONE'),
      'Renderer: ' + (vrRenderer ? 'OK' : 'NONE'),
      'Mesh: ' + (vrScreenMesh ? 'OK' : 'NONE'),
      'Presenting: ' + (vrRenderer && vrRenderer.xr.isPresenting ? 'YES' : 'NO'),
    ];

    let y = 48;
    for (const line of lines) {
      ctx.fillText(line, 12, y);
      y += 18;
    }

    if (vrCamera) {
      y += 6;
      ctx.fillStyle = '#ff6584';
      ctx.fillText('Cam pos: ' + vrCamera.position.x.toFixed(2) + ', ' + vrCamera.position.y.toFixed(2) + ', ' + vrCamera.position.z.toFixed(2), 12, y);
    }

    if (vrScreenMesh) {
      y += 18;
      ctx.fillStyle = '#4ade80';
      ctx.fillText('Screen at: ' + vrScreenMesh.position.x + ', ' + vrScreenMesh.position.y + ', ' + vrScreenMesh.position.z, 12, y);
    }

    if (vrDebugTexture) {
      vrDebugTexture.needsUpdate = true;
    }
  }

  async function enterVR() {
    if (!navigator.xr) {
      vrStatus.textContent = 'WebXR not supported in this browser';
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

      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor']
      });

      vrRenderer.xr.setSession(session);
      vrStatus.textContent = 'In VR session';
      vrStatus.className = 'vr-status supported';

      session.addEventListener('end', () => {
        vrStatus.textContent = 'VR session ended';
        vrStatus.className = 'vr-status';
      });
    } catch (err) {
      console.error('[VR] Failed to enter VR:', err);
      vrStatus.textContent = 'VR Error: ' + err.message;
      vrStatus.className = 'vr-status unsupported';
    }
  }

  function checkWebXRSupport() {
    if (!navigator.xr) {
      vrStatus.textContent = 'WebXR not available - desktop preview only';
      vrStatus.className = 'vr-status unsupported';
      vrEnterBtn.disabled = true;
      return;
    }

    navigator.xr.isSessionSupported('immersive-vr').then(supported => {
      if (supported) {
        vrStatus.textContent = 'WebXR supported - VR mode available';
        vrStatus.className = 'vr-status supported';
      } else {
        vrStatus.textContent = 'Immersive VR not supported - desktop preview only';
        vrStatus.className = 'vr-status unsupported';
        vrEnterBtn.disabled = true;
      }
    }).catch(() => {
      vrStatus.textContent = 'Desktop preview mode';
      vrStatus.className = 'vr-status';
    });
  }
}

// Start polling for Three.js
initVRModule();
