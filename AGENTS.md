# Ren'Py Tool 工程架构与约束

## 项目定位

纯前端 Ren'Py 工作区辅助工具，面向 Chrome/Edge，使用 File System Access API 本地读写。核心价值：
- 逐行结构化编辑对白/旁白
- 立绘/资源快速插入（带智能候选过滤）
- 跨文件文本 Review
- 资源分类与引用诊断（用户自定义路径规则）

## 技术栈

### 已采纳

- **React 19** + **TypeScript 6** + **Vite 8**
- **Tailwind CSS 4** (`@tailwindcss/vite` 插件) — 唯一样式来源，**已删除 App.css**
- **Light/Dark theme** — `UserSettings.theme` 持久化，根节点 `data-theme` + `dark` class 驱动 CSS token，Sonner Toast 同步跟随应用主题
- **shadcn/ui 风格自建组件** — `Button`, `Badge`, `Input`, `Textarea`, `Separator`, `ScrollArea`
- **Sonner** — Toast 通知层，`useToast()` 保留业务调用适配，主题由应用 light/dark 设置驱动
- **Motion** (`motion/react`) — 视图切换、用户旅程引导 overlay / 聚光定位 / 卡片切换过渡
- **Monaco Editor** (`monaco-editor`) — IDE 类首屏同步加载，本地打包到 `dist`，不走外部 CDN
- **lucide-react** — 图标
- **minimatch** — 资产路径规则 glob 匹配
- **clsx + tailwind-merge + cva** — class 合并
- **File System Access API** — 本地文件读写
- **IndexedDB** — 工作区句柄 + 缩略图缓存
- **localStorage** — 设置 / 草稿 / 用户覆盖 / 资产规则

### 不使用

- ❌ 后端 — 初版纯前端
- ❌ 完整 AST 解析 — 行级正则
- ❌ shadcn/ui 官方 CLI 拷贝 — 改为按需自建（避免 Radix 依赖膨胀）

## 路径别名

`@/*` → `./src/*` ：
- `tsconfig.json` paths
- `tsconfig.app.json` paths
- `vite.config.ts` resolve.alias

## 数据流

```
FileSystemDirectoryHandle (IndexedDB)
  ↓ scanWorkspace() → FileEntry[] + buildRpyIndex()
  ↓ RpyIndex { lines, linesByFile, characters, assets, chapters, diagnostics }
  ↓ reclassifyAssets(index, assetRules)  ← 用户路径规则
  ↓ applyOverrides(snapshot, characterOverrides, chapterOverrides)
  ↓ React state (snapshot)
  ↓ Views consume snapshot
  ↓ persistLines() → writeTextFile() → rescanFiles() (增量)
```

**关键原则**：
- 工作区打开 **一次全量扫描**，保存后 **增量重扫单个文件**
- 草稿存 `localStorage`，提交时批量写回并增量索引
- 用户覆盖（角色/章节/资产规则）独立存储，apply 时合并到 snapshot

## 持久化边界

| 存储 | Key | 内容 |
|------|-----|------|
| IndexedDB `workspace` | `current` | `FileSystemDirectoryHandle` |
| IndexedDB `thumbnails` | `path:size:mtime` | 缩略图 Blob |
| localStorage | `rpy-tool:settings` | `UserSettings`（含 theme/view/assetTab/spriteCardScale/reviewOperationPanelVisible/motionEnabled/tourGuideCompleted/tourGuideCurrentStepId 等） |
| localStorage | `rpy-tool:drafts` | `{lineKey: DraftEntry}`，包含文本草稿与可选 `speakerId` |
| localStorage | `rpy-tool:characters` | `CharacterOverrides` |
| localStorage | `rpy-tool:chapters` | `ChapterOverrides` |
| localStorage | `rpy-tool:review-marks` | `{lineKey: ReviewMark}`，包含校对状态、备注 / 修改意见 |
| localStorage | `rpy-tool:asset-rules` | `AssetPathRule[]` |
| localStorage | `rpy-tool:sidebar:*` | 用户拖拽后的 sidebar 宽度 |

## Layout Shell（关键约束）

首屏启动：
- `index.html` 内置轻量静态 boot screen，覆盖 JS bundle 下载与 React 初始化前空白期
- `AppShell` 在恢复 IndexedDB 工作区句柄期间显示 IDE 风格启动屏，完成后进入正常 shell
- 命令面板可用状态由真实 `snapshot` 驱动，避免额外调用 `restoreWorkspace()`

