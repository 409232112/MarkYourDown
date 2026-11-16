# MarkYourDown

MarkYourDown 是一款面向 Windows 的本地 Markdown 编辑器，基于 Wails、Go 和 Vue 构建。

![MarkYourDown 编辑器预览](docs/screenshot.png)

## 功能

- 所见即所得编辑与源码模式切换
- 多文档标签、文件夹工作区、大纲、查找与替换
- 支持表格、任务列表、代码高亮、数学公式和 Mermaid 图表
- 支持插入本地图片、自动保存、草稿备份和 HTML 导出
- 支持主题、正文宽度、专注模式和打字机模式

## 开发与构建

环境要求：Windows、Go 1.26+、Node.js 22.12+、npm、Wails v3 CLI 和 WebView2 Runtime。生成 Windows 安装程序还需要 NSIS。

在项目根目录运行：

```bash
# 启动开发模式
wails3 task dev

# 构建应用
wails3 task build

# 构建应用并生成安装程序
wails3 task package
```

构建结果位于 `bin/`：`markyourdown.exe` 为应用程序，`markyourdown-amd64-installer.exe` 为安装程序。

运行测试：

```bash
go test ./...
cd frontend
npm install
npm test
```

## 项目结构

```text
frontend/   Vue 前端、编辑器与导出功能
internal/   Go 后端、文件操作与系统服务
build/      构建配置和打包资源
tests/      测试与测试样本
```

## 常用快捷键

| 操作 | 快捷键 |
| --- | --- |
| 新建 / 打开 / 保存 | Ctrl+N / Ctrl+O / Ctrl+S |
| 打开文件夹 / 另存为 | Ctrl+Shift+O / Ctrl+Shift+S |
| 切换源码模式 | Ctrl+/ |
| 查找 / 替换 | Ctrl+F / Ctrl+H |
| 导出 HTML | Ctrl+Shift+E |
| 专注模式 / 打字机模式 | F8 / F9 |
