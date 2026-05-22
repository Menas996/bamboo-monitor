# bamboo-monitor

macOS 桌面应用：监控 Atlassian Bamboo 构建与部署状态，支持收藏 Plan、构建详情、系统通知与菜单栏徽章。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 说明

- 连接 Bamboo 6.x REST API（Basic Auth 或 Session 登录）
- 凭据保存在本机 `electron-store`，不会写入仓库
