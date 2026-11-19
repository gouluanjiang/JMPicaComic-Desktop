# JMPicaComic-Desktop 1.4.1 发行记录

状态：2026-11-19（UTC 05:13 公开）。1.4.1 已公开，并在维护者本机通过软件内更新完成升级。公开发行包不含私人资料、漫画或音频。

## 源码与发行身份

- 发版 PR [#70](https://github.com/gouluanjiang/JMPicaComic-Desktop/pull/70) 已合并。这一版收录了 1.4.0 之后的 PR #64—#69：1.4.0 发行记录（#64）、界面修正（#65：下拉框文字居中、JM 每周必看期数格式、阅读小窗标题栏呼出范围）、卡顿修正（#66、#67、#69）和项目主页截图（#68）。发版 PR 本身只改版本号和文档。
- 发版源码：`ce4763329031470aca78de1ffefc78672fb85549`（PR 头）。
- PR 构建 checkout：`b960388623fc260ac30498ccf2a44582abf8b4ad`。
- main 合并提交与 `v1.4.1` 标签：`ffd787282a125b034182c9b6170def86ce09e27f`。
- 构建 checkout 与合并提交的源码树相同，都是 `e3ec22362974e58ed71d3f7eaf57343cd3fdca41`。发版分支从 main 的 `65896de` 切出，期间 main 没有新提交，因此没有再次构建。

安装名 `MangaMonitor Dev`、应用标识 `com.mangamonitor.workbench.preview`、程序文件名、数据目录和凭据命名空间都没有变。

## CI 与产物核验

| 检查 | 发版源码 CI | 结果 |
| --- | --- | --- |
| Rust 基线 | [44460451386](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/44460451386) | 第 1 次运行通过 |
| 前端逻辑／浏览器 | [44460451391](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/44460451391) | 第 1 次运行通过 |
| Windows 原生／安装 | [44460451375](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/44460451375) | 第 1 次运行通过：原生构建、NSIS、安装后 WebView、重启和数据保留 |

同一提交由 push 触发的重复运行被并发设置自动取消，显示为失败，不属于发版检查。

发行使用 Windows CI 的 artifact `14500408624`。下载后核对了 ZIP 摘要与 CI 记录一致、manifest 中全部 8 个文件的 SHA-256，以及包内版本说明与 `docs/RELEASE_NOTES_1.4.1.md` 一致。草稿中上传后的文件摘要与本地逐个一致，经维护者确认后公开。公开后以匿名方式重新下载安装包、`latest.json` 和 `SHA256SUMS.txt`，摘要一致；`releases/latest/download/latest.json` 与发行页的 `latest.json` 相同，版本为 1.4.1。

## 公开发行资产

[正式发行页](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/tag/v1.4.1)，发行 ID `450903486`，非预发行，已设为最新版本，原有发行版本保留。v1.4.0 发行页上供项目主页使用的截图附件不受影响。

| 文件 | SHA-256 |
| --- | --- |
| `JMPicaComic-Desktop-1.4.1-windows-x64.zip` | `5ff19288d5d5561c29373dadd9aec7a7837e492fa44462a9a3b37c3162358130` |
| `MangaMonitor.Dev_1.4.1_x64-setup.exe` | `d02daf2cde9dd65a09dd3a676c6e109f3d672632cb8696ecefba58b0b98f098a` |
| `manifest.json` | `6fab4bbd275d3d51f53ee6c23b33b2caaebfb4dbf4bc1f21dfa2d1321f7180be` |
| `latest.json` | `5d46677b5150c1d3f2da262ef0e46f8935582b4909ee03f814c36e3f01231e98` |
| `SHA256SUMS.txt` | `51f582294194e8e6291163a80fa1ff137281054c13ec720e3299760984c2a4f` |

安装后的主程序：`b02c90905859f323abc98bf601b76f58200dadf38df1652d851584a7c1ac16ac`。许可资源和文档的哈希见公开的 manifest。

按 [UPDATER_RELEASE.md](UPDATER_RELEASE.md) 发布。安装包在仓库外用更新密钥签名，签名不改变安装包。`latest.json` 由 `scripts/write-update-manifest.mjs` 生成，签名里的文件名带 `_1.4.1_x64-setup.exe`，更新说明为完整的 1.4.1 版本说明。

## 发布前的实际试用与测量

卡顿修正在维护者本机测量过：用 WebView2 调试端口连接已安装的 CI 候选程序，逐页切换并记录长动画帧和 CPU 剖析，再做只读的功能检查（列表、排序、详情、作者名单筛选、作者搜索、发现分类切换、下载按钮状态、程序内阅读器开关）。测量和检查不改账号、下载、关注或漫画库。

- 1.4.0 时切换页面最长的一次停顿为 250–800 毫秒（2026-11-17 测量）。
- #69 候选程序（`3ea9386`，2026-11-18）：大多数页面切换没有超过 50 毫秒的帧；“最近更新”反复切换 56–66 毫秒，作者目录真正变化后的那一次约 245 毫秒；程序启动后第一次打开“最近更新”约 200 毫秒（完整读取一次作者目录）。
- 这些候选程序的源码比 1.4.1 少版本号和文档改动。

## 本机交付：软件内更新到 1.4.1

维护者本机装的是 #69 的 CI 候选程序，版本号显示 1.4.0，带更新功能。公开后用户打开程序，按提示确认更新；程序下载安装包、校验签名、安装并重新打开，用户确认更新成功。

- 更新后主程序 SHA-256 为 `b02c90905859f323abc98bf601b76f58200dadf38df1652d851584a7c1ac16ac`，与 manifest 记录的安装后哈希一致。
- Windows 安装记录为 MangaMonitor Dev 1.4.1，安装位置没有变。

## 验证边界与后续

- CI 是合成环境测试。卡顿测量只在一台电脑、一份真实数据上做过，数字会随作者数量、最近更新列表长度和网络情况变化。
- 去过的页面仍留在内存中；前端对后台数据的逐条检查和下载队列的文件核对按设计保留，理由见[当前交接](DEVELOPMENT_HANDOFF.md)。
- 安装向导的界面没有测试，没有逐一测试从每个旧版本手动升级。
- JM 图片域名仍然只有一个。Windows 安装包没有代码签名。云端自动监控没有启用，`production_enabled=false` 不变。
- 后续路线见[当前交接](DEVELOPMENT_HANDOFF.md)：ASMR 的下载和本地库，需先按 `DOWNLOAD_EXECUTOR_THAW_GATE.md` 处理，还没有开始，也不代表任何授权。

本记录之后的提交只补记交付事实，不重新构建、不覆盖已公开的文件，也不移动发行标签。
