# JMPicaComic-Desktop 1.2.0 发行记录

状态：2026-11-12。1.2.0 已公开，并在维护者本机通过软件内更新完成了一次真实升级。公开发行包不含私人资料、漫画或音频。

## 源码与发行身份

- 发版 PR [#53](https://github.com/gouluanjiang/JMPicaComic-Desktop/pull/53) 已合并。这一版收录了 PR #47—#52：软件内更新、ASMR 分区的浏览和在线播放、桌面字幕，以及两处测试修复。发版 PR 本身只改版本号和文档。
- 发版源码：`9fdbb04e52baf54e6ac6c013652dd98138f83f07`。
- PR 构建 checkout：`24eee91c3af51d978b47da8dde0256368c3641a2`。
- main 合并提交与 `v1.2.0` 标签：`38ef278e0c9b73cea7fe86bbc592b66e2803b22b`。
- PR 构建 checkout 与 main 合并提交的源码树相同，都是 `03fc8444b0f65838f3684da08a0040bfbd8a7544`。三个提交角色不同，不混称为同一个 SHA。

安装名 `MangaMonitor Dev`、应用标识 `com.mangamonitor.workbench.preview`、程序文件名、数据目录和凭据命名空间都没有变。

## CI 与产物核验

| 检查 | 发版源码 CI | 结果 |
| --- | --- | --- |
| Rust 基线 | [43034267369](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/43034267369) | 通过 |
| 前端逻辑／浏览器 | [43034267274](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/43034267274) | 第 5 次运行通过 |
| Windows 原生／安装 | [43034267539](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/43034267539) | 通过：原生构建、NSIS、安装后 WebView、重启和数据保留 |

前端检查的前 4 次运行都失败在“安装测试用浏览器”这一步：CI 机器解析不了 Ubuntu 软件源的域名，测试一项都没有开始。同一源码第 5 次运行全部通过。这是运行环境的问题，没有改代码，也不把重跑当作修复。

发行使用发版源码 Windows CI 的 artifact `13862549669`。下载后核对了 ZIP 摘要、manifest 身份和全部 8 个文件的 SHA-256。下载曾多次因网络中断失败，其中一次续传得到的文件摘要不符，已丢弃并重新下载。先在草稿中核对，之后公开。公开后又以匿名方式下载全部文件再次核对，`latest` 和标签也都确认无误。

## 公开发行资产

[正式发行页](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/tag/v1.2.0)，发行 ID `442517384`，非预发行，原有发行版本保留。

| 文件 | SHA-256 |
| --- | --- |
| `JMPicaComic-Desktop-1.2.0-windows-x64.zip` | `d8618cd7381cc6350eefdb0456d681d43a41a0f8b14fa0f2aeaee524bed985bb` |
| `MangaMonitor.Dev_1.2.0_x64-setup.exe` | `a8040acb0f75953c62264443923272b549b8fad782860818c314a9db4ddcd8dc` |
| `manifest.json` | `078357276b5dca0fce6c28f915552e84e25c5de5313f663bd34edff6251bbdaf` |
| `latest.json` | `685e23856ab824aae74f07f886d760fe826cff70475046caf4b04d2cbc214281` |
| `SHA256SUMS.txt` | `e52be8a1d454615ca66c4fa107dfed6a5d4f99ca495a50cef71467d8bdd7e507` |

安装后的主程序：`db35cadd195c2edca020619236c9325f9e8e256f3654343ff2ced2f4d57f746e`。许可资源和文档的哈希见公开的 manifest。

这是第一个按 [UPDATER_RELEASE.md](UPDATER_RELEASE.md) 发布的版本。安装包在仓库外用更新密钥签名，签名不改变安装包，SHA-256 仍是 CI 记录的值。`latest.json` 由 `scripts/write-update-manifest.mjs` 生成，签名里的文件名带 `_1.2.0_x64-setup.exe`。公开后 `releases/latest/download/latest.json` 返回的内容与上表一致。

## 本机交付：第一次真实的软件内更新

维护者本机装的是 PR #51 的候选程序，版本号为 1.1.0，已经带更新功能。所以这次没有手动运行安装包，而是用它验证软件内更新。

- 更新前程序已经退出，安装目录和数据目录备份到仓库外。
- 用户打开程序，按提示确认更新。程序下载安装包、校验签名、安装并重新打开，用户确认更新成功。
- 更新后主程序哈希与 manifest 记录的安装后哈希一致，安装记录更新为 1.2.0，安装位置没有变。

备份和核对材料都保留在仓库外，公开文档不含个人路径、账户、书目或凭据。

## 验证边界与后续

- CI 是合成环境测试。软件内更新只在一台电脑上跑过一次，起点是候选程序，不是公开的旧版本；公开版本之间的更新要等下一个版本。
- 安装向导的界面没有测试。没有逐一测试从每个旧版本手动升级。
- ASMR 的浏览、播放和桌面字幕由用户在候选程序上试用过，没有针对 asmr.one 的自动化实测。
- 1.0.2 记录中的 LOCAL-03 没有单独复核。`author-workspace-ui.spec.ts:7` 的一次偶发失败仍未解释。
- JM 图片域名仍然只有一个；JM 和 asmr.one 的地址都编译在程序里，网站更换地址时需要发布新版本。
- Windows 安装包没有代码签名。云端自动监控没有启用，`production_enabled=false` 不变。
- 后续路线见[当前交接](DEVELOPMENT_HANDOFF.md)：视频小窗、关注、账号同步、下载。都还没有开始开发，也不代表任何授权。

本记录之后的提交只补记交付事实，不重新构建、不覆盖已公开的文件，也不移动发行标签。
