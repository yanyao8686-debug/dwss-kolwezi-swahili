# DWSS 科卢韦齐斯瓦西里语助手

这是 DWSS 科卢韦齐斯瓦西里语助手跨平台离线 PWA 的发布仓库。

## 第一步：启用 GitHub Pages（只需做一次）

1. 打开本仓库 **Settings → Pages**。
2. 在 **Build and deployment → Source** 选择 **GitHub Actions**。
3. 保存设置。

GitHub 官方操作说明：[配置 GitHub Pages 发布来源](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

## 第二步：上传 PWA 发布包（只需做一次）

1. 下载本对话提供的 `DWSS_PWA_0.5.1_GitHubPages_发布包.zip`。
2. 在仓库主页面点击 **Add file → Upload files**。
3. 把 ZIP 文件本身上传到仓库根目录，不要解压，也不要改文件名。
4. 点击 **Commit changes**。

上传后，`.github/workflows/deploy.yml` 会自动解压发布包并部署网站。

## 第三步：确认发布成功

1. 打开仓库 **Actions**。
2. 找到 **Deploy DWSS PWA to GitHub Pages**。
3. 等待最近一次运行显示绿色勾号。若失败，点进运行记录查看具体错误。
4. 发布成功后的网址为：

https://yanyao8686-debug.github.io/dwss-kolwezi-swahili/

只有 Actions 成功后，这个地址才算正式可用。

## 手机上安装

- Android：用 Chrome 打开上方网址，等待显示“离线资源已缓存”，再从浏览器菜单选择“安装应用”或“添加到主屏幕”。
- iPhone：用 Safari 打开上方网址，等待显示“离线资源已缓存”，点击“分享 → 添加到主屏幕”。

首次访问和缓存必须联网。缓存完成后，词库查询、中文短句匹配、自定义词条维护、收藏、历史和备份恢复可以在本机离线使用。

## 重要说明

- 本项目是 PWA，不是 APK 或 IPA。
- 用户自定义词条、收藏和历史分别保存在各台手机本机，不会自动跨设备同步；更换手机前请先导出词库备份。
- 本工具以用户最初提供的两份中文—中文谐音资料为依据；原资料未系统提供斯瓦西里语拉丁拼写，故不伪造拼写。
- 短句功能是按词库整句优先及词条匹配拼配，不能视为谷歌翻译级的完整语法翻译。未收录内容会提示补充；重要安保、医疗和紧急指令应让当地使用者核验。
- 本仓库和 Pages 网站是公开可访问的；不要上传任何密码、密钥或个人敏感资料。
