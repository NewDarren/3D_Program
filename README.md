# 南洋沐漓 3D Landing Page

这是一个不依赖构建工具的静态网站版本。

## 本地预览

在 VS Code 的 Terminal 中执行（预览时保持终端运行）：

```powershell
cd D:\MMU\nanyang-3d
python -m http.server 4174 --bind 127.0.0.1
```

然后访问 [http://127.0.0.1:4174/?ref=limshimin](https://newdarren.github.io/3D_Program/) 。如果 4174 已被占用，可改成 4175 并访问对应端口。静态页面也可通过 VS Code Live Server 预览，无需 npm 安装。

## 部署

发布文件为 `index.html`、各 CSS/JS 文件和 `assets`。无需构建命令。`backups`、`tools` 仅用于本地开发，不需要发布。当前修改是本地版本，原 Netlify 网址不会自动更新。

## 已实现

- 原生 WebGL 桂林微缩山水：真实山峰、河流、树林、竹筏与石质底座
- 首屏滚动镜头推进，鼠标拖动、触摸横向旋转、方向键探索及 Home 重置
- 日光 / 黄昏 / 夜色三种照明，河面波光与夜晚灯火
- 六天行程联动：桌面滚动自动选择当天，所有设备可点选 Day 01–06；视角、竹筏与光点同步变化
- 3D 礼包卡片与图片景深，8 张原图的完整大图相册；方向键切图、Esc 关闭并恢复焦点
- 中英双语切换
- 动态推荐人及 WhatsApp 报名信息
- 响应式手机布局
- 默认遵从 `prefers-reduced-motion`；用户可主动点击“开启动效”，也可随时暂停
- 模型离开视口或标签页不可见时停止渲染；无 WebGL 时显示原照片

山水模型是艺术化行程示意，并非真实地理地图。手机采用点选行程，避免长时间占住屏幕。

## 主要文件

- `index.html`：内容、光影按钮和六天行程
- `styles.css`、`experience-3d.css`：原页面及立体卡片样式
- `scene-3d.js`：WebGL 场景与镜头、灯光、竹筏
- `journey-3d.js`、`journey-3d.css`：滚动联动、行程选择和响应式布局
- `gallery-3d.js`、`gallery-3d.css`：原图大图查看器
- `app.js`：中英切换、推荐人、WhatsApp、FAQ

本次升级前的代码备份在 `backups/before-journey-3d-20260925`；更早 3D 升级前版本在 `backups/before-3d-20260925`。

## 图片原则

页面使用原网站的原始图片，不以相似场景图替换。只有在确认找到完全相同的高清原图并核实使用来源后，才会升级对应素材。

- `bar.jpg`：使用已确认完全同图的 1920×1080 原文件，备份位于 `assets/original-highres`。
- 其余页面图片：由原站文件等比例 Lanczos 放大并轻度锐化；不裁切、不生成内容、不更换人物或场景。
- 原始低分辨率文件保存在 `assets/original-lowres`，方便随时逐张复核或恢复。
- 图片 URL 带有版本参数，避免浏览器继续显示旧缓存。