布局根：`<div className="flex h-screen flex-col">`
- **顶栏 Topbar**: `h-14` (3.5rem) — Brand + 主导航 + 工作区操作 + 命令面板
- **路径栏**: `h-8` (2rem) — 全局当前文件路径（`workspace > path/file.rpy`）
- **状态栏 StatusRail**: `h-8` (2rem) — 状态 / 文件数 / 行号 / 立绘 / 草稿 / 诊断
- **内容区**: `flex-1 overflow-hidden`
  - 各视图必须用 `h-[calc(100vh-var(--shell-chrome))]` 计算高度
  - `--shell-chrome = 3.5rem + 2rem + 2rem = 7.5rem`
  - 内部 sidebar 用 `flex h-full flex-col overflow-hidden` + 内部 `overflow-auto`
  - 这保证了三栏 sidebar 高度固定，只在内部滚动
  - 所有主视图 sidebar 必须支持鼠标横向拖拽调整宽度，使用 `useResizableSidebar()` + `SidebarResizeHandle`
  - resize handle 的布局列统一使用 `12px` 命中区，中间只显示细分隔线，避免 6px 热区过窄
  - 可 resize 区域只做最小宽度限制，不做最大宽度限制，用户可以按工作区实际空间继续拉宽
  - 视图切换由 `MotionView` 包裹，按顶栏 tab 顺序做整页轻量横向滑动 + opacity 过渡，不给 `LineList` 虚拟滚动行逐项加动画
  - motion 受 `UserSettings.motionEnabled` 与系统 reduced-motion 偏好共同控制

## 首页与关于页

首页只保留三类内容，不再使用 sidebar / 工作流旅程：
- 数据统计
- 项目健康
- 诊断

文案原则：优先短标题、短状态、短按钮；避免解释型 description 堆叠。

关于页（`about-view.tsx`）作为信息与设置入口；当前放主题调整、过渡动画开关、重新打开用户旅程引导，以及一份 `rpy-tool` 项目说明（本地离线、建议先做版本管理、定位为写后校对 / 审阅 / 修改 / 立绘查分）。

## 用户旅程引导（Tour Guide）

实现入口：
- `services/tour-guide.ts`: `tourGuideSteps` 配置，按用户旅程定义步骤、目标视图、DOM anchor 和是否需要工作区。
- `components/tour-guide.tsx`: `TourGuide` overlay，使用 `motion/react` 的 `AnimatePresence` / `motion` 做遮罩、聚光框和卡片切换。
- `App.tsx`: 管理 `tourGuideOpen`、当前步骤、完成 / 跳过状态，并在步骤变化时切换到对应视图。

引导步骤（从产品 / 用户旅程角度重排，一般不介绍首页）：
1. 项目说明（本地离线、强烈建议先做版本管理、定位为编写后的校对 / 审阅 / 修改 / 立绘查分，暂不覆盖前期流程）
2. 打开工作区（说明应选 game 目录或项目根目录）
3. 资产管理（简介分类工作原理，指引设置路径规则）
4. 立绘快插（简介逐行查分套用立绘的作用）
5. 文本 Review（校对核心：队列筛选 + 1/2/3/0 状态快捷键 + 备注 / 导入导出）
6. 可视化编辑器（定位为备用编辑，简介如何切换打开 Monaco 源文件）
7. 关于（简介可从关于页 / 顶栏「引导」按钮再次打开引导）

关键约束：
- 没有工作区时只展示 `requiresWorkspace` 为假的步骤（项目说明、打开工作区）；打开工作区后才补齐资产、立绘、编辑、关于步骤。
- 点击关闭只临时收起，不标记完成；点击跳过或完成才写入 `tourGuideCompleted`。
- Tour anchor 使用 `data-tour="..."`，新增步骤必须优先锚定稳定的小控件 / 小区域（例如 mode switch、slider、按钮组），不要直接锚定整页工作区。
- 聚光框只读取目标元素 `getBoundingClientRect()`，不得改变业务布局；定位失败时退回 fallback rect 并用整屏 scrim。
- 引导卡片定位走 `placeCard()` 算法：先测量卡片自身 `offsetWidth/Height`，按聚光框中心对齐选 下 / 上 / 右 / 左 中第一个放得下的方向；目标过大（如整屏 workbench 面板）放不下时，钉到剩余空间最大的边，不再让卡片悬空或随意压住聚光框。
- 遮罩只用聚光框的 `box-shadow` 大扩散实现，高亮元素保持明亮；整屏只放一个透明 click-catcher 负责点击空白关闭。
- 大面积锚点仅作为 fallback，必须从元素中心收敛为局部 spotlight（当前上限 720×220），步骤卡片必须 clamp 在视口内，避免框选工作区过大导致溢出和错位。
- 重新打开引导从第一步（项目说明）开始，入口在 Topbar「引导」按钮与关于页。

