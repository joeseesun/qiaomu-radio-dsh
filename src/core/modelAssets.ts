/**
 * 3D 模型资产的 URL。
 *
 * 与 `mount.ts` 用同一个挂载前缀，避免出现第二处硬编码：宿主路由按
 * `MOUNT_PATH` 注册，资产目录由构建脚本拷到 `lib/player/models/`。
 *
 * 为什么随包发模型：参考实现的 `theme === "fantasy"`（魔兽世界）渲染的是
 * `RamsRadio.tsx` + `qiaomu-fantasy-radio-hyper3d-v2.glb`，视觉信息几乎全在
 * 模型本身的材质与雕花上，用图元重建无法等价。用户已确认接受约 2.7 MB 的包体增量。
 */

import { MOUNT_PATH } from "./mount";

/** 魔兽世界（fantasy）机型；由 `src/client/skins/three/fantasyScene.ts` 加载。 */
export const FANTASY_MODEL_URL = `${MOUNT_PATH}/models/qiaomu-fantasy-radio-hyper3d-v2.glb`;

/**
 * 模型加载期间显示的符文动效（参考实现 `ModelLoader` 的 `model-loader-fantasy`）。
 *
 * 2.7 MB 的模型在冷启动/慢网络下需要可感知的加载反馈，纯文字状态不够。
 */
export const FANTASY_RUNE_URL = `${MOUNT_PATH}/images/warcraft-loading-rune.png`;