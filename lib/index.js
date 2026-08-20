// dsh-usage — 后端: 供应商用量查询
// - 内置查询: Kimi / Zhipu GLM / DeepSeek / 火山方舟(签名 V4), 与 cc-switch 模板一致
// - 自定义查询: 每个供应商可配置 url/method/headers/body/extractor (支持 {{apiKey}} {{baseUrl}} {{accessKeyId}} {{secretAccessKey}} 模板)
// - 配置: settings.yaml 的 `dsh-usage:` 命名空间 (schema 校验 + 热加载), 见 README.md
// - 数据: GET /api/dsh-usage.json (与 DSH 同源)
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createHash, createHmac } from "node:crypto";
import z from "@deepseek-ai/schemastery";

export const name = "dsh-usage";
export const inject = ["webServer"];
const NS = "dsh-usage";

// ── 配置 schema (settings 命名空间, 设置页/文件校验同源) ──────────────────────
const ProviderUsage = z.object({
  enabled: z.boolean().default(true),
  // kimi | zhipu | deepseek | volcengine | custom | none
  type: z.union([z.const("kimi"), z.const("zhipu"), z.const("deepseek"), z.const("volcengine"), z.const("custom"), z.const("none")]).default("none"),
  base: z.string().default(""),            // 展示名 (缺省用 llm-pi-ai 的 displayName / 路由名)
  apiKeyEnv: z.string().role("credential-ref").default(""), // 凭据引用覆盖
  url: z.string().default(""),             // custom: 请求地址 (支持模板)
  method: z.union([z.const("GET"), z.const("POST")]).default("GET"),
  headers: z.dict(z.string()).default({}), // custom: 请求头 (值支持 {{apiKey}} 模板)
  body: z.string().default(""),            // custom: POST body (JSON 模板)
  extractor: z.string().default(""),       // custom: (response) => ({usage, usageColor?}) JS 表达式
  accessKeyId: z.string().role("secret").default(""),     // volcengine/custom
  secretAccessKey: z.string().role("secret").default(""), // volcengine/custom
});
export const Config = z.object({
  interval: z.natural().min(10).max(86400).default(300), // 用量刷新间隔 (秒), 设置页/文件均可配 (默认 5 分钟)
  providers: z.dict(ProviderUsage).default({}),
}).default({});

// ── 内置供应商规格 (无 dsh-usage 配置时生效) ──────────────────────────────────
// 按 base URL 自动推断用量查询类型 (与 cc-switch detect_provider 同规则);
// 未配置 dsh-usage 且能推断出类型的路由自动启用对应内置查询.
function detectType(baseURL, routeId) {
  const url = String(baseURL || "").toLowerCase();
  if (url) {
    if (url.includes("api.kimi.com/coding")) return "kimi";
    if (url.includes("bigmodel.cn")) return "zhipu";
    if (url.includes("api.deepseek.com")) return "deepseek";
    if (url.includes("volces.com/api/plan") || url.includes("volces.com/api/coding")) return "volcengine";
  }
  // pi-ai 内置 catalog 路由 (无用户 baseURL, 但端点是官方的)
  if (routeId === "kimi-coding") return "kimi";
  if (routeId === "deepseek") return "deepseek";
  return "";
}

const dshHome = () => process.env.DSH_HOME || join(homedir(), ".dsh");
const SETTINGS = () => join(dshHome(), "settings.yaml");
const CREDS = () => join(dshHome(), ".credentials.yaml");
// 用量刷新间隔 (秒): 设置页 config.interval > 环境变量 DSH_USAGE_INTERVAL_MS > 默认 300
function intervalSeconds() {
  const cfg = current?.();
  if (cfg && Number.isFinite(cfg.interval) && cfg.interval > 0) return cfg.interval;
  const env = Number(process.env.DSH_USAGE_INTERVAL_MS);
  if (Number.isFinite(env) && env > 0) return Math.round(env / 1000);
  return 300;
}
const log = (...a) => console.log("[" + new Date().toISOString() + "] [dsh-usage]", ...a);

let state = { updatedAt: null, providers: {} };
let current = null; // settings 命名空间的取值函数 (apply 时注入)

