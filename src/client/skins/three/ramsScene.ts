/**
 * 博朗 3D 场景引擎 — 从参考实现逐行移植。
 *
 * 源文件：`qiaomu-radio/src/NativeRadio.tsx`（再次提醒：参考的文件名与主题是**反的**，
 * `PlayerSkin.tsx` 里 `theme === "rams"` 渲染的才是 `NativeRadio.tsx`）。
 *
 * 参考的 rams 是**程序化建模**（`src/radioModel.ts`，无外部模型文件），所以这款不需要
 * 随包发 GLB —— 与 fantasy 恰好相反。
 *
 * 保真的部分：`createRadioModel()` 的全部图元与材质、RoomEnvironment + 阴影、相机与
 * 轨道控制、**CSS3DRenderer 把真 HTML 屏幕投影进 3D 机身**（参考的标志性做法）、
 * 三个控件（tune / volume / power）的射线拾取与拖拽、调台档位、按键弹簧形变、
 * 拆解视图、滚轮与键盘、指针捕获、滚出屏幕时的焦点与 inert 处理。
 *
 * 有意简化的部分：屏幕内容只保留"正在播放"这一屏（用我们自己的播放器状态渲染），
 * 参考那套 12 页机内菜单不移植——我们已有导航与屏幕组件，重复实现两套菜单没有意义。
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { CSS3DObject, CSS3DRenderer } from "three/addons/renderers/CSS3DRenderer.js";

import { clockwiseArc, clampVolume, detents, TUNING_DETENT, turnVolume, volumeAngle } from "../../../core/radioGestures";
import { pulsePressMotion, stepPressMotion, type PressMotion } from "./pressFeedback";
import { createRadioModel, RADIO_FLOOR, RADIO_SCREEN } from "./radioModel";

/** 屏幕上的四行文字，由调用方按当前语言算好（引擎不做 i18n）。 */
export type RamsScreen = {
  eyebrow: string;
  title: string;
  subtitle: string;
  status: string;
};

export type RamsVisual = { playing: boolean; muted: boolean; volume: number };

export type RamsSceneOptions = {
  menuElement?: HTMLElement;
  labels: { screen: string; power: string; volume: string; canvas: string };
  actions: {
    onToggle(): void;
    /** 调台档位，+1 / -1 一档。 */
    onTune(delta: number): void;
    onVolume(value: number): void;
    onMuteToggle(): void;
    onScreenMenu(): void;
  };
  announce(text: string): void;
  prefersReducedMotion(): boolean;
  /** 机位被重置（Home 键）时回调，让调用方把「拆解」状态一起收回。 */
  onReset(): void;
  onReady(): void;
  onFail(): void;
};

export type RamsSceneHandle = {
  menu(value: boolean): void;
  setScreen(screen: RamsScreen): void;
  setVisual(visual: RamsVisual): void;
  explode(value: boolean): void;
  reset(): void;
  dispose(): void;
};

