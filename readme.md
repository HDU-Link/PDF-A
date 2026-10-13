# PDF 标注 + 公式编辑器

> 一个 PDF 阅读与批注工具。支持 PDF 阅读、区域截图、图片上传、MathLive 公式编辑、在 PDF 上绘制标注，以及导出修改后的 PDF。

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![HTML](https://img.shields.io/badge/HTML-5-orange.svg) ![CSS](https://img.shields.io/badge/CSS-3-blue.svg) ![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg) ![PDF.js](https://img.shields.io/badge/PDF.js-3.11.174-red.svg) ![MathLive](https://img.shields.io/badge/MathLive-local-green.svg)

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

### 📷 截图
- **PDF 区域截图**：工具栏「截图」→ 在 PDF 上拖拽框选
- **网页框选截图**：右上角 📷 → 在网页上拖拽任意区域（**零偏差**）

### 🧮 公式编辑
- 基于 **MathLive** 的所见即所得编辑器，支持虚拟键盘
- 公式以 **LaTeX 源码**保存，可复制、可重新载入编辑
- 公式列表用 `<math-field readonly>` 渲染预览

### 💾 数据管理
- 所有记录自动保存到浏览器 `localStorage`
- **导出 / 导入 JSON 记录**（追加或替换）
- **导出修改后的 PDF**：标注烧录进原文件（隐藏的标注不导出）

### 🎨 界面
- 左右分栏，可拖拽调整宽度，双击折叠
- 四个标签页：**截图 / 图片 / 公式 / 标注**
- 未加载 PDF 时，鼠标悬停在预览区会变暗并提示「点击选择 PDF 文件」

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/HDU_Link/pdf-annotator.git
cd pdf-annotator
```

### 2. 准备 MathLive 本地依赖

MathLive 采用**本地离线**方式引入。请从 [MathLive Releases](https://github.com/arnog/mathlive/releases) 下载，放入：

```
mathlive/
├── mathlive.min.js
└── fonts/
    ├── KaTeX_Main-Regular.woff2
    ├── KaTeX_Math-Italic.woff2
    └── ...
```

### 3. 启动本地服务器

**必须用 HTTP 服务访问**（MathLive 是 ES Module，`file://` 下会被 CORS 拦截）：

```bash
# 任选其一
python -m http.server 8000
py -m http.server 8000
npx serve .
```

### 4. 打开浏览器

```
http://localhost:8000/index.html
```

---

## 🛠️ 技术栈

| 技术 | 用途 |
| --- | --- |
| [PDF.js](https://mozilla.github.io/pdf.js/) | PDF 渲染、文字层、链接层 |
| [pdf-lib](https://pdf-lib.js.org/) | 生成修改后的 PDF |
| [MathLive](https://mathlive.io/) | LaTeX 公式可视化编辑 |
| [html2canvas](https://html2canvas.hertzen.com/) | 网页框选截图 |
| [Font Awesome](https://fontawesome.com/) | 图标 |
| 原生 JavaScript | 无框架，无构建步骤 |

**零构建、零后端**——克隆、起个 HTTP 服务就能跑。

---

## 📂 项目结构

```
pdf-annotator/
├── index.html                  # 主页面（结构 + 内联初始化脚本）
├── styles.css                  # 全部样式
├── script.core.js              # 核心：常量 / 状态 / 工具 / 存储 / 布局
├── script.pdf.js               # PDF：加载 / 渲染 / 翻页 / 缩放 / 链接 / 悬浮预览
├── script.panels.js            # 面板：截图 / 图片 / 公式 / 标注列表 / 网页截图 / 导入导出
├── annotation.js               # 标注模块（绘制 / 文字输入 / 贴图 / 导出 PDF）
├── README.md
├── LICENSE
└── mathlive/                   # MathLive 本地依赖
    ├── mathlive.min.js
    └── fonts/
```

### 模块职责

| 文件 | 职责 |
| --- | --- |
| **`script.core.js`** | 常量、`App.state` 全局状态、工具函数、localStorage 读写、布局分栏 / 折叠 / 分隔条、右侧标签切换 |
| **`script.pdf.js`** | PDF 加载 / 渲染（画布 + 文字层 + 链接层）、翻页 / 跳页 / 缩放、键盘方向键、内部链接悬浮预览、拖拽 / 单击上传 |
| **`script.panels.js`** | PDF 区域截图、图片面板、公式面板（MathLive）、标注列表面板、网页框选截图、JSON 导入导出 |
| **`annotation.js`** | 标注绘制 / 文字内联输入 / 贴图缩放 / 隐藏 / `window.__annotatorList` API / 用 pdf-lib 导出 PDF |

**通信方式**：三个 `script.*.js` 挂在同一个全局命名空间 `window.App` 上，通过 `App.xxx` 互访，无需模块系统。

---

## 📖 使用指南

### 快速上手

1. 点击「选择文件」或拖拽 PDF 到预览区
2. 右侧面板默认收起，点「批注」展开
3. 用工具栏画标注，或贴截图、贴公式

### 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `←` / `→` | 上一页 / 下一页 |
| `Delete` / `Backspace` | 删除选中的标注 |
| `Esc` | 取消当前工具 / 关闭浮窗 / 退出截图模式 |
| `Enter` | 提交文字批注 |
| `Shift + Enter` | 文字批注换行 |

### 核心操作

| 功能 | 操作 |
| --- | --- |
| **PDF 阅读** | 翻页按钮 / 键盘 ←→；页码输入框跳页；右下角 +/− 缩放 |
| **PDF 区域截图** | 工具栏「截图」→ PDF 上拖拽框选 |
| **网页框选截图** | 右上角 📷 → 网页上拖拽框选 |
| **上传图片** | 右侧「图片」标签 → 「上传图片」 |
| **公式编辑** | 右侧「公式」标签 → MathLive 编辑器 → 保存 |
| **把公式贴到 PDF** | 编辑器里编好 → 📷 框选公式 → 图片卡片点 📌 → PDF 上点击放置 |
| **文字批注** | 选「文字」→ 点击位置 → 直接输入（支持换行） |
| **编辑文字** | 选「选择」→ **双击文字** → 修改 |
| **调字号** | 选中文字 → 工具栏出现字号滑块 |
| **贴图缩放** | 选「选择」→ 点贴图 → 拖 8 个控制点 |
| **标注列表** | 右侧「标注」标签 → 点击定位 / 👁 隐藏 / ✕ 删除 |
| **链接悬浮预览** | 鼠标移到 PDF 内部引用链接（如 `[1]`）上 |
| **导出 PDF** | 标注工具栏右侧绿色 PDF 图标 |
| **导出/导入 JSON** | 批注面板头部图标 |


---

## 🙏 致谢

- [PDF.js](https://mozilla.github.io/pdf.js/) — Mozilla
- [pdf-lib](https://pdf-lib.js.org/) — Andrew Dillon
- [MathLive](https://mathlive.io/) — Arno Gourdol
- [html2canvas](https://html2canvas.hertzen.com/) — Niklas von Hertzen
- [Font Awesome](https://fontawesome.com/) — Fonticons, Inc.

---

本项目仅供学习与个人使用。 欢迎提 Issue 或 PR。
**如果这个项目对你有帮助，欢迎给个Star ⭐ ！**