## 资产分类系统

**用户配置路径规则**（`AssetPathRule`）：
```ts
interface AssetPathRule {
  id: string
  pattern: string       // glob: "images/characters/**/*"
  category: AssetCategory
  priority: number      // 高优先级先匹配
  enabled: boolean
}
```

匹配逻辑（`matchAssetCategory`）：
1. 按 `priority` 降序遍历启用规则
2. 用 `minimatch` 匹配文件路径（小写归一化）
3. 第一个匹配决定分类
4. 无匹配则回退 `categoryFromPathHeuristic`

默认规则（`asset-rules.ts`）：
- `images/characters/**/*` → character
- `images/cg/**/*` → cg
- `images/bg/**/*` → bg
- `audio/bgm/**/*` → bgm
- `audio/sfx/**/*` → sfx
- `audio/voice/**/*` → voice

资产管理顶部提供独立「路径规则」按钮，使用 modal/dialog 展示 CRUD UI；路径规则不是资产 tab。

路径规则可视化选择：
- 规则弹窗右侧提供「选择目录」sidebar，从当前工作区图片/音频文件归纳目录
- 点击目录会对当前高亮规则写入 `目录/**/*`
- 若没有高亮规则，则自动新建规则
- 分类使用 `categoryFromPathHeuristic()` 预填，用户仍可用下拉框调整
- 目录选择 sidebar 本身也支持拖拽调整宽度
- 规则行实时显示「命中 / 生效」数量：命中为 glob 直接匹配资源数，生效为按优先级 first-match 后实际决定分类的资源数

## 图片预览与全屏查看

所有图片资源与角色立绘预览都通过共享组件展示：
- `StateThumbnail`: 根据 `CharacterState.path` 查找实际 `FileEntry`，支持脚本路径 `images/...` 匹配工作区路径 `game/images/...`
- `ImageFileThumb`: 用 `getImagePreviewUrl()` 读取图片 / 缩略图，点击可全屏查看
- `ImagePreview`: 资产详情里的图片预览
- `CharacterAvatar`: 行列表、角色列表等紧凑位置的角色代表立绘

关键约束：
- 预览必须遵从原图原比例，使用 `max-h/max-w + object-contain`，不得用固定 `aspect-video` 或 `h-full w-full` 强行铺满导致比例失真
- 所有图片资源都应可点击全屏展示，全屏层用 portal 挂到 `document.body`
- 全屏预览按 `Esc` 或点击遮罩关闭
- 资产详情图片预览和全屏预览提供缩放比例控制（50%–300%）与透明棋盘背景开关
- 若图片文件无法匹配，才允许退回颜色占位；正常角色/立绘位置不应显示“前两个字母”占位

## 立绘快插与立绘候选

### 立绘快插（SpriteView 三栏）

`sprite-view.tsx` 是「立绘快插」工作流，不是普通立绘库浏览：

```
[左 280px] 筛选侧栏：搜索导航 / 章节 / 角色 / 全部可编辑行 / 有角色 / 对白 / 有草稿
[中 窄列]  筛选后的对白/旁白/选项行列表，J/K 快速切换，选中行自动尽量居中
[右 宽列]  当前角色拥有的所有立绘，真实图片预览
  → 当前选中行必须是 dialogue 才能套用立绘
  → 点击立绘 = 改写对白头部，不插入 show
  → 示例：e "你好" + 选择 e happy → e happy "你好"
  → 若该行有草稿文本，套用立绘时一并写回并清除对应草稿
  → 立绘卡片中的图片按原图比例居中显示，不强制占满整行宽度
  → 立绘卡片使用 flex-wrap 多列排列，一行可展示多个立绘
  → 右侧顶部 slider 调整立绘卡片缩放，写入 `UserSettings.spriteCardScale`
  → 点击行列表时根据 `RpyLine.target` 匹配当前角色 state，并在右侧高亮对应立绘
  → 中栏底部只显示当前行原代码，不展示 Visual / Review 的修改栏
```

