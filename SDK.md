# Ren'Py SDK 使用说明

当前 SDK 位于 `src/sdk/`，目标是把 Ren'Py 项目的解析、索引、读写和保格式行级编辑从 React UI 中拆出来。React 只负责展示、交互、toast/dialog、草稿和选中状态。

## 核心入口

```ts
import { RenpyProjectSdk } from './src/sdk/project'
import { MemoryFileAdapter } from './src/sdk/memory-file-adapter'

const sdk = new RenpyProjectSdk(
  new MemoryFileAdapter({
    'game/script.rpy': 'label start:\n    e "Hello"',
  }),
)

const snapshot = await sdk.scan()
```

`snapshot` 是纯数据对象，包含：

- `files`: 工作区文件元数据
- `index.lines`: 脚本行索引
- `index.characters`: 角色与立绘状态
- `index.assets`: 图片/音频资产引用
- `index.chapters`: label 章节
- `index.diagnostics`: 诊断信息

## 文件 Adapter

SDK 通过 `RenpyFileAdapter` 访问文件，不直接绑定 React 或浏览器 API。

```ts
interface RenpyFileAdapter {
  name: string
  listFiles(): Promise<FileEntry[]>
  readText(path: string): Promise<string>
  writeText(path: string, content: string): Promise<void>
  stat(
    path: string,
  ): Promise<{ size: number; lastModified?: number } | undefined>
  readBlob?(path: string): Promise<Blob>
}
```

已提供：

- `BrowserFileSystemAdapter`: 浏览器 File System Access API，用于当前前端应用
- `MemoryFileAdapter`: 内存文件系统，用于 Bun/Node smoke、解析验证和自动化脚本

后续可按同一接口补 `NodeFileSystemAdapter`。

## 浏览器中使用

当前前端通过 `services/workspace.ts` 连接浏览器目录句柄：

```ts
import { BrowserFileSystemAdapter } from './src/sdk/browser-file-adapter'
import { RenpyProjectSdk } from './src/sdk/project'

const sdk = new RenpyProjectSdk(new BrowserFileSystemAdapter(rootHandle))
const snapshot = await sdk.scan()
```

## Bun / 自动化中使用

内存 adapter 可直接跑 SDK 行为：

```ts
import { RenpyProjectSdk } from './src/sdk/project'
import { MemoryFileAdapter } from './src/sdk/memory-file-adapter'

const sdk = new RenpyProjectSdk(
  new MemoryFileAdapter({
    'game/script.rpy': [
      'define e = Character("艾琳", image="e")',
      'image e happy = "images/e_happy.png"',
      'label start:',
      '    e "Hello"',
    ].join('\n'),
  }),
)

let snapshot = await sdk.scan()
const line = snapshot.index.lines.find((item) => item.kind === 'dialogue')
const state = snapshot.index.characters
  .flatMap((character) => character.states)
  .find((item) => item.imageTag === 'e happy')

if (!line || !state) throw new Error('示例脚本缺少对白或立绘')

const result = await sdk.applyDialogueSprite(snapshot, line, {
  state,
  text: '你好，SDK。',
})

snapshot = result.snapshot
console.log(await sdk.readTextFile(line.filePath))
```

本项目已初始化 smoke 脚本：

```bash
bun run sdk:smoke
```

脚本位置：`scripts/sdk/memory-smoke.ts`

## 常用方法

```ts
await sdk.scan()
await sdk.rescanFiles(snapshot, ['game/script.rpy'])

await sdk.readTextFile('game/script.rpy')
await sdk.writeTextFile('game/script.rpy', content)

await sdk.saveEditableLine(snapshot, line, {
  text: '新的对白',
  speakerId: 'e',
})

await sdk.applyDialogueSprite(snapshot, line, {
  state,
  text: '新的对白',
})

await sdk.insertEditableLine(snapshot, line, 'after')
await sdk.deleteLine(snapshot, line)

await sdk.insertShowCommand(snapshot, line, {
  state,
  position: 'left',
  transition: 'dissolve',
  variant: 'show',
})
```

## 设计约束

- SDK 返回 plain data，不持有 React state。
- SDK 保留行级源码写回，不通过 AST 重排整份脚本。
- `FileEntry` 不包含浏览器 `FileSystemFileHandle`。
- 浏览器句柄、IndexedDB、localStorage、toast/dialog 都属于前端服务层。
- 官方 Ren'Py/Python/WASM parser 后续可以作为 parser backend 增强，不影响 SDK 门面。
