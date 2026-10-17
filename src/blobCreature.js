import * as THREE from 'three';
import mascotImgUrl from './assets/images/mascot_alien_1792222225785.jpg';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Loads the mascot image and creates a high-fidelity transparent texture.
 * Uses outer-border flood-fill (BFS) background removal so only the outer white studio
 * background is cleared, leaving the white sneakers and yellow cube 100% intact!
 */
function createMascotTexture(onLoadCallback) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  // Initial placeholder while image loads (soft neutral tone)
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, 1024, 1024);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const w = canvas.width;
    const h = canvas.height;
    const totalPixels = w * h;

    // Check if pixel qualifies as outer studio background (near-white / light gray cyc)
    function isNearWhite(idx) {
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const brightness = (r + g + b) / 3;
      const maxDiff = Math.max(Math.abs(r - g), Math.max(Math.abs(g - b), Math.abs(r - b)));
      return brightness > 230 && maxDiff < 26;
    }

    // Outer-border BFS flood fill: queue starts strictly from image boundaries
    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);
    let head = 0;
    let tail = 0;

    // Seed top and bottom borders
    for (let x = 0; x < w; x++) {
      const topIdx = x * 4;
      if (isNearWhite(topIdx)) {
        visited[x] = 1;
        queue[tail++] = x;
      }
      const btmY = h - 1;
      const btmIdx = (btmY * w + x) * 4;
      if (isNearWhite(btmIdx)) {
        visited[btmY * w + x] = 1;
        queue[tail++] = btmY * w + x;
      }
    }

    // Seed left and right borders
    for (let y = 0; y < h; y++) {
      const leftIdx = (y * w) * 4;
      if (!visited[y * w] && isNearWhite(leftIdx)) {
        visited[y * w] = 1;
        queue[tail++] = y * w;
      }
      const rightX = w - 1;
      const rightIdx = (y * w + rightX) * 4;
      if (!visited[y * w + rightX] && isNearWhite(rightIdx)) {
        visited[y * w + rightX] = 1;
        queue[tail++] = y * w + rightX;
      }
    }

    // BFS flood fill
    while (head < tail) {
      const p = queue[head++];
      const px = p % w;
      const py = (p / w) | 0;

      // Check 4 neighbors
      const neighbors = [
        px > 0 ? p - 1 : -1,
        px < w - 1 ? p + 1 : -1,
        py > 0 ? p - w : -1,
        py < h - 1 ? p + w : -1
      ];

      for (let i = 0; i < 4; i++) {
        const n = neighbors[i];
        if (n !== -1 && !visited[n] && isNearWhite(n * 4)) {
          visited[n] = 1;
          queue[tail++] = n;
        }
      }
    }

    // Apply alpha = 0 to all flood-filled background pixels, with soft 2px anti-aliasing feathering
    for (let p = 0; p < totalPixels; p++) {
      if (visited[p]) {
        data[p * 4 + 3] = 0;
      }
    }

    // Edge anti-aliasing feathering along boundary
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (!visited[p]) {
          // Check if neighboring any background pixel
          const hasBgNeighbor =
            visited[p - 1] || visited[p + 1] || visited[p - w] || visited[p + w];
          if (hasBgNeighbor) {
            const r = data[p * 4];
            const g = data[p * 4 + 1];
            const b = data[p * 4 + 2];
            const brightness = (r + g + b) / 3;
            if (brightness > 215) {
              const alphaRatio = Math.max(0.0, Math.min(1.0, (255 - brightness) / 40.0));
              data[p * 4 + 3] = Math.round(alphaRatio * 255);
            }
          }
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
    texture.needsUpdate = true;
    if (typeof onLoadCallback === 'function') {
      onLoadCallback(texture);
    }
  };

  img.src = mascotImgUrl;
  return texture;
}

/**
 * Creates a soft radial contact shadow texture for grounding the yellow cube.
 */
function createContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createRadialGradient(128, 128, 15, 128, 128, 120);
  gradient.addColorStop(0.0, 'rgba(0, 0, 0, 0.75)');
  gradient.addColorStop(0.45, 'rgba(0, 0, 0, 0.40)');
  gradient.addColorStop(0.75, 'rgba(0, 0, 0, 0.12)');
  gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Evaluates follicle density & length mask on the mascot.
 * Concentrated strictly on top of the mascot alien's head ("above mascot alien"):
 * - High (1.0..1.35) on the stylish pompadour crown and front wave tuft
 * - Smoothly tapers to 0 at the hairline and temples
 * - 0.0 everywhere else so the alien's green face, ears, and antenna remain clean
 */
