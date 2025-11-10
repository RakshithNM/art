import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

let scene, camera, renderer, composer, controls;
let core, petalsGroup;
const clock = new THREE.Clock();

const allPetals = [];

function init() {
  scene = new THREE.Scene();

  // Create a small in-memory gradient canvas for background
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512; // Height determines smoothness of vertical gradient
  const context = canvas.getContext('2d');
  // Gradient from top (0, 0) to bottom (0, h)
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#000515'); // Top color (Deep Blue)
  gradient.addColorStop(1, '#1a0a25'); // Bottom color (Dark Purple/Black)
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  scene.background = new THREE.CanvasTexture(canvas);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 3, 8);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  document.body.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.5;

  const coreGeometry = new THREE.SphereGeometry(1.2, 32, 32);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffdd88,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending
  });
  core = new THREE.Mesh(coreGeometry, coreMaterial);
  scene.add(core);

  petalsGroup = new THREE.Group();
  scene.add(petalsGroup);

  const numPetals = 40;
  const petalWidth = 0.8;
  const petalThickness = 0.05;
  const basePetalLength = 4;

  const petalMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xff3300,
    emissive: 0x551100,
    roughness: 0.15,
    metalness: 0.2,
    transmission: 0.9,
    ior: 1.4,
    thickness: 0.2,
    clearcoat: 1.0,
    side: THREE.DoubleSide // Helps them look better from all angles
  });

  for(let i = 0; i < numPetals; i++) {
    const currentPetalLength = basePetalLength * (0.7 + Math.random() * 0.6);

    const basePetalGeometry = new THREE.BoxGeometry(petalWidth, currentPetalLength, petalThickness, 1, 15, 1);
    basePetalGeometry.translate(0, currentPetalLength / 2, 0);

    // CLONE geometry for each petal so they can bend individually
    const thisPetalGeo = basePetalGeometry.clone();

    // Store original positions for the wave animation later
    thisPetalGeo.userData.originalPositions = thisPetalGeo.attributes.position.array.slice();

    const petal = new THREE.Mesh(thisPetalGeo, petalMaterial);

    const angle = (i / numPetals) * Math.PI * 2;
    const radius = 1.3; // Start right at the core surface

    // Position groups to arranged in a circle
    petal.position.x = Math.cos(angle) * radius;
    petal.position.y = Math.sin(angle) * radius;

    // Rotate to point outwards
    petal.rotation.z = angle - Math.PI / 2;

    // Add a slight varied initial tilt for more organic look
    petal.rotation.x = (Math.random() - 0.5) * 0.5;

    // Store some data for individual animation timing
    petal.userData.index = i;
    petal.userData.speedOffset = Math.random() * 5;
    petal.userData.petalLength = currentPetalLength;

    petalsGroup.add(petal);
    allPetals.push(petal);
  }

  // --- Lighting ---
  scene.add(new THREE.AmbientLight(0x111111));
  const coreLight = new THREE.PointLight(0xffaa00, 1, 15);
  scene.add(coreLight);

  const dirLight1 = new THREE.DirectionalLight(0xffaa00, 0.8);
  dirLight1.position.set(5, 10, 5);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x0066ff, 0.5);
  dirLight2.position.set(-5, -10, 2);
  scene.add(dirLight2);

  // --- Post-processing ---
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.5, 0.8);
  composer.addPass(bloomPass);

  /* ----- Rotate perpendicular ----- */
  // 1. Create a master group
  const bloomObject = new THREE.Group();
  scene.add(bloomObject);

  // 2. Add your existing components to this group INSTEAD of the scene
  bloomObject.add(core);
  bloomObject.add(petalsGroup);

  // 3. Rotate the master group 90 degrees around the X or Y axis
  bloomObject.rotation.x = Math.PI / 2;

  window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
  requestAnimationFrame(animate);
  const time = clock.getElapsedTime();

  core.scale.setScalar(1 + Math.sin(time * 2.5) * 0.03);

  // --- CPU VERTEX ANIMATION LOOP ---
  // This can be heavy if you have thousands of petals, but fine for ~50.
  allPetals.forEach(petal => {
    const positions = petal.geometry.attributes.position;
    const originalPositions = petal.geometry.userData.originalPositions;
    const idx = petal.userData.index;
    const speed = petal.userData.speedOffset;

    for(let i = 0; i < positions.count; i++) {
      // Get original coordinates
      const px = originalPositions[i * 3];
      const py = originalPositions[i * 3 + 1];
      const pz = originalPositions[i * 3 + 2];

      // THE WAVE FORMULA:
      // We only want to move the Z axis (relative to the petal flat surface).
      // py is the distance from the base (0 to 4).
      // We multiply the wave by py so the base doesn't move (0 * wave = 0), but the tip moves a lot.

      const waveHeight = 0.3; // How extreme the bend is
      const waveFrequency = 1.5; // How many "ripples" are along the petal
      const waveSpeed = 2.0;

      // Calculate flow based on time, position along petal (py), and unique petal index
      const flow = Math.sin(time * waveSpeed + py * waveFrequency + idx + speed) * waveHeight * (py / 4);

      positions.setZ(i, pz + flow);
    }

    // Tell Three.js to update the geometry on the GPU
    positions.needsUpdate = true;

    // Optional: recompute normals for correct lighting on bent surfaces. 
    // Can be expensive, comment out if too slow.
    petal.geometry.computeVertexNormals();
  });

  petalsGroup.rotation.z = time * 0.05;

  controls.update();
  composer.render();
}

init();
animate();
