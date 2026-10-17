import * as THREE from 'three';

/**
 * Procedural striped canvas texture for the mascot's iconic rainbow striped shirt
 * Matching the reference image: Red, Amber/Yellow, Sky Blue, Purple, and Hot Pink stripes.
 */
function createStripedShirtTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const stripeColors = [
    '#e63946', // Vibrant Red
    '#f59e0b', // Warm Amber/Yellow
    '#0ea5e9', // Crisp Sky Blue
    '#8b5cf6', // Royal Purple
    '#ec4899'  // Bubblegum / Magenta Pink
  ];

  const totalStripes = stripeColors.length * 2;
  const stripeH = canvas.height / totalStripes;

  for (let i = 0; i < totalStripes; i++) {
    ctx.fillStyle = stripeColors[i % stripeColors.length];
    ctx.fillRect(0, i * stripeH, canvas.width, stripeH + 1);

    // Subtle knit fabric highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.fillRect(0, i * stripeH, canvas.width, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0.0, Math.min(1.0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3.0 - 2.0 * t);
}

/**
 * Evaluates follicle density & length mask on the mascot.
 * Concentrated strictly on top of the mascot alien's head ("above mascot alien"):
 * - High (1.0..1.35) on the stylish pompadour crown and forehead tuft
 * - Smoothly tapers to 0 at the hairline, temples, and nape
 * - 0.0 across the face, ears, antenna, eyes, and body
 */
export function evaluateFollicleMask(x, y, z) {
  // Fur is exclusively on top of the alien mascot's head
  if (y < 1.05) {
    return 0.0;
  }

  const cx = 0.0;
  const cy = 0.95;
  const cz = 0.06;

  const dx = x - cx;
  const dy = y - cy;
  const dz = z - cz;

  // Front forehead cutoff so the alien face stays completely smooth and clean
  if (dz > 0.36 && dy < 0.28) {
    return 0.0;
  }

  // Antenna base exclusion (prevent hair poking through antenna)
  const distAntenna = Math.hypot(x + 0.22, y - 1.42, z - 0.08);
  if (distAntenna < 0.12) {
    return 0.0;
  }

  // Ear temple cutouts
  const earDistLeft = Math.hypot(x + 0.52, y - 1.05, z);
  const earDistRight = Math.hypot(x - 0.52, y - 1.05, z);
  if (earDistLeft < 0.24 || earDistRight < 0.24) {
    return 0.0;
  }

  // Taper near hairline rim
  const hairlineRim = smoothstep(1.06, 1.22, y);

  // Extra volume & length boost on the iconic pompadour crest (front-top tuft)
  const crestDist = Math.hypot(dx - 0.04, y - 1.48, dz - 0.22);
  const crestFluff = 1.0 + 0.32 * (1.0 - smoothstep(0.0, 0.38, crestDist));

  return Math.max(0.0, Math.min(1.35, hairlineRim * crestFluff));
}

/**
 * Computes biological hair flow tangent for the mascot pompadour tuft.
 * Hairs sweep gracefully up from the forehead, flowing backwards and to the right
 * in a handsome wavy crest, hugging the head silhouette.
 */
