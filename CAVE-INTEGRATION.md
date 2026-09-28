# 溶洞 3D 场景接入

2026-09-28：将评审通过的完整 GLB 场景与平滑过场同步到主项目。

- 主入口：点击 index.html 的 #cave-dinner 晚宴卡片直接进入 3D，无单独按钮；支持键盘 Tab / Enter。
- 场景入口：cave-dinner-demo/index.html；点击左上方「返回行程」返回卡片。
- 原来的「查看照片」和餐厅实拍图保留，其他卡片不变。
- cave-integration.js 保留 ref 推荐人参数并跟随主站中英语言切换无障碍链接说明。
- cave-integration.css 只影响该晚宴卡片。GLB 仅在进入场景页后加载。
- 模型、贴图、源代码和重建说明：见 cave-dinner-demo/README.md。

本地主站：http://127.0.0.1:4181/?ref=limshimin#cave-dinner

这次只更新本地代码，没有发布到 Netlify 或 GitHub Pages。

## 回退备份

原主页、原 README 和旧版场景已备份在 backups/cave-integration-20260928-171418/。
如需回退，可先另存当前修改，再从该备份恢复主页及旧场景；新增的入口样式和脚本在旧主页中不会被引用。

## 验证

主卡片打开原照片、进入完整模型、返回原卡片及 ref 参数保留已在浏览器验证。入口在 1440×900 与 390×844 宽度下检查。GLB 与交互代码同步前后 SHA-256 一致。导航与平滑路径测试可按场景 README 运行。
