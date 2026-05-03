---
permalink: web-clipper/twitter
---

# Twitter site adapter

当 Web Clipper 抓取 `https://x.com/<user>/status/<id>` 这类 tweet 状态页时，会自动启用 Twitter site adapter，从 X 的 GraphQL endpoint 拉取作者画像和互动数据，写进 frontmatter。所有字段都以 `twitter:` 前缀命名（与 `meta:`、`schema:` 同款约定）。

数据来源：

- `TweetDetail` GraphQL operation（页面打开时 X 自己也会发一次，我们复用 cookie 重发一次拿全部字段）
- `FollowersYouKnow` GraphQL operation（X 自己只在 hover 头像时才发，我们主动请求拿到互关样本）
- 几个 derived 字段（账号年龄、权重）在拿到原始数据后纯函数计算

只在已登录 X 的浏览器里有效。queryId 每 2-4 周由 X 后端轮换一次，adapter 启动时从当前 main bundle 里实时抠出来，不需要人肉维护。

---

## 字段速查表

### Tweet 本体

| 变量名 | 数据源路径 | 类型 | 含义 |
|---|---|---|---|
| `twitter:tweet_id` | URL `/status/(\d+)` | string | Tweet ID |
| `twitter:tweet_url` | 拼接 | string | 规范化 tweet URL（`https://x.com/<handle>/status/<id>`） |
| `twitter:tweet_text` | `legacy.full_text` | string | Tweet 正文（短推文是全文，X Article 是 abstract） |
| `twitter:tweet_lang` | `legacy.lang` | string | ISO 语言码（如 `en`、`zh`） |
| `twitter:tweet_created_at` | `legacy.created_at` | string | Tweet 发布时间，X 原生格式（`Thu Apr 30 16:16:13 +0000 2026`） |
| `twitter:tweet_likes` | `legacy.favorite_count` | number | 点赞数 |
| `twitter:tweet_retweets` | `legacy.retweet_count` | number | 转推数 |
| `twitter:tweet_replies` | `legacy.reply_count` | number | 回复数 |
| `twitter:tweet_quotes` | `legacy.quote_count` | number | 引用数 |
| `twitter:tweet_bookmarks` | `legacy.bookmark_count` | number | 收藏数（**比 likes 信号更强**——多数人不会公开点赞但会私下收藏，是 "我以后想回来看" 的强意图标记） |
| `twitter:tweet_views` | `views.count` | number | 浏览数 |
| `twitter:tweet_is_article` | `article` 字段是否存在 | boolean | 是否为 X Article（长文）。短推文为 `false` |

### 作者基础信息

| 变量名 | 数据源路径 | 类型 | 含义 |
|---|---|---|---|
| `twitter:author_id` | `core.user_results.result.rest_id` | string | 作者 X 内部 user ID（数字字符串） |
| `twitter:author_handle` | `…result.core.screen_name` | string | @ 用户名（不带 @） |
| `twitter:author_name` | `…result.core.name` | string | 显示名 |
| `twitter:author_bio` | `…result.legacy.description` | string | bio（可能含 t.co 短链） |
| `twitter:author_location` | `…result.location.location` | string | 自填地理位置（无验证） |
| `twitter:author_website` | `…result.legacy.entities.url.urls[0].expanded_url` | string | bio 上挂的网站链接（已展开 t.co） |
| `twitter:author_avatar` | `…result.avatar.image_url` | string | 头像图 URL |
| `twitter:author_banner` | `…result.legacy.profile_banner_url` | string | 背景图 URL |
| `twitter:author_created_at` | `…result.core.created_at` | string | 账号创建时间（X 原生格式） |
| `twitter:author_company` | `…result.affiliates_highlighted_label.label.description` | string | 关联公司徽章名（如 "Sentra"）。**强信号**——必须真实归属于已注册的 X 组织账号才能挂上 |

### 验证 / 身份

| 变量名 | 数据源路径 | 类型 | 含义 |
|---|---|---|---|
| `twitter:author_blue_verified` | `…result.is_blue_verified` | boolean | 蓝标。**2022 年起改为付费购买**，不再是身份验证信号——任何人付月费都能拿 |
| `twitter:author_legacy_verified` | `…result.verification.verified` | boolean | 老蓝标（2022 年前的验证制度遗留）。绝大多数已被重置，目前几乎没人有；如果有，是真信号 |

### 量化指标

| 变量名 | 数据源路径 | 类型 | 含义 |
|---|---|---|---|
| `twitter:followers` | `…result.legacy.followers_count` | number | 粉丝数 |
| `twitter:following` | `…result.legacy.friends_count` | number | 关注数 |
| `twitter:tweets` | `…result.legacy.statuses_count` | number | 历史发推总数（含转推） |
| `twitter:listed` | `…result.legacy.listed_count` | number | **被多少人加进了 list**（被精选/订阅）。X 上最被低估的 trust 信号——刷不出来，只有别人主动归类你才会涨。一般 listed 高的账号都是某个领域的真实参与者 |
| `twitter:media_count` | `…result.legacy.media_count` | number | 历史发过多少张图/视频 |

