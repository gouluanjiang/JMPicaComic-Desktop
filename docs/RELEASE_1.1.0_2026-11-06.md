# JMPicaComic-Desktop 1.1.0 发行记录

状态：2026-11-06。1.1.0 已公开，并在维护者本机用公开的安装包完成真实升级。公开发行包不含私人资料或漫画。

## 源码与发行身份

- 发版 PR [#45](https://github.com/gouluanjiang/JMPicaComic-Desktop/pull/45) 已合并。它收录了 PR #33—#44 的改动：JM 域名更新与验证、新界面和更大的文字、每周必看修复、入库时间修正、按文件内容核对、批量移除历史记录、列表位置恢复，以及 README 和项目改名。
- 发版源码：`5eeb4193367b1a2f0403156147618fe5ff550e31`。
- PR 构建 checkout：`6d39a789cf746a154515eead123c91abe999a549`。
- main 合并提交与 `v1.1.0` 标签：`729e624f080f4fc5175ccc7ba2d528b322e602be`。
- PR 构建 checkout 与 main 合并提交的源码树相同，都是 `0ffdcb044c61f4ba72828e26aa875c27ccd7431a`。三个提交角色不同，不混称为同一个 SHA。

仓库已改名为 `gouluanjiang/JMPicaComic-Desktop`，软件内的显示名称也在这一版改为 JMPicaComic-Desktop。安装名 `MangaMonitor Dev`、应用标识 `com.mangamonitor.workbench.preview`、程序文件名、数据目录和凭据命名空间都没有变。

## CI 与产物核验

| 检查 | 发版源码 CI | 结果 |
| --- | --- | --- |
| Rust 基线 | [42164372535](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/42164372535) | 通过 |
| 前端逻辑／浏览器 | [42164372464](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/42164372464) | 第 2 次运行通过：372 项逻辑测试、278 项浏览器测试 |
| Windows 原生／安装 | [42164372634](https://github.com/gouluanjiang/JMPicaComic-Desktop/actions/runs/42164372634) | 通过：原生构建、NSIS、安装后 WebView、重启和数据保留 |

前端检查第 1 次运行被取消。原因是安装 Chromium 用了 12 分钟（平时不到 1 分钟），整个任务超过了 20 分钟的上限。那次主要的浏览器测试已经通过，只有最后一项检查被截断。同一源码重跑后全部通过。这是运行环境的问题，没有改代码，也不把重跑当作修复。

main 合并后的 CI 作为补充证据，不替换已发布的文件。

发行使用发版源码 Windows CI 的 artifact `13479211202`。下载后检查了 ZIP 摘要、manifest 身份和全部 8 个文件的 SHA-256。先在草稿中核对，之后公开。公开后又以匿名方式下载全部文件再次核对，`latest` 和标签也都确认无误。

## 公开发行资产

[正式发行页](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/tag/v1.1.0)，发行 ID `436151612`，非预发行，原有发行版本保留。

| 文件 | SHA-256 |
| --- | --- |
| `JMPicaComic-Desktop-1.1.0-windows-x64.zip` | `2c65d9d1255cf2933b8653b4b434a7b9d2474a11933900e457109475b751b5e9` |
| `MangaMonitor.Dev_1.1.0_x64-setup.exe` | `89faf4c0d5c7a889b3aeb3c936735af1a8c505c3514f3df5a46e9c1aaf03d240` |
| `manifest.json` | `d146976018416009cd19428de8332040d5f273a21fb144837ad89eeb471c9268` |
| `SHA256SUMS.txt` | `974d3015b3f260d5727cc751e9b3551542ca89d42d825fea5c272e27c8b8e7ed` |

安装后的主程序：`9f4e460a43e330ca82742828d5036432f3ef7ab442e64c3bf188a4e5d96e7040`。许可资源和文档的哈希见公开的 manifest。

## 本机交付

1.0.2 在本机用 NSIS 安装时没能替换文件，后来的候选版本都是直接替换程序文件。所以这次在公开前，先用这一版的安装包在本机做了一次真实升级。

- 安装前确认应用已经退出，并把安装目录和数据目录备份到仓库外。
- 安装前，安装记录显示的版本是 0.3.4，实际程序是此前直接替换上去的候选版本。
- 用当前用户静默安装，指定原安装目录，返回 0。
- 安装后主程序哈希与 manifest 记录的安装后哈希一致，安装记录更新为 1.1.0，没有装到默认的其他位置。
- 用户打开程序检查：显示名称、版本、漫画库、关注、下载记录和列表位置都正常。

这次没有经过安装向导的界面。备份和核对材料都保留在仓库外，公开文档不含个人路径、账户、书目或凭据。

## 验证边界与后续

- CI 是合成环境测试。本机升级是一次真实安装，但只覆盖一台电脑、一条升级路径，没有逐一测试从每个旧版本升级。
- 1.0.2 记录中的 LOCAL-03（最近更新冷启动后滚动位置有轻微偏差）没有单独复核。这个周期修了一个滚动测试的竞态（#42），给列表位置恢复加了等待上限（#33），但两者都不能证明 LOCAL-03 的根因已经找到。
- JM 图片域名仍然只有一个，域名列表编译在程序里。JM 更换全部域名时需要发布新版本。
- Windows 安装包没有代码签名。云端自动监控没有启用，`production_enabled=false` 不变。
- README 的“未来计划”（内置更新器、ASMR 和视频）都还没有开始开发，也不代表任何授权。

本记录之后的提交只补记交付事实，不重新构建、不覆盖已公开的文件，也不移动发行标签。
