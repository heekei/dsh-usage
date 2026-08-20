# dsh-usage

DSH 供应商用量查询插件. 后端查询各供应商的套餐/余额用量, 前端在输入框上方渲染用量徽标条.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)


**dsh-usage** 是 DeepSeek Harness (DSH) 的供应商用量查询插件。它实时查询各 LLM 供应商的
套餐/余额用量, 并在会话输入框下方显示一条低调的用量读数条, 让你**一眼看清当前还能用多少**。

- 🔌 **零配置自动识别**: 按 vendor base URL 自动识别 Kimi / 智谱 / DeepSeek / 火山方舟, 新增同类供应商无需任何配置;
- ⚙️ **自定义查询**: 支持中转站/自建服务, 可配置 url / method / headers / body / extractor, 兼容 access token 与 access key/secret;
- 🎨 **会话区环境读数**: 颜色分级 (剩余 ≥50% 绿 / ≥20% 橙 / <20% 红), 输入框下方与会话统计同区显示;
- 📊 **设置页配置**: ⚙️ 设置 → “用量查询” 分节逐供应商配置, 保存即热加载生效.

## 快速开始

安装仅需一条命令 (见下方详细安装):

```bash
dsh plugin --profile web add github:heekei/dsh-usage
```

重启 DSH Web 后, 打开任意会话即可看到输入框下方的用量读数条.

## 功能
- **自动推断**: 按供应商 base URL 自动识别 Kimi / 智谱 / DeepSeek / 火山方舟, 新增同类供应商**零配置**即有用量查询
  (pi-ai 内置路由 kimi-coding / deepseek 按路由 id 识别)
- 自定义查询: 每个供应商可在 设置→用量查询 配置 请求地址/方法/请求头/请求体/extractor, 支持 access token 与 access key/secret
- 火山方舟: 需在 设置→用量查询 配置控制面 AccessKeyId / SecretAccessKey (签名 V4)
- 数据接口: `GET /api/dsh-usage.json` (与 DSH 同源, 无需独立端口); 用量自动刷新, **间隔可在设置页配置** (默认 5 分钟)
- 前端: 会话输入框下方用量读数条 (conversation.composer.dock 槽, 与会话统计同区的低调环境读数) + 设置页"用量查询"分节 (settings.section), 颜色分级: 剩余 ≥50% 绿 / ≥20% 橙 / <20% 红

## 安装（一行命令）

> 适用于 DeepSeek Harness (DSH). 插件是标准 **bundle 型插件**: 声明 `dsh.bundle.patch`,
> 由 `dsh plugin` 安装进 profile 后自动启用, **无需手动配置** `cordis.patch.yml`.

```bash
dsh plugin --profile web add github:heekei/dsh-usage
```

或使用 git 地址:
```bash
dsh plugin --profile web add git+https://github.com/heekei/dsh-usage.git
```

安装完成后重启 DSH Web 生效.

> 说明: `dsh plugin` 会把剩余参数转发给 profile 目录下的 pnpm 安装依赖, 并在安装后
> 根据包的 `dsh.bundle.patch` 自动把 `dsh-usage` 加入 profile 层列表 (行为与 `dsh-git-sync` 一致).

### 手动安装 (备用)
适用于不想用 `dsh plugin` 命令的场景:

1. 克隆/放置本仓库到 DSH 插件目录:
   ```
   plugins/dsh-usage   # 本仓库
   ```
2. `profiles/node_modules/dsh-usage` → junction 指向 `plugins/dsh-usage`:
   ```powershell
   New-Item -ItemType Junction -Path profiles/node_modules/dsh-usage -Target plugins/dsh-usage
   ```
3. 在 `profiles/web/cordis.patch.yml` 注册插件:
   ```yaml
   - insert:
       - id: dsh-usage
         name: 'dsh-usage'
   ```
4. 重启 DSH Web 生效.

## 用量查询配置

### 设置界面 (推荐)
⚙️ 设置 → **用量查询** 分节: 每个 llm-pi-ai 供应商一张卡片, 可配置 启用/类型/展示名/凭据引用/自定义API/AK·SK, 保存即生效.

