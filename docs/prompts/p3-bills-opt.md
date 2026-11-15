本阶段已由审批方授权执行。收到后立即动手，不要复述计划、不要等待确认、不要只分析不落地。

读 docs/DESIGN.md（尤其第 5、6、7、8 节的账单段落）、AGENTS.md，以及现有账单实现，然后只完成「支付宝账单页面优化」。这是对已交付账单功能（P3）的 UI 与数据分析增强，只动 bills 域，不碰 mail / dashboard / 其它模块。

## 目标

把账单页从「一张总额卡 + 两张柱状图 + 三列明细」升级为带收支方向、时间范围、多维图表的分析页。核心是补上数据模型缺失的「收/支方向」与「交易对方」，让「支出/收入/结余」等主流指标可用，图表真正具备分析深度。

## 现状（先读这些文件，勿改无关系文件）

- `src/main/db/migrations/006_bills.sql`：bill_txns 只有 fingerprint / import_id / ts / category / amount_cents(>=0)，无方向、无交易对方。
- `src/main/bill-import.ts`：parseCsv 只解析「交易时间/交易分类/交易状态/金额/交易订单号」，丢弃「收/支」「交易对方」。
- `src/main/db/repo/bills.ts`：saveBill + readBillOverview（单接口，返回 totalCents/monthly/categories/rows）。
- `src/main/ipc/bills.ts`、`src/shared/bills.ts`、`src/shared/ipc-contract.ts`、`src/preload/index.ts`。
- `src/renderer/src/features/bills/module.tsx` + `bills.css`：当前页面。

## 1. 数据模型（新增迁移，绝不改 006）

新建 `src/main/db/migrations/009_bills_v2.sql`（008 已被并行工作「活动统计」占用为 008_activity.sql，账单迁移改用 009；不要改动 008_activity.sql 及 activity 相关文件）：

```sql
ALTER TABLE bill_txns ADD COLUMN direction TEXT NOT NULL DEFAULT 'expense';
ALTER TABLE bill_txns ADD COLUMN counterparty TEXT NOT NULL DEFAULT '';
```

- direction 取值只允许 `'income'` / `'expense'`，合法性由解析层保证；**不加列级 CHECK**（SQLite 的 ADD COLUMN 不支持带 CHECK 的列，避免重建表引入外键风险），在代码注释里说明这一点。
- 历史已导入数据 direction 默认 'expense'、counterparty 默认 ''（旧版无方向信息，无法回填）。

## 2. 解析器（src/main/bill-import.ts）

- `BillRow`（在 repo/bills.ts 定义）增加 `direction: 'income' | 'expense'` 与 `counterparty: string`。
- parseCsv 定位表头时额外解析两列：
  - `收/支`（列名可能为「收/支」或「收支」），取值「收入/支出/其他」；命中「收入」→ 'income'，其余一律 'expense'。**该列不存在时不报错，默认 'expense'**（兼容老版本导出）。
  - `交易对方`：取值原样保留（中文商户名），列不存在时留空串 ''。
- 去重：`saveBill` 里订单号分支不变（`order:订单号`）；空订单号兜底签名的 `signature` 把 direction 纳入（`JSON.stringify([ts, category, amountCents, direction])`），counterparty 不参与去重。
- 其余（GBK/GB18030 探测、表头前置说明行、金额去 `¥,元` 与千分位、relax_column_count、越界补空）保持不变，不要动。

## 3. 后端聚合与类型（src/shared/bills.ts + src/main/db/repo/bills.ts）

先重写 `src/shared/bills.ts` 类型（单一来源）：

