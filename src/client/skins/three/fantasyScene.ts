/**
 * 魔兽世界 3D 场景引擎 — 从参考实现逐行移植。
 *
 * 源文件：`qiaomu-radio/src/RamsRadio.tsx`（文件名与主题是**反的**：参考的
 * `PlayerSkin.tsx` 里 `theme === "fantasy"` 渲染的是 `RamsRadio.tsx`，加载
 * `qiaomu-fantasy-radio-hyper3d-v2.glb`；而 `theme === "rams"` 渲染 `NativeRadio.tsx`
 * 的程序化机身。这里是前者。）
 *
 * 为什么是"框架无关引擎"而不是 React 组件：参考实现把 three.js 场景、机内菜单、
 * 手势与 i18n 全塞在一个 232 行组件里。本仓库的皮肤契约要求皮肤只做渲染
 * （`docs/CONTRACTS.md` §4），场景生命周期需要独立于 React 重渲染，所以这里导出
 * 命令式句柄，由 `FantasySkin.ts` 负责挂载与状态推送。
 *
 * 保真的部分：模型归一化、材质与光照、PMREM 环境、阴影、相机与轨道、画布屏幕、
 * 喇叭发光与活塞动画、五个实体按键的射线拾取、按下形变、滚轮/键盘、指针捕获。
 * 有意简化的部分：屏幕按下不再进入参考那套 11 页机内菜单，而是交给调用方
 * （我们已有自己的导航与屏幕内容，重复实现两套菜单没有意义）。
 */

import * as THREE from "three";
import { createSurfaceSampler } from "./surfaceSampler";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { stepSpeakerMotion, speakerExcursion, speakerVisual } from "../../../core/fantasySpeakerMotion";
import { clampVolume, clockwiseArc, turnVolume } from "../../../core/radioGestures";
import {
  bindFantasyPress,
  bindFantasySpeakers,
  fantasyActionAt,
  normalizeFantasyModel,
  surfacePatch,
  FANTASY_CONTROLS,
  FANTASY_SCREEN,
  FANTASY_SPEAKERS,
  type FantasyAction,
} from "./fantasySurface";
import { pulsePressMotion, stepPressMotion, type PressMotion } from "./pressFeedback";

/** 屏幕四行文字，由调用方按当前语言算好（引擎不做 i18n）。 */
export type FantasyLines = [string, string, string, string];

export type FantasyVisual = {
  playing: boolean;
  liked: boolean;
  muted: boolean;
  volume: number;
};

export type FantasySceneOptions = {
  /** GLB 的 URL（宿主路由下的同源地址）。 */
  modelUrl: string;
  /** 每个实体按键的可访问名称，用于动效文案。 */
  labels: Record<FantasyAction, string>;
  actions: {
    onToggle(): void;
    onPrevious(): void;
    onNext(): void;
    onLike(): void;
    onVolume(value: number): void;
    onScreenMenu(): void;
  };
  /** 交互反馈文案（"已收藏""音量 62%"…）。 */
  announce(text: string): void;
  prefersReducedMotion(): boolean;
  onReady(): void;
  onFail(): void;
};

export type FantasySceneHandle = {
  setLines(lines: FantasyLines): void;
  setVisual(visual: FantasyVisual): void;
  reset(): void;
  dispose(): void;
};

/** 画布屏幕的内部分辨率（参考实现同值）。 */
const SCREEN_CANVAS = { width: 1200, height: 438 };

/**
 * 挂载场景。WebGL 不可用时返回 `null`（由调用方回退到无 3D 的呈现），
 * 这与参考实现自身的 three.js 失败兜底一致。
 */
