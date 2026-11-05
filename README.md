# MangaMonitor

**在 Windows 上管理你的漫画库：浏览 JM／哔咔、跟进关注作者的新作、批量下载，下载好的漫画直接在程序里看。**

[![最新版本](https://img.shields.io/github/v/release/gouluanjiang/MangaMonitor-AI?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC)](https://github.com/gouluanjiang/MangaMonitor-AI/releases/latest)
![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20x64-blue)
[![许可](https://img.shields.io/github/license/gouluanjiang/MangaMonitor-AI?label=%E8%AE%B8%E5%8F%AF)](LICENSE)

[下载安装包](https://github.com/gouluanjiang/MangaMonitor-AI/releases/latest) · [使用指南](docs/USER_GUIDE.md) · [问题反馈](https://github.com/gouluanjiang/MangaMonitor-AI/issues)

> [!WARNING]
> **使用 JM 前请先看这里：** 1.0.2 内置的 JM 主域名已失效并变成停放页，JM 的登录、收藏、搜索和详情都会失败。在这个版本上登录 JM，账号密码可能已经发送到这个域名。
>
> - 修复已经合入 `main`，但还没有发布新版本。在新版本发布前，**不要在 1.0.2 上登录 JM**。
> - 如果 2026 年 10 月中旬之后在 1.0.2 上登录过 JM，建议修改 JM 密码；其他网站用了相同密码的，也一并修改。

## 它能做什么

### 管理电脑上的漫画

- 读取你选择的文件夹，用封面墙浏览 ZIP 漫画
- 按状态筛选，按入库时间或版本时间排序，调整封面大小
- 右键打开文件位置；删除前会确认，文件只会移到 Windows 回收站
- 不用搬迁现有漫画，选择原来的目录就能用

### 发现想看的漫画

- 查看 JM 和哔咔的在线收藏
- 按作者、作品关键词、编号或链接、标签搜索
- 浏览单站或两站合并的最近更新，以及 JM 每周必看和哔咔排行榜
- 每部作品都标明是否已入库；有明确标签时标出已汉化或生肉

### 跟进关注的作者

- 一键检查所有关注作者，优先增量读取并复用已有目录；也可以完整复核或补查未完成的范围
- 把重要的作者设为特别关注：程序启动后在后台检查，未读新作单独计数
- 查询没读完时会明确提示，不会把部分结果当成全部结果

### 批量下载

- 单本或多选后直接加入队列，支持暂停、继续和重试
- 每本作品保存为一个 ZIP，保留元数据和章节结构
- 保存、验证、登记都完成才算成功，自动进入漫画库
- 不会覆盖已有文件；同名冲突时会提示你处理

### 阅读

- 支持纵向滚动和单页翻页，Ctrl＋滚轮缩放，F11 全屏
- 可以同时打开多个阅读小窗，并按需置顶
- 自动保存阅读位置，保留最近 100 本的浏览历史
- 可以自定义背景图和封面密度

## 快速开始

1. 从[发行页](https://github.com/gouluanjiang/MangaMonitor-AI/releases/latest)下载 `MangaMonitor.Dev_<版本>_x64-setup.exe`，可用同页的 `SHA256SUMS.txt` 核对文件。
2. 关闭正在运行的 MangaMonitor 和阅读小窗，然后运行安装包。
3. 打开“设置 → 漫画库”，选择你的漫画文件夹。
4. 打开“设置 → 账号与收藏”，登录 JM 或哔咔（JM 请先看上方提示）。

常用流程：**关注作者 → 手动检查更新 → 筛选未入库 → 下载 → 在漫画库阅读**

**运行环境：** Windows x64，需要 Microsoft Edge WebView2。缺少时安装程序可能会联网下载。

## 使用前请了解

- **需要你自己的账号：** 程序不附带账号、书目或漫画。
- **内容来自第三方网站：** 这些网站可能包含成人内容，也可能随时不可用。请遵守当地法律和网站条款。
- **安装包没有代码签名：** Windows 可能弹出安全提示，请只从本仓库发行页下载。
- **目前没有内置更新器：** 新版本需要手动下载安装。
- **名称里的 Dev：** 安装后显示为 MangaMonitor Dev，只是为了沿用原有的安装记录和数据，不代表测试版。
- **这些是有意不做的：** 不在后台定时监控或自动下载，不按相似标题猜测是否为同一本，也不自动合并两个网站的同一部作品。所以有文件但没有来源记录的旧漫画，可能显示为“未入库”或“待核对”。

## 隐私与数据

- 账号、关注名单和漫画库只保存在你的电脑上，不会上传到 GitHub。
- 记住会话和 JM 的“记住登录”都是可选功能，凭据保存在 Windows 系统安全存储中，不写入普通设置文件。
- “设置 → 网络与诊断”可以复制状态摘要，其中不含账号、作品标题和私人路径。反馈问题时请不要附上账号或密码。

## 常见问题

**显示“未入库”，但我电脑上有这本？**
入库状态只依据同来源的下载记录、已核对的旧库登记和实际文件，不靠标题猜测。详见[使用指南](docs/USER_GUIDE.md#已入库的含义)。

**怎么完全退出或更新？**
关闭主窗口后，如果还有阅读小窗，程序可能仍在运行。安装新版前请关闭所有窗口，也不要同时运行不同版本。

**能在浏览器或 Mac 上用吗？**
不能。真实账号、漫画库和下载只有 Windows 桌面端提供；开发用的浏览器预览只显示合成数据。

## 开发者

| 组成 | 位置 |
| --- | --- |
| 前端（React、TypeScript、Vite） | [apps/local-workbench](apps/local-workbench/README.md) |
| 桌面端（Tauri 2） | `apps/local-workbench/src-tauri` |
| Rust 工作区 | `crates/` |

工具链：Node 24、pnpm 11.19.0、Rust 1.98.1，依赖由锁文件固定。正式检查和构建在 GitHub Actions 上运行。

更多资料：[贡献说明](CONTRIBUTING.md) · [开发约束](AGENTS.md) · [文档导航](docs/README.md) · [项目进度](docs/PROJECT_STATUS.md) · [1.0.2 版本说明](docs/RELEASE_NOTES_1.0.2.md) · [历史文档](docs/archive/README.md)

历史文档不代表当前路线；已取消的自动匹配、手机名单和分类书单不会因此恢复。

## 许可

[MIT](LICENSE)。参考和适配的第三方代码见[第三方通知](THIRD_PARTY_NOTICES.md)，安装包内也附有依赖的许可文本。
