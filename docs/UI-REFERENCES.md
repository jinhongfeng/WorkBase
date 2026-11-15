# UI 参考资源清单

来源：X 用户 @EianLu 的《100 个提升审美的设计网站大赏》
（<https://x.com/EianLu/status/2121219503988113557>），对照 `docs/DESIGN.md` 的技术栈
与外观硬约束筛选。本文只记录「哪些值得用、用在哪、怎么用才不违反规范」；
动手改任何外观前仍以 `DESIGN.md` 第 7 节为准。

## 落地硬约束（搬任何东西前必看）

1. `DESIGN.md` 禁止引入清单不放宽：不引 AntD/MUI、图表二次封装、DnD 库、GSAP。
   「复制源码归自己所有」模式的资源是唯一合规路径。
2. 一切视觉值必须进 `tokens.css` 的 CSS 变量；边框与阴影只有一套取值。
   参考站上的色值只能作参考，取用后走 token。
3. 离线 + CSP（`img-src 'self' data: blob: wb-asset:`、`font-src 'self' data:`）：
   不引 CDN 脚本/字体/图片，资源必须本地化后才算「能用」。

## 一、能直接搬的（开源，可复制源码进项目）

| 资源 | 能用在 WorkBase 的哪里 | 注意点 |
|---|---|---|
| React Bits（reactbits.dev，215+ 组件） | 微交互类：按钮/开关/指示器小动效（对口「动效 ≤180ms」）；背景类粒子/网格：可改写进 `splash-particles.ts` 与沉浸氛围特效；文字动效（SplitText 等） | 选 TS+CSS 版本（不选 Tailwind 版）；协议 MIT + Commons Clause，桌面应用使用没问题；部分组件依赖 motion（已有依赖） |
| coss ui（coss.com/ui，Cal.com 设计系统，约 74 组件） | 只作交互与可访问性参考：Popover / Dialog / Command Menu / Tooltip / Toast 的键盘、焦点与状态机写法 | Base UI + Tailwind v4 方案，样式不能照搬，只抄行为逻辑 |
| tweakcn（shadcn 主题编辑器） | 调四套界面风格 token 时做可视化预览，调完把值抄进 `tokens.css` | 纯工具，不引入代码 |
| Radix Colors | 色阶推导方法参考：`--text-2/--text-3` 灰阶、`accent-soft` 派生可参考它的明度阶梯 | 参考方法，不必引包 |
| awesome-design-md（GitHub） | `DESIGN.md` 的写法参考 | — |
| Poly Haven（CC0） | 沉浸背景/壁纸素材来源（走现有「从链接添加」通道） | 弱相关，仅当素材站用 |

## 二、只能当参考、不出代码

| WorkBase 组件/页面 | 参考站 |
|---|---|
| 命令面板、更多面板 | Nicelydone、Vercel Guidelines（浮层模式、键盘导航）、Mobbin（Linear/Raycast 类截图） |
| Toast / Dialog / Tooltip 细节 | Emil Kowalski 个人站（Sonner/Vaul 作者）、Rauno Freiberg（键盘与 hover 细节）、Josh W. Comeau（CSS 技巧） |
| 空态/加载/错误三态 | The Component Gallery、Vercel Guidelines、Laws of UX |
| 设置页、苹果界面风格 | Apple HIG（毛玻璃、发丝线、系统语义色的规范来源） |
| 深色主题打磨 | Dark Mode Design、Minimal Gallery |
| 首页卡片、笔记页排版气质 | Land-book、Siteinspire（编辑类/极简版式；Awwwards/FWA 炫技站慎看） |
| 启动层动画节奏 | GSAP Demos、Motion 示例——只参考节奏，不引 GSAP，用现有 motion + canvas 实现 |
| 沉浸氛围特效算法 | Shadertoy、Book of Shaders——算法降级为「单张低分辨率 Canvas、≤30fps」实现，不上 WebGL |
| Token 调色 | Coolors、Realtime Colors、Utopia（字号/行高节奏） |

## 三、基本无关，收藏即可

大赛奖项（Awwwards/FWA/D&AD）、动态视频（Motionographer/STASH 等）、3D 渲染
（ArtStation/Sketchfab 等）、电影镜头（ShotDeck/FILMGRAB）、Game UI Database、
Web Design Museum、字体站（字体已定 Segoe UI Variable / PingFang SC / JetBrains Mono，
且 CSP 限制字体来源）。Mobbin/Page Flows/Refero/Nicelydone/SaaSFrame 为付费站，
免费额度够看关键模式。

## 已应用的记录

- 2026-11-15：浅色边框对比度修复（React Bits 之外的通用观察，源自 2026-11-09 审视记录）；
  新增主题色预设（Radix Colors 色阶思路 + tweakcn 式预设板）；
  微交互打磨（Emil Kowalski 手法：按压反馈、Toast 出入场、弹窗入场）；
  命令面板/更多面板键盘行为对齐 coss ui（循环导航、焦点管理）；
  沉浸氛围六种特效加深度层与细节（Shadertoy/Book of Shaders 算法降级 Canvas 2D）。