export function evaluateFollicleMask(x, y, z) {
  // Fur is on top of the alien mascot's head
  if (y < 0.85) {
    return 0.0;
  }

  const cx = -0.02;
  const cy = 0.96;
  const cz = 0.08;

  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;

  // Front forehead cutoff so the face stays completely smooth
  if (dz > 0.35 && dy < 0.12) {
    return 0.0;
  }

  // Antenna base exclusion (prevent fur poking through the green antenna)
  const distAntenna = Math.hypot(x + 0.16, y - 1.25, z - 0.04);
  if (distAntenna < 0.10) {
    return 0.0;
  }

  // Taper near hairline rim
  const hairlineRim = smoothstep(0.86, 1.02, y);

  // Extra volume & length boost on the iconic pompadour crest (front-top tuft)
  const crestDist = Math.hypot(dx - 0.02, y - 1.15, dz - 0.18);
  const crestFluff = 1.0 + 0.35 * (1.0 - smoothstep(0.0, 0.32, crestDist));

  return Math.max(0.0, Math.min(1.35, hairlineRim * crestFluff));
}

/**
 * Computes biological hair flow tangent for the mascot pompadour tuft.
 * Hairs sweep gracefully up from the forehead, flowing backwards and to the right
 * in a handsome wavy crest, hugging the head silhouette.
 */
export function evaluateGroomFlow(x, y, z, nx, ny, nz) {
  // Upward and backward pompadour sweep (-z, +y) with a subtle diagonal parting (+x)
  let fx = 0.24 + x * 0.16;
  let fy = 0.38 * Math.max(0.0, 1.25 - y);
  let fz = -0.85;

  // Crown whorl swirl near the back-top (x = 0.04, z = -0.12)
  const whorlDx = x - 0.04;
  const whorlDz = z + 0.12;
  const whorlDist = Math.hypot(whorlDx, whorlDz);
  if (whorlDist < 0.38) {
    const influence = 1.0 - whorlDist / 0.38;
    fx += -whorlDz * 0.9 * influence;
    fz += whorlDx * 0.9 * influence;
  }

  // Project onto tangent plane orthogonal to normal N
  const dotFN = fx * nx + fy * ny + fz * nz;
  let tx = fx - dotFN * nx;
  let ty = fy - dotFN * ny;
  let tz = fz - dotFN * nz;
  const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (len > 1e-5) {
    tx /= len;
    ty /= len;
    tz /= len;
  } else {
    tx = 0.0;
    ty = 0.0;
    tz = -1.0;
  }
  return [tx, ty, tz];
}

/**
 * Sculpt the 3D scalp dome into the mascot's iconic pompadour hair silhouette.
 */
function sculptMascotScalp(u, v, w) {
  // Scalp center in local space: (x = -0.02, y = 0.96, z = 0.06)
  let rx = 0.44;
  let ry = 0.36;
  let rz = 0.38;

  // Forward & upward pompadour wave crest on top-front (v > 0.15, w > 0.0)
  const crestInfluence = Math.max(0.0, v * 0.72 + w * 0.65);
  const crestLift = Math.pow(crestInfluence, 2.6) * 0.16;

  // Lateral sweep volume
  const sideVolume = Math.pow(Math.abs(u), 2.2) * 0.03 * Math.max(0.0, v);

  const lift = crestLift + sideVolume;

  let x = -0.02 + u * (rx + lift);
  let y = 0.96 + v * (ry + lift * 1.15);
  let z = 0.06 + w * (rz + lift * 0.85);

  return [x, y, z];
}

/**
 * Builds continuous organic scalp geometry for the mascot fur system
 * with baked aFollicleMask and aGroomTangent attributes.
 */
export function createOrganicBlobGeometry(widthSegments = 84, heightSegments = 64) {
  const geom = new THREE.SphereGeometry(1.0, widthSegments, heightSegments, 0, Math.PI * 2, 0, Math.PI * 0.62);
  const posAttr = geom.attributes.position;
  const count = posAttr.count;

  for (let i = 0; i < count; i++) {
    const u = posAttr.getX(i);
    const v = posAttr.getY(i);
    const w = posAttr.getZ(i);
    const [sx, sy, sz] = sculptMascotScalp(u, v, w);
    posAttr.setXYZ(i, sx, sy, sz);
  }

  geom.computeVertexNormals();

  const normAttr = geom.attributes.normal;
  const follicleMaskArray = new Float32Array(count);
  const groomTangentArray = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const nx = normAttr.getX(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);

    follicleMaskArray[i] = evaluateFollicleMask(x, y, z);
    const [tx, ty, tz] = evaluateGroomFlow(x, y, z, nx, ny, nz);
    groomTangentArray[i * 3] = tx;
    groomTangentArray[i * 3 + 1] = ty;
    groomTangentArray[i * 3 + 2] = tz;
  }

  geom.setAttribute('aFollicleMask', new THREE.BufferAttribute(follicleMaskArray, 1));
  geom.setAttribute('aGroomTangent', new THREE.BufferAttribute(groomTangentArray, 3));

  return geom;
}