/** 挂载场景；WebGL 不可用时返回 `null`，由调用方回退到无 3D 的呈现。 */
export function mountRamsScene(element: HTMLElement, options: RamsSceneOptions): RamsSceneHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch {
    options.onFail();
    return null;
  }

  let atHome = true;
  let expansion = 0;
  let expansionGoal = 0;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  element.appendChild(renderer.domElement);

  /*
   * 注意：rams 与 fantasy 的场景参数**不是一套**。第一次移植时我错用了 fantasy 那组
   * （homeDistance `max(4.1, 1.63/…)`、PCF 阴影、30x30 地面…），同条件 A/B 立刻暴露出来：
   * 机身只有参考的 56% 大（CSS3D 屏幕投影 170px vs 参考 291px，反推相机距离 3.97 vs 参考 2.32），
   * 阴影也过硬过深。下面每个值都取自 `NativeRadio.tsx:105-120`。
   */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 40);
  const homeDistance = () => Math.max(2.72, 1.05 / (Math.tan(THREE.MathUtils.degToRad(16)) * camera.aspect));
  camera.position.set(0.34, 0.22, homeDistance());

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1.3;
  controls.maxDistance = 7;
  controls.maxPolarAngle = Math.PI * 0.68;
  controls.update();

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.7;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x858678, 0.7));

  const light = new THREE.DirectionalLight(0xfff8e9, 2.2);
  light.position.set(-3, 5, 3);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 12 });
  light.shadow.normalBias = 0.015;
  light.shadow.bias = -0.0001;
  light.shadow.radius = 4;
  light.shadow.blurSamples = 8;
  scene.add(light);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.ShadowMaterial({ opacity: 0.22, color: 0x45503c }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = RADIO_FLOOR;
  floor.receiveShadow = true;
  scene.add(floor);

  const { device, parts, knobs } = createRadioModel();
  scene.add(device);

  // 机身屏幕：真 HTML，由 CSS3DRenderer 投影到 3D 空间里。
  const screenElement = document.createElement("div");
  screenElement.className = "native-glass";
  const screenRoot = document.createElement("button");
  screenRoot.type = "button";
  screenRoot.className = "native-now";
  screenRoot.setAttribute("data-rams-screen", "1");
  const line = (tag: "span" | "strong" | "small") => {
    const node = document.createElement(tag);
    screenRoot.appendChild(node);
    return node;
  };
  const eyebrowNode = line("span");
  const titleNode = line("strong");
  const subtitleNode = line("span");
  const statusNode = line("small");
  screenElement.appendChild(screenRoot);
  if (options.menuElement) {
    options.menuElement.className = "physical-menu-mount";
    options.menuElement.hidden = true;
    screenElement.appendChild(options.menuElement);
  }
  // 具名引用：dispose 必须移除**同一个**函数，否则监听器会留在已销毁的节点上。
  const onScreenClick = () => options.actions.onScreenMenu();
  screenRoot.addEventListener("click", onScreenClick);

  const css = new CSS3DRenderer();
  css.domElement.className = "native-css-scene";
  element.appendChild(css.domElement);
  const cssScene = new THREE.Scene();
  const screenObject = new CSS3DObject(screenElement);
  screenObject.position.set(RADIO_SCREEN.x, RADIO_SCREEN.y, RADIO_SCREEN.z);
  screenObject.scale.setScalar(RADIO_SCREEN.width / 900);
  cssScene.add(screenObject);

  const bounds = new THREE.Box3();
  const disposeTree = (object: THREE.Object3D) =>
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        Object.values(material).forEach((value) => {
          if (value instanceof THREE.Texture) value.dispose();
        });
        material.dispose();
      }
    });

  const aim = (position: [number, number, number], lookAt: [number, number, number]) => {
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    camera.position.set(...position);
    controls.target.set(...lookAt);
    controls.update();
    controls.enableDamping = damping;
  };
  let focused = false;
  let framing = false;
  let savedView: { position: THREE.Vector3; target: THREE.Vector3; atHome: boolean } | null = null;
  const cameraGoal = camera.position.clone();
  const targetGoal = controls.target.clone();
  const focusScreen = () => {
    options.menuElement?.style.setProperty("--physical-pixel", `${900 / Math.min(element.clientWidth * .84, 860)}px`);
    const target = device.localToWorld(new THREE.Vector3(RADIO_SCREEN.x, RADIO_SCREEN.y, RADIO_SCREEN.z));
    const distance = Math.max(.38, RADIO_SCREEN.width / (2 * Math.tan(THREE.MathUtils.degToRad(16)) * Math.min(camera.aspect * .84, 860 / Math.max(1, element.clientHeight))));
    targetGoal.copy(target);
    cameraGoal.copy(target).add(new THREE.Vector3(0, 0, distance));
    framing = true;
    controls.enabled = false;
  };
  const menu = (value: boolean) => {
    if (focused === value) return;
    focused = value;
    screenRoot.hidden = value;
    if (options.menuElement) options.menuElement.hidden = !value;
    if (value) {
      savedView = { position: camera.position.clone(), target: controls.target.clone(), atHome };
      atHome = false;
      expansionGoal = 0;
      controls.minDistance = .1;
      focusScreen();
      queueMicrotask(() => { if (focused) options.menuElement?.querySelector<HTMLElement>(".skin-screen")?.focus({ preventScroll: true }); });
    } else if (savedView) {
      cameraGoal.copy(savedView.position);
      targetGoal.copy(savedView.target);
      atHome = savedView.atHome;
      framing = true;
      screenRoot.focus({ preventScroll: true });
    }
  };
  const reset = () => {
    atHome = true;
    expansionGoal = 0;
    options.onReset();
    aim([0.34, 0.22, homeDistance()], [0, 0, 0]);
  };
  reset();

  const visual: RamsVisual = { playing: false, muted: false, volume: 0.6 };
  let visibleVolume = visual.volume;

  const ray = new THREE.Raycaster();
  /** 命中一个控件网格：往父级回溯到带 `userData.action` 的节点。 */
  const hit = (event: PointerEvent | WheelEvent): THREE.Object3D | undefined => {
    const rect = element.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    let object: THREE.Object3D | undefined = ray.intersectObjects(device.children, true)[0]?.object;
    while (object && !object.userData.action && object.parent !== device) object = object.parent ?? undefined;
    return object;
  };

  /** 在设备坐标系里的固定平面上求交，避免用正在旋转的旋钮自身坐标系。 */
  const knobPoint = (event: PointerEvent, action: string): number | null => {
    hit(event);
    const knob = knobs[action];
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(device.quaternion);
    if (Math.abs(ray.ray.direction.dot(normal)) < 0.16) return null;
    const center = device.localToWorld(knob.position.clone().add(new THREE.Vector3(0, 0, 0.04)));
    const point = ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(normal, center), new THREE.Vector3());
    if (!point) return null;
    device.worldToLocal(point).sub(knob.position);
    if (Math.hypot(point.x, point.y) < (action === "tune" ? 0.183 : 0.065) * 0.25) return null;
    return Math.atan2(point.y, point.x);
  };

  const pressMotion: Record<string, PressMotion> = {
    power: { depth: 0, velocity: 0, pulse: 0 },
    tune: { depth: 0, velocity: 0, pulse: 0 },
    volume: { depth: 0, velocity: 0, pulse: 0 },
  };

  let gesture:
    | {
        id: number;
        x: number;
        y: number;
        lastX: number;
        lastY: number;
        action: string;
        value: number;
        angle: number;
        lastAngle: number | null;
        circular: boolean;
        arc: number;
        steps: number;
        moved: boolean;
      }
    | null = null;

  const release = () => {
    if (gesture?.action === "tune") knobs.tune.rotation.z = gesture.angle - gesture.steps * TUNING_DETENT;
    gesture = null;
    controls.enabled = true;
  };

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || gesture) return;
    const action = hit(event)?.userData.action || "body";
    if (action === "body") {
      renderer.domElement.focus();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    controls.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    const angle = action === "tune" || action === "volume" ? knobPoint(event, action) : null;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      action,
      value: visibleVolume,
      angle: knobs[action]?.rotation.z || 0,
      lastAngle: angle,
      circular: angle !== null,
      arc: 0,
      steps: 0,
      moved: false,
    };
    renderer.domElement.classList.add("native-canvas-action");
  };

  const move = (event: PointerEvent) => {
    if (!gesture || gesture.id !== event.pointerId) {
      renderer.domElement.classList.toggle("native-canvas-action", Boolean(hit(event)?.userData.action));
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const active = gesture;
    const dx = event.clientX - active.lastX;
    const dy = event.clientY - active.lastY;
    active.moved ||= Math.hypot(event.clientX - active.x, event.clientY - active.y) > 4;
    if (!active.moved) return;
    active.lastX = event.clientX;
    active.lastY = event.clientY;
    if (active.action !== "volume" && active.action !== "tune") return;
    const angle = active.circular ? knobPoint(event, active.action) : null;
    const arc = active.circular
      ? angle !== null && active.lastAngle !== null
        ? clockwiseArc(active.lastAngle, angle)
        : 0
      : ((dx - dy) * Math.PI) / 150;
    active.lastAngle = angle;
    if (active.action === "volume") {
      active.value = turnVolume(active.value, arc);
      setVolume(active.value);
    } else {
      active.arc += arc;
      const steps = detents(active.arc);
      const delta = steps - active.steps;
      if (delta) options.actions.onTune(delta);
      active.steps = steps;
      knobs.tune.rotation.z = active.angle - active.arc;
    }
  };

  const up = (event: PointerEvent) => {
    const active = gesture?.id === event.pointerId ? gesture : null;
    if (active) {
      // `screen` 没有弹簧形变（`pressMotion` 只覆盖 power / tune / volume）。
      // 参考实现这里是直接索引，点中屏幕会抛 `Cannot read properties of undefined
      // (reading 'depth')`；它之所以没暴露，是因为 HTML 屏幕盖在画布上吃掉了指针事件。
      // 这里显式判空——我们自己的探针已经真的踩到并拿到了堆栈。
      const motion = pressMotion[active.action];
      if (motion) pressMotion[active.action] = pulsePressMotion(motion);
      release();
    }
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    renderer.domElement.classList.toggle("native-canvas-action", Boolean(hit(event)?.userData.action));
    if (!active || active.moved) return;
    if (active.action === "power" || active.action === "tune") options.actions.onToggle();
    if (active.action === "screen") options.actions.onScreenMenu();
    if (active.action === "volume") options.actions.onMuteToggle();
  };

  const cancel = (event: PointerEvent) => {
    if (gesture?.id === event.pointerId) release();
    renderer.domElement.classList.remove("native-canvas-action", "native-canvas-dragging");
  };

  const wheel = (event: WheelEvent) => {
    const action = hit(event)?.userData.action;
    if (action !== "volume" && action !== "tune") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    pressMotion[action] = pulsePressMotion(pressMotion[action]);
    if (action === "volume") setVolume(visibleVolume - Math.sign(event.deltaY) * 0.025);
    else options.actions.onTune(Math.sign(event.deltaY));
  };

  const keyboard = (event: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter", "m", "M", "Home"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") options.actions.onTune(event.key === "ArrowRight" ? 1 : -1);
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      setVolume(visibleVolume + (event.key === "ArrowUp" ? 0.025 : -0.025));
    } else if (event.key === "Home") reset();
    else if (event.key === "Enter") options.actions.onScreenMenu();
    else options.actions.onToggle();
  };

  const setVolume = (value: number) => {
    const next = clampVolume(value);
    visibleVolume = next;
    visual.volume = next;
    knobs.volume.rotation.z = volumeAngle(next);
    options.actions.onVolume(next);
    options.announce(`${options.labels.volume} ${Math.round(next * 100)}%`);
  };

  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("data-rams-canvas", "1");
  renderer.domElement.setAttribute("aria-label", options.labels.canvas);
  const orbitStart = () => {
    atHome = false;
    renderer.domElement.classList.add("native-canvas-dragging");
  };
  const orbitEnd = () => renderer.domElement.classList.remove("native-canvas-dragging");
  controls.addEventListener("start", orbitStart);
  controls.addEventListener("end", orbitEnd);
  renderer.domElement.addEventListener("keydown", keyboard);
  renderer.domElement.addEventListener("pointerdown", down, true);
  renderer.domElement.addEventListener("pointermove", move, true);
  renderer.domElement.addEventListener("pointerup", up, true);
  renderer.domElement.addEventListener("pointercancel", cancel, true);
  renderer.domElement.addEventListener("lostpointercapture", cancel, true);
  renderer.domElement.addEventListener("wheel", wheel, { passive: false, capture: true });

  const resize = new ResizeObserver(() => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    renderer.setSize(rect.width, rect.height);
    css.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    if (focused) focusScreen();
    else if (atHome) {
      camera.position.set(0.34, 0.22, homeDistance());
      controls.target.set(0, 0, 0);
      controls.update();
    }
  });
  resize.observe(element);

  let screen: RamsScreen = { eyebrow: "", title: "", subtitle: "", status: "" };
  const applyScreen = () => {
    eyebrowNode.textContent = screen.eyebrow;
    titleNode.textContent = screen.title;
    subtitleNode.textContent = screen.subtitle;
    statusNode.textContent = `${screen.status}　MENU ›`;
  };
  applyScreen();
  options.onReady();

  let previousFrame = performance.now();
  renderer.setAnimationLoop((time) => {
    const reduced = options.prefersReducedMotion();
    const speed = reduced ? 1 : 0.18;
    const delta = Math.min(Math.max((time - previousFrame) / 1000, 0), 0.05);
    previousFrame = time;
    if (framing) {
      const alpha = reduced ? 1 : 1 - Math.exp(-delta * 16);
      camera.position.lerp(cameraGoal, alpha);
      controls.target.lerp(targetGoal, alpha);
      if (camera.position.distanceTo(cameraGoal) < .001 && controls.target.distanceTo(targetGoal) < .001) {
        framing = false;
        controls.enabled = !focused;
        controls.minDistance = focused ? .1 : 1.3;
      }
    }
    controls.update();

    expansion += (expansionGoal - expansion) * speed;
    for (const action of ["power", "tune", "volume"]) {
      pressMotion[action] = stepPressMotion(pressMotion[action], gesture?.action === action, delta, reduced);
    }
    for (const part of parts) {
      part.mesh.position.copy(part.origin).addScaledVector(part.offset, expansion);
      for (const action of ["power", "tune", "volume"]) {
        if (part.mesh === knobs[action]) part.mesh.position.z -= pressMotion[action].depth;
      }
    }
    const powerMaterial = knobs.power.material as THREE.MeshStandardMaterial;
    powerMaterial.emissive.setHex(0x7a2c08);
    powerMaterial.emissiveIntensity = visual.playing ? 0.16 : pressMotion.power.pulse * 0.12;

    device.position.y = 0;
    device.updateMatrixWorld(true);
    bounds.setFromObject(device);
    device.position.y = Math.max(0, RADIO_FLOOR - bounds.min.y);
    device.updateMatrixWorld(true);

    screenObject.position.copy(device.localToWorld(new THREE.Vector3(RADIO_SCREEN.x, RADIO_SCREEN.y, RADIO_SCREEN.z)));
    screenObject.quaternion.copy(device.quaternion);
    const facing = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(device.quaternion)
      .dot(camera.position.clone().sub(screenObject.position).normalize());
    const visible = expansion < 0.02 && facing > 0.18;
    screenElement.classList.toggle("native-screen-hidden", !visible);
    screenElement.inert = !visible;

    renderer.render(scene, camera);
    css.render(cssScene, camera);
  });

  return {
    menu,
    setScreen(next) {
      screen = next;
      applyScreen();
    },
    setVisual(next) {
      visual.playing = next.playing;
      visual.muted = next.muted;
      visual.volume = clampVolume(next.volume);
      visibleVolume = next.muted ? 0 : visual.volume;
      knobs.volume.rotation.z = volumeAngle(visibleVolume);
    },
    explode(value) {
      // 只有目标状态**真的变化**时才改机位。参考只在用户点「拆解」时调用 `view.explode`；
      // 这里的调用方是 React 的 effect，挂载时也会以 `false` 调一次——若无条件改机位，
      // 初始画面就会被推到拆解视角（实测 CSS3D 屏幕投影 183px vs 参考 291px）。
      const goal = value ? 1 : 0;
      if (goal === expansionGoal) return;
      atHome = false;
      expansionGoal = goal;
      aim([1.5, 0.65, Math.max(3.8, homeDistance())], [0, 0, 0.1]);
    },
    reset,
    dispose() {
      resize.disconnect();
      renderer.setAnimationLoop(null);
      controls.removeEventListener("start", orbitStart);
      controls.removeEventListener("end", orbitEnd);
      controls.dispose();
      renderer.domElement.removeEventListener("keydown", keyboard);
      renderer.domElement.removeEventListener("pointerdown", down, true);
      renderer.domElement.removeEventListener("pointermove", move, true);
      renderer.domElement.removeEventListener("pointerup", up, true);
      renderer.domElement.removeEventListener("pointercancel", cancel, true);
      renderer.domElement.removeEventListener("lostpointercapture", cancel, true);
      renderer.domElement.removeEventListener("wheel", wheel, true);
      screenRoot.removeEventListener("click", onScreenClick);
      disposeTree(scene);
      environment.dispose();
      room.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      css.domElement.remove();
    },
  };
}