### 关系视角（依赖当前登录账号）

| 变量名 | 数据源路径 | 类型 | 含义 |
|---|---|---|---|
| `twitter:i_follow` | `…result.relationship_perspectives.following` | boolean | 你是否已关注 ta |
| `twitter:follows_me` | `…result.relationship_perspectives.followed_by` | boolean | ta 是否关注你（**互关 = 高信号**，对方关注你说明你已经过 ta 的 trust filter） |

### 互关网络（FollowersYouKnow API）

| 变量名 | 来源 | 类型 | 含义 |
|---|---|---|---|
| `twitter:mutuals_count` | FYK 返回的 user 条目数（最多请求 50） | number | "你关注的人里也关注 ta 的" 数量。如果作者在你的圈层里有很多互关说明 ta 是被你的网络认可的 |
| `twitter:mutuals_handles` | FYK 全部 user 的 handle | string | 所有互关 handle，逗号分隔 |
| `twitter:mutuals_top` | FYK 前 3 个 handle（按 X 返回顺序） | string | 取前 3 个，逗号分隔。X 的算法默认按"对你最相关"排序 |
| `twitter:mutuals_blue_ratio` | 互关里蓝标占比 | number (0-1) | 衡量你的圈层"水分"。如果互关里大多数是蓝标，说明你的 X 圈以付费蓝标为主；如果多是非蓝标老用户，含金量更高 |

### 派生指标

| 变量名 | 来源 | 类型 | 含义 |
|---|---|---|---|
| `twitter:author_age_years` | `(now - author_created_at) / 1y` | number (1 位小数) | 账号年龄（年） |
| `twitter:author_weight` | 计算见下文 | number (0-100) | 0-100 综合作者权重 |
| `twitter:author_weight_breakdown` | 计算见下文 | JSON 字符串 | 7 个维度的细分得分 |
| `twitter:_status` | adapter 内部 | string | `ok` / `no_ct0_cookie` / `no_TweetDetail_qid` 等。用来排查为什么字段为空 |

---

## `author_weight` 计算公式

设计原则：

- **可解释**：每一项都能说出加这个分的理由
- **抗作弊**：付费可买的信号（蓝标）权重很低；只能由别人决定的信号（listed、mutuals）权重高
- **总分 0-100**，七个维度相加再 clamp

源码：[`src/utils/site-adapters/twitter/weight.ts`](../src/utils/site-adapters/twitter/weight.ts)。下面表格是当前 v1 公式，要改公式直接动这个文件，不需要重新抓数据。

### 七个维度

#### 1. `followers` 维度（0-25 分）

按 `log10(followers_count)` 分档：

| log10(followers) | 粉丝量级 | 得分 |
|---|---|---|
| < 1 | < 10 | 0 |
| 1-2 | 10-99 | 5 |
| 2-3 | 100-999 | 10 |
| 3-4 | 1k-9.9k | 17 |
| 4-5 | 10k-99k | 22 |
| ≥ 5 | ≥ 100k | 25 |

为什么对数：粉丝从 100 涨到 1k 比从 100k 涨到 1M 难得多。线性会让大 V 一家独大。

#### 2. `listed` 维度（0-15 分）

按 `listed_count`（被加进多少 list）分档：

| listed_count | 得分 |
|---|---|
| 0 | 0 |
| 1-9 | 3 |
| 10-49 | 7 |
| 50-199 | 11 |
| 200-999 | 14 |
| ≥ 1000 | 15 |

#### 3. `mutuals` 维度（0-25 分）

`base + bonus`，两者再 clamp 到 [0, 25]。

**Base（按互关数量）**：

| mutuals_count | base |
|---|---|
| 0 | 0 |
| 1-2 | 5 |
| 3-9 | 9 |
| 10-29 | 14 |
| ≥ 30 | 18 |

**Bonus（按互关们的总影响力）**：

```
reach = Σ log10(max(1, mutual_followers_count))      ← 取前 10 个互关
bonus = clamp(reach * 0.7, 0, 7)
```

逻辑：每个互关贡献其粉丝数的 log10。比如 3 个互关粉丝分别为 10k / 50k / 200k，则 `reach = log10(10000) + log10(50000) + log10(200000) ≈ 4 + 4.7 + 5.3 = 14`，乘 0.7 后 = 9.8 → clamp 到 7。

#### 4. `relationship` 维度（0-15 分）

| 关系状态 | 加分 |
|---|---|
| `i_follow = true` | +5 |
| `follows_me = true` | +10 |

互关时两者都加（共 +15）。"对方关注你"权重大于"你关注对方"，因为前者是对方对你的 trust filter，后者只是你的兴趣。

#### 5. `age` 维度（0-10 分）

| 账号年龄 | 得分 |
|---|---|
| < 1 年 | 0 |
| 1-2 年 | 3 |
| 2-5 年 | 6 |
| 5-10 年 | 9 |
| ≥ 10 年 | 10 |