实现入口：
- `replaceDialogueSprite(raw, state)`: 保留对白文本、引号、`with` 修饰，仅替换角色后面的 image attributes
- `parseLine()`: dialogue 解析支持 `e "..."` 和 `e happy "..."`，`RpyLine.target` 保存现有 attributes
- `sprite-view.tsx` 的行选择需要同步当前立绘高亮：无 attributes 时优先匹配 default/normal/idle，存在 attributes 时匹配 image tag 去掉首 token 后的属性串

### VisualView 立绘候选

VisualView 右侧 SpritePicker / 立绘候选面板已暂时停用，右侧工具栏先不展示：
- `visual-view.tsx` 保留注释说明，后续重新设计右侧工具栏时再恢复
- 传统 `show/scene` 快捷插入暂时只保留命令面板入口
- 可视化编辑器当前聚焦文件列表 + 结构化行列表 + 当前行编辑/插入/删除

## 通用行号跳转

所有文本文件相关的 `filePath:lineNumber` 跳转入口都应使用共享组件 `LineJumpButton`：
- Review 行详情
- 资产章节 label 跳转
- 角色代表立绘的 image 定义跳转
- 立绘卡片的 image 定义跳转

新增文本文件位置入口时，不要手写一次性跳转按钮。

## 行编辑性能

所有行编辑/行选择列表统一走共享 `LineList`：
- `LineList` 内置轻量虚拟滚动，不再对可见脚本行硬截断到 800 行
- VisualView / ReviewView / SpriteView 等行编辑位置必须复用它
- 选中行变化时由虚拟容器自动滚动到可见区域
- 行内角色查找使用 `Map` 派生，避免每行重复线性查找
- 搜索命中通过 `searchMatchLineKeys` 传入 `LineList`，只做行高亮，不改变列表数据源

## 搜索导航（非过滤）

文件索引、校对队列、立绘快插的搜索都是 VSCode 风格的命中导航，不是筛选：
- 输入搜索词后原列表保持不变，只显示命中数量与当前位置，并通过上 / 下按钮跳转。
- 文件索引搜索范围：文件名 / 路径 + `.rpy` 行的路径、行号、类型、角色 id、角色显示名、target、正文、原始行；文件名命中跳文件，行命中跳到具体行。
- 校对队列搜索范围：当前校对队列筛选结果内的行；状态、章节、角色筛选仍决定队列范围，搜索只在该范围内跳转和高亮。
- 立绘快插搜索范围：当前立绘筛选结果内的行，并额外匹配所属章节 title / entryLabel；正文或角色命中会同步选中行与右侧立绘状态。
- 搜索命中文件 / 行使用 `bg-info/10` 和信息圆点标记，当前选中行仍优先使用更明显的 `ring-info` 高亮。

## 行级 CRUD

脚本行作为核心编辑对象，至少提供基础 CRUD：
- Create: Visual / Review 可在当前行上方或下方插入空白对白/旁白/选项行，按当前行缩进与角色上下文生成默认 Ren'Py 行
- Update: 可编辑行继续通过草稿 + `Ctrl/Cmd+S` / 保存按钮写回；Visual / Review 都必须支持修改说话人（character），对白与旁白之间可互转
- Delete: Visual / Review 可删除当前行，删除前必须确认
- 插入或删除会改变同文件后续行号；若该文件存在草稿，操作前提示并清除该文件草稿，避免草稿写回错行
- 若同文件 Monaco 源文件草稿未保存，结构化插入/删除必须先阻止并提示保存源文件草稿
- 保存后仍走 `persistLines()` + `rescanFiles()` 增量重扫
- Visual / Review 共用底部 `LineOperationPanel`，操作区置于主编辑面板底部，不放在右侧信息栏
- Review 顶部提供「修改栏」开关，可隐藏 / 显示底部 `LineOperationPanel`，偏好写入 `UserSettings.reviewOperationPanelVisible`
- Visual / Review 的 `LineOperationPanel` 顶部必须显示当前行原代码内容；立绘快插中栏底部也显示同一类原代码条，但不提供修改操作
- 行列表里的文本行支持右键菜单，提供保存、插入、复制、删除等当前行操作；右键菜单不放在底部操作面板上
- Review 顶部工具栏只保留筛选、导航和批量提交；单行保存只放在底部操作面板，避免按钮重复
- 所有已经支持快捷键的按钮必须在按钮内显示快捷键标记，例如 `Ctrl+S`、`Ctrl+Shift+S`、`J`、`K`

