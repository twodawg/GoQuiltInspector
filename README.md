# Go Quilt Inspector

A web-based tool for inspecting, generating, and viewing **Looking Glass Go Quilt** light field images — including a VR mode for Meta Quest.

## Features

### 🔍 Inspector
- Load quilt images (PNG, JPEG, GIF, WebP) via drag-and-drop or file picker
- Auto-detect grid dimensions from filename (`qs11x6a1.0`) or device presets
- Extract and preview individual view tiles
- Interactive parallax viewer with bilinear blending between viewpoints
- Video export: record parallax sweeps as WebM or PNG sequences

### 🧊 Generator
- Load side-by-side (SBS) stereo images
- Generate valid Looking Glass quilts with configurable grid size
- Adjust parallax strength and vertical tilt
- Preview generated quilt with interactive parallax
- Download as PNG with standard Looking Glass naming convention

### 🥽 VR Viewer
- Load quilts from **blocks.glass URLs** or local files
- View quilts on a virtual screen in a 3D scene
- **Meta Quest support**: enter immersive VR and walk around the screen to see different viewpoints
- Desktop preview with mouse/touch orbit controls
- Adjustable screen size and view distance

## Usage

1. Open `index.html` in a browser (Chrome recommended)
2. Select a mode via the tabs: Inspector, Generator, or VR Viewer
3. Load a quilt image or SBS stereo pair
4. Interact with the parallax viewer or export results

### Meta Quest VR
1. Host the app over **HTTPS** (required for WebXR)
2. Open the URL in the Quest Browser
3. Switch to the VR Viewer tab and load a quilt
4. Tap **Enter VR Mode** to enter immersive VR
5. Walk around the virtual screen to experience parallax

## Looking Glass Quilt Format

A quilt encodes multiple viewpoints of a scene into a single tiled image. Each tile is a 2D image from a slightly different angle. When displayed on a Looking Glass screen with a lenticular lens array, the brain perceives true 3D depth.

| Device | Grid | Resolution |
|--------|------|------------|
| Looking Glass Go | 11×6 | 4092×4092 |
| Looking Glass Portrait | 8×6 | 3360×3360 |
| Looking Glass 16" (Landscape) | 7×7 | 5999×5999 |
| Looking Glass 27" (Landscape) | 8×6 | 7680×4320 |
| Looking Glass 27" (Portrait) | 12×4 | 7680×4320 |
| Looking Glass 32" (Landscape) | 7×7 | 8190×8190 |
| Looking Glass 65" | 8×9 | 8192×8192 |

**File naming:** `filename_qs{C}x{R}a{Aspect}.{ext}`
**Tile ordering:** Bottom-left = view 0, top-right = last view

## Tech Stack

- Vanilla HTML/CSS/JS (single file)
- Three.js r152 (CDN) for VR rendering
- WebXR API for Meta Quest immersive mode
- Canvas API for tile extraction and parallax blending
- MediaRecorder API for video export

## Links

- [Looking Glass Quilt Docs](https://lfdocs.lookingglassfactory.com/keyconcepts/quilts)
- [Looking Glass Blocks](https://blocks.glass/discover)
- [Looking Glass WebXR Library](https://lookingglassfactory.com/software/webxr-library)
- [Meta Quest WebXR Docs](https://developers.meta.com/horizon/documentation/web/webxr-first-steps/)
