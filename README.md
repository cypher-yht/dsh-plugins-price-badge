# dsh-price-badge · DeepSeek 价格时段徽标

DeepSeek Harness（DSH）Web 界面**右下角常驻的一个胶囊徽标**：实时显示 DeepSeek API 当前处于**高峰**还是**空闲（5 折）**时段，
并倒计时到下一次切换；徽标右侧同时显示账户余额。

> 标准 DSH bundle 插件（`cordis.patch.yml` + 宿主/客户端两个半区），装完刷新页面即生效。

## 特性

- **右下角常驻徽标**：注册到 `shell.overlay` 插槽（`id: price-badge`，`order: 50`），固定在视口右下角
  （`right/bottom: 16px`），1 秒一跳，不挡正文点击（容器 `pointer-events: none`，只有徽标本身可点）。
- **峰谷判定（北京时间）**：周一至周五 **09:00–12:00、14:00–18:00 为高峰**（全价）；其余全部时间（含周末）
  **为空闲，价格为高峰的 50%**。徽标显示「高峰」或「空闲 · 5 折」，圆点分别用警告色 / 成功色。
- **到下次切换的倒计时**：不是简单找下一个整点，而是向后扫 8 天内的 09 / 12 / 14 / 18 四个边界，
  找到**真正会让峰谷状态翻转**的那一刻，显示为 `mm:ss` 或 `hh:mm:ss`。
- **切换瞬间高亮**：峰谷翻转时徽标放大 4% + 一圈描边光晕，并弹出「已进入高峰时段」/「已进入空闲时段（5 折）」，
  6 秒后自动消失。
- **点开看详情**：点徽标展开一个小面板（272px 宽），含当前时段说明、下次切换的具体时刻（北京时间 + 周几）、
  余额、完整计费规则，以及「法定节假日未单独识别」的提示；再点一次或按「收起」关闭。
- **账户余额**：徽标右侧显示 `余额 ¥x.xx`；有赠金且大于 0 时显示 `余额 ¥x.xx（赠金 ¥y.yy）`（赠金为 0 时不展示）。
  客户端每 60 秒刷新一次；单次失败会保留上一次的成功值，不会闪成「余额不可用」。
  未登录显示「未登录账户」，接口缺失显示「余额不可用」。
- **中英双语**：内置 zh / en 字典，切换语言时面板在原地重渲染（不重新注册插槽）。

## 计费口径（代码里实现的就是这张表）

| 时段 | 北京时间 | 价格 |
|---|---|---|
| 高峰 | 周一至周五 09:00–12:00 | 全价 |
| 高峰 | 周一至周五 14:00–18:00 | 全价 |
| 空闲 | 其余所有时间（含周末全天） | 高峰的 50% |

> 代码不识别法定节假日：节假日当天若落在工作日的上述区间，仍会显示为高峰。

## 两个半区

- **宿主侧（`index.js`）**：只做浏览器算不出来的那件事 —— 余额。注册 `GET /plugins/price-badge/balance`：
  仅接受回环地址（否则 `403 local access only`）、仅接受 GET（否则 `405`）、服务端缓存 30 秒；
  返回 `{ status: 'ready', currency, balance, bonus? }` / `{ status: 'signed-out' }` /
  `{ status: 'unavailable' }` / `{ status: 'error', reason }`。数据来自 `deepseekAccount.getBalance()`。
- **客户端侧（`client.js`）**：峰谷判定、倒计时、闪光提示、面板全部是纯时钟运算，在浏览器里跑；
  只有余额走上面那个接口。

## 安装

```powershell
dsh plugin add github:cypher-yht/dsh-plugins-price-badge
```

本地开发用软链（改源码即生效）：

```powershell
dsh plugin add link:D:\path\to\dsh-plugins-price-badge
```

> 桌面客户端（Electron）读的是 `desktop` profile，请让桌面端会话里的 `plugin_manager` 安装。

装完**重启宿主**，浏览器 `Ctrl+F5` 硬刷新。

## 目录结构

```text
dsh-plugins-price-badge/
├── index.js            # 宿主侧：GET /plugins/price-badge/balance（余额，30s 缓存）
├── client.js           # 前端：右下角徽标 + 倒计时 + 展开面板
├── cordis.patch.yml    # 挂载声明
├── locale/             # 插件元信息文案（zh / en）
│   ├── en.json
│   └── zh.json
├── icon.svg            # 插件列表图标
└── package.json
```

## 许可证

MIT，见 [LICENSE](LICENSE)。