export function evaluateGroomFlow(x, y, z, nx, ny, nz) {
  // Upward and backward pompadour sweep (-z, +y) with a subtle diagonal parting (+x)
  let fx = 0.22 + x * 0.18;
  let fy = 0.35 * Math.max(0.0, 1.50 - y);
  let fz = -0.85;

  // Crown whorl swirl near the back-top (x = 0.06, z = -0.16)
  const whorlDx = x - 0.06;
  const whorlDz = z + 0.16;
  const whorlDist = Math.hypot(whorlDx, whorlDz);
  if (whorlDist < 0.42) {
    const influence = 1.0 - whorlDist / 0.42;
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
 * Sculpt the upper scalp dome into the mascot's iconic pompadour hair silhouette.
 */
function sculptMascotScalp(u, v, w) {
  // u, v, w are unit hemisphere/sphere coordinates
  let r = 0.54;

  // Forward & upward pompadour wave crest on top-front (v > 0.2, w > 0.0)
  const crestInfluence = Math.max(0.0, v * 0.68 + w * 0.62);
  const crestLift = Math.pow(crestInfluence, 2.8) * 0.20;

  // Gentle side temple volume
  const sideVolume = Math.pow(Math.abs(u), 2.2) * 0.035 * Math.max(0.0, v);

  r += crestLift + sideVolume;

  let x = u * r;
  let y = 0.95 + v * r * 1.05;
  let z = 0.06 + w * r;

  return [x, y, z];
}

/**
 * Builds continuous organic scalp geometry for the mascot fur system
 * with baked aFollicleMask and aGroomTangent attributes.
 */
export function createOrganicBlobGeometry(widthSegments = 84, heightSegments = 64) {
  // Use hemisphere/dome geometry concentrated over the scalp
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
 * Matching the uploaded reference image:
 * - Cheerful apple-green alien skin
 * - Expressive dark cartoon eyes with pupil depth & glossy catchlights
 * - Pointed alien/elf ears with inner ear detail
 * - Curved alien antenna with glowing tip sphere & dynamic spring physics
 * - Vibrant rainbow striped t-shirt & denim blue shorts
 * - Seated hands resting on knees
 * - Chunky stylish white sneakers
 * - Seated on a warm yellow cube block
 * - Sculpted scalp on top with dynamic 64-shell + 60k-strand mascot fur system
 */
export function createBlobCreature() {
  const root = new THREE.Group();
  root.name = 'AlienMascotCreature';

  // ---------------------------------------------------------------------------
  // Materials
  // ---------------------------------------------------------------------------
  const alienSkinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#62c424'), // Bright, joyful apple/lime alien green
    roughness: 0.52,
    metalness: 0.02
  });

  const innerEarMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#4eb31a'),
    roughness: 0.65
  });

  const scalpMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#22140e'), // Dark espresso brown matching fur roots
    roughness: 0.76,
    metalness: 0.02
  });

  const shirtTex = createStripedShirtTexture();
  const shirtMat = new THREE.MeshStandardMaterial({
    map: shirtTex,
    roughness: 0.72,
    metalness: 0.01
  });

  const collarMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e63946'), // Red collar
    roughness: 0.68
  });

  const shortsMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#385f8e'), // Denim blue
    roughness: 0.82
  });

  const sneakerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f8fafc'), // Clean white
    roughness: 0.45,
    metalness: 0.05
  });

  const sneakerTrimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#cbd5e1'), // Light gray sole line & laces
    roughness: 0.65
  });

  const pedestalMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f2bd34'), // Warm golden yellow cube
    roughness: 0.44,
    metalness: 0.03
  });

  const eyeCorneaMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0c0910'),
    roughness: 0.02,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    reflectivity: 1.0
  });

  const eyeIrisMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#2c1e44') // Warm violet-emerald crescent
  });

  const catchlightMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff')
  });

  const mouthCavityMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#2e0b17')
  });

  const tongueMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#f472b6')
  });

  const antennaBulbMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#7ced2e'),
    emissive: new THREE.Color('#3ca510'),
    emissiveIntensity: 0.45,
    roughness: 0.28,
    metalness: 0.05
  });

  const pickTargets = [];

  // ---------------------------------------------------------------------------
  // 1. Warm Yellow Seated Pedestal Cube (from reference image)
  // ---------------------------------------------------------------------------
  const cubeGeo = new THREE.BoxGeometry(1.42, 0.88, 1.35, 8, 8, 8);
  const pedestalMesh = new THREE.Mesh(cubeGeo, pedestalMat);
  pedestalMesh.name = 'YellowPedestal';
  pedestalMesh.position.set(0, -0.66, -0.05);
  pedestalMesh.castShadow = true;
  pedestalMesh.receiveShadow = true;
  root.add(pedestalMesh);
  pickTargets.push(pedestalMesh);

  // ---------------------------------------------------------------------------
  // 2. Seated Torso & Clothing
  // ---------------------------------------------------------------------------
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'MascotBodyGroup';
  root.add(bodyGroup);

  // Denim Blue Shorts (sitting flush on top of yellow cube at y = -0.22)
  const shortsGeo = new THREE.CylinderGeometry(0.48, 0.50, 0.32, 32);
  const shortsMesh = new THREE.Mesh(shortsGeo, shortsMat);
  shortsMesh.position.set(0, -0.08, 0.05);
  shortsMesh.castShadow = true;
  shortsMesh.receiveShadow = true;
  bodyGroup.add(shortsMesh);
  pickTargets.push(shortsMesh);

  // Striped T-Shirt Torso
  const torsoGeo = new THREE.CylinderGeometry(0.44, 0.47, 0.54, 32);
  const torsoMesh = new THREE.Mesh(torsoGeo, shirtMat);
  torsoMesh.position.set(0, 0.30, 0.05);
  torsoMesh.castShadow = true;
  torsoMesh.receiveShadow = true;
  bodyGroup.add(torsoMesh);
  pickTargets.push(torsoMesh);

  // Collar Ring
  const collarGeo = new THREE.TorusGeometry(0.24, 0.038, 12, 28);
  const collarMesh = new THREE.Mesh(collarGeo, collarMat);
  collarMesh.position.set(0, 0.57, 0.05);
  collarMesh.rotation.x = Math.PI / 2;
  bodyGroup.add(collarMesh);

  // T-Shirt Short Sleeves
  for (const side of [-1, 1]) {
    const sleeveGeo = new THREE.CylinderGeometry(0.16, 0.18, 0.22, 20);
    const sleeve = new THREE.Mesh(sleeveGeo, shirtMat);
    sleeve.position.set(side * 0.42, 0.36, 0.06);
    sleeve.rotation.z = side * 0.45;
    sleeve.rotation.x = -0.15;
    bodyGroup.add(sleeve);
  }

  // Chubby Green Arms with Hands resting gently on knees
  for (const side of [-1, 1]) {
    // Upper arm
    const armGeo = new THREE.CylinderGeometry(0.12, 0.11, 0.36, 18);
    const arm = new THREE.Mesh(armGeo, alienSkinMat);
    arm.position.set(side * 0.42, 0.20, 0.16);
    arm.rotation.z = side * 0.25;
    arm.rotation.x = -0.55;
    arm.castShadow = true;
    bodyGroup.add(arm);

    // Chubby Hand resting on knee/thigh
    const handGeo = new THREE.SphereGeometry(0.11, 18, 14);
    handGeo.scale(1.0, 0.65, 1.25);
    const hand = new THREE.Mesh(handGeo, alienSkinMat);
    hand.position.set(side * 0.30, -0.07, 0.46);
    hand.rotation.x = 0.18;
    hand.rotation.y = -side * 0.15;
    hand.castShadow = true;
    bodyGroup.add(hand);

    // Cute finger bumps
    for (let f = -1; f <= 1; f++) {
      const fingerGeo = new THREE.SphereGeometry(0.034, 10, 8);
      const finger = new THREE.Mesh(fingerGeo, alienSkinMat);
      finger.position.set(side * 0.30 + f * 0.038, -0.09, 0.56);
      bodyGroup.add(finger);
    }
  }

  // Seated Chubby Green Legs & White Sneakers
  for (const side of [-1, 1]) {
    // Thigh extending forward from shorts
    const thighGeo = new THREE.CylinderGeometry(0.16, 0.15, 0.36, 18);
    const thigh = new THREE.Mesh(thighGeo, alienSkinMat);
    thigh.position.set(side * 0.28, -0.10, 0.26);
    thigh.rotation.x = Math.PI / 2;
    thigh.castShadow = true;
    bodyGroup.add(thigh);

    // Calf hanging down in front of yellow block
    const calfGeo = new THREE.CylinderGeometry(0.14, 0.13, 0.42, 18);
    const calf = new THREE.Mesh(calfGeo, alienSkinMat);
    calf.position.set(side * 0.28, -0.38, 0.42);
    calf.castShadow = true;
    bodyGroup.add(calf);

    // Chunky White Sneaker
    const shoeGroup = new THREE.Group();
    shoeGroup.position.set(side * 0.28, -0.66, 0.54);

    // Main sneaker body
    const shoeMainGeo = new THREE.SphereGeometry(0.17, 20, 16);
    shoeMainGeo.scale(1.05, 0.95, 1.45);
    const shoeMain = new THREE.Mesh(shoeMainGeo, sneakerMat);
    shoeMain.castShadow = true;
    shoeGroup.add(shoeMain);

    // Thick Sole
    const soleGeo = new THREE.BoxGeometry(0.34, 0.08, 0.52);
    const sole = new THREE.Mesh(soleGeo, sneakerTrimMat);
    sole.position.set(0, -0.11, 0.02);
    sole.castShadow = true;
    shoeGroup.add(sole);

    // Front Toe Cap
    const toeGeo = new THREE.SphereGeometry(0.13, 16, 12);
    toeGeo.scale(1.08, 0.65, 0.9);
    const toe = new THREE.Mesh(toeGeo, sneakerMat);
    toe.position.set(0, -0.04, 0.16);
    shoeGroup.add(toe);

    // Laces band
    const laceGeo = new THREE.BoxGeometry(0.18, 0.025, 0.16);
    const lace = new THREE.Mesh(laceGeo, sneakerTrimMat);
    lace.position.set(0, 0.09, 0.02);
    lace.rotation.x = -0.3;
    shoeGroup.add(lace);

    bodyGroup.add(shoeGroup);
  }

  // ---------------------------------------------------------------------------
  // 3. Alien Mascot Head & Facial Features
  // ---------------------------------------------------------------------------
  const headGroup = new THREE.Group();
  headGroup.name = 'AlienHeadGroup';
  root.add(headGroup);

  // Cute pear-shaped alien head base
  const headGeo = new THREE.SphereGeometry(0.56, 48, 36);
  headGeo.scale(0.98, 1.04, 0.96);
  const headMesh = new THREE.Mesh(headGeo, alienSkinMat);
  headMesh.name = 'AlienHeadBase';
  headMesh.position.set(0, 0.95, 0.05);
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headGroup.add(headMesh);
  pickTargets.push(headMesh);

  // Scalp / Mascot Fur Base Dome (covered by 64 volumetric shells + 60k strands)
  const bodyGeometry = createOrganicBlobGeometry(84, 64);
  const bodyMesh = new THREE.Mesh(bodyGeometry, scalpMat);
  bodyMesh.name = 'MascotScalpMesh';
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  root.add(bodyMesh);
  pickTargets.push(bodyMesh);

  // Pointed Alien / Elf Ears (on sides of the head)
  for (const side of [-1, 1]) {
    const earGroup = new THREE.Group();
    earGroup.position.set(side * 0.52, 0.94, -0.02);
    earGroup.rotation.y = side * 0.35;
    earGroup.rotation.z = side * 0.18;
    earGroup.rotation.x = -0.08;

    // Sculpted pointed ear cone
    const earPinnaGeo = new THREE.ConeGeometry(0.18, 0.44, 20);
    earPinnaGeo.scale(0.85, 1.0, 0.48);
    const earPinna = new THREE.Mesh(earPinnaGeo, alienSkinMat);
    earPinna.position.set(side * 0.16, 0.04, 0);
    earPinna.rotation.z = -side * (Math.PI / 2 - 0.25);
    earPinna.castShadow = true;
    earGroup.add(earPinna);

    // Inner ear fossa depression
    const innerEarGeo = new THREE.ConeGeometry(0.12, 0.32, 16);
    innerEarGeo.scale(0.8, 1.0, 0.28);
    const innerEar = new THREE.Mesh(innerEarGeo, innerEarMat);
    innerEar.position.set(side * 0.14, 0.04, 0.025);
    innerEar.rotation.z = -side * (Math.PI / 2 - 0.25);
    earGroup.add(innerEar);

    headGroup.add(earGroup);
  }

  // Cute Curved Alien Antenna with glowing tip bulb
  const antennaPivot = new THREE.Group();
  antennaPivot.name = 'AntennaPivot';
  antennaPivot.position.set(-0.20, 1.40, 0.08);

  // Smooth S-curved tube for antenna stem
  const antennaCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.06, 0.12, 0.01),
    new THREE.Vector3(-0.16, 0.24, -0.01),
    new THREE.Vector3(-0.28, 0.32, 0.0)
  ]);
  const antennaTubeGeo = new THREE.TubeGeometry(antennaCurve, 24, 0.026, 12, false);
  const antennaStem = new THREE.Mesh(antennaTubeGeo, alienSkinMat);
  antennaStem.castShadow = true;
  antennaPivot.add(antennaStem);

  // Glowing Lime-Green Bulb on the tip
  const bulbGeo = new THREE.SphereGeometry(0.085, 24, 18);
  const antennaBulb = new THREE.Mesh(bulbGeo, antennaBulbMat);
  antennaBulb.position.set(-0.28, 0.32, 0.0);
  antennaBulb.castShadow = true;
  antennaPivot.add(antennaBulb);

  headGroup.add(antennaPivot);

  // Big Expressive Dark Cartoon Eyes
  const eyes = [];
  for (const side of [-1, 1]) {
    const eyePivot = new THREE.Group();
    eyePivot.position.set(side * 0.24, 0.98, 0.52);
    eyePivot.rotation.y = side * 0.16;

    // Deep glossy cornea
    const eyeballGeo = new THREE.SphereGeometry(0.145, 28, 22);
    eyeballGeo.scale(0.96, 1.04, 0.65);
    const eyeball = new THREE.Mesh(eyeballGeo, eyeCorneaMat);
    eyePivot.add(eyeball);

    // Warm lower iris crescent
    const irisGeo = new THREE.SphereGeometry(0.11, 20, 14);
    irisGeo.scale(0.92, 0.92, 0.35);
    const iris = new THREE.Mesh(irisGeo, eyeIrisMat);
    iris.position.set(0, -0.02, 0.075);
    eyePivot.add(iris);

    // Large anime catchlight (top-inner)
    const catchlightMainGeo = new THREE.SphereGeometry(0.042, 16, 12);
    catchlightMainGeo.scale(1.0, 1.15, 0.3);
    const catchlightMain = new THREE.Mesh(catchlightMainGeo, catchlightMat);
    catchlightMain.position.set(-side * 0.038, 0.045, 0.095);
    eyePivot.add(catchlightMain);

    // Secondary rim catchlight
    const catchlightSubGeo = new THREE.SphereGeometry(0.022, 12, 10);
    catchlightSubGeo.scale(1.0, 1.0, 0.3);
    const catchlightSub = new THREE.Mesh(catchlightSubGeo, catchlightMat);
    catchlightSub.position.set(side * 0.042, -0.042, 0.092);
    eyePivot.add(catchlightSub);

    // Subtle green eyelid crease
    const eyelidGeo = new THREE.TorusGeometry(0.13, 0.016, 8, 20, Math.PI * 0.75);
    const eyelid = new THREE.Mesh(eyelidGeo, alienSkinMat);
    eyelid.position.set(0, 0.05, 0.08);
    eyelid.rotation.z = side * 0.15;
    eyePivot.add(eyelid);

    headGroup.add(eyePivot);
    eyes.push({
      pivot: eyePivot,
      catchlightMain,
      catchlightSub,
      side
    });
  }

  // Cute Green Alien Button Nose
  const noseGeo = new THREE.SphereGeometry(0.042, 16, 12);
  noseGeo.scale(1.2, 0.9, 0.75);
  const nose = new THREE.Mesh(noseGeo, alienSkinMat);
  nose.position.set(0, 0.88, 0.58);
  headGroup.add(nose);

  // Joyful Smiling Open Mouth with rosy pink tongue
  const mouthGroup = new THREE.Group();
  mouthGroup.position.set(0, 0.76, 0.53);

  // Mouth cavity recess
  const mouthGeo = new THREE.SphereGeometry(0.095, 20, 16);
  mouthGeo.scale(1.25, 0.75, 0.5);
  const mouthCavity = new THREE.Mesh(mouthGeo, mouthCavityMat);
  mouthGroup.add(mouthCavity);

  // Pink Tongue
  const tongueGeo = new THREE.SphereGeometry(0.065, 16, 12);
  tongueGeo.scale(1.15, 0.5, 0.8);
  const tongue = new THREE.Mesh(tongueGeo, tongueMat);
  tongue.position.set(0, -0.035, 0.025);
  mouthGroup.add(tongue);

  // Smiling upper lip line
  const lipArcGeo = new THREE.TorusGeometry(0.11, 0.015, 8, 24, Math.PI * 0.8);
  const lipMesh = new THREE.Mesh(lipArcGeo, alienSkinMat);
  lipMesh.position.set(0, 0.01, 0.045);
  lipMesh.rotation.x = Math.PI * 0.85;
  mouthGroup.add(lipMesh);

  headGroup.add(mouthGroup);

  // ---------------------------------------------------------------------------
  // Animation, Dynamic Spring Physics & Gaze Tracking
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

  // Antenna spring physics state
  const antennaSpring = {
    rotZ: 0,
    rotX: 0,
    velZ: 0,
    velX: 0
  };

  // Spatial anchor state for AR mode
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
    // Energetic antenna wobble kick
    antennaSpring.velZ += 8.5;
    antennaSpring.velX += 4.5;
  }

  function update(dt, pointerNDC, cameraPos = null, isARMode = false) {
    const safeDt = Math.min(Math.max(dt, 0.001), 0.05);
    animState.time += safeDt;

    if (faceViewerHoldTimer > 0) {
      faceViewerHoldTimer = Math.max(0, faceViewerHoldTimer - safeDt);
    }

    // Pointer eye tracking
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
    const breath = Math.sin(animState.time * 2.2) * 0.025;
    const bodyLookScale = (isPlaced || isARMode) ? (faceViewerHoldTimer > 0 ? 0.0 : 0.06) : 1.0;
    const swayX = (Math.sin(animState.time * 1.3) * 0.04 + animState.currentLook.x * 0.12 * bodyLookScale) * s;
    const jumpY =
      (Math.sin(animState.time * 2.2) * 0.035 +
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
    root.rotation.y = facingYaw + animState.currentLook.x * 0.32 * bodyLookScale + Math.sin(animState.time * 0.85) * (isPlaced ? 0.02 : 0.05);
    root.rotation.x = facingPitch - animState.currentLook.y * 0.18 * bodyLookScale + Math.cos(animState.time * 1.7) * (isPlaced ? 0.02 : 0.035);
    root.rotation.z = -(swayX / s) * 0.30 + Math.sin(animState.boopPhase) * animState.boopImpulse * 0.14;

    // Head subtle secondary tilt
    headGroup.rotation.y = animState.currentLook.x * 0.22;
    headGroup.rotation.x = -animState.currentLook.y * 0.14;

    // Antenna dynamic damped harmonic spring simulation
    const springK = 38.0;
    const dampK = 5.8;
    const targetAntennaRotZ = Math.sin(animState.time * 2.5) * 0.06 - swayX * 0.8;
    const targetAntennaRotX = Math.cos(animState.time * 2.1) * 0.04 - jumpY * 0.6;

    const forceZ = -springK * (antennaSpring.rotZ - targetAntennaRotZ) - dampK * antennaSpring.velZ;
    const forceX = -springK * (antennaSpring.rotX - targetAntennaRotX) - dampK * antennaSpring.velX;
    antennaSpring.velZ += forceZ * safeDt;
    antennaSpring.velX += forceX * safeDt;
    antennaSpring.rotZ += antennaSpring.velZ * safeDt;
    antennaSpring.rotX += antennaSpring.velX * safeDt;

    antennaPivot.rotation.z = antennaSpring.rotZ;
    antennaPivot.rotation.x = antennaSpring.rotX;

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

    // Blinking animation
    animState.blinkTimer += safeDt;
    let blinkScaleY = 1.0;
    if (animState.blinkTimer > animState.nextBlink) {
      const blinkProgress = (animState.blinkTimer - animState.nextBlink) / 0.16;
      if (blinkProgress < 1.0) {
        blinkScaleY = Math.max(0.06, Math.abs(Math.cos(blinkProgress * Math.PI)));
      } else {
        animState.blinkTimer = 0;
        animState.nextBlink = 2.4 + Math.random() * 2.6;
      }
    }
    if (animState.boopImpulse > 0.25) {
      blinkScaleY = Math.min(blinkScaleY, 0.16); // Happy squint
    }

    for (const eye of eyes) {
      eye.pivot.scale.y = blinkScaleY;
      eye.catchlightMain.position.x = -eye.side * 0.038 + animState.currentLook.x * 0.024;
      eye.catchlightMain.position.y = 0.045 + animState.currentLook.y * 0.022;
    }
  }

  return {
    root,
    headGroup,
    bodyMesh,
    bodyGeometry,
    skinMaterial: scalpMat, // Expose scalpMat as skinMaterial so simState.baseColor updates roots seamlessly
    scalpMaterial: scalpMat,
    alienSkinMaterial: alienSkinMat,
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
