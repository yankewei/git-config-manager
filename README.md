# Git Config Manager

Git Config Manager 是一个基于 Wails 的桌面应用，用于集中查看和管理 Git 配置。项目采用 Go 作为后端、React + TypeScript 作为前端，通过同一界面对全局与仓库级别的配置进行浏览和维护。

## 功能特性

- **全局配置总览**：在「全局配置」标签页中读取并展示 `git config --global` 的完整内容，包含键值、作用域与文件来源。
- **仓库管理**：
  - 通过 Finder 选择本地目录，应用会验证其是否为 Git 仓库并加入扫描列表。
  - 扫描结果按名称排序展示，可快速切换查看不同仓库。
  - 配置表格显示每个键的最终值以及来源文件/行号。
- **变更历史**：展示最近一次写入操作的 diff，支持模拟写入或触发回滚。
- **includeIf 规则维护**：在侧栏中新增、启用/禁用或删除 includeIf 规则。

## 运行环境

- Go 1.20+
- Node.js 16+
- Wails CLI（`go install github.com/wailsapp/wails/v2/cmd/wails@latest`）

## 安装与开发

```bash
# 安装前端依赖
npm install --prefix frontend

# 启动桌面开发模式（Go + Vite 热重载）
wails dev
```

也可以仅运行前端：

```bash
npm run dev --prefix frontend
```

## 构建

```bash
# 前端编译 + TypeScript 检查
npm run build --prefix frontend

# 生成桌面应用发行包
wails build
```

## 测试

```bash
go test ./...
```

（目前项目尚未添加前端单元测试，可根据需要引入 Vitest 或 React Testing Library。）

## 项目结构

```
.
├── app.go                       // Wails 应用入口逻辑
├── main.go                      // Wails 引导和资源绑定
├── internal/gitcfg/             // Git 配置领域逻辑（服务与类型定义）
├── frontend/                    // React + Vite 前端
│   ├── src/App.tsx              // 主界面，包含全局/仓库标签页
│   ├── wailsjs/                 // Wails 自动生成的前端绑定
│   └── ...                      // 样式、静态资源、配置
└── wails.json                   // Wails 项目配置
```

## 常见操作

1. 启动应用并选择「仓库」标签页。
2. 点击「选择目录」，在 Finder 中挑选一个 Git 仓库。
3. 从仓库列表中选择目标条目，即可查看其配置总览与最近变更。
4. 切换到「全局配置」标签页，查看用户级 Git 配置。
5. 在侧栏维护 includeIf 规则，或在「最近变更」区域触发模拟写入/回滚。

欢迎根据实际需求继续扩展：例如增加配置搜索、更多诊断能力或命令行导出功能等。祝使用愉快！
