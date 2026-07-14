# 终端矩阵

Windows 桌面终端复用器。在同一个窗口内创建多个 PowerShell、CMD 或 Git Bash 终端。

## 功能

- 不限制固定终端数量，可持续新建终端。
- 自动网格、横向分栏和纵向堆叠布局。
- 单个终端放大/还原。
- 每个终端拥有独立的 ConPTY 会话。
- 可选择新终端的默认工作目录。
- 将文件或文件夹拖入指定终端，可直接输入带引号的完整路径。
- 支持 Codex、Claude、开发服务器和其他交互式命令。
- **矩阵宠物**：桌面透明置顶小宠物，显示终端数量，可拖动、双击打开主窗口。

## 快捷键

- `Ctrl+Shift+T`：新建终端。
- `Ctrl+Shift+W`：关闭当前终端。
- `Ctrl+Shift+C`：复制终端选区。
- `Ctrl+Shift+V`：粘贴。
- `Ctrl+Insert` / `Shift+Insert`：复制 / 粘贴。
- 终端内右键：打开复制、粘贴、全选菜单。
- `Alt+1` 到 `Alt+9`：聚焦对应终端。

## 开发命令

```powershell
npm install
npm start
npm run check
npm run install-desktop
```

## 打包与发布（重要）

**不要把 `release/` 安装包提交进 Git。**  
Electron 安装包约几十～上百 MB，会超过 Git 单文件限制，也极易上传失败。  
`release/` 已在 `.gitignore` 中。

### 本地打包

```powershell
# 默认：只打便携版（体积更小，一个文件）
npm run dist:win

# 需要安装包时
npm run dist:win:setup

# 安装包 + 便携版
npm run dist:win:all
```

产物目录：`release/`

| 命令 | 产物 |
|------|------|
| `npm run dist:win` | `terminal-deck-portable-v*-windows-x64.exe` |
| `npm run dist:win:setup` | `terminal-deck-setup-v*-windows-x64.exe` |

### 发布到 GitHub Releases（推荐）

本地网络上传大文件容易失败，**推荐用 GitHub Actions 在云端打包并上传**：

```powershell
# 1. 改版本号（package.json 的 version）
# 2. 提交代码并打 tag
git add .
git commit -m "release: v0.1.1"
git tag v0.1.1
git push origin main
git push origin v0.1.1
```

推送 `v*` 标签后，`.github/workflows/release.yml` 会自动：

1. 在 Windows 云主机上 `npm run dist:win`
2. 创建 / 更新 GitHub Release
3. 挂上 `terminal-deck-portable-*.exe`

也可在 GitHub 仓库 **Actions → Release → Run workflow** 手动触发。

### 体积优化说明

- 只保留 `en-US` / `zh-CN` 语言包  
- 打包后剔除 node-pty 的 macOS / ARM 预编译  
- 默认只打便携版一个文件（避免装包+便携双份上传）
