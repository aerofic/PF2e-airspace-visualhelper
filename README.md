# PF2e Flying Visual Helper V2 / 0.4.3

面向 Foundry VTT v14 与 PF2e 8.x 的纯视觉空域辅助模块。V2 在传统 2D 地图上组合透明飞行支架、阴影、地面投影与 ApplicationV2 高度 HUD，不实现真正 3D，也不修改 PF2e 规则。

## V2 功能

- 读取标准 `TokenDocument.elevation`，所有 HUD 节点按真实高度从高到低排列。
- 紧凑相对高度轴；每个不同 elevation 占一个等距视觉层，仍按真实高度排序并在 Token 节点显示精确数值，不使用固定 20 ft 分层，也不合并同高 Token。
- 空域 HUD 默认不显示，只有点击 Token 控制栏的空域按钮后才打开；每次切换场景都会重新保持关闭。
- `ALL / GROUND / AIR` 三种过滤改为紧凑图标按钮，并保留本地化提示、键盘焦点与读屏标签。
- 主动展开导航条后显示完整高度轴、附近高度关系、Token 列表、悬停详情与 Token 定位交互；窗口会自动容纳所有筛选结果，不设置宽高上限或内部轴滚动区，收起后立即恢复极简尺寸。
- 点击 HUD Token 后，在权限允许时选中 Token，移动镜头，并使用 Foundry 本地 Ping 高亮 2 秒。
- 悬停显示名称、Elevation，以及 PF2e 最终派生的 Fly Speed；无飞行速度或无 Actor 观察权限时不显示 Fly Speed。
- 选择 Token 后，在 HUD 中显示视觉半径 8 格内玩家可见空中单位的纯高度差关系。
- 地面底座固定在 Foundry 计算的 Token footprint 中心（包括非矩形 Token），Token 图像向左上抬升，并由顶部直连模型中心、约 12° 倾斜的半透明亚克力支架连接。
- 支架采用低透明杆体、双折射边和窄幅高光分层绘制；透明椭圆底盘带厚度、内外缘、底部插销和顶部连接套管，不再表现为粗亮的发光杆。
- 接触阴影与高度投射阴影独立绘制；低空更凝实，高空逐渐缩小、偏移和淡化，完整视觉仍限制在原始 footprint 内。
- 地面投影同时提供不参与交互的 footprint 提示；悬停或选择 Token 时提示会增强，便于拖拽时识别真实占格。
- 连续高度压缩曲线取代离散高度段，使起飞、30 ft、100 ft 等位置都不会跳变，同时让 5–100 ft 的高度差保持清楚。
- 所有可见飞行 Token 都获得可逆的轻微透视缩放、透明度、冷色下缘反光和异步微浮动；系统启用“减少动态效果”时自动停用微浮动。
- 支架、阴影与投影平滑更新；Foundry/PF2e 原生 elevation 数字完全不由本模块改动。
- 点击打开后的无边框 ApplicationV2 导航条停靠在界面顶部并水平居中，可通过专用拖动柄移动；高度节点卡片缩短为 132 px，展开尺寸随高度层数与同高单位数量完整增长。
- Token 控制工具栏是空域 HUD 的唯一打开入口；世界载入、Canvas 就绪、设置启用和场景切换都不会自动打开。

## 原生高度标签

地图上的高度数字完全由 Foundry v14/PF2e 原生 `Token#tooltip` 与 Level 指示负责。本模块不读取或写入它们的位置、文字、单位、alpha、`renderable` 或显示格式；模型抬升、高度动画、设置刷新、Z Scatter 兼容和模块销毁都不会移动、隐藏或淡化这些原生数字。

HUD 中的高度数字是空域面板自身的必要数据展示，不会覆盖地图上的原生标签。

## Ultra-Compact Navigation HUD

空域 HUD 默认关闭。点击 Token 控制栏的空域按钮后，它以 `360 × 32` 的导航仪或小地图状态条布局打开。低透明度背景只用于保证高度摘要可读，不会用整块面板遮住地图。摘要会显示当前过滤结果、最高可见高度；选择 Token 后会优先显示其名称和真实 elevation。关闭后不会被数据刷新重新打开，切换场景也会保持关闭。

点击展开图标后，HUD 才会显示相对高度轴、附近高度差关系以及可点击 Token。高度轴用“上下顺序”表达相对高低，避免让极端高度差占用大量空白；每个节点仍保留真实 elevation。HUD 根据所有角色和同高横向节点自动扩展，不裁切内容。再次点击即可收回单行导航条。

## 底座与移动对齐

