# JMPicaComic-Desktop 1.4.0 发行记录

状态：2026-11-17（UTC 12:33 公开）。1.4.0 已公开，并在维护者本机通过软件内更新完成升级。公开发行包不含私人资料、漫画或音频。

## 源码与发行身份

- 发版 PR [#63](https://github.com/gouluanjiang/JMPicaComic-Desktop/pull/63) 已合并。这一版收录了 PR #60—#62：主窗口和阅读小窗去掉 Windows 标题栏（#60）、项目主页重做（#61）、藏青＋金色界面和页面说明按钮（#62）。发版 PR 本身只改版本号和文档。
- 发版源码：`f58de22`（PR 头）。
- PR 构建 checkout：`6914c3275719078d4d85fbe58d53c4038174c433`。
- main 合并提交与 `v1.4.0` 标签：`074f3765510c2d78bf8c0d6566036594c51d9add`。
- 三者的源码树相同，都是 `13825c6de295e4eb04295328513ae65a3a037bd9`。发版分支从 main 的 `1c8815b` 切出，期间 main 没有新提交，因此没有再次构建。

安装名 `MangaMonitor Dev`、应用标识 `com.mangamonitor.workbench.preview`、程序文件名、数据目录和凭据命名空间都没有变。

## CI 与产物核验

| 检查 | 发版源码 CI | 结果 |
| --- | --- | --- |
| Rust 基线 | [44068285657](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/44068285657) | 第 1 次运行通过 |
| 前端逻辑／浏览器 | [44068285109](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/44068285109) | 第 1 次运行通过 |
| Windows 原生／安装 | [44068285349](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/44068285349) | 第 1 次运行通过：原生构建、NSIS、安装后 WebView、重启和数据保留 |

发行使用 Windows CI 的 artifact `14322656602`。下载后核对了 ZIP 摘要与 CI 记录一致，以及 manifest 中全部 8 个文件的 SHA-256。先在草稿中核对上传后的摘要，经维护者确认后公开。公开后以匿名方式重新下载全部文件，`SHA256SUMS.txt` 全部通过；`releases/latest/download/latest.json` 与发行页的 `latest.json` 一致，版本为 1.4.0。

## 公开发行资产

[正式发行页](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/tag/v1.4.0)，发行 ID `448606064`，非预发行，已设为最新版本，原有发行版本保留。v1.3.0 发行页上供项目主页使用的截图附件不受影响。

| 文件 | SHA-256 |
| --- | --- |
| `JMPicaComic-Desktop-1.4.0-windows-x64.zip` | `132ff909a24f074ff78e3b24f3741f6a029131398c3ade5985d88ce26c6852e7` |
| `MangaMonitor.Dev_1.4.0_x64-setup.exe` | `656e2fd43427e1107bc20821887dd38deb9e9fcfecba559012b7dc6df57463b1` |
| `manifest.json` | `86b4ccb2ba14b8c069b7e0e6aa8eca2ee02e2b8f8f3cd3546d1a9f3312776432` |
| `latest.json` | `2c57884a06dd73496419fb585686d54687de0dca66d835bf2e12a5e18a0a38e0` |
| `SHA256SUMS.txt` | `b2fc8d1d051f98e03062edabdec4839ccc57308e78755172b9d63a69e5d2e6c1` |

安装后的主程序：`b6710619b876dd1b132c45214df270aaa418715b5e8d3642d1d86a769b35aa27`。许可资源和文档的哈希见公开的 manifest。

按 [UPDATER_RELEASE.md](UPDATER_RELEASE.md) 发布。安装包在仓库外用更新密钥签名，签名不改变安装包。`latest.json` 由 `scripts/write-update-manifest.mjs` 生成，签名里的文件名带 `_1.4.0_x64-setup.exe`，更新说明为完整的 1.4.0 版本说明。

## 发布前的实际试用

维护者 2026-11-17 在本机安装了与 main `1c8815b` 源码树相同（`7971704`）的 CI 候选程序，确认新界面、主窗口按钮、拖动、双击最大化、贴边、改大小、最大化与任务栏，以及阅读小窗顶部标题栏和关闭前保存位置都正常。这次试用的源码只比 1.4.0 少版本号和文档改动。

## 本机交付：软件内更新到 1.4.0

维护者本机装的是与 main `1c8815b` 源码树相同的候选程序，版本号显示 1.3.0，带更新功能。公开后用户打开程序，按提示确认更新；程序下载安装包、校验签名、安装并重新打开，用户确认更新成功。

- 更新后主程序 SHA-256 为 `b6710619b876dd1b132c45214df270aaa418715b5e8d3642d1d86a769b35aa27`，与 manifest 记录的安装后哈希一致。
- Windows 安装记录为 MangaMonitor Dev 1.4.0，安装位置没有变。

## 验证边界与后续

- CI 是合成环境测试。无标题栏窗口的贴边、改大小等只在一台电脑上试用过。
- 自己绘制的最大化按钮没有 Windows 11 悬停时的窗口布局菜单；程序内阅读时没有可拖动的空白区域。
- 项目主页的截图仍是 1.3.0 的配色。
- 安装向导的界面没有测试，没有逐一测试从每个旧版本手动升级。
- 1.0.2 记录中的 LOCAL-03 没有单独复核。JM 图片域名仍然只有一个。Windows 安装包没有代码签名。云端自动监控没有启用，`production_enabled=false` 不变。
- 后续路线见[当前交接](DEVELOPMENT_HANDOFF.md)：ASMR 的下载和本地库，需先按 `DOWNLOAD_EXECUTOR_THAW_GATE.md` 处理，还没有开始，也不代表任何授权。

本记录之后的提交只补记交付事实，不重新构建、不覆盖已公开的文件，也不移动发行标签。