## 角色与图片分离

- **角色 tab** (`getCharacterAssetRows`): 仅返回 `CharacterRegistryItem`，每张卡片显示 `characterPreviewState()` 选出的真实代表立绘缩略图
- **图片 tab** (`getImageAssetRows`): 包含所有 `kind === 'image'` 文件，按用户规则分类，标记 `referenced`（是否被 `image/show/scene` 引用）
- **音频 tab** (`getAudioAssetRows`): 同理，标记 `referenced`

未被引用的资源在表格中以 `text-destructive` 显示。

资产管理布局：
- 左侧 sidebar 仅用于选择 tab 和条目
- 中间内容区展示当前选中条目的详情、编辑器、预览和跳转
- 路径规则通过顶部按钮打开 modal/dialog，不作为 tab

## 角色与 image 归属解析

Ren'Py 常见写法：
```renpy
image tamu = "images/character/tamu.png"
define tamu_c = Character("塔木", image="tamu")
```

应解析为：
- 角色：`塔木` / `tamu_c`
- 代表立绘状态：`imageTag = tamu`
- `image tamu` 不应额外生成一个 `tamu` 角色

解析规则：
- `parseCharacterDefine()` 提取 `Character(..., image="tag")`
- `buildRpyIndex()` 先收集 `imageAliases: image tag -> character id`
- 再把 image line 转为 `CharacterState`，优先按 alias 归属到真实角色
- 无 alias 时才回退到 image tag 的第一个 token 作为角色 id

## Monaco 集成

`components/editor/monaco-editor.tsx`：
- 直接使用 `monaco-editor` 创建 editor/model，构建产物进入 `dist/assets`，不依赖 `@monaco-editor/loader` 或 CDN fallback
- 自动按文件扩展名选择 language（rpy → `renpy`，py → `python`）
- 内置 Ren'Py Monarch token provider：label/image/define/show/scene/play/voice/jump/call/menu/python 等行级语法高亮
- 主题跟随 `UserSettings.theme`（light → `vs`, dark → `vs-dark`）、字体 Cascadia Mono、字号 13、tab=4
- `automaticLayout: true` 自适应容器尺寸

## React 最佳实践应用

按 Vercel 规范：
- ✅ `bundle-local-monaco` — IDE 类应用同步加载 Monaco，并用本地 `monaco-editor` 打包，避免运行时外部 CDN 请求
- ✅ `bundle-barrel-imports` — 直接导入组件，无 barrel
- ✅ `rerender-derived-state-no-effect` — `selectedFile/selectedLine/selectedChapter/dirtyByFile` 全用 `useMemo` 派生
- ✅ `rerender-functional-setstate` — `setDrafts(prev => ...)` 维持回调稳定
- ✅ `rerender-memo` — Topbar 等大组件按需 memo
- ✅ `js-set-map-lookups` — `dirtyByFile: Set`, `linesByFile: Record`
- ✅ `client-localstorage-schema` — 7 个独立 key 不互相影响
- ✅ `rendering-content-visibility / virtual list` — 行编辑列表使用共享虚拟滚动窗口

## 文件结构（实际）