模块对 Foundry Primary Canvas 中的 `token.mesh` 施加可恢复的纯视觉位移、轻微缩放和显示透明度，并同步随模型显示的原生名称、血条和状态图标。原生高度数字不随模型移动。`TokenDocument.x/y`、Token 容器、选择边框、目标标记、视野、移动路径和网格吸附全部保留在地面底座格。

拖拽 preview 到新格时，Foundry 仍用原生文档坐标吸附目标格；模块随后把透明底座放在该 footprint 中心，再把 Token 图像抬升到支架顶部。因此移动和落点始终看底座，而不是看悬浮图像。关闭模块、降到 0 ft、重绘或切换场景时会安全恢复 Mesh 与原生视觉 UI 的位置、缩放和透明度。

## Z Scatter 兼容

检测到可选模块 Z Scatter 2.2.4 时，本模块从它公开写入的 Token 几何结果推导散布位移，将地面底座、抬升模型、名称、血条与状态图标组合到同一视觉布局，但不参与原生高度数字的布局。空中模型额外获得一个纯客户端命中区域，因此模型图像与地面 Token 重叠时，可以直接点击或从空中图像开始拖动；原始散布底座仍然可选。若希望 Z Scatter 主动错开同格但 elevation 不同的单位，可在 Z Scatter 中启用 `Ignore Elevation`；即使不开启，本模块仍会为空中图像提供第二命中区域。

兼容层不读取 Z Scatter 私有状态，不修改其设置、flag 或碰撞算法。拖动及 Foundry 移动动画期间会暂时归还命中区；结束后以 Z Scatter 最新结果重新组合。这个双命中区域只把两个视觉位置映射到同一个 Token，不会创建第二个规则位置，也不会修改移动落点、网格吸附或 PF2e 距离。

## 设置

所有设置均为客户端范围：

- Enable Flying Visual Helper
- Enable Altitude HUD
- Enable Ground Projection
- Enable Height Axis
- Enable Transparent Stand
- Enable Height Shadow
- Stand Opacity
- Shadow Opacity
- Projection Opacity
- Shadow Distance Multiplier（保留 V1 设置）

## 性能与隐私

- 普通 x/y 移动只同步地面容器并重施缓存的 Token 模型姿态，不重建高度相关几何。
- 所有可见飞行 Token 共用一个低频按需 ticker；它只更新 Mesh 与原生 UI 的微小姿态，不逐帧重建支架、底座、阴影或投影几何。没有飞行 Token 时 ticker 自动停止，系统请求减少动态效果时不启动微浮动。
- Z Scatter 激活时，兼容状态最多以 10 Hz 检查；只在其布局发生变化时重组缓存位置和命中区，不重绘 PIXI 几何。
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
- 模块只对核心 `token.mesh` 的位置、轻微缩放和显示透明度进行可恢复的客户端视觉调整，不修改 anchor、pivot、纹理、滤镜或 shader；动态 Token Ring 会随同一个 Mesh 一起抬升。原生 elevation tooltip 与 Level 指示不在抬升目标集合中。检测到其他模块后写某一受管属性时，本模块只对该属性让出所有权。
- 默认命中区保留在地面底座；Z Scatter 激活时另加一个可逆的悬浮图像命中区域，两处都操作同一个 TokenDocument，选择边框、规则位置与移动目标仍只有地面底座一个。

## 安装

将整个 `pf2e-flying-visual-helper` 目录放入 Foundry 用户数据目录的 `Data/modules/`，重启 Foundry，在 PF2e 世界的“管理模块”中启用。

## 结构

```text
src/
  flying-stand.js
  token-lift-renderer.js
  z-scatter-compatibility.js
  shadow-renderer.js
  projection-renderer.js
  altitude-hud.js
  altitude-axis.js
  hud-lifecycle.js
  settings.js
  main.js
```

另有 `flying-token-visual.js`、`flying-visual-layer.js` 和 `visual-math.js` 分别负责组合、生命周期与纯视觉公式。

## 验证

```powershell
npm test
```

自动测试覆盖 HUD 点击开启与场景关闭生命周期、高度排序与过滤、相对高度层与无上限自适应 HUD、PF2e Fly Speed 权限、附近高度差、连续高度曲线、分层亚克力材质、双阴影、footprint 提示、非矩形与多格 Token、Mesh 位置/缩放/透明度及美术 UI 的恢复、原生高度数字零写入、跨模块逐属性后写保护、Z Scatter 双命中区与移动让权、目标格 preview、Secret Token、减少动态效果、高度动画以及 50 个飞行 Token 的共享 ticker。
