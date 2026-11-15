# JMPicaComic-Desktop 1.3.0 发行记录

状态：2026-11-14（UTC 2026-11-15 03:22 公开）。1.3.0 已公开。公开发行包不含私人资料、漫画或音频。维护者本机从当前版本软件内更新到 1.3.0 尚待进行，完成后补记在本文末尾。

## 源码与发行身份

- 发版 PR [#58](https://github.com/gouluanjiang/JMPicaComic-Desktop/pull/58) 已合并。这一版收录了 PR #55—#57：可调整大小和画中画的视频小窗，以及 asmr.one 账号（登录、我的收藏、标记和评分、播放列表管理、自动标记）。发版 PR 本身只改版本号和文档。
- 发版源码：`9561e918aa392fa349fde51937095174da0d1f89`。
- PR 构建 checkout：`6a463aaee1c9c20cb1b12e48f59e984f4ed899b0`。
- main 合并提交与 `v1.3.0` 标签：`c21c2013abfe70f12b1ab6333f0807ae0382830f`。
- 三者的源码树相同，都是 `279c7aaa8767960daa4cc8c228f45fd9fb934ed9`。发版 PR 包含 #57 的全部提交，#57 先合并，#58 再合并，因此 main 上的源码与 CI 构建的源码一致，没有再次构建。

安装名 `MangaMonitor Dev`、应用标识 `com.mangamonitor.workbench.preview`、程序文件名、数据目录和漫画凭据命名空间都没有变。asmr.one 的登录状态使用新增的独立凭据位置，不影响漫画账号。

## CI 与产物核验

| 检查 | 发版源码 CI | 结果 |
| --- | --- | --- |
| Rust 基线 | [43591235072](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/43591235072) | 第 1 次运行通过 |
| 前端逻辑／浏览器 | [43591235037](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/43591235037) | 第 1 次运行通过 |
| Windows 原生／安装 | [43591235086](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/43591235086) | 第 1 次运行通过：原生构建、NSIS、安装后 WebView、重启和数据保留 |

推送触发的同源码运行被并发规则取消，以 PR 触发的运行为准，取消不算失败。

发行使用 Windows CI 的 artifact `14112339711`。下载后核对了 ZIP 摘要与 CI 记录一致，以及 manifest 中全部 8 个文件的 SHA-256。先在草稿中核对上传后的摘要，经维护者确认后公开。公开后以匿名方式重新下载全部文件，`SHA256SUMS.txt` 全部通过；`releases/latest/download/latest.json` 返回的内容与发行页的 `latest.json` 一致，版本为 1.3.0。

## 公开发行资产

[正式发行页](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/tag/v1.3.0)，发行 ID `445273546`，非预发行，已设为最新版本，原有发行版本保留。

| 文件 | SHA-256 |
| --- | --- |
| `JMPicaComic-Desktop-1.3.0-windows-x64.zip` | `3d4d09d91f912b1d01253afbe8b3c795085bbdb87ea3552cbdf97df59f297165` |
| `MangaMonitor.Dev_1.3.0_x64-setup.exe` | `fb61a3a02266ac250f6fd0dea8e0663bb1f42e7ce65dfab9a2b6c6376a0f4a22` |
| `manifest.json` | `35792e4e5355a25962aac0a18a2f9f9412b5b0b6fce2aefc5e6c86dcc601f25c` |
| `latest.json` | `408e50e91703cff4d374a25fdcdbc264baec2d589ff1a3e89a967e5b169ef58e` |
| `SHA256SUMS.txt` | `bf80520ac1daaaa6b7f9f93876c0d0ad8c99dcbde9153e7ce5dab91cdcd47cdc` |

安装后的主程序：`51701b1c551d6fc015fc65c7dd789978b37838482834c928555933406ec20f94`。许可资源和文档的哈希见公开的 manifest。

按 [UPDATER_RELEASE.md](UPDATER_RELEASE.md) 发布。安装包在仓库外用更新密钥签名，签名不改变安装包。`latest.json` 由 `scripts/write-update-manifest.mjs` 生成，签名里的文件名带 `_1.3.0_x64-setup.exe`，更新说明为完整的 1.3.0 版本说明。

## 发布前的实际试用

以下内容由维护者在本机用 CI 候选程序和真实 asmr.one 账号试用，没有针对 asmr.one 的自动化实测：

- 视频小窗按比例调整大小、画中画弹出到程序之外（候选 `fc17e4f`）。
- 登录、重启后保持登录、我的收藏的筛选和排序、播放列表浏览、标记和评分显示、退出登录（候选 `fa626da`）。
- 改标记、打星和清除、作品加入和移出播放列表、新建、编辑和删除临时播放列表、自动标记（未标记 → 在听，重听／搁置不变）（候选 `baa5d5b`）。

账号的写入请求按网站自身脚本里的接口实现，查看脚本时没有发出任何写入请求。

## 验证边界与后续

- CI 是合成环境测试。这是第一次在两个正式版本之间使用软件内更新，结果待维护者本机实际更新后补记。
- 安装向导的界面没有测试。没有逐一测试从每个旧版本手动升级。
- asmr.one 的接口和媒体地址编译在程序里；网站改动接口后账号功能可能暂时失效，需要发布新版本。
- 1.0.2 记录中的 LOCAL-03 没有单独复核。`author-workspace-ui.spec.ts:7` 的一次偶发失败仍未解释。
- JM 图片域名仍然只有一个。Windows 安装包没有代码签名。云端自动监控没有启用，`production_enabled=false` 不变。
- 后续路线见[当前交接](DEVELOPMENT_HANDOFF.md)：ASMR 的下载和本地库，需先按 `DOWNLOAD_EXECUTOR_THAW_GATE.md` 处理，还没有开始，也不代表任何授权。

本记录之后的提交只补记交付事实，不重新构建、不覆盖已公开的文件，也不移动发行标签。