/**
 * Creates the complete Alien Mascot Character ("lil' alien") sitting on a warm yellow cube
 * Matching the exact official mascot from the reference image:
 * - High-definition visual mascot with smooth apple green skin, cartoon eyes, antenna, striped shirt, denim shorts, and yellow box
 * - 3D dynamic GPU fur simulation (64 shells + 60k strands) situated directly above the mascot alien's head over its hair tuft
 * - Physical Marschner hair shading, combing, petting, wind, and boop physics
 */
export function createBlobCreature() {
  const root = new THREE.Group();
  root.name = 'AlienMascotCreature';

  const pickTargets = [];

  // ---------------------------------------------------------------------------
  // 1. Contact Floor Shadow Plane
  // ---------------------------------------------------------------------------
  const shadowTex = createContactShadowTexture();
  const shadowGeo = new THREE.PlaneGeometry(2.0, 1.8);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.58,
    depthWrite: false
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.name = 'ContactShadow';
  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0, -0.96, -0.05);
  root.add(shadowMesh);

  // ---------------------------------------------------------------------------
  // 2. High-Definition Alien Mascot Character Body
  // ---------------------------------------------------------------------------
  const mascotTexture = createMascotTexture();

  // Multi-subdivision curved plane with subtle 3D cylindrical relief
  // Giving the character genuine depth and volumetric feel when orbiting
  const charWidth = 2.38;
  const charHeight = 2.38;
  const charGeo = new THREE.PlaneGeometry(charWidth, charHeight, 32, 32);
  const posArr = charGeo.attributes.position;
  for (let i = 0; i < posArr.count; i++) {
    const px = posArr.getX(i);
    // Subtle cylindrical arching so it holds 3D lighting and shadow beautifully
    const pz = -Math.pow(px / (charWidth * 0.5), 2.0) * 0.12;
    posArr.setZ(i, pz);
  }
  charGeo.computeVertexNormals();

  const characterMat = new THREE.MeshStandardMaterial({
    map: mascotTexture,
    transparent: true,
    alphaTest: 0.05,
    roughness: 0.52,
    metalness: 0.02,
    side: THREE.DoubleSide
  });

  const characterMesh = new THREE.Mesh(charGeo, characterMat);
  characterMesh.name = 'AlienMascotBody';
  characterMesh.position.set(0, 0.18, 0.0);
  characterMesh.castShadow = true;
  characterMesh.receiveShadow = true;
  root.add(characterMesh);
  pickTargets.push(characterMesh);

  // ---------------------------------------------------------------------------
  // 3. 3D Scalp & Mascot Fur Geometry ("above mascot alien")
  // ---------------------------------------------------------------------------
  const scalpMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#22140e'), // Dark espresso brown matching fur roots
    roughness: 0.78,
    metalness: 0.02
  });

  const bodyGeometry = createOrganicBlobGeometry(84, 64);
  const bodyMesh = new THREE.Mesh(bodyGeometry, scalpMat);
  bodyMesh.name = 'MascotScalpMesh';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  root.add(bodyMesh);
  pickTargets.push(bodyMesh);

  // ---------------------------------------------------------------------------
  // Animation, Breathing, Gaze Tracking & Boop Physics
  // ---------------------------------------------------------------------------
  const animState = {
    time: 0,
    baseScale: 1.0,
    baseX: 0.0,
    baseY: 0.0,
    baseZ: 0.0,
    blinkTimer: 0,
    nextBlink: 2.8,
    boopImpulse: 0,
    boopPhase: 0,
    prevPosition: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    angularVelocity: new THREE.Vector3(),
    targetLook: new THREE.Vector2(0, 0),
    currentLook: new THREE.Vector2(0, 0)
  };

  const anchorPos = new THREE.Vector3(0, 0, 0);
  const targetAnchorPos = new THREE.Vector3(0, 0, 0);
  const startAnchorPos = new THREE.Vector3(0, 0, 0);
  let isPlaced = false;
  let isPlacing = false;
  let placeProgress = 1.0;
  let placeHopHeight = 0.0;
  let facingYaw = 0.0;
  let facingPitch = 0.0;
  let targetFacingYaw = 0.0;
  let targetFacingPitch = 0.0;
  let faceViewerHoldTimer = 0.0;

  function placeAt(targetWorldPos, normal, animate = true, cameraPos = null) {
    if (!targetWorldPos) return;
    isPlaced = true;
    const s = animState.baseScale;
    const targetCenterY = targetWorldPos.y + 0.94 * s;

    animState.targetLook.set(0, 0);
    animState.currentLook.set(0, 0);
    faceViewerHoldTimer = 1.4;

    if (cameraPos) {
      const dx = cameraPos.x - targetWorldPos.x;
      const dy = cameraPos.y - targetCenterY;
      const dz = cameraPos.z - targetWorldPos.z;
      const horizDist = Math.max(0.001, Math.hypot(dx, dz));
      targetFacingYaw = Math.atan2(dx, dz);
      targetFacingPitch = -Math.atan2(dy, horizDist) * 0.72;
      if (!animate) {
        facingYaw = targetFacingYaw;
        facingPitch = targetFacingPitch;
      }
    }

    if (animate) {
      startAnchorPos.copy(anchorPos);
      targetAnchorPos.set(targetWorldPos.x, targetCenterY, targetWorldPos.z);
      placeProgress = 0.0;
      isPlacing = true;
      placeHopHeight = Math.min(0.65, Math.max(0.18, startAnchorPos.distanceTo(targetAnchorPos) * 0.22));
      animState.boopImpulse = 0.85;
      animState.boopPhase = 0.0;
    } else {
      anchorPos.set(targetWorldPos.x, targetCenterY, targetWorldPos.z);
      targetAnchorPos.copy(anchorPos);
      isPlacing = false;
      placeProgress = 1.0;
    }
  }

  function resetPlacement(animate = true) {
    isPlaced = false;
    targetFacingYaw = 0.0;
    targetFacingPitch = 0.0;
    faceViewerHoldTimer = 0.0;
    animState.targetLook.set(0, 0);
    animState.currentLook.set(0, 0);
    const s = animState.baseScale;
    const ox = animState.baseX || 0.0;
    const oz = animState.baseZ || 0.0;
    const targetY = -0.94 + 0.94 * s;
    if (animate) {
      startAnchorPos.copy(anchorPos);
      targetAnchorPos.set(ox, targetY, oz);
      placeProgress = 0.0;
      isPlacing = true;
      placeHopHeight = Math.min(0.55, Math.max(0.18, startAnchorPos.distanceTo(targetAnchorPos) * 0.22));
      animState.boopImpulse = 0.85;
      animState.boopPhase = 0.0;
    } else {
      anchorPos.set(ox, targetY, oz);
      targetAnchorPos.set(ox, targetY, oz);
      startAnchorPos.set(ox, targetY, oz);
      facingYaw = 0.0;
      facingPitch = 0.0;
      isPlacing = false;
      placeProgress = 1.0;
      animState.boopImpulse = 0.0;
      animState.boopPhase = 0.0;
    }
  }

  function setEnvironmentScale(scale, offsetX = 0.0, offsetZ = 0.0) {
    const s = Number.isFinite(scale) && scale > 0 ? scale : 1.0;
    const ox = Number.isFinite(offsetX) ? offsetX : 0.0;
    const oz = Number.isFinite(offsetZ) ? offsetZ : 0.0;
    animState.baseScale = s;
    animState.baseX = ox;
    animState.baseY = -0.94 * (1.0 - s);
    animState.baseZ = oz;
    if (!isPlaced) {
      anchorPos.set(ox, -0.94 + 0.94 * s, oz);
      targetAnchorPos.copy(anchorPos);
      startAnchorPos.copy(anchorPos);
      facingYaw = 0.0;
      facingPitch = 0.0;
      targetFacingYaw = 0.0;
      targetFacingPitch = 0.0;
    }
  }

  function triggerBoop() {
    animState.boopImpulse = 1.0;
    animState.boopPhase = 0.0;
  }

  function update(dt, pointerNDC, cameraPos = null, isARMode = false) {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
    animState.time += safeDt;

    if (faceViewerHoldTimer > 0) {
      faceViewerHoldTimer = Math.max(0, faceViewerHoldTimer - safeDt);
    }

    // Pointer eye/head tracking
    if (pointerNDC && faceViewerHoldTimer <= 0) {
      animState.targetLook.set(pointerNDC.x * 0.35, pointerNDC.y * 0.25);
    } else if (faceViewerHoldTimer > 0) {
      animState.targetLook.set(0, 0);
    }
    animState.currentLook.lerp(animState.targetLook, Math.min(1.0, safeDt * 7.5));

    // Breathing & playful idle hop
    if (animState.boopImpulse > 0.001) {
      animState.boopPhase += safeDt * 14.0;
      animState.boopImpulse *= Math.exp(-safeDt * 3.6);
    } else {
      animState.boopImpulse = 0.0;
    }

    let hop = 0.0;
    if (isPlacing) {
      placeProgress += safeDt * 3.4;
      if (placeProgress >= 1.0) {
        placeProgress = 1.0;
        isPlacing = false;
        anchorPos.copy(targetAnchorPos);
        triggerBoop();
      } else {
        const p = placeProgress;
        anchorPos.lerpVectors(startAnchorPos, targetAnchorPos, p);
        hop = Math.sin(p * Math.PI) * placeHopHeight;
      }
    }

    if ((isPlaced || isARMode) && cameraPos) {
      const dx = cameraPos.x - anchorPos.x;
      const dy = cameraPos.y - anchorPos.y;
      const dz = cameraPos.z - anchorPos.z;
      const horizDist = Math.max(0.001, Math.hypot(dx, dz));
      targetFacingYaw = Math.atan2(dx, dz);
      targetFacingPitch = -Math.atan2(dy, horizDist) * 0.72;
    } else if (!isPlaced) {
      targetFacingYaw = 0.0;
      targetFacingPitch = 0.0;
    }

    const yawDiff = Math.atan2(Math.sin(targetFacingYaw - facingYaw), Math.cos(targetFacingYaw - facingYaw));
    facingYaw += yawDiff * Math.min(1.0, safeDt * 12.0);
    facingPitch += (targetFacingPitch - facingPitch) * Math.min(1.0, safeDt * 12.0);

    const s = animState.baseScale;
    const breath = Math.sin(animState.time * 2.2) * 0.022;
    const bodyLookScale = (isPlaced || isARMode) ? (faceViewerHoldTimer > 0 ? 0.0 : 0.06) : 1.0;
    const swayX = (Math.sin(animState.time * 1.3) * 0.035 + animState.currentLook.x * 0.10 * bodyLookScale) * s;
    const jumpY =
      (Math.sin(animState.time * 2.2) * 0.03 +
        Math.abs(Math.sin(animState.boopPhase)) * animState.boopImpulse * 0.28) *
        s;

    const squash =
      1.0 +
      breath +
      Math.cos(animState.boopPhase * 2.0) * animState.boopImpulse * 0.12;

    const prevX = root.position.x;
    const prevY = root.position.y;
    const prevZ = root.position.z;
    const prevRotY = root.rotation.y;
    const prevRotZ = root.rotation.z;

    root.position.set(
      anchorPos.x + swayX,
      anchorPos.y + jumpY + hop,
      anchorPos.z
    );
    root.scale.set((1.0 / Math.sqrt(squash)) * s, squash * s, (1.0 / Math.sqrt(squash)) * s);
    root.rotation.y = facingYaw + animState.currentLook.x * 0.28 * bodyLookScale + Math.sin(animState.time * 0.85) * (isPlaced ? 0.02 : 0.04);
    root.rotation.x = facingPitch - animState.currentLook.y * 0.16 * bodyLookScale + Math.cos(animState.time * 1.7) * (isPlaced ? 0.02 : 0.03);
    root.rotation.z = -(swayX / s) * 0.25 + Math.sin(animState.boopPhase) * animState.boopImpulse * 0.12;

    // Velocity computation for GPGPU Verlet fur inertia
    animState.velocity.set(
      (root.position.x - prevX) / (safeDt * s),
      (root.position.y - prevY) / (safeDt * s),
      (root.position.z - prevZ) / (safeDt * s)
    );
    animState.angularVelocity.set(
      0,
      (root.rotation.y - prevRotY) / safeDt,
      (root.rotation.z - prevRotZ) / safeDt
    );
  }

  return {
    root,
    bodyMesh,
    bodyGeometry,
    skinMaterial: scalpMat,
    scalpMaterial: scalpMat,
    characterMesh,
    pickTargets,
    animState,
    setEnvironmentScale,
    triggerBoop,
    placeAt,
    resetPlacement,
    isPlaced: () => isPlaced,
    getAnchorPosition: () => anchorPos,
    update
  };
}
