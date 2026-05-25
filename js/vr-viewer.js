// ─── VR Viewer Mode ──────────────────────────────────────────────

let vrQuiltImage = null;
let vrCols = 11, vrRows = 6;
let vrTileW = 0, vrTileH = 0;
let vrTiles = [];
let vrScene, vrCamera, vrRenderer;
let vrScreenMesh, vrScreenTexture, vrScreenMaterial;
let vrIsVRMode = false;
let vrOrbitAngle = { x: 0, y: 0 };
let vrIsDragging = false;
let vrLastMouse = { x: 0, y: 0 };
let vrReady = false;

// ─── Wait for Three.js ───────────────────────────────────────────
function initVRModule() {
  if (typeof THREE === 'undefined') {
    console.warn('Three.js not loaded yet, retrying...');
    setTimeout(initVRModule, 100);
    return;
  }

  console.log('Three.js loaded, initializing VR module');
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
      console.error('Failed to load from blocks.glass:', err);

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

    document.getElementById('vrQuiltName').textContent = filename.split('.').slice(0, -1).join('.');
    document.getElementById('vrGrid').textContent = vrCols + ' × ' + vrRows;
    document.getElementById('vrTiles').textContent = vrCols * vrRows;

    vrEnterBtn.disabled = false;
    vrOverlay.style.display = 'none';
    setStatus('ready', 'VR quilt loaded');

    // Delay scene init until next frame so the tab is visible
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!vrRenderer) {
          initVRScene();
        }
      });
    });
  }

  // ─── Three.js Scene ────────────────────────────────────────────
  function initVRScene() {
    try {
      console.log('Initializing VR scene...');

      if (vrRenderer) {
        vrRenderer.dispose();
      }

      const container = vrCanvas.parentElement;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;

      console.log('Container size:', w, 'x', h);

      vrScene = new THREE.Scene();
      vrScene.background = new THREE.Color(0x111118);

      vrCamera = new THREE.PerspectiveCamera(70, w / h, 0.01, 100);
      vrCamera.position.set(0, 0, 1.5);
      vrCamera.lookAt(0, 0, -1.5);

      vrRenderer = new THREE.WebGLRenderer({
        canvas: vrCanvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance'
      });
      vrRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      vrRenderer.setSize(w, h);
      vrRenderer.xr.enabled = true;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      vrScene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
      dirLight.position.set(0, 0, 3);
      vrScene.add(dirLight);

      const screenSize = parseFloat(document.getElementById('vrScreenSize').value) || 1.5;
      const aspect = vrTileW / vrTileH;
      const screenW = screenSize;
      const screenH = screenSize / aspect;
      const screenZ = -1.5;

      const screenGeometry = new THREE.PlaneGeometry(screenW, screenH);

      const initialCanvas = createInitialScreenTexture();
      vrScreenTexture = new THREE.CanvasTexture(initialCanvas);
      vrScreenTexture.minFilter = THREE.LinearFilter;
      vrScreenTexture.magFilter = THREE.LinearFilter;
      vrScreenTexture.needsUpdate = true;

      vrScreenMaterial = new THREE.MeshBasicMaterial({
        map: vrScreenTexture,
        side: THREE.DoubleSide,
        color: 0xffffff
      });

      vrScreenMesh = new THREE.Mesh(screenGeometry, vrScreenMaterial);
      vrScreenMesh.position.set(0, 0, screenZ);
      vrScreenMesh.userData.screenCenter = new THREE.Vector3(0, 0, screenZ);
      vrScreenMesh.userData.screenW = screenW;
      vrScreenMesh.userData.screenH = screenH;
      vrScene.add(vrScreenMesh);

      // Frame border
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

      vrRenderer.setAnimationLoop(renderVRFrame);

      console.log('VR scene initialized successfully');

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

      checkWebXRSupport();
    } catch (err) {
      console.error('Failed to initialize VR scene:', err);
      vrStatus.textContent = 'Error: ' + err.message;
      vrStatus.className = 'vr-status unsupported';
    }
  }

  function createInitialScreenTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = vrTileW;
    canvas.height = vrTileH;
    const ctx = canvas.getContext('2d');

    const centerIdx = Math.floor((vrRows * vrCols) / 2);
    if (vrTiles[centerIdx]) {
      ctx.drawImage(vrTiles[centerIdx], 0, 0);
    } else {
      ctx.fillStyle = '#6c63ff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    return canvas;
  }

  function renderVRFrame() {
    if (!vrScene || !vrCamera || !vrRenderer || !vrScreenMesh) return;

    if (vrRenderer.xr.isPresenting) {
      const xrCamera = vrRenderer.xr.getCamera();
      const camPos = xrCamera.position;
      const screenCenter = vrScreenMesh.userData.screenCenter;
      const relX = camPos.x - screenCenter.x;
      const relY = camPos.y - screenCenter.y;
      updateScreenTexture(relX, relY);
    } else {
      const distance = parseFloat(document.getElementById('vrDistance').value) || 1.5;
      const x = Math.sin(vrOrbitAngle.x) * Math.cos(vrOrbitAngle.y) * distance;
      const y = Math.sin(vrOrbitAngle.y) * distance;
      const z = Math.cos(vrOrbitAngle.x) * Math.cos(vrOrbitAngle.y) * distance;

      vrCamera.position.set(x, y, -z);
      vrCamera.lookAt(0, 0, -1.5);

      updateScreenTexture(x, y);
    }

    vrRenderer.render(vrScene, vrCamera);
  }

  function updateScreenTexture(cameraX, cameraY) {
    const screenW = vrScreenMesh.userData.screenW || 1.5;
    const screenH = vrScreenMesh.userData.screenH || 1;

    const normX = Math.max(-1, Math.min(1, (cameraX / (screenW / 2))));
    const normY = Math.max(-1, Math.min(1, (cameraY / (screenH / 2))));

    const viewCol = ((1 - normX) / 2) * (vrCols - 1);
    const viewRow = ((1 - normY) / 2) * (vrRows - 1);

    const c0 = Math.floor(viewCol), r0 = Math.floor(viewRow);
    const c1 = Math.min(c0 + 1, vrCols - 1), r1 = Math.min(r0 + 1, vrRows - 1);
    const fc = viewCol - c0, fr = viewRow - r0;

    const canvas = vrScreenTexture.image;
    canvas.width = vrTileW;
    canvas.height = vrTileH;
    const ctx = canvas.getContext('2d');

    ctx.globalAlpha = (1 - fc) * (1 - fr);
    ctx.drawImage(vrTiles[r0 * vrCols + c0], 0, 0);
    ctx.globalAlpha = fc * (1 - fr);
    ctx.drawImage(vrTiles[r0 * vrCols + c1], 0, 0);
    ctx.globalAlpha = (1 - fc) * fr;
    ctx.drawImage(vrTiles[r1 * vrCols + c0], 0, 0);
    ctx.globalAlpha = fc * fr;
    ctx.drawImage(vrTiles[r1 * vrCols + c1], 0, 0);
    ctx.globalAlpha = 1;

    vrScreenTexture.needsUpdate = true;
  }

  function checkWebXRSupport() {
    if ('xr' in navigator) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => {
        if (supported) {
          vrStatus.textContent = '✓ WebXR supported — Enter VR on Meta Quest';
          vrStatus.className = 'vr-status supported';
        } else {
          vrStatus.textContent = '⚠ WebXR not supported — Desktop preview only';
          vrStatus.className = 'vr-status unsupported';
        }
      }).catch(() => {
        vrStatus.textContent = '⚠ WebXR check failed — Desktop preview only';
        vrStatus.className = 'vr-status unsupported';
      });
    } else {
      vrStatus.textContent = '✗ WebXR not available — Desktop preview only';
      vrStatus.className = 'vr-status unsupported';
    }
  }

  // Enter VR button
  vrEnterBtn.addEventListener('click', async () => {
    if (!vrRenderer || !vrScene) return;

    if ('xr' in navigator) {
      try {
        const session = await navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor']
        });

        vrRenderer.xr.setSession(session);
        vrIsVRMode = true;

        session.addEventListener('end', () => {
          vrIsVRMode = false;
          vrEnterBtn.textContent = '🥽 Enter VR Mode';
        });

        vrEnterBtn.textContent = '🥽 In VR...';
      } catch (err) {
        vrStatus.textContent = 'VR Error: ' + err.message;
        vrStatus.className = 'vr-status unsupported';
      }
    } else {
      alert('WebXR is not supported in this browser. Try opening this page on a Meta Quest browser.');
    }
  });
}

// Start initialization
initVRModule();