### 设置文件 (`settings.yaml` 的 `dsh-usage:` 命名空间)

配置跟随供应商路由 (与 llm-pi-ai.providers 同名), schema 校验 + 热加载, 改完即生效 (无需重启):
- **不配置**: 能按 base URL 自动推断出类型的供应商自动启用内置查询 (新增同类供应商无需任何配置)
- **显式配置**时覆盖自动推断

```yaml
dsh-usage:
  providers:
    # 内置类型: 只改展示名/凭据引用
    kimi-coding:
      enabled: true
      type: kimi            # kimi | zhipu | deepseek | volcengine | custom | none
      base: Kimi For Coding # 徽标展示名 (缺省用 llm-pi-ai 的 displayName)
      apiKeyEnv: KIMI_API_KEY  # 凭据引用覆盖 (缺省用路由自己的 apiKeyEnv)

    # 火山方舟: 控制面 AK/SK (密钥, 只在配置处填写)
    ark-coding-mine:
      type: volcengine
      accessKeyId: AKLT...
      secretAccessKey: ...

    # 自定义 API: 中转站/自建服务/特殊格式
    my-gateway:
      enabled: true
      type: custom
      base: 我的网关
      apiKeyEnv: MY_GW_KEY        # 访问 token (凭据文件 .credentials.yaml)
      url: https://gw.example.com/api/usage   # 支持 {{apiKey}} {{baseUrl}} {{accessKeyId}} {{secretAccessKey}}
      method: GET                 # GET | POST
      headers:
        authorization: Bearer {{apiKey}}
        x-custom: v1
      body: '{"ak":"{{accessKeyId}}","sk":"{{secretAccessKey}}"}'  # POST 时用, JSON 模板
      extractor: >-
        (r) => ({ usage: "余额 " + r.data.balance, usageColor: r.data.balance > 10 ? "ok" : "bad" })
      # extractor: 接收响应 JSON, 返回 { usage: string, usageColor?: "ok"|"warn"|"bad" }

    # 关闭某供应商的用量查询
    glm-zk:
      enabled: false
    # 或 type: none
```

- 凭据统一放 `~/.dsh/.credentials.yaml` (如 `MY_GW_KEY: sk-xxx`), 配置里只写引用.
- `accessKeyId` / `secretAccessKey` 为 secret 字段 (跨 wire 传输时被脱敏).
- extractor 是本地 JS 表达式 (new Function), 仅你自己的配置可写, 与 cc-switch 自定义脚本同级信任.
- 无 `dsh-usage` 分节时, 使用内置默认规格 (Kimi×2 / DeepSeek / GLM / 方舟×2).

## 用量刷新间隔

刷新间隔 (秒, 默认 300 = 5 分钟) 可在 **设置 → 用量查询 → 用量刷新间隔** 里配置, 保存即热加载生效, 无需重启。

也支持写入配置文件 `settings.yaml` 的 `dsh-usage.interval` (秒), 或用环境变量 `DSH_USAGE_INTERVAL_MS` (毫秒) 兜底。优先级: 设置页/配置文件 > 环境变量 > 默认 300s。

## 环境变量
| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DSH_HOME` | `~/.dsh` | DSH 配置目录 (settings.yaml / .credentials.yaml) |
| `DSH_USAGE_INTERVAL_MS` | (已由设置页替代) | 兜底: 用量刷新间隔 (毫秒) |

## 开发
源码位于 `lib/`:
- `lib/index.js` — 后端: 配置 schema, 内置查询 (Kimi / GLM / DeepSeek / 火山签名 V4), 自定义查询, `/api/dsh-usage.json` 数据接口
- `lib/client.js` — 前端: 输入框下方用量读数条 + 设置页"用量查询"分节

依赖: `@deepseek-ai/schemastery` (MIT), `@deepseek-ai/cosmokit` (MIT, 传递) — 均为 MIT 许可, 可自由再分发.

## License
[MIT](LICENSE)