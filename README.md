# rpy-tool

纯前端 Ren'Py 工作区辅助工具，面向 Chrome / Edge，通过 File System Access API 在本地读取和写回项目文件。项目定位是写后校对、审阅、修改和立绘差分查分。

## 开发

本项目使用 Bun 作为包管理器和脚本入口。

```bash
bun install
bun run dev
bun run typecheck
bun run lint
bun run build
```

部署到 Cloudflare Pages：

```bash
bun run deploy:pages
```

## 文档

- [用户旅程梳理](./docs/user-journey.md)
- [工程架构与约束](./AGENTS.md)
