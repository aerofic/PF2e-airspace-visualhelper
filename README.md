# PF2e Flying Visual Helper 0.6.0

面向 Foundry VTT v14 与 PF2e 8.x 的纯客户端飞行视觉和局部 3D 空域辅助模块。它不制作真正 3D 地图，也不修改 PF2e 规则、TokenDocument 坐标、移动、攻击或距离计算。

## 0.6.0 核心体验

- 地图上的飞行 Token 只做同格内几像素的轻微浮空和异步摇摆，不会视觉占据邻格。
- 地面阴影直接留在 Token 原始格位，使用 Token 当前纹理的透明轮廓绘制本影与半影；阴影尺寸受原 Token 占地约束，不向邻格远距离投射。
- 阴影跟随空中摇摆同步改变少量尺寸和密度，但阴影中心不离开 TokenDocument 的真实地面位置。
- 透明亚克力底盘、落点环和地面阴影均不参与点击；选择、Target、拖动与网格吸附仍操作原生 Token。
- Foundry/PF2e 原生 elevation 数字保持原生文字、单位、位置逻辑和样式，只叠加与飞行模型相同的视觉位移，使其始终位于模型上方。

## 局部 3D 空域展开图

Token 控制栏提供一个侧边空域按钮，这是面板的唯一打开入口；没有打开快捷键，也不会在载入世界或切换场景后自动弹出。

打开前先选择一个 Token。面板以它为中心，将附近可见 Token 的真实 Canvas X/Y 相对位置和 `TokenDocument.elevation` 投影到固定等距 3D 战术视图中：

- 半透明透视地面网格表达水平相对位置。
- 地面落点、垂直引线和 Token 缩略图共同表达 X/Y/Z 关系。
- 同一视图内 elevation 使用统一线性比例，并保留精确高度标签。
- “附近范围”滑杆可在 1–30 格之间实时调整视觉查询半径。
- 点击 Token 缩略图，在权限允许时选择对应地图 Token，并移动镜头和本地 Ping。
- 每个缩略图的独立准星按钮切换 Foundry 原生本地 Target，不绕过可见性或控制权限。
- 悬停显示名称、Elevation 和 PF2e 最终派生 Fly Speed；无飞行速度或无 Actor `OBSERVER` 权限时隐藏 Fly Speed。

“附近”只使用 Canvas 像素位置筛选面板内容，不调用 PF2e/Foundry 规则距离 API，也不代表攻击、移动或效果范围。

## 地图视觉

- 读取标准 `TokenDocument.elevation`；只有 elevation > 0 时启用飞行视觉。
- 同心透明飞行底盘锚定 Foundry 计算的真实 Token footprint，包括非矩形和多格 Token。
- 严格俯视模式不绘制跨格的侧视长支架；仅显示底盘折射边缘、支撑端面、落点环和原格位阴影。
- 连续高度曲线驱动不超过约 6 px 的视觉微位移、轻微缩放与透明度变化。
- 所有飞行 Token 共用一个按需低频 ticker；摇摆只更新缓存的 Mesh、原生 UI 和阴影 Sprite 姿态，不逐帧重建 PIXI Graphics。
- 系统或浏览器请求减少动态效果时自动停用摇摆，并恢复静态浮空姿态。

## Z Scatter 兼容

检测到可选模块 Z Scatter 2.2.4 时，本模块把散布位移、浮空位移、原生高度数字和扩展命中区域组合到同一 Token 上。点击 Z Scatter、拖动和移动动画期间会暂时让出并重新取得受管几何，避免标签落回底座或出现双重位移。

兼容层不读取 Z Scatter 私有状态，不修改其设置、flag 或碰撞算法。地面位置、空中图像命中区和 3D 空域图中的条目最终都指向同一个 TokenDocument。

## 设置

所有设置均为客户端范围：

- Enable Flying Visual Helper
- Enable 3D Airspace Explorer
- Enable Ground Projection
- Enable Top-Down Acrylic Base
- Enable Ground Shadow
- Stand Opacity
- Shadow Opacity
- Projection Opacity

0.5.x 的 Height Axis 和 Shadow Distance Multiplier 键会隐藏保留，以便安全降级，但不再控制 0.6.0 的空域图或居中阴影。

## 隐私和规则边界

- 面板只读取当前用户可见且非 Secret 的 `canvas.tokens.placeables`。
- PF2e Fly Speed 只对具有 Actor `OBSERVER` 权限的用户显示。
- 点击无所有权 Token 不会强制取得控制权；仍可移动镜头和本地 Ping。
- Target 使用 Foundry 原生本地 `Token#setTarget`，不写 Actor、Item、Combat 或规则数据。
- 模块没有 socket、数据库写入、规则判断或距离测量。

## 安装

将整个 `pf2e-flying-visual-helper` 目录放入 Foundry 用户数据目录的 `Data/modules/`，重启 Foundry，在 PF2e 世界的“管理模块”中启用。

## 结构

```text
src/
  airspace-explorer.js
  airspace-view.js
  airspace-lifecycle.js
  flying-stand.js
  shadow-renderer.js
  projection-renderer.js
  token-lift-renderer.js
  z-scatter-compatibility.js
  flying-token-visual.js
  flying-visual-layer.js
  visual-math.js
  settings.js
  main.js

templates/
  airspace-controls.hbs
  airspace-view.hbs
```

## 验证

```powershell
npm test
```

自动测试覆盖 3D X/Y/Z 投影、实时半径过滤、侧边按钮打开与场景关闭生命周期、选择与 Target 分离、隐私权限、居中纹理阴影、摇摆同步、原生高度标签、Z Scatter、动画、极端有限输入及共享 ticker 性能。
