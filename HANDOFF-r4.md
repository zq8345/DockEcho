# DockEcho 开发交接文档 · 第 4 轮：迁移轮（Switch to DockEcho）

> 来自：DockEcho-总调度 · 2026-07-05
> ⚠️ **先完成手头的第 3.5 轮设计整顿并回报，再开始本轮。** 本文件独立命名 HANDOFF-r4.md 以免冲突；开工时按惯例执行、提交前删除。
> 战略背景：用户拍板"我们是后来者，要方便用户从其他平台迁移过来"。竞品审计（.agents/research/competitor-audit-2026-07-05.md，值得先读第五节）确认了各平台难民潮：Notion 复杂度反噬、Evernote 涨价愤怒、Roam 停滞、Apple Notes 搜索崩溃、Day One 专有孤岛。

## 0. 每轮红线（不变）

无任务管理特性；全部新字符串 t() zh/en 同补；零依赖；vault 写回纪律（绝不改未编辑文件、删除只进 .trash/）；MD 文件是唯一真相。

## 1. 本轮头号红线（新增）：时间戳保真

**所有导入必须尽最大可能保留原始 createdAt/updatedAt**，仅在源数据确实没有时才回退为导入时刻。这决定产品生死：导入的笔记如果全是"今天创建"，回声引擎的"90 天以上旧想法"永远不会触发、"N 年前的今天"永远为空——迁移用户的魔法时刻直接归零。
**先审计第 3 轮的 Kindle/Readwise 导入器**：My Clippings 的 "Added on" 日期和 Readwise CSV 的日期列是否已透传到 createdAt？没有就修。

## 2. 任务 A：统一导入中心（"带上你的旧笔记" 2.0）

1. 导入弹层改为**拖放万物区**：一个 drop zone + 文件选择，**按内容自动识别格式**（不要让用户先选平台）：`.zip`（Notion/Bear/Day One 导出）、`.enex`（Evernote）、`.json`（Roam/Day One/Google Keep Takeout）、`.txt`（Kindle My Clippings）、`.csv`（Readwise）、`.md/.markdown`（散文件）。识别失败时给人话提示+指向迁移指南。
2. **ZIP 支持（保持零依赖）**：用原生 `DecompressionStream('deflate-raw')` 写一个最小 ZIP 读取器（只需支持 stored + deflate 两种压缩方式，~100 行）。不支持的 zip 变体降级提示"请先解压后把 .md 文件拖进来"。
3. 全部本地解析零上传（不变）；每种来源打 `#来源` 标签（#notion #evernote #roam #dayone #keep #bear）；导入完成即触发"第一声回声"（不变，注意用导入后语料里**最老**的相关笔记）。

## 3. 任务 B：新增解析器（按优先级）

1. **Notion 导出**（zip 内 md 文件）：文件名去掉 UUID 后缀（`Page abc123def456.md` → `Page`）；保留子页层级为标签或路径前缀（选简单可靠的做法）；CSV 数据库文件跳过并在结果里如实说明"跳过 N 个数据库文件"；尽力从 md 内的 "Created:" 属性行提取日期。
2. **Evernote ENEX**（XML）：DOMParser 解析；`<created>/<updated>` 属性→时间戳；`<tag>`→#标签；en-note HTML 内容→纯文本/轻 Markdown（段落、列表、链接保留，其余剥离）；附件跳过并如实计数。
3. **Day One JSON**：entries→笔记（标题取首行或日期），**原始日期必须保真**——这是"N 年前的今天"（任务 C）的弹药库，日记迁移者是 On-this-day 需求的原生人群。
4. **Roam JSON**：page→笔记，嵌套 bullets→Markdown 缩进列表；`[[链接]]` 语法原样保留（我们本来就兼容）；edit-time/create-time 保真。
5. **Google Keep Takeout**（json/html）：标题+正文+标签+时间戳。
6. **Bear**：导出即 md（zip），走 zip→md 通道即可，验证一遍。
7. **Apple Notes**：无直接文件格式——不写解析器，写**指南**（任务 D）：iOS 26 的 Markdown 导出 → 拖进来；或桌面端复制粘贴。

每个解析器都要：样例文件测试（自造，存 .agents/samples/，不入库）、格式损坏时的人话报错、导入结果摘要（成功 N 条/跳过 M 项及原因）。

## 4. 任务 C："N 年前的今天"回声维度（审计缺口 #8，用户原话"我的梦想"级需求）

1. 回声候选逻辑增加 on-this-day 通道：存在"恰好 N 年前（±1 天）的今天"创建的笔记时，它获得高优先权成为当日回声卡，"为什么回来"用专属文案："**{n} 年前的今天，你写下了这条。**"（zh/en 模板进 i18n）。
2. 与相关性通道的关系：on-this-day 优先但仍受"宁缺毋滥"约束——内容空洞（<40 字符）的不选；同一天两个通道都有货时选 on-this-day（情感钩子更强）。
3. 每天仍然最多一张卡（不变）。

## 5. 任务 D：迁移指南区（落地页，SEO+转化双职能）

落地页新增 "Switch to DockEcho / 搬家到 DockEcho" 区块（或独立锚点 section）：
1. 六个来源卡片：Notion / Evernote / Apple Notes / Roam / Day One / Obsidian，每个 3 步说明（去哪导出→选什么格式→拖进 DockEcho）。Obsidian 的卡片特殊：**"不用搬家——直接挂载你的库，文件一个字节都不动。"**（这是王牌，放第一）
2. 文案要点：时间戳保留（"你 2019 年写的笔记，导入后依然是 2019 年的——回声和'N 年前的今天'立即生效"）、全程本地解析零上传、随时可再导出走人。
3. SEO：每个来源卡带关键词自然语句（notion export markdown / leave evernote / apple notes export 等）；section 加进 sitemap 锚点；zh/en。
4. ADHD 场景点名（审计行动项顺带完成）：FAQ 加一条 "Is DockEcho ADHD-friendly? / DockEcho 对 ADHD 友好吗？"——答案强调零维护、系统替你记得、看不见≠不存在的针对性设计。措辞共情、不做医疗声明。

## 6. 自测清单（全过才 push）

- [ ] 六种格式样例各导一遍：条数正确、**createdAt 是原始日期**（抽查最老一条）、来源标签正确、摘要如实
- [ ] Kindle/Readwise 旧导入器时间戳回归检查（第 1 节审计结论落实）
- [ ] 破损文件各测一个：报错是人话、不崩溃、不留半截数据
- [ ] ZIP 最小读取器：Notion 真实导出结构的模拟 zip 通过；不支持变体时降级提示正确
- [ ] 导入 Day One 样例（含 2-3 年前日期）后，"N 年前的今天"回声卡按预期出现、文案正确
- [ ] on-this-day 与相关性通道的优先级、宁缺毋滥约束、每日一张上限均正确
- [ ] 落地页 Switch 区 + ADHD FAQ：zh/en 完整、Obsidian 卡在首位、sitemap 更新
- [ ] 全功能回归（挂载/写回/.trash/回声/导出/统计）无回退；Console 零报错
- [ ] zh/en × 亮/暗四组合过一遍新增界面

## 7. 提交

信息：`Add migration center: Notion/Evernote/Roam/Day One/Keep importers, on-this-day echoes, switch guide`（含 Co-Authored-By 行）。push 后线上自查并回报总调度验收（重点报：每种格式的样例测试结果和时间戳保真证据）。
