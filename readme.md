# PDF 标注 + 公式编辑器

> 一个 PDF 阅读与批注工具。支持 PDF 阅读、区域截图、图片上传、MathLive 公式编辑、在 PDF 上绘制标注，以及导出修改后的 PDF。
>
> **同时支持两种运行方式：**
> - 🌐 **网页版**（原生 HTML/JS，起个 HTTP 服务就能用）
> - 🖥️ **Electron 桌面版**（可打包成 `.exe` / `.dmg` / `.AppImage`，双击即用）

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Electron](https://img.shields.io/badge/Electron-30.x-47848F.svg) ![HTML](https://img.shields.io/badge/HTML-5-orange.svg) ![CSS](https://img.shields.io/badge/CSS-3-blue.svg) ![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg) ![PDF.js](https://img.shields.io/badge/PDF.js-3.11.174-red.svg) ![MathLive](https://img.shields.io/badge/MathLive-local-green.svg)

---

## ✨ 特性

### 📖 PDF 阅读
- 翻页（按钮 / 键盘 ←→）、缩放、页码跳转
- 拖拽 / 单击 / 悬停提示上传 PDF
- 文字层可选中、链接可点击
- **内部链接悬浮预览**：鼠标移到 `[1]` 等引用链接上，浮窗显示参考文献那一块的**实际内容**（行数自适应 2~5 行）

### ✏️ 标注与批注
- **7 种工具**：自由画笔、直线、箭头、高亮、矩形框、文字批注、选择
- **文字批注**：点击位置**直接输入**（不弹窗），支持换行；选择工具下**双击即可再次编辑**
- **贴图**：截图 / 图片 / 公式都能贴到 PDF，8 个控制点自由缩放
- **颜色可选**、**撤销**、**清空当前页**

### 📋 标注列表
- 右侧「标注」标签列出**当前页**所有元素
- 点击定位、👁 隐藏/显示、✕ 单独删除
- 全部隐藏 / 全部显示 / 清空本页
- **隐藏的元素不会被导出到 PDF**

### 📷 截图 / 素材
- **PDF 区域截图**：工具栏「截图」→ 在 PDF 上拖拽框选
- **网页框选截图**：右上角 📷 → 在网页上拖拽任意区域（零偏差）
- **上传图片**：本地图片、`Win + Shift + S` 截图都能上传
- **素材面板**：截图和上传图片**合并显示**，按时间倒序排列

### 🧮 公式编辑
- 基于 **MathLive** 的所见即所得编辑器，支持虚拟键盘
- **Shift + Enter 换行**（自动包 `aligned` 环境）
- 公式以 **LaTeX 源码**保存，可复制、可重新载入编辑
- 公式列表用 `<math-field readonly>` 渲染预览

### 💾 数据管理
- 所有记录自动保存到浏览器 `localStorage`
- **导出 / 导入 JSON 记录**（追加或替换）
- **导出修改后的 PDF**：标注烧录进原文件（隐藏的标注不导出）

### 🎨 界面
- 左右分栏，可拖拽调整宽度，双击折叠
- **三个标签页**：素材 / 公式 / 标注
- 未加载 PDF 时，鼠标悬停在预览区会变暗并提示「点击选择 PDF 文件」

---

## 🚀 快速开始

### 方式 A：Electron 桌面版（推荐）

#### 1. 克隆项目

```bash
git clone https://github.com/HDU_Link/pdf-annotator.git
cd pdf-annotator
```

#### 2. 安装依赖

```bash
npm install
```

> 国内网络慢的话，先在项目根目录建一个 `.npmrc`：
>
> ```
> registry=https://registry.npmmirror.com
> electron_mirror=https://npmmirror.com/mirrors/electron/
> electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
> ```
>
> 然后重装：`npm install`

#### 3. 启动开发

```bash
npm start
```

#### 4. 打包成安装包

```bash
# Windows
npm run build:win

# macOS（需在 Mac 上执行）
npm run build:mac

# Linux
npm run build:linux
```

产物在 `dist/` 目录，Windows 下会得到：
- `PDF Annotator Setup x.x.x.exe`（**安装版，发给别人用这个**）
- `PDF Annotator x.x.x.exe`（便携版，免安装）

---

### 方式 B：网页版（无需 Electron）

#### 1. 准备 MathLive 本地依赖

从 [MathLive Releases](https://github.com/arnog/mathlive/releases) 下载，放入：

```
mathlive/
├── mathlive.min.js
└── fonts/
    ├── KaTeX_Main-Regular.woff2
    ├── KaTeX_Math-Italic.woff2
    └── ...
```

#### 2. 启动本地服务器

**必须用 HTTP 服务访问**（MathLive 是 ES Module，`file://` 下会被 CORS 拦截）：

```bash
# 任选其一
python -m http.server 8000
py -m http.server 8000
npx serve .
```

#### 3. 打开浏览器

```
http://localhost:8000/index.html
```

---

## 🛠️ 技术栈

| 技术 | 用途 |
| --- | --- |
| [Electron](https://www.electronjs.org/) | 桌面应用外壳 |
| [electron-builder](https://www.electron.build/) | 打包为 exe / dmg / AppImage |
| [PDF.js](https://mozilla.github.io/pdf.js/) | PDF 渲染、文字层、链接层 |
| [pdf-lib](https://pdf-lib.js.org/) | 生成修改后的 PDF |
| [MathLive](https://mathlive.io/) | LaTeX 公式可视化编辑 |
| [html2canvas](https://html2canvas.hertzen.com/) | 网页框选截图 |
| [Font Awesome](https://fontawesome.com/) | 图标 |
| 原生 JavaScript | 无框架，无构建步骤 |

---

## 📂 项目结构

```
pdf-annotator/
├── package.json               # npm 依赖 + electron-builder 打包配置
├── main.js                    # Electron 主进程（创建窗口 / 原生菜单 / IPC）
├── preload.js                 # Electron 预加载脚本（安全桥接）
├── .npmrc                     # npm 镜像配置（可选，加速国内安装）
├── build/                     # 打包资源
│   └── icon.png               # 应用图标
├── renderer/                  # ★ 渲染进程（原网页版全部内容）
│   ├── index.html             # 主页面
│   ├── styles.css             # 全部样式
│   ├── script.core.js         # 核心：常量 / 状态 / 工具 / 存储 / 布局
│   ├── script.pdf.js          # PDF：加载 / 渲染 / 翻页 / 缩放 / 链接 / 悬浮预览
│   ├── script.panels.js       # 面板：素材 / 公式 / 标注列表 / 网页截图 / 导入导出
│   ├── annotation.js          # 标注模块（绘制 / 文字 / 贴图 / 导出 PDF）
│   └── mathlive/              # MathLive 本地依赖
│       ├── mathlive.min.js
│       └── fonts/
├── dist/                      # 打包输出（npm run build:win 后生成）
│   ├── PDF Annotator Setup x.x.x.exe
│   ├── PDF Annotator x.x.x.exe
│   └── win-unpacked/
├── README.md
└── LICENSE
```

### 模块职责

| 文件 | 职责 |
| --- | --- |
| **`main.js`** | Electron 主进程：创建 `BrowserWindow`、加载 `renderer/index.html`、原生菜单（`Ctrl+O` 打开 PDF）、IPC 保存文件 |
| **`preload.js`** | 通过 `contextBridge` 暴露 `window.electronAPI`，让渲染进程能调 IPC |
| **`script.core.js`** | 常量、`App.state` 全局状态、工具函数、`localStorage` 读写、布局分栏 / 折叠 / 分隔条、右侧标签切换 |
| **`script.pdf.js`** | PDF 加载 / 渲染（画布 + 文字层 + 链接层）、翻页 / 跳页 / 缩放、键盘方向键、内部链接悬浮预览、拖拽 / 单击上传 |
| **`script.panels.js`** | 素材面板（截图 + 图片）、公式面板（MathLive）、标注列表面板、网页框选截图、JSON 导入导出 |
| **`annotation.js`** | 标注绘制 / 文字内联输入 / 贴图缩放 / 隐藏 / `window.__annotatorList` API / 用 pdf-lib 导出 PDF |

**通信方式**：三个 `script.*.js` 挂在同一个全局命名空间 `window.App` 上，通过 `App.xxx` 互访，无需模块系统。

---

## 🔧 开发指南

### npm 脚本一览

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动 Electron 开发（等同 `electron .`） |
| `npm run dev` | 启动并打开 Chromium 日志（等同 `electron . --enable-logging`） |
| `npm run build:win` | 打包 Windows 安装包（`.exe` + 便携版） |
| `npm run build:mac` | 打包 macOS（`.dmg`，**必须在 Mac 上执行**） |
| `npm run build:linux` | 打包 Linux（`.AppImage` / `.deb`） |
| `npm run build` | 按当前系统打包 |

### 调试技巧

#### 渲染进程调试（HTML/CSS/JS）

启动后按 `Ctrl + Shift + I`（macOS 是 `Cmd + Option + I`）打开 **DevTools**，跟浏览器里一样用：

- **Console**：看 `console.log` 和报错
- **Elements**：审查 DOM、改 CSS 实时生效
- **Sources**：打断点、单步调试
- **Application → Local Storage**：查看 / 清空 `localStorage` 数据

> 或者在 `main.js` 里取消注释 `mainWindow.webContents.openDevTools();`，让 DevTools 默认打开。

#### 主进程调试（`main.js`）

主进程的 `console.log` **直接输出到启动 Electron 的终端**。比如：

```bash
npm start
# 终端里会打印 main.js 里的 console.log
```

想看更详细的 Chromium 日志：

```bash
npm run dev
```

#### 热重载

Electron **默认没有热重载**，改完文件后：

- 改 `renderer/` 下的文件 → 按 `Ctrl + R` 重载渲染进程
- 改 `main.js` → 需要**完全关掉再 `npm start`**

如果想要自动重载，可以装：

```bash
npm install --save-dev electron-reloader
```

然后在 `main.js` 顶部加：

```js
try { require('electron-reloader')(module); } catch (_) {}
```

---

## 📦 打包成 exe 注意事项

### 首次打包可能遇到的坑

#### 1. `ECONNRESET` 或下载超时

Electron 二进制（约 100MB）走 GitHub Release，国内经常失败。**建 `.npmrc`** 加镜像：

```
registry=https://registry.npmmirror.com
electron_mirror=https://npmmirror.com/mirrors/electron/
electron_builder_binaries_mirror=https://npmmirror.com/mirrors/electron-builder-binaries/
```

然后 `npm install` 重装。

#### 2. `Cannot create symbolic link` 报错

打包时解压 `winCodeSign` 工具包会因为**普通用户没有创建符号链接的权限**而失败。**三个解决方案任选其一**：

- **方案 A（推荐）**：Windows 设置 → 隐私和安全性 → 开发者选项 → **打开"开发者模式"**
- **方案 B**：**以管理员身份**运行 CMD，再执行 `npm run build:win`
- **方案 C**：手动下载 `winCodeSign-2.6.0.7z` 解压到 `C:\Users\<你>\AppData\Local\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0\`

#### 3. 打包产物 300MB+ 是正常的

Electron 会把整个 Chromium + Node 运行时打进去，**体积大是正常现象**，没法显著压缩。

#### 4. 别人第一次打开会看到"Windows 保护"警告

因为你的 exe **没有代码签名证书**。让对方：

- 点 **"更多信息"** → **"仍要运行"**
- 或者：右键 exe → **属性** → 勾选底部 **"解除锁定"** → 确定

要消除警告只能买代码签名证书（个人项目一般不做）。

#### 5. macOS 打包必须在 Mac 上

苹果平台限制，Windows 上打不出可用的 `.dmg`。

---

## 📖 使用指南

### 快速上手

1. 点击「选择文件」或拖拽 PDF 到预览区
2. 右侧面板默认收起，点「批注」展开
3. 用工具栏画标注，或贴截图、贴公式

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl + O` | 打开 PDF（Electron 原生菜单） |
| `←` / `→` | 上一页 / 下一页 |
| `Delete` / `Backspace` | 删除选中的标注 |
| `Esc` | 取消当前工具 / 关闭浮窗 / 退出截图模式 |
| `Enter` | 提交文字批注 |
| `Shift + Enter` | 文字批注换行 / 公式换行 |
| `Ctrl + Shift + I` | 打开开发者工具（调试用） |

### 核心操作

| 功能 | 操作 |
| --- | --- |
| **PDF 阅读** | 翻页按钮 / 键盘 ←→；页码输入框跳页；右下角 +/− 缩放 |
| **PDF 区域截图** | 工具栏「截图」→ PDF 上拖拽框选 |
| **网页框选截图** | 右上角 📷 → 网页上拖拽框选 |
| **上传图片** | 右侧「素材」标签 → 「上传图片」 |
| **公式编辑** | 右侧「公式」标签 → MathLive 编辑器 → 保存 |
| **公式换行** | 编辑器里按 **Shift + Enter** |
| **把公式贴到 PDF** | 编辑器里编好 → 📷 框选公式 → 素材卡片点 📌 → PDF 上点击放置 |
| **文字批注** | 选「文字」→ 点击位置 → 直接输入（支持换行） |
| **编辑文字** | 选「选择」→ **双击文字** → 修改 |
| **调字号** | 选中文字 → 工具栏出现字号滑块 |
| **贴图缩放** | 选「选择」→ 点贴图 → 拖 8 个控制点 |
| **标注列表** | 右侧「标注」标签 → 点击定位 / 👁 隐藏 / ✕ 删除 |
| **链接悬浮预览** | 鼠标移到 PDF 内部引用链接（如 `[1]`）上 |
| **导出 PDF** | 标注工具栏右侧绿色 PDF 图标 |
| **导出/导入 JSON** | 批注面板头部图标 |

---

## 🖼️ 自定义应用图标

1. 准备一张 **512×512 或 1024×1024** 的 PNG
2. 放到 `build/icon.png`
3. 重新 `npm run build:win`

不设置的话会用 Electron 默认图标（不好看）。

---

## ❓ 常见问题

**Q：`npm start` 白屏？**

按 `Ctrl + Shift + I` 看 Console 报错。常见原因：
- `renderer/index.html` 不存在或路径不对
- MathLive 的 `mathlive/` 目录缺失
- CDN 加载失败（先联网跑通，之后再本地化）

**Q：打包出来的 exe 双击没反应？**

- 用 `npm run dev` 看终端有没有报错
- 检查 `package.json` 的 `main` 字段是否指向 `main.js`
- 检查 `build.files` 里有没有把 `renderer/**/*` 包含进去

**Q：能在 Mac 上打 Windows 的 exe 吗？**

可以（跨平台打包），但**Windows 打不了 Mac 的 dmg**。

**Q：`localStorage` 存的数据在哪？**

- Electron 里：`C:\Users\<你>\AppData\Roaming\pdf-annotator\Local Storage\`
- 浏览器里：开发者工具 → Application → Local Storage

---

## 🙏 致谢

- [Electron](https://www.electronjs.org/) — OpenJS Foundation
- [electron-builder](https://www.electron.build/) — Loopline Systems
- [PDF.js](https://mozilla.github.io/pdf.js/) — Mozilla
- [pdf-lib](https://pdf-lib.js.org/) — Andrew Dillon
- [MathLive](https://mathlive.io/) — Arno Gourdol
- [html2canvas](https://html2canvas.hertzen.com/) — Niklas von Hertzen
- [Font Awesome](https://fontawesome.com/) — Fonticons, Inc.

---

本项目仅供学习与个人使用。欢迎提 Issue 或 PR。
**如果这个项目对你有帮助，欢迎给个 Star ⭐ ！**