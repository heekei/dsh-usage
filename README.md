# dsh-usage

DSH 供应商用量查询插件. 后端查询各供应商的套餐/余额用量, 前端在输入框上方渲染用量徽标条.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 功能
- **自动推断**: 按供应商 base URL 自动识别 Kimi / 智谱 / DeepSeek / 火山方舟, 新增同类供应商**零配置**即有用量查询
  (pi-ai 内置路由 kimi-coding / deepseek 按路由 id 识别)
- 自定义查询: 每个供应商可在 设置→用量查询 配置 请求地址/方法/请求头/请求体/extractor, 支持 access token 与 access key/secret
- 火山方舟: 需在 设置→用量查询 配置控制面 AccessKeyId / SecretAccessKey (签名 V4)
- 数据接口: `GET /api/dsh-usage.json` (与 DSH 同源, 无需独立端口); 每 5 分钟刷新 (`DSH_USAGE_INTERVAL_MS`)
- 前端: 会话输入框下方用量读数条 (conversation.composer.dock 槽, 与会话统计同区的低调环境读数) + 设置页"用量查询"分节 (settings.section), 颜色分级: 剩余 ≥50% 绿 / ≥20% 橙 / <20% 红

## 安装

> 适用于 DeepSeek Harness (DSH). 插件通过 `dsh` 元数据与 `exports["./client"]` 注入后端与前端的插槽.

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

## 环境变量
| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DSH_USAGE_INTERVAL_MS` | `300000` (5min) | 用量刷新间隔 |
| `DSH_HOME` | `~/.dsh` | DSH 配置目录 (settings.yaml / .credentials.yaml) |

## 开发
源码位于 `lib/`:
- `lib/index.js` — 后端: 配置 schema, 内置查询 (Kimi / GLM / DeepSeek / 火山签名 V4), 自定义查询, `/api/dsh-usage.json` 数据接口
- `lib/client.js` — 前端: 输入框下方用量读数条 + 设置页"用量查询"分节

依赖: `@deepseek-ai/schemastery` (MIT), `@deepseek-ai/cosmokit` (MIT, 传递) — 均为 MIT 许可, 可自由再分发.

## License
[MIT](LICENSE)
