# PF2e Flying Visual Helper

面向 Foundry VTT v14 与 PF2e 8.x 的纯客户端飞行视觉和局部 3D 空域辅助模块。

模块不制作真正的 3D 地图，也不修改 Actor、Item、Rules Element、Combat、TokenDocument 坐标、移动、攻击或距离计算。

## 地图飞行视觉

- 读取标准 `TokenDocument.elevation`，只对 elevation > 0 的 Token 启用视觉效果。
- 不再绘制亚克力底座、支架、连接件或落点环。
- Token 模型每升高 10 ft，上移其自身占地高度的 5%；60 ft 时达到 30% 上限，更高高度不继续增加屏幕位移。
- 强烈的地面阴影以 Token 的真实原始占地为起点，复用当前 Token 纹理的透明轮廓并始终保持非交互。
- 阴影随高度最多向下漂移 Token 高度的约 4.5%；空中摇摆只叠加不足摇摆幅度 20% 的中心位移，并同步少量浓淡和尺寸变化。
- Foundry/PF2e 原生高度数字保持原生文字、单位和布局逻辑，只叠加与模型相同的视觉位移，始终跟随模型。
- Token 选择、Target、拖动、网格吸附、视野和规则位置仍由原始 Token 处理。

## 可旋转 3D 空域悬浮框

Token 控制栏提供空域按钮，面板只在点击后打开，切换场景时自动关闭，没有打开快捷键。

- 首次打开时根据可见 Token 数量和浏览器可用区域自动计算尺寸，小规模战斗保持紧凑，单位较多时优先扩大三维画布。
- 标题栏可拖动整个高透明悬浮框。
- 在三维画布空白处按住鼠标拖动可水平环绕并调整俯角；鼠标滚轮缩放；重置按钮恢复默认镜头。
- “附近范围”滑杆可在 1–30 格之间实时调整局部查询范围。
- 以当前选中 Token 为中心，将附近可见 Token 的真实相对 X/Y 与精确 elevation 投影到同一三维坐标系。
- 点击缩略 Token 可在权限允许时选择地图 Token，并移动镜头和本地 Ping。
- 独立准星按钮调用 Foundry 原生本地 `Token#setTarget`，不会写入世界数据。
- 悬停信息显示名称、Elevation，以及用户具备 Actor `OBSERVER` 权限时的 PF2e Fly Speed。

“附近范围”只筛选面板内容，不代表攻击、移动、效果或规则距离。

## Z Scatter 兼容

检测到可选模块 Z Scatter 2.2.4 时，本模块组合其视觉散布、浮空位移、原生高度数字和扩展命中区域。地面阴影仍以 TokenDocument 的真实规则格位为基准，不跟随 Z Scatter 的屏幕散布。

兼容层不读取 Z Scatter 私有状态，也不修改其设置、flag 或碰撞算法。

## 设置

公开设置均为客户端范围：

- Enable Flying Visual Helper
- Enable 3D Airspace Explorer
- Enable Ground Shadow
- Shadow Opacity

旧版本的底座、支架、落点环、高度轴和阴影距离设置键会隐藏保留，便于安全降级，但不再参与当前渲染。

## 安装

将整个 `pf2e-flying-visual-helper` 目录放入 Foundry 用户数据目录的 `Data/modules/`，重启 Foundry，然后在 PF2e 世界中启用模块。

## 结构

```text
src/
  airspace-explorer.js
  airspace-view.js
  airspace-lifecycle.js
  shadow-renderer.js
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

自动测试覆盖 3D X/Y/Z 投影、镜头旋转与缩放、自动尺寸、实时范围过滤、选择与 Target、隐私权限、强阴影及其受限漂移、精确高度位移、摇摆同步、原生高度标签、Z Scatter、动画、极端输入和共享 ticker 性能。