老账号 + 高粉 = 真实账号；新账号 + 高粉 = 大概率买的。

#### 6. `ratio` 维度（0-10 分）

`ratio = followers / max(following, 1)`：

| ratio | 得分 |
|---|---|
| < 0.3 | 0 |
| 0.3-1 | 2 |
| 1-3 | 4 |
| 3-10 | 7 |
| ≥ 10 | 10 |

真有影响力的账号一般 ratio 高（关注少、粉丝多）；机器人 / 互粉群 ratio 接近 1 或反向。

#### 7. `signals` 维度（0-5 分，clamp 后）

| 信号 | 加分 |
|---|---|
| `hasCompanyLabel = true`（有公司徽章） | +3 |
| `isBlueVerified = true`（蓝标） | +1 |
| `defaultProfile = true`（从未设置过 profile） | -3 |

最后 clamp 到 [0, 5]。蓝标只给 +1 是因为它现在纯靠付费；公司徽章给 +3 因为必须挂在已认证的组织账号下；从未设置 profile 是 spam 账号常见特征。

### 总分

```
total = clamp(
  round(followers + listed + mutuals + relationship + age + ratio + signals),
  0, 100
)
```

### 实例：Ashwin Gopinath（@ashwingop）

E2E 探测拿到的真实数据，从作者视角带入：

| 维度 | 输入 | 计算 | 得分 |
|---|---|---|---|
| followers | 3121 | log10 ≈ 3.49 → 第 4 档 | **17** |
| listed | 35 | 落在 10-49 区间 | **7** |
| mutuals | 8（含 itsandrewgao=43806、DeryaTR_=339590、pmarca=2.7M…） | base=9（3-9 档），bonus≈7（reach 太大被 clamp） | **16** |
| relationship | i_follow=true, follows_me=false | +5 | **5** |
| age | ~10.1 年 | ≥ 10 档 | **10** |
| ratio | 3121/795 ≈ 3.92 | 3-10 档 | **7** |
| signals | 蓝标=true（+1），公司徽章=Sentra（+3），default_profile=true（-3） | 1 + 3 - 3 = 1，clamp(1, 0, 5) = 1 | **1** |
| **total** | | | **63 / 100** |

实际打印的 breakdown：
```json
{"followers":17,"listed":7,"mutuals":16,"relationship":5,"age":10,"ratio":7,"signals":1,"total":63}
```

> 关于 default_profile：Ashwin 是真 CEO，但他没换 X 的默认头像背景设置，`default_profile` 字段为 `true`，所以拿到 -3 的扣分。这反映了一个事实——这个信号比较粗暴，把"懒得设 banner"和"刚注册的 spam 账号"混在一起了。如果你觉得不公平，把 `signalsScore` 里的 `-3` 改小或删掉。

---

## 限制 / 注意事项

1. **必须已登录 X**——没有 `ct0` cookie 时整个 adapter 短路，frontmatter 里 `twitter:_status` 会写 `no_ct0_cookie`，其他字段空
2. **互关数量受请求 cap 限制**——我们请求 `count=50`，所以 `mutuals_count` 最大 50。实际互关 100+ 的人这里只会显示 50。如果需要精确数，得分页（未实现）
3. **互关名单依赖你的登录账号**——同一条 tweet 在不同账号视角下 mutuals 完全不同。换账号会得到不同 weight
4. **queryId 会过期**——X 每 2-4 周轮换一次。adapter 自动从 main bundle 抠最新 queryId，正常情况无感。如果某次抓取突然失败，看 `twitter:_status` 是不是 `no_TweetDetail_qid`
5. **Bearer token 是公开常量**——硬编码在源码，X 多年未换。如果哪天换了，所有 GraphQL 调用会一起失效，需要重新提取
6. **数据是抓取时点的快照**——粉丝数、点赞数会随时间变化。frontmatter 里固化的是"clip 那一刻"的值

---

## 在模板里使用

默认的 Twitter 模板（`createTwitterTemplate()` in [`src/managers/template-manager.ts`](../src/managers/template-manager.ts)）只勾了一部分核心字段。要加更多就在 Settings → Templates → Twitter → Properties 里追加：

```
followers: {{twitter:followers}}
mutuals_top: {{twitter:mutuals_top}}
weight: {{twitter:author_weight}}
breakdown: {{twitter:author_weight_breakdown}}
```

记得 type 选 `number` / `checkbox`，frontmatter 才会按对应类型渲染。

---

## 调权重公式

直接改 [`src/utils/site-adapters/twitter/weight.ts`](../src/utils/site-adapters/twitter/weight.ts)。这是纯函数，有 7 个 unit test 在 `weight.test.ts`。改完跑：

```bash
node_modules/.bin/vitest run src/utils/site-adapters/twitter/weight.test.ts
```

调好之后 rebuild，老的 frontmatter 不会自动更新——只影响后续 clip。
