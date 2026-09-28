# 溶洞红酒私人晚宴 · 完整 3D 场景

已接入主项目的「溶洞红酒私人晚宴」卡片，同时仍可作为独立页面运行。原餐厅照片保持不变，主页面的「查看照片」仍然可用。

## 运行

在 D:\MMU\nanyang-3d 中执行：

```powershell
python -m http.server 4181 --bind 127.0.0.1
```

- 主网页：http://127.0.0.1:4181/
- 3D 场景：http://127.0.0.1:4181/cave-dinner-demo/
- 点击主站的晚宴卡片进入 3D；右上角「查看照片」仍打开实拍相册。点击场景左上方「返回行程」返回晚宴卡片，保留 ref 推荐人参数。
- 请使用 HTTP 服务或 VS Code Live Server，不要以 file:// 双击打开。

## 模型与文件

- models/cave-restaurant.glb：完整可复用模型，约 27.7 MB，包含几何、材质、内嵌贴图及灯光；网页直接加载此模型。
- models/scene-manifest.json：机位、路径、碰撞边界、热点和实拍对照信息。
- scene-builder.mjs：模型生成源代码；scripts/export-glb.mjs：重新导出模型。
- experience.mjs：加载模型、灯光、自由行走、触屏、全景、实拍对照。
- navigation.mjs：碰撞检测和寻路；camera-motion.mjs：安全圆滑路径及镜头缓动。
- camera-motion.css、styles.css、index.html：界面；site-navigation.js：返回主站。
- models/sign-outlines.json：入口招牌字形轮廓；textures/：可复用纹理；references/：原始实拍对照。
- vendor/：本地 Three.js r180 与加载工具，无运行时 CDN 依赖。
- 旧版 scene.js 不再被页面引用；本版入口是 experience.mjs。

模型组包含 ShellRoof、ShellWalls、Facade、Grounds、Dining、Service、Plants、Fixtures、Lights。全景可临时隐藏洞顶与岩壁以读懂内部，但完整模型没有删除这些部分。GLB 已通过格式校验。

## 操作与过场

鼠标拖动 / 单指滑动环顾；WASD / 屏幕方向键行走；滚轮 / 双指缩放。预设包含入口、主厅、晚宴桌、服务区、全景布局。切换室内视角沿安全路线移动，全景通过入口升降过渡。支持跳过过场、重置、灯光模式、热点说明、实拍对照与模型下载。

顶栏播放图标开关镜头动画，并保存用户选择；未作选择时遵循系统减少动态效果偏好。室内拖动或行走可接管镜头。参见 CAMERA-MOTION.md。

## 性能与复现

按材质合并网格，限制像素比（手机 1.2、桌面 1.65）、各向异性与阴影分辨率；阴影烘存，空闲时降低渲染频率，页面隐藏时暂停。主网页不预载 GLB，进入独立场景才加载。

安装 Node.js 后可执行：
```powershell
node scripts/export-glb.mjs
node scripts/test-navigation.mjs
node scripts/test-scene-navigation.mjs
node scripts/test-camera-motion.mjs
```
可选模型校验依赖：在 scripts/validation-tools 中安装 gltf-validator，然后执行 node scripts/validate-model.mjs。此依赖不需要部署到网站。

## 素材与还原边界

同店参考原件位于 ../assets/references/cave-restaurant，包括 01、06、09、11 照片及入口至主厅视频；照片仅作对照，不作为岩壁几何替代物。空间分析见 REFERENCE-ANALYSIS.md。

岩石微表面使用 Poly Haven 的 rock_boulder_dry（CC0，Dimitrios Savva / Rico Cilliers）：https://polyhaven.com/a/rock_boulder_dry 。木纹、地面等辅助纹理由本项目脚本生成。Three.js 为 MIT 许可，许可证随 vendor 保留。参考照片来源不等于取得再分发许可，正式公开部署前应确认照片与视频授权。

这是基于可见资料的视觉重建，不是实测扫描或 1:1 测绘。整体尺寸、照片遮挡处、外围边界、后方服务区和部分桌椅数量采用合理推估；红酒烛光陈设属于晚宴主题演绎。准确结构判断以原照片和实地资料为准。
