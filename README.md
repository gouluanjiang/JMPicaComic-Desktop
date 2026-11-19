<div align="center">

<img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.3.0/app-icon.png" width="96" alt="">

# JMPicaComic-Desktop

**只看你关注的作者更新了什么：隔一个月回来，点一下就能查出这段时间的新作。**

[![最新版本](https://img.shields.io/github/v/release/gouluanjiang/JMPicaComic-Desktop?label=%E6%9C%80%E6%96%B0%E7%89%88%E6%9C%AC)](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/latest)
![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20x64-blue)
[![下载量](https://img.shields.io/github/downloads/gouluanjiang/JMPicaComic-Desktop/total?label=%E4%B8%8B%E8%BD%BD%E9%87%8F)](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases)
[![许可](https://img.shields.io/github/license/gouluanjiang/JMPicaComic-Desktop?label=%E8%AE%B8%E5%8F%AF)](LICENSE)

**[下载最新版](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/latest)** · [快速开始](#快速开始) · [使用教程](#使用教程) · [常见问题](#常见问题) · [问题反馈](https://github.com/gouluanjiang/JMPicaComic-Desktop/issues/new/choose)

</div>

一个支持 JM 和哔咔的 Windows 桌面程序（原名 MangaMonitor）。除了跟进关注作者的新作，它还能批量下载、管理电脑上的漫画，并直接在程序里阅读。另有一个开发中的 [ASMR 分区](#asmr-分区)，可以在线收听 asmr.one 的作品，登录账号后还能管理收藏、标记和播放列表。

> [!NOTE]
> 页面上的截图都是在 1.4.0 的真实程序里拍的，但**封面统一换成了同一张图，作品名和作者名换成了“张飞1”“刘备1”这样的代称，编号是随机生成的**，不含任何真实作品。截图挂在[发行页](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/tag/v1.4.0)，仓库里不放图片。

> [!WARNING]
> **还在用 1.0.2 请尽快升级：** 1.0.2 内置的 JM 主域名已失效并变成停放页，在这个版本上登录 JM，账号密码可能已经发送到这个域名。1.1.0 已修复。
>
> 如果 2026 年 10 月中旬之后在 1.0.2 上登录过 JM，建议修改 JM 密码；其他网站用了相同密码的，也一并修改。

## 目录

- [亮点](#亮点)
- [快速开始](#快速开始)
- [使用教程](#使用教程)
  - 跟进作者：[作者更新](#作者更新) · [特别关注](#特别关注) · [关注作者与作品](#关注作者与作品)
  - 找漫画：[搜索](#搜索) · [在线收藏](#在线收藏) · [最近更新](#最近更新) · [周排行榜](#周排行榜) · [作品详情](#作品详情) · [内容过滤与标记](#内容过滤与标记)
  - 下载与阅读：[下载队列](#下载队列) · [漫画库](#漫画库) · [阅读器](#阅读器) · [浏览历史](#浏览历史)
  - [设置](#设置) · [ASMR 分区](#asmr-分区) · [键盘快捷键](#键盘快捷键)
- [常见问题](#常见问题)
- [使用须知](#使用须知)
- [隐私与数据](#隐私与数据)
- [开发](#开发)
- [维护状态与计划](#维护状态与计划)
- [致谢](#致谢) · [免责声明](#免责声明) · [许可](#许可)

## 亮点

- **只看关注作者的新作：** 一键检查全部关注作者，只显示这次新发现、还没下载的作品，不用翻完整站更新。
- **特别关注自动检查：** 每次启动后在后台检查特别关注的作者，有未读新作时侧栏显示数字。
- **JM 和哔咔在一个窗口：** 搜索、在线收藏、最近更新、排行榜都能在两站之间切换，按作者搜索时两站一起查。
- **批量下载不重复：** 多选或粘贴编号批量下载，每本一个 ZIP；已入库的作品默认隐藏，下载过的不用再看一遍。
- **电脑漫画库加内置阅读器：** 已有的 ZIP 漫画直接用封面墙浏览，右键就能在程序里或小窗里阅读。
- **软件内更新：** 有新版本时右上角提示，确认后自动下载、校验并安装。

## 快速开始

1. 从[发行页](https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/latest)下载 `MangaMonitor.Dev_<版本>_x64-setup.exe`，可用同页的 `SHA256SUMS.txt` 核对文件。
2. 关闭正在运行的程序和阅读小窗，然后运行安装包。
3. 打开“设置 → 漫画库”，选择你的漫画文件夹。已有漫画不用搬迁。
4. 打开“设置 → 账号与收藏”，连接 JM 和哔咔。
5. 关注几位作者，然后到“作者更新”点击“一键检查全部关注作者”。

**升级：** 1.2.0 起可以直接在软件内更新（见[软件更新](#软件更新)）。1.1.0 和更早的版本需要先手动安装一次新版，安装前请关闭所有窗口。

**运行环境：** Windows x64，需要 Microsoft Edge WebView2，缺少时安装程序可能会联网下载。

## 使用教程

左侧栏分三组：“我的漫画”（漫画库、下载队列、浏览历史）、“发现作品”（在线收藏、最近更新、周排行榜、搜索）、“关注与更新”（作者更新、关注作者、特别关注）。侧栏顶部的“漫画 / ASMR”切换两个分区，底部是设置和收起侧栏。

窗口没有 Windows 自带的标题栏：最小化、最大化和关闭按钮在右上角，按住顶部空白处可以拖动窗口，双击可以最大化或还原。

### 作者更新

程序的核心功能：一键检查所有关注作者，告诉你这次新发现了多少部。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-author-updates.jpg" alt="作者更新：检查结果和未入库的新作" width="820"></p>

如果你一个月甚至更久才看一次漫画，自己翻完这段时间的全部更新太花时间，里面还混着大量不想看的内容。假设你在 10 月 1 日第一次检查，11 月 1 日再回来：

| 时间 | 你的操作 | 你看到的结果 |
| --- | --- | --- |
| 10 月 1 日 | 第一次点击“一键检查全部关注作者” | 程序读取每位作者的完整目录，列出他们到这天为止的全部作品 |
| 11 月 1 日 | 再点一次同一个按钮 | 程序优先读取上次之后新增的部分，告诉你这次新发现了多少部 |
| 随时 | 点击“仅看本次扫描新增” | 只显示这次新发现的作品，也就是从 10 月 1 日到现在新出现的内容 |

**怎么用：**

1. 在“设置 → 账号与收藏”连接 JM 和哔咔，两个账号都需要。
2. 打开任意作品的详情，点击作者旁边的“关注作者”。关注的作者越全，查到的更新越完整。
3. 打开左侧的“作者更新”，点击“一键检查全部关注作者”。第一次要读取完整目录，作者多时需要等一段时间。
4. 查看结果：可以按来源筛选、按更新时间排序，或在“全部 / 已入库 / 未入库 / 状态待核对”之间切换。
5. 点击作品卡片上的“下载到漫画库”，或点击右下角的“多选”批量下载。
6. 下次想看新作时，回到这里再点一次“一键检查全部关注作者”。

| 想做什么 | 怎么做 |
| --- | --- |
| 只看某一位作者的更新 | 在“检查作者”中选这位作者 |
| 上次断网或读取失败没查完 | 点“仅补查未完成”，只补查没完成的部分 |
| 怀疑作者补录了旧作 | 点“完整复核”，重新读取所选范围的全部分页 |
| 只想更新显示和入库状态 | 点“刷新显示与入库状态”，不会重新扫描网站 |

- 之前没下载的旧作品会一直保留，不会因为又检查了一次就消失。
- 页面默认只显示还没入库的作品；检查只负责查找，不会自动下载。
- “新发现”指这部作品第一次被这个目录记录到，不一定是网站上新发布的。如果某次检查没有查完，页面会明确提示，查到 0 部也不代表作者一定没有更新。

### 特别关注

有几位作者特别想追、不想每次手动检查时，把他们设为特别关注。每次启动程序后，程序会在后台自动检查所有特别关注的作者，不影响你正常浏览；有未读新作时，侧栏显示数字。程序完全退出后不会继续检查。

1. 在左侧的“关注作者”中找到作者，点击“设为特别关注”，也可以在作品详情里设置。
2. 第一次检查会把作者已有的作品记为基线，之后出现的新作才算未读。
3. 打开左侧的“特别关注”查看新作，可以在“只看未读”和“全部特别关注更新”之间切换。
4. 打开某本的详情或阅读器后，这一本才标为已读；也可以点击“全部标为已读”。想马上查一次，点击“检查特别关注”。

### 关注作者与作品

集中管理想长期跟进的作者，或先记下某一部还想继续看的作品。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-followed-authors.jpg" alt="关注作者名单" width="820"></p>

| 想做什么 | 怎么做 |
| --- | --- |
| 关注或取消关注 | 在作品详情中点击“关注作者”或“关注作品”，在同一位置取消 |
| 查看名单 | 打开左侧的“关注作者”，在“作者关注 / 作品关注”和 JM / 哔咔之间切换 |
| 查这位作者的全部作品 | 在作者一行点“搜索该作者” |
| 让程序自动检查这位作者 | 点“设为特别关注” |

关注保存在本机当前账号下，不会改动网站上的关注。

### 搜索

打开左侧的“搜索”，选择“作者”“作品关键词”“编号或链接”或“标签”。

| 想做什么 | 怎么做 |
| --- | --- |
| 查某位作者的全部作品 | 选“作者”。会同时查询 JM 和哔咔，每位作者单独一个标签页，切换页面后结果和浏览位置都还在，重启后不保留 |
| 用关键词或标签找漫画 | 选“作品关键词”或“标签” |
| 手上已有编号或链接 | 选“编号或链接” |
| 从作品继续找 | 点击封面下的作者名，或详情里的标签，直接搜索 |

### 在线收藏

在网站上收藏了很多作品，想看看哪些还没下载。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-favorites.jpg" alt="在线收藏：网站收藏夹和入库状态" width="820"></p>

| 想做什么 | 怎么做 |
| --- | --- |
| 看某个网站的收藏 | 打开左侧的“在线收藏”，切换 JM 或哔咔，选择网站收藏夹 |
| 网站上的收藏有变动 | 点“刷新收藏” |
| 找出还没下载的 | 切到“未入库”，再搜索或排序，然后多选批量下载 |
| 在网站上收藏或取消 | 在作品详情中点击“收藏到网站”或“取消网站收藏” |

### 最近更新

不限于关注的作者，想随便逛逛网站最近出了什么。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-recent.jpg" alt="最近更新：两站的新近作品" width="820"></p>

打开左侧的“最近更新”，在“来源”中选择 JM、哔咔或两站合并，向下滚动继续加载，点击“刷新最近更新”读取最新内容。“新增”角标表示和上次浏览相比新出现的作品。

### 周排行榜

想知道最近大家都在看什么，发现还不认识的作者。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-ranking.jpg" alt="JM 每周必看榜单" width="820"></p>

打开左侧的“周排行榜”，查看 JM 每周必看或哔咔排行榜。JM 可以选择期数和类型，点击“刷新榜单”重新读取。切到“未入库”筛掉已经有的作品，再下载想看的。

### 作品详情

下载前先确认页数、章节、更新时间、作者和标签。点击作品标题，或右键封面选择“作品详细”打开。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-detail.jpg" alt="作品详情：作者、标签、章节、页数和操作按钮" width="820"></p>

在详情里可以阅读、下载到漫画库、收藏到网站、关注作者或作品，也可以点击标签继续搜索。

### 内容过滤与标记

这些都是自动的，不需要设置。

- 明确标有 BL／耽美或 AI 作画的作品，以及 JM 的“女性向”作品，会自动隐藏。网站没有标注的内容无法识别。
- 封面上标出“已汉化”或“生肉”，只依据网站标签，不靠标题猜测；没有依据时封面不标，详情页显示“未知”。“生肉”表示未翻译，不一定是日文。

### 下载队列

一次下载很多本，中途可能要暂停，或者下载失败后要重试。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-download-queue.jpg" alt="下载队列：粘贴编号和三个分类" width="820"></p>

| 想做什么 | 怎么做 |
| --- | --- |
| 下载一本或一批 | 在任意列表点击“下载到漫画库”，或点击“多选”后勾选批量下载 |
| 手上有一串编号或链接 | 打开“下载队列”，选择来源后粘贴（每行一个，一次最多 500 本），点“加入下载” |
| 看进度、处理失败 | 在“下载中”“下载失败／需要处理”“已下载”之间切换，可以暂停、继续、重试或放弃 |
| 调整下载速度 | 在“设置 → 下载与资源”调整同时下载的作品数和全局图片请求数 |

每本保存为一个 ZIP，保存、验证、登记都完成才算成功。已有文件不会被覆盖，同名冲突时会提示。更多细节见[使用指南](docs/USER_GUIDE.md#下载队列)。

### 漫画库

电脑里已经有不少 ZIP 漫画，想用封面墙浏览和查找。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-library.jpg" alt="漫画库：最近入库和全部作品的封面墙" width="820"></p>

| 想做什么 | 怎么做 |
| --- | --- |
| 选择漫画文件夹 | 在“设置 → 漫画库”选择，已有漫画不用搬迁 |
| 找一本漫画 | 在右上角搜索，或筛选、按时间排序 |
| 调整封面大小 | 点右上角“封面密度”的 5 / 7 / 9 |
| 手动移动或删除了文件 | 点“刷新漫画库”重新核对 |
| 打开文件位置、删除漫画 | 右键封面。删除前会确认，文件只会移到 Windows 回收站 |

### 阅读器

下载完直接在程序里看，或者开一个小窗一边看一边做别的事。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-reader.jpg" alt="程序内阅读：单页模式和底部工具栏" width="820"></p>

| 操作 | 怎么做 |
| --- | --- |
| 打开 | 右键封面，选“程序内阅读”或“小窗阅读”；双击封面直接开小窗 |
| 切换纵向连续 / 单页 | 底部工具栏的模式选择 |
| 翻页（单页模式） | 点击左半边或右半边，或按 `←` `→` |
| 缩放 | `Ctrl`＋滚轮 |
| 跳页、换章节 | 鼠标移到底部显示工具栏，拖动进度条或选择章节 |
| 全屏 | 工具栏的“全屏”，或按 `F11` |
| 返回 | 工具栏的“返回”，或按 `Esc` |
| 移动、最小化、关闭小窗 | 鼠标移到小窗最顶端，滑出标题栏后拖动或点按钮；关闭前会保存阅读位置 |

可以同时打开多个小窗并按需置顶，阅读位置会自动保存。

### 浏览历史

想找回前几天看过、但当时没收藏的作品。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-history.jpg" alt="浏览历史：带封面的最近打开记录" width="820"></p>

打开左侧的“浏览历史”，这里带封面显示最近打开的 100 本。只有打开详情或阅读器才会记录。可以取消勾选“记录浏览历史”，也可以点击“清空历史”；两者都不影响漫画文件和阅读进度。

### 设置

点左下角的“设置”。左边是分类，顶部可以搜索设置项。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-settings-account.jpg" alt="设置：账号与收藏" width="820"></p>

| 位置 | 用来做什么 |
| --- | --- |
| 账号与收藏 | 分别登录 JM 和哔咔。可以选择“记住会话”；JM 还可以选择“记住登录” |
| 漫画库 | 选择电脑漫画文件夹 |
| 外观 | 背景预设或自定义背景图，调整背景模式、暗化、模糊和封面密度，也可以减少动态效果 |
| 下载与资源 | 同时下载的作品数和全局图片请求数 |
| 网络与诊断 | 软件更新；查看版本和提交号、账号与线路状态；复制诊断摘要 |

#### 外观

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-settings-appearance.jpg" alt="设置：外观" width="820"></p>

#### 软件更新

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-settings-diagnostics.jpg" alt="设置：软件更新与网络诊断" width="820"></p>

- 程序启动时会检查有没有新版本，有就在右上角提示。点击“查看更新”可以看到版本说明，确认后才会下载和安装。
- 安装包会先校验签名，然后程序和所有阅读小窗会关闭，安装完成后自动重新打开。下载队列运行时不能安装。
- 在“设置 → 网络与诊断 → 软件更新”可以关闭启动时的检查，也可以手动检查。

这个功能从 1.2.0 开始提供，1.1.0 和更早的版本需要先手动安装一次。

#### 诊断

遇到问题想反馈：在“设置 → 网络与诊断”查看版本和提交号，点“复制诊断摘要”后提交到 [Issues](https://github.com/gouluanjiang/JMPicaComic-Desktop/issues)。摘要不含账号、作品标题和私人路径。

### ASMR 分区

开发中。想在同一个程序里听 ASMR，不用另开浏览器。内容来自 asmr.one，浏览和播放都不需要账号；音频和视频直接在线播放，不会保存到电脑上。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-asmr.jpg" alt="ASMR 分区：热门作品和全部作品" width="820"></p>

1. 点击侧栏顶部的“漫画 / ASMR”切换到 ASMR 分区。切回漫画时，原来的页面和浏览位置都会保留。
2. 浏览热门作品或全部作品，可以排序、只看带字幕的作品，也可以搜索标题、社团、声优或 RJ 号。
3. 点开作品，右侧会显示详情和文件列表。点击“播放”，或直接点列表里的音频、视频文件。
4. 底部出现播放条，点它可以展开完整播放器，里面有字幕列表和播放列表。

<p align="center"><img src="https://github.com/gouluanjiang/JMPicaComic-Desktop/releases/download/v1.4.0/screenshot-asmr-detail.jpg" alt="ASMR 作品详情：标记、评分、播放和文件列表" width="820"></p>

**播放时：**

- **字幕：** 支持 VTT、LRC 和 SRT。带字幕的文件还会在桌面上显示一个置顶的透明字幕小窗，可以拖到任意位置并调整字号。
- **视频：** 收起播放器时，视频缩成一个可以拖动的小窗，拖角可以调整大小（保持画面比例）；展开后可以全屏。也可以点“画中画”弹到程序窗口之外，一边看视频一边翻漫画。
- **多个版本：** 作品有多个版本文件夹时，优先选中文、带字幕、无损原档的版本，拿不准时会问一次。
- **其他：** 键盘快捷键和媒体键、播放速度、睡眠定时，每个文件记住听到的位置。切到漫画分区时会继续播放。

**asmr.one 账号（1.3.0 起）：**

| 想做什么 | 怎么做 |
| --- | --- |
| 登录 | 点 ASMR 页面右上角的“登录”。密码只发给 asmr.one，程序不保存；登录状态存在 Windows 凭据管理器里，网站给的有效期约一年 |
| 看自己标记过的作品 | 侧栏的“我的收藏”，按想听、在听、听过、重听、搁置显示，可以按标记时间排序 |
| 标记和评分 | 在作品详情里直接改标记、打一到五星，或者清除 |
| 管理播放列表 | 和网站上的是同一份。可以把作品加入或移出列表，也可以新建、编辑、删除自己的列表 |
| 自动标记 | 开始播放时标为“在听”，播完标为“听过”；“重听”和“搁置”不会被改动。可以在账号菜单里关闭 |

所有修改都直接保存到你的 asmr.one 账号，网站上会同步看到。

### 键盘快捷键

| 按键 | 作用 |
| --- | --- |
| `←` `→` | 阅读器单页模式：上一页 / 下一页 |
| `Ctrl`＋滚轮 | 阅读器：缩放 |
| `F11` | 阅读器：全屏 / 退出全屏 |
| `Esc` | 阅读器：退出全屏或返回；ASMR：收起完整播放器 |
| `空格` 或 `K` | ASMR：播放 / 暂停 |
| `←` `→` | ASMR：后退 / 前进 10 秒（按住 `Shift` 为 30 秒） |
| `↑` `↓` | ASMR：调节音量（完整播放器展开时） |
| `M` | ASMR：静音 / 取消静音 |
| `Shift`＋`N` / `Shift`＋`P` | ASMR：下一首 / 上一首 |

## 常见问题

<details>
<summary><b>显示“未入库”，但我电脑上有这本？</b></summary>

入库状态只依据同来源的下载记录、已核对的旧库登记和实际文件，不靠标题猜测，也不自动把两个网站的同一部作品合并。所以有文件但没有来源记录的旧漫画，可能显示为“未入库”或“待核对”。详见[使用指南](docs/USER_GUIDE.md#已入库的含义)。

</details>

<details>
<summary><b>检查完显示 0 部新作，是作者真的没更新吗？</b></summary>

不一定。如果某次检查没有查完，页面会明确提示；可以点“仅补查未完成”只补查没完成的部分。怀疑作者补录了旧作时，用“完整复核”。

</details>

<details>
<summary><b>怎么完全退出或更新？</b></summary>

关闭主窗口后，如果还有阅读小窗，程序可能仍在运行。手动安装新版前请关闭所有窗口，也不要同时运行不同版本。1.2.0 起也可以在软件内更新，它会自己关闭和重新打开程序。

</details>

<details>
<summary><b>为什么安装后叫 MangaMonitor Dev？</b></summary>

本项目原名 MangaMonitor。安装名称 MangaMonitor Dev 和内部标识保持不变，只是为了沿用原有的安装记录和数据，不代表测试版。实际版本可以在“设置 → 网络与诊断”查看。

</details>

<details>
<summary><b>Windows 弹出安全提示？</b></summary>

安装包没有代码签名，Windows 可能提示未知发布者。请只从本仓库发行页下载，并可用同页的 `SHA256SUMS.txt` 核对文件。

</details>

<details>
<summary><b>能在浏览器或 Mac 上用吗？</b></summary>

不能。真实账号、漫画库和下载只有 Windows 桌面端提供；开发用的浏览器预览只显示合成数据。

</details>

## 使用须知

- **需要你自己的账号：** 程序不附带账号、书目或漫画。
- **内容来自第三方网站：** 这些网站可能包含成人内容，也可能随时不可用。请遵守当地法律和网站条款。
- **安装包没有代码签名：** Windows 可能弹出安全提示，请只从本仓库发行页下载。
- **软件内更新从 1.2.0 开始：** 1.1.0 和更早的版本不会检查新版本，需要先手动安装一次 1.2.0 或更新的版本。
- **自动检查的范围：** 只有特别关注会在启动时自动检查；普通关注要手动点击。程序不会定时扫描，退出后也不会检查，任何检查都不会自动下载。
- **不靠猜测判断同一本：** 程序不按相似标题判断，也不自动合并两个网站的同一部作品。

## 隐私与数据

- 账号、关注名单和漫画库只保存在你的电脑上，不会上传到 GitHub。
- 记住会话和 JM 的“记住登录”都是可选功能，凭据保存在 Windows 系统安全存储中，不写入普通设置文件。
- asmr.one 只保存登录后网站发的令牌，同样放在 Windows 系统安全存储中，不保存密码；令牌只发给 asmr.one 的接口服务器。
- 诊断摘要不含账号、作品标题和私人路径。反馈问题时请不要附上账号或密码。

## 开发

| 组成 | 位置 |
| --- | --- |
| 前端（React、TypeScript、Vite） | [apps/local-workbench](apps/local-workbench/README.md) |
| 桌面端（Tauri 2） | `apps/local-workbench/src-tauri` |
| Rust 工作区 | `crates/` |

工具链：Node 24、pnpm 11.19.0、Rust 1.98.1，依赖由锁文件固定。正式检查和构建在 GitHub Actions 上运行。

- **反馈问题或提建议：** 请使用 [Issue 模板](https://github.com/gouluanjiang/JMPicaComic-Desktop/issues/new/choose)。
- **报告安全问题：** 请按[安全策略](SECURITY.md)私下提交，不要公开发布。
- **提交代码：** 请先阅读[贡献说明](CONTRIBUTING.md)。

更多资料：[使用指南](docs/USER_GUIDE.md) · [开发约束](AGENTS.md) · [文档导航](docs/README.md) · [项目进度](docs/PROJECT_STATUS.md) · [1.4.1 版本说明](docs/RELEASE_NOTES_1.4.1.md) · [历史文档](docs/archive/README.md)

历史文档不代表当前路线；已取消的自动匹配、手机名单和分类书单不会因此恢复。

## 维护状态与计划

漫画部分功能稳定，持续维护；ASMR 分区仍在开发中。接下来的方向：

- **ASMR 下载和本地库：** 把喜欢的作品保存到电脑上。

这里列出的是方向，还没有开始开发，也不代表发布日期。之前计划的“关注社团、声优、标签”改为直接使用 asmr.one 账号自带的收藏和播放列表，不再单独开发；视频来源也不再计划加入。

## 致谢

本项目参考或适配了以下开源项目，版本和许可信息见[第三方通知](THIRD_PARTY_NOTICES.md)：

- [lanyeeee/jmcomic-downloader](https://github.com/lanyeeee/jmcomic-downloader)
- [lanyeeee/picacomic-downloader](https://github.com/lanyeeee/picacomic-downloader)
- [hect0x7/JMComic-Crawler-Python](https://github.com/hect0x7/JMComic-Crawler-Python)
- [2024baibai/PicaComic-Api](https://github.com/2024baibai/PicaComic-Api)
- [gotson/komga](https://github.com/gotson/komga)
- [motiondivision/motion](https://github.com/motiondivision/motion)
- [Miuzarte/PicaComic-go](https://github.com/Miuzarte/PicaComic-go)（仅查阅，未包含其代码）

## 免责声明

本项目是非官方的第三方工具，与 JM、哔咔、asmr.one 及其运营方没有关联，也不提供、托管或分发任何漫画、音频或视频内容。所有内容都来自你自己的账号和第三方网站，版权归原作者和权利人所有。

请仅在当地法律和相关网站条款允许的范围内使用。账号受限、数据丢失等使用风险由使用者自行承担。

## 许可

[MIT](LICENSE)。参考和适配的第三方代码见[第三方通知](THIRD_PARTY_NOTICES.md)，安装包内也附有依赖的许可文本。
