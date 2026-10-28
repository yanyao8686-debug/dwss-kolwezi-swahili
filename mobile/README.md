# DWSS 原生应用构建说明

此目录将已部署的 DWSS 网站资源打包进 Capacitor 原生容器，不改变 Supabase 共享词库结构。

## 当前构建方式

- Android：GitHub Actions 使用官方 Android 工具链生成可侧载的 Debug APK。
- iOS：GitHub Actions 在 macOS 上编译 iOS Simulator .app，用于界面和功能预检；这不是可安装到实体 iPhone 的 IPA。
- 网页资源：构建时从正式 GitHub Pages 站点拉取并嵌入 www/，因此构建前应先通过网站回归测试。

## 本地构建

需要 Node.js 22+、Android Studio/JDK 21；iOS 需要 macOS、Xcode 26+。

1. 进入 mobile 目录并运行 npm install。
2. 将正式站点资源复制到 www/（见 .github/workflows/build-native-apps.yml）。
3. 运行 npx cap add android、npx cap sync android。
4. 进入 android 目录运行 ./gradlew assembleDebug。

## iOS 签名限制

无 Apple Developer Program 会员时，不能通过 TestFlight/App Store 正式分发，也不能生成可供普通用户直接安装的签名 IPA。免费 Apple Account 可在 Mac 上用 Xcode 对个人设备做有限的开发测试，但需要用户本人登录并签名。不要把未签名 IPA 误称为可安装包。

## 版本和数据

应用内嵌资源随原生包版本更新；共享词库继续通过 Supabase 在线同步。网页 Service Worker 的自动更新不负责替换原生 APK/IPA。Android 原生版本升级应通过新 APK 安装；iOS 需重新签名安装或经 TestFlight/App Store 分发。