export function mountFantasyScene(
  element: HTMLElement,
  options: FantasySceneOptions,
): FantasySceneHandle | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  } catch {
    options.onFail();
    return null;
  }

  let disposed = false;
  let loaded = false;
  let focused = false;
  let atHome = true;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  element.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 30);
  const homeDistance = () => Math.max(4.1, 1.63 / (Math.tan(THREE.MathUtils.degToRad(16)) * camera.aspect));
  camera.position.set(0, 0.25, 4.1);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.2, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 1;
  controls.maxDistance = 10;
  controls.maxPolarAngle = Math.PI * 0.68;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.75;
  scene.add(new THREE.HemisphereLight(0xe2eaff, 0x30221b, 0.7));

  const light = new THREE.DirectionalLight(0xffe2ae, 2);
  light.position.set(-3, 5, 4);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  Object.assign(light.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 12 });
  light.shadow.bias = -0.0002;
  light.shadow.normalBias = 0.003;
  scene.add(light);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ opacity: 0.3 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.525;
  floor.receiveShadow = true;
  scene.add(floor);

  const device = new THREE.Group();
  scene.add(device);

  let model: THREE.Object3D | null = null;
  let deform: ReturnType<typeof bindFantasyPress> | null = null;
  let speakers: ReturnType<typeof bindFantasySpeakers> | null = null;
  const speakerVisuals: Array<{ mesh: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>; baseZ: number }> = [];
  let speakerMotion = { level: 0, phase: 0 };
  let initialVolume: number | null = null;
  const visual: FantasyVisual = { playing: false, liked: false, muted: false, volume: 0.6 };

  const canvas = document.createElement("canvas");
  canvas.width = SCREEN_CANVAS.width;
  canvas.height = SCREEN_CANVAS.height;
  const context = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  let display: THREE.Mesh | null = null;

  const feedback = new Map<string, { patch: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>; motion: PressMotion }>();
  const pressDepthFeedback = { text: "", until: 0 };
  const announce = (text: string) => {
    pressDepthFeedback.text = text;
    pressDepthFeedback.until = Date.now() + 1500;
    options.announce(text);
  };

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = 128;
  maskCanvas.height = 128;
  const maskContext = maskCanvas.getContext("2d")!;
  maskContext.fillStyle = "black";
  maskContext.fillRect(0, 0, 128, 128);
  const glowGradient = maskContext.createRadialGradient(64, 64, 25, 64, 64, 64);
  glowGradient.addColorStop(0, "white");
  glowGradient.addColorStop(1, "black");
  maskContext.fillStyle = glowGradient;
  maskContext.fillRect(0, 0, 128, 128);
  const mask = new THREE.CanvasTexture(maskCanvas);

  const disposeTree = (object: THREE.Object3D) => {
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
  };

  new GLTFLoader().load(
    options.modelUrl,
    (gltf) => {
      if (disposed) {
        disposeTree(gltf.scene);
        return;
      }
      try {
        model = gltf.scene;
        device.add(model);
        normalizeFantasyModel(model);
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        const sample = createSurfaceSampler(model);
        const screen = FANTASY_SCREEN;
        display = new THREE.Mesh(
          surfacePatch(model, screen.x, screen.y, screen.width, screen.height, 32, 0.04, sample),
          new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
        );
        device.add(display);

        for (const control of FANTASY_CONTROLS) {
          const patch = new THREE.Mesh(
            surfacePatch(model, control.x, control.y, control.radius * 1.5, control.radius * 1.5, 12, 0, sample),
            new THREE.MeshBasicMaterial({
              color: control.color,
              alphaMap: mask,
              transparent: true,
              opacity: 0,
              depthWrite: false,
              toneMapped: false,
              blending: THREE.AdditiveBlending,
            }),
          );
          device.add(patch);
          feedback.set(control.action, { patch, motion: { depth: 0, velocity: 0, pulse: 0 } });
        }

        FANTASY_SPEAKERS.forEach((speaker, index) => {
          const face = sample(speaker.x, speaker.y);
          if (!face) return;
          const glowCanvas = document.createElement("canvas");
          glowCanvas.width = glowCanvas.height = 128;
          const glowContext = glowCanvas.getContext("2d")!;
          const gradient = glowContext.createRadialGradient(64, 64, 3, 64, 64, 64);
          const color = index === 0 ? "255,102,47" : "67,157,255";
          gradient.addColorStop(0, `rgba(${color},.42)`);
          gradient.addColorStop(0.42, `rgba(${color},.16)`);
          gradient.addColorStop(1, `rgba(${color},0)`);
          glowContext.fillStyle = gradient;
          glowContext.fillRect(0, 0, 128, 128);
          const map = new THREE.CanvasTexture(glowCanvas);
          map.colorSpace = THREE.SRGBColorSpace;
          const material = new THREE.MeshBasicMaterial({
            map,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false,
            toneMapped: false,
            blending: THREE.AdditiveBlending,
          });
          const mesh = new THREE.Mesh(new THREE.CircleGeometry(speaker.radius * 0.72, 64), material);
          mesh.position.set(speaker.x, speaker.y, face.z + 0.004);
          mesh.renderOrder = 3;
          device.add(mesh);
          speakerVisuals.push({ mesh, baseZ: mesh.position.z });
        });

        device.updateMatrixWorld(true);
        deform = bindFantasyPress(device);
        speakers = bindFantasySpeakers(model);
        loaded = true;
        options.onReady();
      } catch {
        options.onFail();
      }
    },
    undefined,
    () => {
      if (!disposed) options.onFail();
    },
  );

  const cameraGoal = camera.position.clone();
  const targetGoal = controls.target.clone();
  let framing = false;
  const frame = (position: THREE.Vector3, target: THREE.Vector3) => {
    cameraGoal.copy(position);
    targetGoal.copy(target);
    framing = true;
    controls.enabled = false;
  };
  const reset = () => {
    atHome = true;
    frame(new THREE.Vector3(0, 0.25, homeDistance()), new THREE.Vector3(0, 0.2, 0));
  };

  const ray = new THREE.Raycaster();
  const setRay = (event: PointerEvent | WheelEvent) => {
    const rect = element.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
  };
  const hitAt = (event: PointerEvent | WheelEvent): FantasyAction | undefined => {
    if (!loaded || !model) return undefined;
    setRay(event);
    const hit = ray.intersectObjects(display ? [model, display] : [model], true)[0];
    return hit ? (hit.object === display ? "screen" : fantasyActionAt(hit.point)) : undefined;
  };
  const knobAngle = (event: PointerEvent) => {
    setRay(event);
    if (Math.abs(ray.ray.direction.z) < 0.16) return null;
    const center = FANTASY_CONTROLS[4];
    const point = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.459), new THREE.Vector3());
    if (!point || Math.hypot(point.x - center.x, point.y - center.y) < 0.025) return null;
    return Math.atan2(point.y - center.y, point.x - center.x);
  };

  /** 静音时记住的音量，供再次按下恢复。 */
  let rememberedVolume = visual.volume;
  const setVolume = (value: number, fromGesture: boolean) => {
    const next = clampVolume(value);
    visual.volume = next;
    visibleVolume = next;
    if (!fromGesture) rememberedVolume = next;
    options.actions.onVolume(next);
    announce(`${options.labels.volume} ${Math.round(next * 100)}%`);
  };
  let visibleVolume = visual.volume;
  const muteToggle = () => {
    if (visual.muted) {
      visual.muted = false;
      visibleVolume = rememberedVolume;
      options.actions.onVolume(rememberedVolume);
      announce(options.labels.volume);
    } else {
      rememberedVolume = visibleVolume;
      visual.muted = true;
      visibleVolume = 0;
      options.actions.onVolume(0);
      announce(options.labels.volume);
    }
  };

  let gesture:
    | {
        id: number;
        action: FantasyAction;
        x: number;
        y: number;
        lastX: number;
        lastY: number;
        angle: number | null;
        circular: boolean;
        value: number;
        moved: boolean;
        cancelled: boolean;
      }
    | null = null;
  let hover: FantasyAction | undefined;

  const execute = (action: FantasyAction) => {
    announce(options.labels[action]);
    const patch = feedback.get(action);
    if (patch) patch.motion = pulsePressMotion(patch.motion);
    if (action === "screen") options.actions.onScreenMenu();
    if (action === "power") options.actions.onToggle();
    if (action === "previous") options.actions.onPrevious();
    if (action === "next") options.actions.onNext();
    if (action === "favorite") options.actions.onLike();
    if (action === "volume") muteToggle();
  };

  const down = (event: PointerEvent) => {
    if (event.button !== 0 || gesture) return;
    const action = hitAt(event);
    if (!action || focused) {
      atHome = false;
      return;
    }
    event.stopImmediatePropagation();
    event.preventDefault();
    framing = false;
    controls.enabled = false;
    const angle = action === "volume" ? knobAngle(event) : null;
    gesture = {
      id: event.pointerId,
      action,
      x: event.clientX,
      y: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      angle,
      circular: angle !== null,
      value: visibleVolume,
      moved: false,
      cancelled: false,
    };
    hover = action;
    renderer.domElement.setPointerCapture(event.pointerId);
    const patch = feedback.get(action);
    if (patch) patch.motion = { depth: 0.014, velocity: 0, pulse: 0 };
  };

  const move = (event: PointerEvent) => {
    if (!gesture) {
      hover = hitAt(event);
      renderer.domElement.classList.toggle("native-canvas-action", Boolean(hover && hover !== "volume"));
      return;
    }
    if (gesture.id !== event.pointerId) return;
    const active = gesture;
    active.moved ||= Math.hypot(event.clientX - active.x, event.clientY - active.y) > 4;
    if (active.action === "volume" && active.moved) {
      const angle = active.circular ? knobAngle(event) : null;
      const arc = active.circular
        ? angle !== null && active.angle !== null
          ? clockwiseArc(active.angle, angle)
          : 0
        : ((event.clientX - active.lastX - event.clientY + active.lastY) * Math.PI) / 150;
      active.value = turnVolume(active.value, arc);
      setVolume(active.value, true);
      active.angle = angle;
      active.lastX = event.clientX;
      active.lastY = event.clientY;
    } else if (active.moved || hitAt(event) !== active.action) {
      active.cancelled = true;
    }
  };

  const release = (event: PointerEvent, run: boolean) => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const active = gesture;
    gesture = null;
    controls.enabled = !focused && !framing;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
    if (run && !active.cancelled && !active.moved && hitAt(event) === active.action) execute(active.action);
  };

  const up = (event: PointerEvent) => release(event, true);
  const cancel = (event: PointerEvent) => release(event, false);
  const leave = () => {
    if (!gesture) hover = undefined;
  };
  const wheel = (event: WheelEvent) => {
    if (hitAt(event) !== "volume") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setVolume(visibleVolume - Math.sign(event.deltaY) * 0.025, true);
  };
  const keyboard = (event: KeyboardEvent) => {
    if (![" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "m", "M", "Home"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Home") reset();
    else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      setVolume(visibleVolume + (event.key === "ArrowUp" ? 0.025 : -0.025), true);
    } else {
      execute(
        event.key === " "
          ? "power"
          : event.key === "ArrowLeft"
            ? "previous"
            : event.key === "ArrowRight"
              ? "next"
              : "volume",
      );
    }
  };

  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("data-fantasy-canvas", "1");
  renderer.domElement.addEventListener("pointerdown", down, true);
  renderer.domElement.addEventListener("pointermove", move);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointercancel", cancel);
  renderer.domElement.addEventListener("lostpointercapture", cancel);
  renderer.domElement.addEventListener("pointerleave", leave);
  renderer.domElement.addEventListener("wheel", wheel, { passive: false, capture: true });
  renderer.domElement.addEventListener("keydown", keyboard);

  const resize = new ResizeObserver(() => {
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    renderer.setSize(rect.width, rect.height);
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    if (focused) api.menu(true);
    else if (atHome) reset();
  });
  resize.observe(element);

  let lines: FantasyLines = ["", "", "", ""];
  let lastDrawn = "";
  const draw = (value: FantasyLines) => {
    context.clearRect(0, 0, SCREEN_CANVAS.width, SCREEN_CANVAS.height);
    context.fillStyle = "#10171b";
    context.beginPath();
    context.roundRect(0, 0, SCREEN_CANVAS.width, SCREEN_CANVAS.height, 22);
    context.fill();
    const fit = (text: string, width: number) => {
      let candidate = text;
      while (candidate.length > 1 && context.measureText(`${candidate}…`).width > width) candidate = candidate.slice(0, -1);
      return candidate === text ? text : `${candidate}…`;
    };
    context.fillStyle = "#c5b594";
    context.font = '500 37px -apple-system,"PingFang SC",sans-serif';
    context.fillText(fit(value[0], 1100), 44, 65);
    context.fillStyle = "#f3e8ce";
    context.font = '500 67px -apple-system,"PingFang SC",sans-serif';
    context.fillText(fit(value[1], 1100), 44, 162);
    context.fillStyle = "#c5ced4";
    context.font = '38px -apple-system,"PingFang SC",sans-serif';
    context.fillText(fit(value[2], 1100), 44, 238);
    context.fillStyle = "#73858e";
    context.fillRect(44, 281, 1112, 1);
    context.fillStyle = "#e1c593";
    context.font = '34px -apple-system,"PingFang SC",sans-serif';
    context.fillText(fit(value[3], 1100), 44, 343);
    context.fillStyle = "#354047";
    context.fillRect(44, 382, 1112, 8);
    context.fillStyle = visual.muted ? "#697279" : "#d4ae67";
    context.fillRect(44, 382, 1112 * clampVolume(visibleVolume), 8);
    texture.needsUpdate = true;
  };

  const api = {
    menu(value: boolean) {
      focused = value;
      const closeDistance = () => Math.max(1.45, 0.6 / (Math.tan(THREE.MathUtils.degToRad(16)) * camera.aspect));
      if (value) {
        atHome = false;
        frame(
          new THREE.Vector3(FANTASY_SCREEN.x, FANTASY_SCREEN.y, closeDistance()),
          new THREE.Vector3(FANTASY_SCREEN.x, FANTASY_SCREEN.y, 0.235),
        );
      } else reset();
    },
  };

  let lastFrame = 0;
  renderer.setAnimationLoop((time) => {
    const reduced = options.prefersReducedMotion();
    const delta = Math.min((time - lastFrame) / 1000, 0.05);
    lastFrame = time;

    if (framing) {
      const speed = reduced ? 1 : 1 - Math.exp(-delta * 16);
      camera.position.lerp(cameraGoal, speed);
      controls.target.lerp(targetGoal, speed);
      if (camera.position.distanceTo(cameraGoal) < 0.001 && controls.target.distanceTo(targetGoal) < 0.001) {
        framing = false;
        controls.enabled = !focused;
      }
    }
    controls.update();

    const depths = new Map<string, number>();
    for (const [action, entry] of feedback) {
      const pressed = gesture?.action === action && !gesture.cancelled;
      entry.motion = stepPressMotion(entry.motion, pressed, delta, reduced);
      depths.set(action, entry.motion.depth);
      const active = action === "power" ? visual.playing : action === "favorite" ? visual.liked : false;
      entry.patch.material.opacity = pressed
        ? 0.32
        : Math.min(0.35, (active ? 0.1 : hover === action ? 0.12 : 0) + entry.motion.pulse * 0.25);
    }
    if (deform && initialVolume !== null) deform(depths, (initialVolume - visibleVolume) * Math.PI * 1.5);

    speakerMotion = stepSpeakerMotion(
      speakerMotion,
      delta,
      visual.playing && !visual.muted && !document.hidden,
      visibleVolume,
      reduced,
    );
    const excursions = [speakerExcursion(speakerMotion, 0), speakerExcursion(speakerMotion, 1)];
    speakers?.(excursions.map((value) => value * 1.8));
    speakerVisuals.forEach(({ mesh, baseZ }, index) => {
      const step = speakerVisual(speakerMotion, index);
      mesh.position.z = baseZ + step.excursion * 3.2;
      mesh.scale.set(step.scale, step.scale, 1);
      mesh.material.opacity = step.opacity;
    });

    if (display) display.visible = !focused;
    const text = JSON.stringify(lines);
    if (text !== lastDrawn) {
      draw(lines);
      lastDrawn = text;
    }

    renderer.render(scene, camera);
  });

  return {
    setLines(next) {
      lines = next;
    },
    setVisual(next) {
      const first = initialVolume === null;
      visual.playing = next.playing;
      visual.liked = next.liked;
      visual.muted = next.muted;
      visual.volume = clampVolume(next.volume);
      visibleVolume = visual.muted ? 0 : visual.volume;
      rememberedVolume = visual.volume || rememberedVolume;
      if (first) initialVolume = visual.volume;
    },
    reset,
    dispose() {
      disposed = true;
      resize.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", down, true);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      renderer.domElement.removeEventListener("lostpointercapture", cancel);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("wheel", wheel, true);
      renderer.domElement.removeEventListener("keydown", keyboard);
      disposeTree(scene);
      texture.dispose();
      mask.dispose();
      environment.dispose();
      room.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}