// ── settings.yaml 读取 (llm-pi-ai 路由 + dsh-usage 配置 + 凭据) ────────────────
function readSettingsSection(text, sectionName) {
  const out = {};
  let inSection = false, currentKey = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^( *)(\S.*)$/);
    if (!m) continue;
    const indent = m[1].length, content = m[2];
    if (indent === 0) { inSection = content === sectionName + ":"; currentKey = null; continue; }
    if (!inSection) continue;
    if (indent === 2) {
      const rm = content.match(/^([\w-]+):\s*$/);
      if (rm) { currentKey = rm[1]; out[currentKey] = {}; continue; }
      const kv = content.match(/^([\w-]+):\s*(.*)$/);
      if (kv) { out[kv[1]] = kv[2].replace(/^["']|["']$/g, "").replace(/\s*#.*$/, "").trim(); }
      continue;
    }
    // 深层字段忽略 (dsh-usage 只需 providers 一层由 mutate 管理; 此处用于 current 缺失时的兜底)
  }
  return out;
}
function readSettingsProviders() {
  const text = readFileSync(SETTINGS(), "utf8");
  const providers = {};
  let section = null, currentRoute = null;
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(/^( *)(\S.*)$/);
    if (!m) continue;
    const indent = m[1].length, content = m[2];
    if (indent === 0) { section = content === "llm-pi-ai:" ? "pi" : null; currentRoute = null; continue; }
    if (section !== "pi") continue;
    if (indent === 2) continue;
    if (indent === 4) {
      const rm = content.match(/^([\w-]+):\s*$/);
      if (rm) { currentRoute = rm[1]; providers[currentRoute] = providers[currentRoute] || {}; }
      continue;
    }
    if (indent === 6 && currentRoute) {
      const kv = content.match(/^([\w-]+):\s*(.*)$/);
      if (kv) providers[currentRoute][kv[1]] = kv[2].replace(/^["']|["']$/g, "").replace(/\s*#.*$/, "").trim();
    }
  }
  return providers;
}
function readCredentials() {
  const creds = {};
  if (!existsSync(CREDS())) return creds;
  for (const line of readFileSync(CREDS(), "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*):\s*(.*)$/);
    if (m) creds[m[1]] = m[2].trim();
  }
  return creds;
}

// ── 内置查询 ──────────────────────────────────────────────────────────────────
const num = (v) => (typeof v === "number" ? v : parseFloat(v));
const pct = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null);
// 用量窗口 -> 展示标签; 所有内置/自定义查询都走这一份, 保证前端 detail 与文案一致.
const TIER_KEYS = [["fiveHour", "5h"], ["session", "5h"], ["weekly", "周"], ["monthly", "月"]];
export function usageText(tiers) {
  const parts = [];
  for (const [key, label] of TIER_KEYS) {
    const v = tiers[key];
    if (v !== undefined && v !== null) parts.push(label + "剩" + v + "%");
  }
  return parts.join(" ");
}
export function usageColorOf(tiers) {
  const vals = Object.values(tiers).filter((v) => v !== undefined && v !== null);
  if (vals.length === 0) return "ok";
  const min = Math.min(...vals);
  return min >= 50 ? "ok" : min >= 20 ? "warn" : "bad";
}

async function queryKimi(key) {
  const res = await fetch("https://api.kimi.com/coding/v1/usages", {
    headers: { authorization: "Bearer " + key, accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 200));
  const body = await res.json();
  let fiveHour = null, weekly = null;
  for (const item of body.limits || []) {
    const d = item.detail;
    if (d && num(d.limit) > 0) { const r = num(d.remaining) / num(d.limit) * 100; if (fiveHour === null) fiveHour = pct(r); }
  }
  if (body.usage && num(body.usage.limit) > 0) weekly = pct(num(body.usage.remaining) / num(body.usage.limit) * 100);
  const detail = { fiveHour, weekly };
  return { usage: usageText(detail), usageColor: usageColorOf(detail), detail };
}
async function queryZhipu(key) {
  const res = await fetch("https://open.bigmodel.cn/api/monitor/usage/quota/limit", {
    headers: { authorization: key, "content-type": "application/json", "accept-language": "en-US,en" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 200));
  const body = await res.json();
  const limits = body.data?.limits || [];
  let fiveHour = null, weekly = null;
  for (const item of limits) {
    const type = String(item.type || "").toUpperCase();
    if (type !== "TOKENS_LIMIT" && type !== "CREDIT_LIMIT") continue;
    const used = num(item.percentage);
    const remain = Number.isFinite(used) ? 100 - used : null;
    const unit = item.unit;
    if (unit === 3 && fiveHour === null) fiveHour = pct(remain);
    else if (unit === 6 && weekly === null) weekly = pct(remain);
    else if (fiveHour === null) fiveHour = pct(remain);
    else if (weekly === null) weekly = pct(remain);
  }
  const detail = { fiveHour, weekly };
  return { usage: usageText(detail), usageColor: usageColorOf(detail), detail };
}
async function queryDeepSeek(key) {
  const res = await fetch("https://api.deepseek.com/user/balance", {
    headers: { authorization: "Bearer " + key, accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("HTTP " + res.status + " " + (await res.text()).slice(0, 200));
  const body = await res.json();
  const info = (body.balance_infos || [])[0];
  if (!info) throw new Error("no balance_infos");
  const total = num(info.total_balance);
  const sym = info.currency === "CNY" ? "¥" : info.currency === "USD" ? "$" : info.currency + " ";
  const usage = "余额 " + sym + (Number.isFinite(total) ? total.toFixed(2) : "?") + (body.is_available === false ? " (余额不足)" : "");
  return { usage, usageColor: !body.is_available ? "bad" : total >= 10 ? "ok" : total >= 2 ? "warn" : "bad", detail: { total } };
}

// ── 火山方舟签名 V4 ───────────────────────────────────────────────────────────
const VOLC_HOST = "open.volcengineapi.com";
const VOLC_VERSION = "2024-01-01";
const VOLC_REGION = "cn-beijing";
const VOLC_SERVICE = "ark";
const VOLC_CONTENT_TYPE = "application/json; charset=utf-8";
const VOLC_SIGNED_HEADERS = "host;x-date;x-content-sha256;content-type";
const sha256hex = (b) => createHash("sha256").update(b).digest("hex");
const hmac = (k, d) => createHmac("sha256", k).update(d).digest();
const uriEncode = (str) => encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
function volcSign(ak, sk, canonicalQuery, now) {
  const xDate = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
  const shortDate = xDate.slice(0, 8);
  const xContentSha256 = sha256hex(Buffer.alloc(0));
  const canonicalHeaders = "host:" + VOLC_HOST + "\n" + "x-date:" + xDate + "\n" + "x-content-sha256:" + xContentSha256 + "\n" + "content-type:" + VOLC_CONTENT_TYPE + "\n";
  const canonicalRequest = "POST\n/\n" + canonicalQuery + "\n" + canonicalHeaders + "\n" + VOLC_SIGNED_HEADERS + "\n" + xContentSha256;
  const scope = shortDate + "/" + VOLC_REGION + "/" + VOLC_SERVICE + "/request";
  const stringToSign = "HMAC-SHA256\n" + xDate + "\n" + scope + "\n" + sha256hex(Buffer.from(canonicalRequest));
  const kDate = hmac(Buffer.from(sk), shortDate);
  const kRegion = hmac(kDate, VOLC_REGION);
  const kService = hmac(kRegion, VOLC_SERVICE);
  const kSigning = hmac(kService, "request");
  const signature = hmac(kSigning, stringToSign).toString("hex");
  return { authorization: "HMAC-SHA256 Credential=" + ak + "/" + scope + ", SignedHeaders=" + VOLC_SIGNED_HEADERS + ", Signature=" + signature, xDate, xContentSha256 };
}
function volcCanonicalQuery(action) {
  return [["Action", action], ["Region", VOLC_REGION], ["Version", VOLC_VERSION]]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => uriEncode(k) + "=" + uriEncode(v)).join("&");
}
async function volcCall(ak, sk, action) {
  const cq = volcCanonicalQuery(action);
  const { authorization, xDate, xContentSha256 } = volcSign(ak, sk, cq, new Date());
  const res = await fetch("https://" + VOLC_HOST + "/?" + cq, {
    method: "POST",
    headers: { "x-date": xDate, "x-content-sha256": xContentSha256, "content-type": VOLC_CONTENT_TYPE, authorization },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  const err = body.ResponseMetadata?.Error || body.Error;
  if (err) { const e = new Error("volc " + action + ": " + err.Code + " " + err.Message); e.isAuth = /auth|signature|denied|credential|token/i.test(String(err.Code)); throw e; }
  if (!res.ok) throw new Error("volc " + action + " HTTP " + res.status + " " + text.slice(0, 200));
  return body;
}
async function queryVolcengine(ak, sk) {
  let lastErr = null;
  for (const action of ["GetAFPUsage", "GetCodingPlanUsage"]) {
    try {
      const body = await volcCall(ak, sk, action);
      const result = body.Result || body;
      const arr = result.QuotaUsage || result.Usages || result.Details || [];
      const tiers = {};
      for (const item of Array.isArray(arr) ? arr : []) {
        const label = String(item.Level || item.Type || item.Period || item.Label || item.Window || "").toLowerCase();
        const used = num(item.Percent ?? item.UsedPercent ?? item.UsagePercent);
        let nm = null;
        if (/^session|^5h|fivehour|five_hour|rolling_5h/.test(label)) nm = "session";
        else if (/^weekly|^week|^7d/.test(label)) nm = "weekly";
        else if (/^monthly|^month/.test(label)) nm = "monthly";
        if (nm && Number.isFinite(used) && tiers[nm] === undefined) tiers[nm] = pct(100 - used);
      }
      if (Object.keys(tiers).length > 0) {
        // 5h / 周 / 月 全部进入文案与 detail; 前端据此渲染多档用量条.
        return { usage: usageText(tiers), usageColor: usageColorOf(tiers), detail: tiers, plan: action };
      }
    } catch (e) { lastErr = e; if (e.isAuth) throw e; }
  }
  throw new Error("volcengine: 无可用套餐数据" + (lastErr ? " (" + lastErr.message + ")" : ""));
}

// ── 自定义查询: url/method/headers/body/extractor ─────────────────────────────
function fillTemplate(text, vars) {
  return String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ""));
}
async function queryCustom(spec, entry, key) {
  if (!spec.url) throw new Error("custom 查询需要 url");
  const vars = { apiKey: key || "", baseUrl: entry.baseURL || "", accessKeyId: spec.ak || "", secretAccessKey: spec.sk || "" };
  const headers = { ...Object.fromEntries(Object.entries(spec.headers || {}).map(([k, v]) => [k, fillTemplate(v, vars)])) };
  if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type") && spec.body) headers["content-type"] = "application/json";
  const res = await fetch(fillTemplate(spec.url, vars), {
    method: spec.method || "GET",
    headers,
    ...spec.body ? { body: fillTemplate(spec.body, vars) } : {},
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error("HTTP " + res.status + " " + text.slice(0, 200));
  let json;
  try { json = JSON.parse(text); } catch { throw new Error("响应不是 JSON: " + text.slice(0, 120)); }
  if (!spec.extractor) throw new Error("custom 查询需要 extractor: (response) => ({usage, usageColor?})");
  let out;
  try {
    const fn = new Function("response", "return (" + spec.extractor + ")(response);");
    out = fn(json);
  } catch (e) { throw new Error("extractor 执行失败: " + e.message); }
  if (!out || typeof out.usage !== "string") throw new Error("extractor 需返回 { usage: string }");
  return {
    usage: out.usage,
    usageColor: ["ok", "warn", "bad"].includes(out.usageColor) ? out.usageColor : "ok",
    detail: out.detail || null,
  };
}

// ── 规格合并与刷新 ────────────────────────────────────────────────────────────
// 规格合成: settings 显式配置 > 按 llm-pi-ai baseURL 自动推断.
// providers: llm-pi-ai 路由表 (route -> { baseURL, displayName, apiKeyEnv })
function buildSpecs(config, providers) {
  const configured = config?.providers || {};
  const specs = {};
  // 1) 显式配置的路由
  for (const [route, cfg] of Object.entries(configured)) {
    if (cfg.type === "none") continue;
    if (cfg.enabled === false) continue;
    const entry = (providers && providers[route]) || {};
    const spec = {
      type: cfg.type,
      base: cfg.base || entry.displayName || route,
      apiKeyEnv: cfg.apiKeyEnv || entry.apiKeyEnv || "",
      ak: cfg.accessKeyId || "",
      sk: cfg.secretAccessKey || "",
      url: cfg.url, method: cfg.method, headers: cfg.headers, body: cfg.body, extractor: cfg.extractor,
    };
    specs[route] = spec;
  }
  // 2) 未配置的路由: 按 baseURL 自动推断 (可推断出且非 custom 才启用)
  for (const [route, entry] of Object.entries(providers || {})) {
    if (specs[route]) continue;
    const type = detectType(entry.baseURL, route);
    if (!type) continue;
    specs[route] = { type, base: entry.displayName || route, apiKeyEnv: entry.apiKeyEnv || "", ak: "", sk: "" };
  }
  return specs;
}

export async function refresh(configOverride) {
  let config = configOverride;
  if (config === undefined) {
    if (current) config = current();
    else {
      // 兜底: 直接从 settings.yaml 解析 dsh-usage 分节 (深层: providers.<route>.<field>)
      config = { providers: {} };
      try {
        const text = readFileSync(SETTINGS(), "utf8");
        const lines = text.split(/\r?\n/);
        let inSection = false, route = null;
        for (const raw of lines) {
          const m = raw.match(/^( *)(\S.*)$/);
          if (!m) continue;
          const indent = m[1].length, content = m[2];
          if (indent === 0) { inSection = content === "dsh-usage:"; route = null; continue; }
          if (!inSection) continue;
          if (indent === 2 && content === "providers:") continue;
          if (indent === 4) {
            const rm = content.match(/^([\w-]+):\s*$/);
            if (rm) { route = rm[1]; config.providers[route] = config.providers[route] || {}; continue; }
          }
          if (indent === 6 && route) {
            const kv = content.match(/^([\w-]+):\s*(.*)$/);
            if (kv) config.providers[route][kv[1]] = kv[2].replace(/^["']|["']$/g, "").replace(/\s*#.*$/, "").trim();
          }
        }
      } catch { /* 文件缺失时用空配置 */ }
    }
  }
  const creds = readCredentials();
  const providers = readSettingsProviders();
  const specs = buildSpecs(config, providers);
  const results = {};
  for (const [route, spec] of Object.entries(specs)) {
    const entry = providers[route];
    const prev = state.providers[route];
    const fail = (msg) => {
      log("  " + route + ": 查询失败: " + msg + (prev?.usage ? " (保留上次: " + prev.usage + ")" : ""));
      results[route] = prev || null;
    };
    try {
      if (!entry) throw new Error("settings.yaml 中无此路由");
      let key = null;
      if (spec.type !== "volcengine") {
        const ref = spec.apiKeyEnv || entry.apiKeyEnv;
        if (ref) {
          key = creds[ref];
          if (!key) throw new Error("凭据 " + ref + " 未配置");
        }
      }
      let r;
      if (spec.type === "kimi") r = await queryKimi(key);
      else if (spec.type === "zhipu") r = await queryZhipu(key);
      else if (spec.type === "deepseek") r = await queryDeepSeek(key);
      else if (spec.type === "volcengine") {
        if (!spec.ak || !spec.sk) throw new Error("火山方舟需要在 设置→用量查询 配置 AccessKeyId / SecretAccessKey (控制面密钥, 非推理 Key)");
        r = await queryVolcengine(spec.ak, spec.sk);
      } else if (spec.type === "custom") r = await queryCustom(spec, entry, key);
      else throw new Error("未知类型 " + spec.type);
      const base = spec.base || entry.displayName || route;
      results[route] = { ok: true, base, usage: r.usage, usageColor: r.usageColor, detail: r.detail, at: Date.now() };
      log("  " + route + ": " + base + " " + r.usage);
    } catch (e) { fail(e.message); }
  }
  state = { updatedAt: Date.now(), providers: results };
  return state;
}

export function apply(ctx, config = {}) {
  let timerHandle = null;
  const tick = async () => { try { await refresh(); } catch (e) { log("刷新失败: " + e.message); } };
  // 按当前配置重建轮询定时器; 设置页/文件改 interval 时触发, 无需重启
  const schedule = () => {
    if (timerHandle) clearInterval(timerHandle);
    const secs = intervalSeconds();
    timerHandle = setInterval(tick, secs * 1000);
    log("用量刷新间隔: " + secs + "s");
  };
  // 注册 settings 命名空间 (schema 校验 + 热加载); 不依赖 dsh-settings 包
  ctx.inject(["settings"], (sctx) => {
    const scope = sctx.settings.register(NS, Config, { base: config });
    current = () => scope.get();
    sctx.effect(() => () => { current = null; }, "dsh-usage: settings scope cleanup");
    scope.watch(() => {
      schedule(); // 间隔可能变了: 先重建定时器
      try { refresh(); } catch (e) { log("配置变更刷新失败: " + e.message); }
    });
  });
  ctx.effect(() => ctx.webServer.register({
    kind: "exact",
    path: "/api/dsh-usage.json",
    handler: (req, res) => {
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "no-cache",
      });
      res.end(JSON.stringify(state));
    },
  }), "dsh-usage: json route");
  tick();
  schedule();
  ctx.effect(() => () => { if (timerHandle) clearInterval(timerHandle); }, "dsh-usage: refresh timer");
  log("dsh-usage 插件已启动 (命名空间 dsh-usage, 每 " + intervalSeconds() + "s 刷新)");
}
