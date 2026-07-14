# PF2e Flying Visual Helper V2 / 0.3.1

面向 Foundry VTT v14 与 PF2e 8.x 的纯视觉空域辅助模块。V2 在传统 2D 地图上组合透明飞行支架、阴影、地面投影与 ApplicationV2 高度 HUD，不实现真正 3D，也不修改 PF2e 规则。

## V2 功能

- 读取标准 `TokenDocument.elevation`，所有 HUD 节点按真实高度从高到低排列。
- 5 ft 线性高度轴；高度差在轴上的像素比例保持一致，不使用固定 20 ft 分层，也不合并同高 Token。
- 默认显示为顶部水平居中的 `360 × 32` 无边框超透明空域导航条，只保留当前高度摘要和必要操作，尽量不遮挡地图及 Foundry UI。
- `ALL / GROUND / AIR` 三种过滤改为紧凑图标按钮，并保留本地化提示、键盘焦点与读屏标签。
- 主动展开导航条后显示完整高度轴、附近高度关系、Token 列表、悬停详情与 Token 定位交互；收起后立即恢复极简尺寸。
- 点击 HUD Token 后，在权限允许时选中 Token，移动镜头，并使用 Foundry 本地 Ping 高亮 2 秒。
- 悬停显示名称、Elevation，以及 PF2e 最终派生的 Fly Speed；无飞行速度或无 Actor 观察权限时不显示 Fly Speed。
- 选择 Token 后，在 HUD 中显示视觉半径 8 格内玩家可见空中单位的纯高度差关系。
- 地面底座固定在 Foundry 计算的 Token footprint 中心（包括非矩形 Token），Token 图像向左上抬升，并由顶部直连模型中心、约 12° 倾斜的半透明亚克力支架连接。
- 更清晰的亚克力边缘、高光底座、底座接触阴影、有限偏移高度阴影与地面投影。
- 支架、阴影、投影与 Foundry 原生 elevation tooltip 平滑更新。
- 无边框 ApplicationV2 导航条默认停靠在界面顶部并水平居中，可通过专用拖动柄移动；展开后的详情可滚动，也可按住高度轴空白处拖动浏览。
- Token 控制工具栏提供重新打开空域 HUD 的按钮。

## 原生高度标签

地图上的高度标签直接复用 Foundry v14 的原生 `Token#tooltip`。模块不创建重复的 PIXI 文本，也不接管其单位或 Level 相对高度格式；标签及其原生 Level 指示会与抬升后的模型同步移动，`Enable Height Label` 只控制飞行 Token 原生标签的显示与动画透明度。

HUD 中的高度数字是空域面板自身的必要数据展示，不会覆盖地图上的原生标签。

## Ultra-Compact Navigation HUD

空域 HUD 默认只占 `360 × 32`，采用类似导航仪或小地图状态条的极简布局。其低透明度背景只用于保证高度摘要可读，不会用整块面板遮住地图。摘要会显示当前过滤结果、最高可见高度；选择 Token 后会优先显示其名称和真实 elevation。

点击展开图标后，HUD 才会显示原有的线性高度轴、附近高度差关系以及可点击 Token。再次点击即可收回单行导航条。关闭后重新打开时也从极简状态开始，因此完整战术信息始终可用，但只在玩家主动查看时占用额外空间。

## 底座与移动对齐

模块对 Foundry Primary Canvas 中的 `token.mesh.position` 以及随模型显示的原生名称、高度标签、血条和状态图标施加可恢复的纯视觉偏移。`TokenDocument.x/y`、Token 容器、命中区、选择边框、目标标记、视野、移动路径和网格吸附全部保留在地面底座格。

拖拽 preview 到新格时，Foundry 仍用原生文档坐标吸附目标格；模块随后把透明底座放在该 footprint 中心，再把 Token 图像抬升到支架顶部。因此移动和落点始终看底座，而不是看悬浮图像。关闭模块、降到 0 ft、重绘或切换场景时会安全恢复 Mesh 与原生视觉 UI 的位置。

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

- 普通 x/y 移动只同步地面容器并重施缓存的 Token 模型姿态，不重建高度相关几何。
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
- 支架、阴影和投影是非交互 Primary Canvas 对象，底座始终锚定 TokenDocument footprint，并通过 `refreshPosition` 跟随移动与拖拽 preview；它们仍只是二维战术视觉，不是真实深度地面层。
- 模块仅可逆地偏移核心 `token.mesh.position` 与模型所属的非交互原生 UI，不修改 Mesh 的缩放、透明度、anchor 或 pivot；动态 Token Ring 会随同一个 Mesh 一起抬升。
- Token 的命中区和选择边框刻意保留在地面底座；选择和拖拽以清晰的亚克力底座为准，悬浮图像不会成为第二个规则位置或额外移动目标。

## 安装

将整个 `pf2e-flying-visual-helper` 目录放入 Foundry 用户数据目录的 `Data/modules/`，重启 Foundry，在 PF2e 世界的“管理模块”中启用。

## 结构

```text
src/
  flying-stand.js
  token-lift-renderer.js
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

自动测试覆盖高度排序与过滤、线性比例轴、PF2e Fly Speed 权限、附近高度差、斜向投影虚线、非矩形与多格 Token 底座、真实支架倾角、完整阴影边界、Mesh/原生 UI 抬升与恢复、跨模块后写保护、目标格 preview、Secret Token、动画以及共享 ticker。发布前仍建议在初始化后的 Foundry 世界中，以 GM 和玩家各检查一次视野隐私、动态 Token Ring、场景切换和 HUD 交互。
