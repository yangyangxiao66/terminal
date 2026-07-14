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