```
src/
├── App.tsx                       # 主壳 + Provider 组合 + 业务逻辑
├── main.tsx
├── index.css                     # Tailwind + theme tokens
├── types.ts
├── appHelpers.ts                 # 跨视图纯函数
├── lib/
│   └── cn.ts                     # twMerge + clsx
├── hooks/
│   ├── useToast.tsx              # Sonner Toast 适配
│   ├── useDialog.tsx             # Tailwind Dialog
│   ├── useCommandPalette.tsx     # Cmd+K 命令面板
│   ├── useHotkeys.ts
│   ├── useUnsavedGuard.ts
│   └── useResizableSidebar.ts    # sidebar 鼠标拖拽宽度 + localStorage 持久化
├── services/
│   ├── workspace.ts              # 扫描 + 增量重扫 + .gitignore
│   ├── rpyParser.ts              # 行级正则解析
│   ├── settings.ts               # 4 类持久化
│   ├── tour-guide.ts             # 用户旅程引导步骤配置
│   ├── asset-rules.ts            # 路径规则匹配
│   ├── storage.ts                # IndexedDB 封装
│   └── thumbnails.ts             # createImageBitmap + IDB 缓存
├── components/
│   ├── ui/                       # shadcn 风格自建
│   │   ├── button.tsx            # cva 变体
│   │   ├── badge.tsx
│   │   ├── input.tsx
│   │   └── scroll.tsx
│   ├── layout/
│   │   ├── topbar.tsx            # 含路径栏
│   │   └── status-rail.tsx
│   ├── editor/
│   │   └── monaco-editor.tsx     # Monaco 本地同步加载 + Ren'Py token provider
│   ├── shared.tsx                # LineList/FileSidebar/Toolbar/图片预览/行号跳转/拖拽分隔条
│   ├── tour-guide.tsx            # Motion 引导 overlay / spotlight / 步骤卡片
│   └── views/
│       ├── home-view.tsx
│       ├── visual-view.tsx       # 可视化行编辑；右侧 SpritePicker 暂停展示
│       ├── review-view.tsx       # 三栏固定高度滚动
│       ├── sprite-view.tsx       # 立绘快插：改写对白头部
│       ├── assets-view.tsx       # 资产详情 + 路径规则 dialog
│       └── about-view.tsx        # 关于页 + 主题调整入口
└── assets/
```

## 已完成的本轮目标（2026-06-12）

✅ 1. 引入 Tailwind 4 + 自建 shadcn 风格组件，删除 `App.css`
✅ 2. 资产路径规则系统（`AssetPathRule`），用户在 资产管理顶部按钮打开 dialog 配置
✅ 3. 顶栏全局文件路径栏（workspace › 当前文件）
✅ 4. Monaco Editor 集成（动态加载，自动语言识别）
✅ 5. 立绘插入侧栏：当前行 characterId 智能过滤 + 单击选中 + 双击替换 show
✅ 6. 角色与图片分离：角色 tab 显示代表立绘，图片/音频独立 tab 含引用状态
✅ 7. Review 三栏 `h-[calc(100vh-var(--shell-chrome))]` 固定高度，内部 `overflow-auto` 滚动
✅ 8. Shell 高度精确计算：3.5rem topbar + 2rem 路径栏 + 2rem 状态栏 = 7.5rem
✅ 9. AGENTS.md 同步本架构
✅ 10. 文本 Review / 立绘快插 J/K 切换时选中行自动尽量居中
✅ 11. 立绘快插改为点击立绘后直接改写对白头部（如 `e happy "..."`），不插入 show
✅ 12. 角色与 image alias 归属修正：`Character(image="tag")` 关联到对应 image 定义
✅ 13. 所有角色/立绘/图片资源预览改为真实图片，支持点击全屏，并遵从原图比例
✅ 14. 通用 `LineJumpButton` 覆盖文本文件行号跳转入口
✅ 15. 资产路径规则改为资产管理顶部按钮 + modal/dialog
✅ 16. 首页精简为数据统计 / 项目健康 / 诊断，无 sidebar
✅ 17. `LineList` 增加虚拟滚动，所有行编辑列表复用
✅ 18. 增加 dark mode 与主题调整入口，Monaco 跟随主题
✅ 19. 增加关于页空壳
✅ 20. 路径规则支持从工作区资源目录可视化选择并生成 glob
✅ 21. Visual / Review / Sprite / Assets / 路径规则目录 sidebar 支持鼠标拖拽调整宽度
✅ 22. Resize handle 命中区扩大到 12px，视觉仍保持中心细分隔线
✅ 23. 立绘快插卡片图片按原图比例居中展示，不再强制占满行宽
✅ 24. VisualView 右侧立绘候选 / 工具栏暂时停用，保留恢复注释
✅ 25. Visual / Review 增加当前行上方插入、下方插入、删除行操作，补齐脚本行基础 CRUD
✅ 26. Resize 宽度限制改为仅保留最小值，不再设置最大宽度
✅ 27. Visual / Review 共用底部行操作面板，支持说话人修改；行列表文本行支持右键菜单
✅ 28. 支持快捷键的按钮显示快捷键标记（如 Ctrl+S / Ctrl+Shift+S / J / K）
✅ 29. 立绘快插右侧立绘卡片改为 flex-wrap 多列展示，并支持 slider 调整缩放
✅ 30. `UserSettings.spriteCardScale` 持久化立绘卡片缩放参数
✅ 31. Visual / Review 通用底部修改栏顶部显示当前行原代码；立绘快插中栏底部显示原代码条但不开放修改
✅ 32. 立绘快插点击行列表时根据当前对白 attributes 自动高亮右侧对应立绘
✅ 33. 立绘快插左侧改为参考文本 Review 的筛选 sidebar，支持搜索导航、章节筛选、角色筛选、有角色行筛选、对白筛选和草稿筛选
✅ 34. Review 校对支持 `1 / 2 / 3 / 0` 状态快捷键、执行后自动跳转下一行，并支持 Shift 连选、Ctrl/Cmd 多选、Ctrl/Cmd+A 全选当前队列、Esc 取消多选
✅ 35. Review 支持备注 / 修改意见、校对 JSON 导入 / 导出，以及底部修改栏显示 / 隐藏持久化
✅ 36. 文件索引、校对队列、立绘快插搜索统一改为非过滤式命中导航，显示命中数并支持上 / 下跳转
✅ 37. shadcn Sonner 替换自建 Toast，保留 `useToast()` 业务 API 作为适配层
✅ 38. Monaco 改为 IDE 类同步加载，直接使用本地 `monaco-editor` 打包到 `dist`，并新增 Ren'Py 语法 token provider
✅ 39. 新增首屏 boot screen：`index.html` 静态兜底 + React 恢复工作区启动屏，并移除重复 `restoreWorkspace()`
✅ 40. 路径规则编辑器实时预览 glob 命中数与按优先级实际生效数
✅ 41. 图片预览支持 50%–300% 缩放和透明棋盘背景，资产详情与全屏预览共用控件
✅ 42. 引入 `motion`，为主视图切换和用户旅程引导提供轻量过渡动画，并支持 `UserSettings.motionEnabled` 关闭
✅ 43. 按产品 / 用户旅程重排 Tour Guide：项目说明 → 打开工作区 → 资产管理 → 立绘快插 → 文本 Review → 可视化编辑器 → 关于；不再介绍首页，无工作区时仅展示项目说明与打开工作区
✅ 44. Sonner Toast 主题跟随 `UserSettings.theme`，light / dark 与应用界面保持一致
✅ 45. 关于页补充 `rpy-tool` 项目说明，覆盖本地离线、版本管理建议和写后流程定位
✅ 46. 主视图 tab 切换动画改为按导航顺序横向滑动，更符合左右切换直觉

