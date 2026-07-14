# PF2e Flying Visual Helper V2

面向 Foundry VTT v14 与 PF2e 8.x 的纯视觉空域辅助模块。V2 在传统 2D 地图上组合透明飞行支架、阴影、垂直地面投影与 ApplicationV2 高度 HUD，不实现真正 3D，也不修改 PF2e 规则。

## V2 功能

- 读取标准 `TokenDocument.elevation`，所有 HUD 节点按真实高度从高到低排列。
- 5 ft 线性高度轴；高度差在轴上的像素比例保持一致，不使用固定 20 ft 分层，也不合并同高 Token。
- `ALL / GROUND / AIR` 三种简单过滤。
- 点击 HUD Token 后，在权限允许时选中 Token，移动镜头，并使用 Foundry 本地 Ping 高亮 2 秒。
- 悬停显示名称、Elevation，以及 PF2e 最终派生的 Fly Speed；无飞行速度或无 Actor 观察权限时不显示 Fly Speed。
- 选择 Token 后，在 HUD 中显示视觉半径 8 格内玩家可见空中单位的纯高度差关系。
- 升级后的半透明亚克力支架、偏移高度阴影、正下方虚线投影及地面圆形标记。
- 支架、阴影、投影与 Foundry 原生 elevation tooltip 平滑更新。
- ApplicationV2 空域面板默认以半透明长条停靠在界面顶部并水平居中；窗口仍可移动、缩放、滚动，也可按住高度轴空白处拖动浏览。
- Token 控制工具栏提供重新打开空域 HUD 的按钮。

## 原生高度标签

地图上的高度标签直接复用 Foundry v14 的原生 `Token#tooltip`。模块不创建重复的 PIXI 文本，也不接管其单位或 Level 相对高度格式；`Enable Height Label` 只控制飞行 Token 原生标签的显示与动画透明度。

HUD 中的高度数字是空域面板自身的必要数据展示，不会覆盖地图上的原生标签。

## 设置

所有设置均为客户端范围：

- Enable Flying Visual Helper
- Enable Altitude HUD
- Enable Ground Projection
- Enable Height Axis
- Enable Height Label
- Enable Transparent Stand
- Enable Height Shadow
- Stand Opacity
- Shadow Opacity
- Projection Opacity
- Shadow Distance Multiplier（保留 V1 设置）

## 性能与隐私

- 普通 x/y 移动只同步 Primary Canvas 容器位置，不重建高度相关几何。
- 静止时没有 ticker 或轮询；仅高度动画中的 Token 使用一个共享按需 ticker，几何最多约 30 FPS 更新。
- HUD 更新采用短延迟合并，只在 Token、Actor、Item、选择、视野、场景或设置数据变化时重绘。
- HUD 只读取 `canvas.tokens.placeables` 中当前用户可见且非 Secret 的 Token。
- PF2e Fly Speed 只对具有 Actor `OBSERVER` 权限的用户显示。
- 点击无所有权 Token 不会绕过 Foundry 控制权限，但仍可移动镜头并进行本地高亮。

## 规则边界

模块没有 socket、数据库写入、规则判定或距离测量，并且不会修改：

- Actor、Item、Rules Element
- Combat、攻击或检定
- Token 移动、移动路径或 elevation 数据
- PF2e 距离计算

“附近”只使用固定 8 格 Canvas 像素半径筛选 HUD 条目，不调用 PF2e/Foundry 规则距离 API。

## 视觉边界

- HUD 保留精确 elevation；Canvas 支架长度使用压缩曲线，避免 60 ft 支架遮挡十二格地图。
- GROUND 严格定义为原始 `elevation = 0`。多 Level 场景仍由 Foundry 原生标签表达相对层级。
- 支架、阴影和投影是非交互 Primary Canvas 对象，排在普通非负高度 Token 图像下方，并通过 `refreshPosition` 跟随移动与拖拽 preview；它们仍只是二维战术视觉，不是真实深度地面层。
- 为避免与动态 Token Ring、核心 refresh 及其他模块冲突，本版本不修改核心 `token.mesh` 的缩放或透明度。

## 安装

将整个 `pf2e-flying-visual-helper` 目录放入 Foundry 用户数据目录的 `Data/modules/`，重启 Foundry，在 PF2e 世界的“管理模块”中启用。

## 结构

```text
src/
  flying-stand.js
  shadow-renderer.js
  projection-renderer.js
  altitude-hud.js
  altitude-axis.js
  settings.js
  main.js
```

另有 `flying-token-visual.js`、`flying-visual-layer.js` 和 `visual-math.js` 分别负责组合、生命周期与纯视觉公式。

## 验证

```powershell
npm test
```

自动测试覆盖高度排序与过滤、线性比例轴、PF2e Fly Speed 权限、附近高度差、投影虚线、原生 tooltip 恢复、拖拽 preview、Secret Token、动画以及共享 ticker。发布前仍建议在初始化后的 Foundry 世界中，以 GM 和玩家各检查一次视野隐私、动态 Token Ring、场景切换和 HUD 交互。
