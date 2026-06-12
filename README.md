# ⛰ 六盘山 V3.0 — 盘感修炼营

A股盘前模拟训练 PWA，基于公开市场数据的量化模拟学习工具。

## 快速开始

### 本地运行
```bash
cd E:\六盘山
node app-server.js
# → http://localhost:9090
```

### 目录结构
```
E:\六盘山\
├── gumo-app.html     # 主应用 (Splash + 登录 + 六强 + 策略)
├── admin.html         # 管理后台 (选股 + 热点 + 充值)
├── sw.js              # Service Worker v56 
├── manifest.json      # PWA 清单
├── app-server.js      # 本地开发服务器
├── market-data.json   # 策略选股数据
├── package.json       # 依赖配置
├── .gitignore
├── icons/             # PWA 图标
├── scripts/
│   ├── fetch-data.js  # 定时刷新行情
│   └── pet-drawing-ref.js  # 宠物绘图参考
├── data/              # 数据备份目录
├── cache/             # PWA 缓存目录
└── .github/workflows/ # GitHub Actions 定时任务
```

## 策略体系

1. **V3.0 逻辑评分 (160分)** — 产业垄断 + 业绩爆炸 + 资金事件 + 爆发力
2. **决策矩阵** — 确定仓位（满仓/半仓/轻仓/放弃）

## 品牌规范

- 名称: 六盘山 · 盘感修炼营
- 口号: 盘感好不好·六盘山上练一练
- 三诫: 戒冲动 · 攒能量 · 敬市场
- 配色: 深空黑(#030609) + 青蓝 + 蓝光渐变
- 六宠: 冲动牛 · 萌萌熊 · 恐惧龙 · 空仓猫 · 大犟驴 · 悟道鹰

> 郑重提示 · 非投资建议 · 仅供模拟训练
