# 刚果金斯语翻译（Android）

这是 DWSS 科卢韦齐斯瓦希里语助手的 Android 原生安装包工程。只构建 Android，不再构建 iOS。

## 应用信息
- 桌面显示名称：刚果金斯语翻译
- Android application ID：`com.dwss.kolwezi`（保持稳定，后续升级沿用）
- 图标：使用正式网页封面 `cover.jpg` 生成 Android 普通图标和自适应图标。
- 网页资源：构建时从正式站点下载并嵌入 APK；离线可打开已缓存/内置的本地词库，联网后使用 Supabase 共享词库。

## 构建
CI 从正式网站下载经过发布的网页文件，使用 Capacitor 8、JDK 21 和 Android SDK 36 构建 Debug APK，并检查 APK 的包名、版本、应用标签、签名和图标资源。

APK 输出文件名：`刚果金斯语翻译-<网站版本>.apk`。

## 安装和分享
1. 构建完成后，从 GitHub Actions 的 Artifact 下载 ZIP 并解压。
2. 将其中的 APK 发送给其他 Android 手机用户（微信、WhatsApp、Telegram、蓝牙、USB 等均可）。
3. 接收者下载 APK 后点击安装；Android 可能要求允许当前浏览器或文件管理器“安装未知应用”。只在确认 APK 来自可信发送者时允许。
4. 安装后打开应用。第一次使用共享词库/跨设备同步需要互联网；离线时可使用 APK 内嵌的网页资源和词库。

## 签名和后续升级注意
当前先产出可直接侧载安装的 Debug APK，并由 CI 签名。每次 GitHub runner 生成的默认 Debug 签名可能不同；下一次更新时，若签名不一致，Android 会拒绝覆盖安装，需要先卸载旧版再安装新版，可能清除仅保存在该手机本地的个人词条/历史。共享云端词库不受影响。正式长期分发前，建议建立并妥善保管固定的 Release keystore，并把签名信息作为私有 CI secrets 配置；绝不能把 keystore 或密码提交到公开仓库。

这不是 Google Play 上架包。若以后要上架或进行稳定长期分发，应使用固定 Release 签名密钥生成签名 Release APK。