## 命令快捷键

- `Ctrl/Cmd + K`: 打开命令面板
- `Ctrl/Cmd + S`: 保存当前行 / 源文件
- `Ctrl/Cmd + Shift + S`: 提交全部草稿
- `F5`: 重扫工作区
- `J / K`: Review / 立绘快插视图上下行（不在输入控件中时）
- Review: `1` 通过、`2` 需修改、`3` 忽略、`0` 重置；`Ctrl/Cmd+A` 全选当前队列，`Esc` 取消多选
- Tour Guide: `Esc` 临时关闭，`← / →` 上一步 / 下一步
- 命令面板额外提供：在当前行上方插入、下方插入、删除当前行、插入 show

## 验证（已通过）

- ✅ `pnpm exec tsc -b` 类型检查通过
- ✅ `pnpm run lint` 通过
- ✅ `pnpm run build` 构建通过：3392 modules；Monaco 主体、worker、语言模块与 motion 依赖均输出到 `dist/assets`
- ✅ 本地 Vite dev server 已启动到 `http://localhost:5175/`（5173/5174 被占用后自动换端口），PowerShell `Invoke-WebRequest` 返回 200
- ✅ 路径别名 `@/*` 在 ts/vite 双侧生效
- ✅ `dist` 中无 `cdn.jsdelivr.net` / `jsdelivr` / `unpkg` Monaco loader 依赖；`monaco-editor@` 命中仅为 Monaco 内部 DOM selector 文本
- ⚠️ 本轮未完成浏览器自动视觉检查：当前 Browser 插件目录缺少其说明要求的 `scripts/browser-client.mjs`

## 仍可优化项

暂无。上一轮优化项已完成并回写到本文件。
