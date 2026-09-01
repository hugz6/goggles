// Sets up camera, renderer, controls and bloom.

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  Vector2,
  AmbientLight,
  DirectionalLight,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export interface Stage {
  scene: Scene;
  overlay: Scene; // rendered after bloom, so labels stay crisp
  camera: PerspectiveCamera;
  controls: OrbitControls;
  addFrameListener(cb: () => void): void;
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const scene = new Scene();
  scene.background = new Color(0x05060a);
  const overlay = new Scene();

  scene.add(new AmbientLight(0xffffff, 0.55));
  const keyLight = new DirectionalLight(0xffffff, 1.0);
  keyLight.position.set(1, 2, 1.5);
  scene.add(keyLight);

  const camera = new PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    6000, // galaxy spans far at this scale
  );
  camera.position.set(0, 640, 1120); // nebulae seen first

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap GPU cost
  renderer.setSize(window.innerWidth, window.innerHeight);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false; // movement is on the arrow keys

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(
      new Vector2(window.innerWidth, window.innerHeight),
      0.62, // strength
      0.62, // radius
      0.72, // threshold
    ),
  );

  function onResize(): void {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener("resize", onResize);

  const frameListeners: Array<() => void> = [];
  function animate(): void {
    requestAnimationFrame(animate);
    controls.update(); // required while damping is on
    for (const cb of frameListeners) {
      cb();
    }
    composer.render();
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(overlay, camera);
    renderer.autoClear = true;
  }
  animate();

  return {
    scene,
    overlay,
    camera,
    controls,
    addFrameListener: (cb) => frameListeners.push(cb),
  };
}
