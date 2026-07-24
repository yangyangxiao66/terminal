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
- **SSH 远程终端**：顶栏 **SSH 连接** / 侧栏 **连接远程主机**，或「终端 → SSH」后新建；基于系统 OpenSSH，支持密码与密钥认证，并记住最近连接。
- **Agent 远端桥（MCP）**：SSH 会话可被选为 Agent 工作区，本机 Codex 通过 MCP 读写远端文件、执行远端命令（无需在服务器装 Codex）。
- **矩阵宠物**：桌面透明置顶小宠物，显示终端数量，可拖动、双击打开主窗口。

## 快捷键

- `Ctrl+Shift+T`：新建终端。
- `Ctrl+Shift+W`：关闭当前终端。
- `Ctrl+Shift+C`：复制终端选区。
- `Ctrl+Shift+V`：粘贴。
- `Ctrl+Insert` / `Shift+Insert`：复制 / 粘贴。
- 终端内右键：打开复制、粘贴、全选菜单。

## SSH 连接

入口（任选其一）：

1. 顶栏绿色 **SSH 连接** 按钮
2. 左侧边栏 **连接远程主机…**
3. 空状态里的 **SSH 连接**
4. 顶栏 **终端** 下拉选 **SSH**，再点 **新建终端**

然后：

1. 填写主机、端口（默认 22）、**用户名**（必填）。
2. **验证方式** 选择：
   - **密码**：填写登录密码（仅存本次内存，可自动应答）
   - **秘钥**：点「加载本地秘钥」或拖入私钥文件；加密私钥再填 **秘钥密码**
   - **每次询问**：在终端里手动输入
3. 可选填写 **Agent 远端根目录**（默认用户主目录）。
4. 连接后在终端内完成主机指纹确认。
5. 最近连接会保存在本机（不含密码 / 秘钥密码），下次可一键回填。

依赖本机 **OpenSSH 客户端**（Windows：设置 → 应用 → 可选功能 → OpenSSH 客户端）。私钥为 OpenSSH / PEM 格式（如 `id_rsa`、`id_ed25519`）。

## 本地 Agent 操作远端（MCP）

终端矩阵可将本地运行的 Codex、Grok 或 Claude Code 连接到现有 SSH 会话，远端无需安装任何 Agent：

1. 打开 **SSH 连接**，选择密码或秘钥登录；密码 / 秘钥密码只保存在本次应用运行的内存中，不写入最近连接。
2. 开启 **连接后启动 Agent**。终端矩阵会自动检测本机的 Codex、Grok 和 Claude Code，只允许选择已经安装且可运行的 Agent。
3. 点击 **连接并启动**。SSH 会话建立后，终端矩阵会自动完成本机 MCP 注册，并在右侧终端直接启动所选 Agent。
4. 在右侧 Agent 终端输入开发任务；Agent 将通过 `remote_connection_info`、`remote_list`、`remote_stat`、`remote_read`、`remote_exec`、`remote_write`、`remote_mkdir` 操作左侧 SSH 对应的远端工作区。

工具栏 **Agent MCP** 和 **Agent 工作区** 仍保留，供手动补配、切换远端会话或高级多终端场景使用。

注册过程只配置用户已经安装的 Agent，不会向远端上传 Codex、Grok 或 Claude Code。Windows 版使用终端矩阵内置运行时启动 MCP 服务，用户无需另外安装 Node.js。若 Agent 会话在注册前已经启动，请刷新 MCP 或重新启动该会话。

MCP 桥接进程在本机运行，通过终端矩阵主进程持有的 SSH/SFTP 连接操作远端。远端路径默认限制在登录用户主目录（`root` 默认 `/root`），可在 SSH 对话框中调整。`remote_exec` 和写入工具会被标记为可能修改远端，便于 MCP 客户端按策略请求确认。

## 换皮（皮肤商城）

工具栏 **皮肤商城** 可浏览、搜索、分类筛选并一键应用皮肤。

- **纯色主题**：矩阵绿 / 午夜蓝 / 赛博紫 / 余烬橙 / 纸白浅色
- **背景模板**：在 `renderer/skins/catalog.js` 配置，图片放 `renderer/skins/`
- **本地换图**：商城内选本机图片，自动切到自定义图片皮肤并记住
- **通透**：图片皮肤下可调面板透明度；调低更易见背景，调高更易读终端
- 工具栏 **皮肤** 下拉仍可快速切换

详见 `renderer/skins/README.md`。

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