```ts
export type BillRange = 'all' | '3m' | '6m' | '12m' | 'thisYear' | 'lastYear'
export type BillDirection = 'income' | 'expense'

export interface BillSummary {
  totalExpenseCents: number
  totalIncomeCents: number
  balanceCents: number            // income - expense
  txnCount: number
  expenseCount: number            // 支出笔数
  avgExpenseCents: number         // 笔均支出，expenseCount 为 0 时取 0
  maxExpenseCents: number         // 最大单笔支出
  thisMonthExpenseCents: number   // 北京时区自然月
  lastMonthExpenseCents: number
}

export interface BillMonthlyPoint { label: string; expenseCents: number; incomeCents: number }

export interface BillCategoryStat { label: string; amountCents: number; count: number }

export interface BillTxnRow {
  timestamp: number; category: string; direction: BillDirection
  counterparty: string; amountCents: number
}

export interface BillOverview {
  summary: BillSummary
  monthly: BillMonthlyPoint[]
  categories: BillCategoryStat[]     // 仅支出，按金额降序
  counterparties: BillAmount[]       // 仅支出、counterparty 非空，Top10，按金额降序
  rowCount: number                   // 按 range 过滤后的总笔数
  rows: BillTxnRow[]                 // 明细分页，每页 50
}

export interface BillsAPI {
  account(): Promise<BillAccount | null>
  saveAccount(input: { email: string; authorizationCode: string }): Promise<BillAccount>
  importFile(password: string): Promise<BillImportResult | null>
  fetchFromMail(input: { password: string; sinceDays: number }): Promise<BillImportResult>
  overview(input: { range: BillRange; page: number }): Promise<BillOverview>
}
```

`BillAmount` 保留不变。`BillImportResult`、`BillAccount` 不变。

`src/main/db/repo/bills.ts`：

- `readBillOverview(range, page)`：先由 range 算出 `minTs`（Unix 毫秒下界）与「本月/上月」的北京时区边界：
  - all → minTs 无；3m/6m/12m → 当前时刻往前推 3/6/12 个自然月（用 Date 减月份，注意月末边界用 setMonth 后 min 处理，或直接用毫秒近似 `Date.now() - N*30*86400000`，注明是近似）；thisYear → 今年 1 月 1 日 00:00 北京时间；lastYear → 去年 1 月 1 日至今年 1 月 1 日（闭开区间，用两个边界）。
  - 所有聚合与分页均带 `WHERE ts >= ?`（thisYear/lastYear 用区间，lastYear 用 `ts >= 去年1月1日 AND ts < 今年1月1日`），SQL 一律在仓库层完成，禁止把全量明细拉到前端算。
- 聚合 SQL（示意，参数按 range 补）：
  - summary：一次 `SELECT` 用 `SUM(CASE WHEN direction='expense' THEN amount_cents ELSE 0 END)` 等聚合出总支出/总收入/笔数/支出笔数/最大单笔；本月与上月支出用两个带北京时区月边界的子查询。
  - monthly：`strftime('%Y-%m', ts/1000,'unixepoch','+8 hours')` 分组，`SUM(CASE WHEN direction=...)` 得到双系列。
  - categories：`WHERE direction='expense'` 按 category 分组，含 `COUNT(*)`。
  - counterparties：`WHERE direction='expense' AND counterparty<>''` 按 counterparty 分组，`ORDER BY amount DESC LIMIT 10`。
  - rows：分页 `LIMIT 50 OFFSET ?`，返回 timestamp/category/direction/counterparty/amount_cents，`ORDER BY ts DESC, fingerprint`。
- `saveBill` 的 `BillRow` 增加 direction、counterparty 写入 INSERT 语句（INSERT 列数从 5 变 7：fingerprint, import_id, ts, category, amount_cents, direction, counterparty）。

## 4. IPC 契约

- `src/shared/ipc-contract.ts`：`'bills:overview'` 改为 `{ args: [input: { range: BillRange; page: number }]; result: BillOverview }`，并在顶部导入 `BillRange`、`BillOverview`（已有 import 来自 `./bills`）。
- `src/main/ipc/bills.ts`：`billOverview` handler 的 zod 校验改为 `z.tuple([z.object({ range: z.enum(['all','3m','6m','12m','thisYear','lastYear']), page: z.number().int().min(0).max(100000) })])`，调用 `readBillOverview(input.range, input.page)`。
- `src/preload/index.ts`：`overview: input => ipcRenderer.invoke(channels.billOverview, input)`。

## 5. 前端（src/renderer/src/features/bills/module.tsx 重写 + bills.css）

保留原有：头部标题与「从邮箱获取 / 导入文件」按钮、连接 QQ 邮箱、两个导入 Dialog、导入结果提示、错误处理逻辑。只重写数据展示部分。

新页面自上而下（组件与交互）：

