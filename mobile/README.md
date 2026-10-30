# 刚果金斯语翻译（Android）

这是 DWSS 科卢韦齐斯瓦希里语助手的 Android 安装外壳。只构建 Android，不构建 iOS。

## 应用信息
- 桌面显示名称：刚果金斯语翻译
- Android application ID：`com.dwss.kolwezi`
- 图标：使用正式 DWSS 网站封面生成 Android 普通图标和自适应图标。
- 主程序：Android WebView 打开官方 HTTPS 网站 `https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/`，不再把当前网页代码作为固定版本运行。

## 网页自动更新与离线缓存
- APK 安装后，首次打开需要联网，让 WebView 打开正式网站并完成 Service Worker 首次缓存。
- 网站本身已有 Service Worker 自动更新管理：打开应用、恢复联网或回到前台时检查新版；发现新版后后台下载、安装并刷新页面。
- 下载更新失败时保留已经缓存的旧网页版本；网络中断时可在缓存已完成的前提下离线使用。
- 以后普通网页功能、界面、词库程序逻辑的发布，只需更新正式网站，不用重新制作或发送 APK。
- 共享词库和跨设备同步仍需互联网。首次打开未完成缓存前，离线不可用。

## 网页与 APK 版本统一

- APK 的 WebView 每次冷启动都会请求正式 HTTPS 网站，并由网站的 Service Worker 检查和缓存最新网页版本；联网成功后，翻译、发音查询、共享词库和界面均以正式网站为准。
- APK 的原生 versionName、versionCode 和随包离线资源仍记录构建时的网页版本。重新构建时，CI 必须从正式网站下载同一版本的 index.html、app.js、Service Worker、词库、拼音表和反向发音引擎，并在构建前后检查版本号一致。
- 离线时只能使用该设备此前成功缓存的版本；首次安装或清除应用数据后必须先联网完成缓存。重新联网启动成功后，Service Worker 才能获取并切换到更新版本。

## 哪些情况仍需要重新安装 APK
只有 Android 原生外壳本身发生变化时才需要新 APK，例如桌面应用名称/图标、Android 权限、WebView 外壳代码、原生插件或包名变更。纯网页代码、样式和词库更新不需要新 APK。

## 安装和分享
将构建出的 APK 发送给 Android 用户；对方下载后点击安装。Android 可能要求对当前浏览器或文件管理器允许“安装未知应用”，只在确认文件来源可信时允许。APK 不能安装在 iPhone 上。

## 本地资料与首次换版提醒
旧版 APK 使用本机 WebView 的 `https://localhost` 本地数据来源；本版改为官方网页 HTTPS 域名，因此旧版的本机自定义词条、收藏和历史不会自动出现在新域名的数据空间。升级前请在旧版的“添加新词”页面生成并复制个人词库 JSON 备份，妥善保存后再安装新版。若 Android 因签名不同要求先卸载旧版，卸载会清除旧版本机数据；云端共享词库不受影响。

当前 CI 仍输出 Debug 签名 APK。不同 CI 构建可能使用不同 Debug 签名；如果未来需要再次替换 APK，可能要卸载再装。长期稳定分发应配置固定且妥善保管的 Release 签名密钥，不要把密钥或密码提交到公开仓库。重新安装前请先导出并确认个人词库 JSON 备份，卸载应用会清除该 WebView 域名下的本机词条、收藏和历史。


## 自动版本发布验证（2026-10-30）
- Android 构建必须读取正式网站 `VERSION.txt`，并使用同一个 SemVer 设置 APK `versionName` 与 `versionCode`。
- 本次发布链路改造会验证 CI Debug 证书是否跨构建保持一致；未确认签名兼容前，不允许用新 APK 覆盖网站当前安装包。
- 正式长期发布需要固定 Release 密钥；签名密钥只通过 GitHub Actions Secrets 提供，绝不写入公开仓库。