1. **总览 KPI 卡片行**：4 张卡片，responsive grid（`repeat(auto-fit, minmax(200px, 1fr))`）。内容：本月支出（大字 + 环比 `↑/↓ x%`，环比 = (本月-上月)/上月，上月为 0 时不显示）、本月收入、结余（收入−支出，负数红色 --danger）、累计支出与笔数。金额用 tabular-nums。
2. **时间范围分段控件**：`全部 / 近3月 / 近6月 / 近12月 / 今年 / 去年` 六个按钮，选中态 --accent-soft 底 + --accent 字，点击切换 range 并重拉 overview（page 归 0）。
3. **月度收支趋势**：Recharts `ComposedChart`，支出用 `Bar`（fill --accent）、收入用 `Line`（stroke --success），XAxis 月份、YAxis 元，tooltip 走 token。数据不足 2 个月时给一行「数据不足，导入更多账单后可见趋势」提示。
4. **分类分析（两栏）**：左栏 `PieChart` 环形图（innerRadius 做环形），取金额前 6 名 + 其余合并为「其他」，中心放总支出金额；右侧图例（色块 + 分类名 + 金额 + 占比）。右栏横向 `BarChart`（layout vertical）显示 Top10 分类排行（金额 + 占比，条长按金额）。分类色板固定常量：
   `['#4F46E5','#7C3AED','#0891B2','#059669','#D97706','#DC2626','#64748B','#DB2777']`，「其他」用 `#A8A29E`。
5. **交易对方排行**：横向 `BarChart` Top10，标题「交易对方排行」，副标题「钱花在哪家」。
6. **交易明细表**：列改为 时间（北京时间）/ 收/支 / 交易分类 / 交易对方 / 金额。收/支列用标签：支出 = 默认文字色「支出」，收入 = `--success` 色「收入」；金额带 `−`（支出）`+`（收入）前缀，右对齐 tabular-nums。分页保留（50/页，上一页/下一页 + 页码）。
7. **三态**：加载用现有 `Spinner` 或轻量骨架（不引新库）；空数据用现有 `EmptyState`（icon Wallet）；错误沿用现有 `bills-error` 与 toast。

样式全部走 token（`styles/tokens.css` 的 CSS 变量），不写死颜色；深浅色下都可读。动效 ≤180ms。

## 6. DESIGN 文档同步

更新 `docs/DESIGN.md`：
- 第 5 节迁移归属表补一行 `009_bills_v2.sql`（P3 优化，bill_txns 增加 direction、counterparty）。
- 第 5 节 006 段 Schema 注释说明 008 扩展两列。
- 第 8 节账单段落的口径改为：解析「收/支」方向与「交易对方」；仅「交易成功」进入；图表含收支总览、月度收支趋势、支出分类环形与排行、交易对方排行。
只改账单相关文字，不动其它章节。

## 验证并在报告里贴出

- `pnpm typecheck`（0 error）、`pnpm lint`（0 error）、`pnpm build`（成功）的输出摘要。
- 在 `temp/` 写一个临时验收脚本（**不进 src、不打包**）：构造一段含表头行、至少 3 个月、含「收/支」列（有收入+支出）与「交易对方」列的样例 CSV，调用现有解析+入库链路（直接 import `src/main/bill-import.ts` 的 importBill 或 repo 的 saveBill）写入数据库，验证：新增笔数正确、direction 与 counterparty 正确落库、重复导入去重、`readBillOverview` 各聚合字段数值正确。脚本只用于验收，验收后无需保留（但不要删掉用户已存在的其它 temp 文件）。
- 报告里贴出改动文件清单（按目录分组）、聚合 SQL 的实测结果数字。

## 边界（不要做）

- 不要改 006_bills.sql 或任何已执行迁移。
- 不要碰 mail / dashboard / notes / todos 等其它模块；尤其不要改动 008_activity.sql 及 activity 相关的 repo/ipc/组件（并行工作产物）。
- 不要引入新依赖（recharts、lucide-react 已在）。
- 不要做账单编辑、预算、导出（V1 非目标）。
- 不要在 src/ 里留 TODO / FIXME / console.log / 假数据占位。

完成后按 AGENTS.md「交付时必须报告」四项写报告，不要输出大段代码。
