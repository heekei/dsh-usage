window.__ModuleLoader__.load({
	id: "@local/dsh-usage",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		const NS = "zh";

		//#region shared: RPC + 样式
		async function rpc(method, payload) {
			const rpcId = crypto.randomUUID();
			const res = await fetch("/api/" + method, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ type: "client-request", rpcId, method, payload })
			});
			return (await res.json()).result;
		}
		const FIELD = { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 };
		const LABEL = { fontSize: 11, color: "var(--dsw-alias-label-secondary, #666)" };
		const INPUT = { width: "100%", boxSizing: "border-box", padding: "4px 8px", fontSize: 12, borderRadius: 6, border: "1px solid var(--dsw-alias-border-l2, #ccc)", background: "var(--dsw-alias-bg-layer-1, #fff)", color: "var(--dsw-alias-label-primary, #111)" };
		const TEXTAREA = Object.assign({}, INPUT, { minHeight: 52, fontFamily: "ui-monospace, monospace", resize: "vertical" });
		const SELECT = Object.assign({}, INPUT, { width: "auto" });
		const BUTTON = { padding: "4px 12px", fontSize: 12, borderRadius: 6, border: "1px solid var(--dsw-alias-border-l2, #ccc)", background: "var(--dsw-alias-bg-layer-1, #fff)", color: "var(--dsw-alias-label-primary, #111)", cursor: "pointer" };
		const CARD = { border: "1px solid var(--dsw-alias-border-l2, #ddd)", borderRadius: 8, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 };
		//#endregion

		//#region 输入框下方用量读数条 (conversation.composer.dock, 与会话统计同区)
		const cache = { data: null, at: 0, inflight: null };
		function fetchUsage() {
			const now = Date.now();
			if (cache.data !== null && now - cache.at < 60000) return Promise.resolve(cache.data);
			if (cache.inflight) return cache.inflight;
			cache.inflight = fetch("/api/dsh-usage.json", { cache: "no-store" })
				.then((r) => r.json())
				.then((j) => { cache.data = j; cache.at = Date.now(); return j; })
				.catch(() => cache.data)
				.finally(() => { cache.inflight = null; });
			return cache.inflight;
		}
		const COLORS = {
			ok: { background: "#E6F4EA", color: "#188038", border: "1px solid #34A85333" },
			warn: { background: "#FEF7E0", color: "#B06000", border: "1px solid #F9AB0033" },
			bad: { background: "#FCE8E6", color: "#C5221F", border: "1px solid #EA433533" }
		};
		// 徽标条主题色: 走 DSH 设计令牌, 自动跟随亮/暗主题
		const HEALTH_COLORS = {
			ok: "var(--dsw-alias-state-success-primary)",
			warn: "var(--dsw-alias-state-warn-primary)",
			bad: "var(--dsw-alias-state-error-primary)"
		};
		// 用量窗口顺序: 5小时 / 周 / 月 (与后端 TIER_KEYS 一致)
		const TIER_ORDER = [
			["fiveHour", "5h"], ["session", "5h"], ["weekly", "周"], ["monthly", "月"]
		];
		const healthOf = (pct) => (pct >= 50 ? "ok" : pct >= 20 ? "warn" : "bad");
		// 胶囊边框按健康度着色: 告急(红)最醒目, 预警(橙)次之, 正常保持中性淡边
		const pillBorder = (h) => h === "bad"
			? "1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, var(--dsw-alias-border-l2))"
			: h === "warn"
				? "1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, var(--dsw-alias-border-l2))"
				: "1px solid var(--dsw-alias-border-l2)";
		const pillBg = (h) => h === "bad" ? "color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)" : "transparent";
		// 从 detail 中取出有序的数值窗口 (无窗口 -> 空数组, 走余额/文案分支)
		function tierWindows(v) {
			const d = v.detail || {};
			const out = [];
			for (const [key, label] of TIER_ORDER) {
				const val = d[key];
				if (typeof val === "number" && Number.isFinite(val)) out.push({ key, label, value: val });
			}
			return out;
		}
		// 文本式读数: 每个窗口以「5h剩53%」直出, 数字按该窗口健康度着色,
		// 哪个窗口紧一眼可见, 比进度条直观. 位于输入框下方 (composer.dock),
		// 与官方会话统计行同区的低调环境读数.
		function UsageStrip() {
			const [data, setData] = react.useState(null);
			react.useEffect(() => {
				let alive = true;
				const tick = () => fetchUsage().then((j) => { if (alive) setData(j); });
				tick();
				const t = setInterval(tick, 60000);
				return () => { alive = false; clearInterval(t); };
			}, []);
			if (!data || !data.providers) return null;
			const entries = Object.entries(data.providers).filter(([, v]) => v && v.ok && v.usage);
			if (entries.length === 0) return null;
			const items = entries.map(([route, v]) => {
				const windows = tierWindows(v);
				const updated = new Date(v.at).toLocaleTimeString();
				if (windows.length > 0) {
					const tip = v.base + " · " + windows.map((w) => w.label + "剩" + w.value + "%").join(" · ") + " · 更新于 " + updated;
					const pillHealth = healthOf(Math.min(...windows.map((w) => w.value)));
					return (0, react_jsx_runtime.jsxs)("span", {
						key: route,
						title: tip,
						style: { display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, height: 18, boxSizing: "border-box", whiteSpace: "nowrap", border: pillBorder(pillHealth), background: pillBg(pillHealth), borderRadius: 999, padding: "0 8px" },
						children: [
							(0, react_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "20px", opacity: 0.95, maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis" }, children: v.base }),
							windows.map((w, i) => (0, react_jsx_runtime.jsxs)(react.Fragment, { key: w.key, children: [
								i > 0 && (0, react_jsx_runtime.jsx)("span", { "aria-hidden": true, style: { color: "var(--dsw-alias-label-tertiary)", opacity: 0.6, marginRight: 6 }, children: "·" }),
								(0, react_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-label-secondary)", opacity: 0.9 }, children: w.label + "剩" }),
								(0, react_jsx_runtime.jsx)("span", { style: { color: HEALTH_COLORS[healthOf(w.value)], fontVariantNumeric: "tabular-nums", fontWeight: 500 }, children: w.value + "%" })
							] }))
						]
					});
				}
				// 非窗口型 (如 DeepSeek 余额): 名称 + 文案
				return (0, react_jsx_runtime.jsxs)("span", {
					key: route,
					title: v.base + " · " + v.usage + " · 更新于 " + updated,
					style: { display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0, height: 18, boxSizing: "border-box", whiteSpace: "nowrap", border: pillBorder(v.usageColor || "ok"), background: pillBg(v.usageColor || "ok"), borderRadius: 999, padding: "0 8px" },
					children: [
						(0, react_jsx_runtime.jsx)("span", { style: { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: "20px", opacity: 0.95, maxWidth: 96, overflow: "hidden", textOverflow: "ellipsis" }, children: v.base }),
						(0, react_jsx_runtime.jsx)("span", { style: { color: HEALTH_COLORS[v.usageColor] || HEALTH_COLORS.ok, fontSize: 11, lineHeight: 1, fontVariantNumeric: "tabular-nums", fontWeight: 500 }, children: v.usage })
					]
				});
			});
			return (0, react_jsx_runtime.jsx)("div", {
				style: {
					textAlign: "center",
					maxWidth: "var(--dsh-chat-content-width, 748px)",
					boxSizing: "border-box",
					width: "100%",
					padding: "4px calc(var(--dsh-composer-side-clearance, 16px) + 16px) 0",
					color: "var(--dsw-alias-label-tertiary)",
					margin: "0 auto",
					display: "flex", flexWrap: "wrap", gap: "6px 8px", justifyContent: "center", alignItems: "center",
					fontSize: 12, lineHeight: "20px", opacity: 0.92
				},
				"aria-label": "供应商用量",
				children: items
			});
		}
		//#endregion

		//#region 设置页: 用量查询配置分节 (settings.section)
		// 按 base URL / 路由 id 自动推断用量查询类型 (与后端 detectType 同规则)
		function detectType(baseURL, routeId) {
			const url = String(baseURL || "").toLowerCase();
			if (url) {
				if (url.includes("api.kimi.com/coding")) return "kimi";
				if (url.includes("bigmodel.cn")) return "zhipu";
				if (url.includes("api.deepseek.com")) return "deepseek";
				if (url.includes("volces.com/api/plan") || url.includes("volces.com/api/coding")) return "volcengine";
			}
			if (routeId === "kimi-coding") return "kimi";
			if (routeId === "deepseek") return "deepseek";
			return "";
		}
		const TYPES = ["", "kimi", "zhipu", "deepseek", "volcengine", "custom", "none"];
		const TYPE_LABEL = { "": "内置默认", kimi: "Kimi", zhipu: "智谱 GLM", deepseek: "DeepSeek", volcengine: "火山方舟", custom: "自定义 API", none: "关闭(不查询)" };

		function UsageConfigSection() {
			const [view, setView] = react.useState({ status: "loading", error: null, routes: [], config: {}, interval: null, secrets: [], revision: null, saving: false, feedback: null });
			const [draft, setDraft] = react.useState({});
			const [intervalDraft, setIntervalDraft] = react.useState("");
			const load = react.useCallback(() => {
				setView((v) => ({ ...v, status: "loading", error: null }));
				rpc("settings.describe", {}).then((r) => {
					if (!r.ok) { setView((v) => ({ ...v, status: "error", error: "读取设置失败: " + (r.error?.message || "") })); return; }
					const byNs = {};
					for (const n of r.value.namespaces) byNs[n.ns] = n;
					const pi = byNs["llm-pi-ai"];
					const usage = byNs["dsh-usage"];
					const piProviders = pi ? (pi.value.providers || {}) : {};
					const routes = Object.keys(piProviders);
					const config = (usage && usage.value && usage.value.providers) ? usage.value.providers : {};
					const interval = (usage && usage.value && typeof usage.value.interval === "number") ? usage.value.interval : null;
					const secrets = (usage && usage.secrets) ? usage.secrets : [];
					// route -> baseURL (推断用)
					const baseURLs = {};
					for (const r of routes) baseURLs[r] = piProviders[r] && piProviders[r].baseURL;
					setDraft({});
					setIntervalDraft(interval ? String(interval) : "");
					setView({ status: "ready", error: null, routes, config, interval, secrets, baseURLs, revision: usage ? usage.revision : null, saving: false, feedback: null, usageMissing: !usage });
				}).catch((e) => setView((v) => ({ ...v, status: "error", error: "读取失败: " + e.message })));
			}, []);
			react.useEffect(() => { load(); }, [load]);

			const setField = (route, field, value) => setDraft((d) => ({ ...d, [route]: { ...(d[route] || {}), [field]: value } }));
			const autoType = (route) => detectType(view.baseURLs && view.baseURLs[route], route);
			const fieldOf = (route, field) => {
				if (draft[route] && field in draft[route]) return draft[route][field];
				const cfg = view.config[route];
				if (cfg && cfg[field] !== undefined && cfg[field] !== null) return cfg[field];
				if (field === "type") return autoType(route);
				if (field === "enabled") return true;
				return "";
			};
			const dirtyOf = (route, field, value) => {
				if (draft[route] && field in draft[route]) return draft[route][field] !== value;
				const cfg = view.config[route];
				const cur = cfg && cfg[field] !== undefined && cfg[field] !== null ? cfg[field] : undefined;
				if (field === "type") return (cur === undefined ? autoType(route) : cur) !== value;
				if (field === "enabled") return (cur === undefined ? true : cur) !== value;
				return (cur === undefined ? "" : cur) !== value;
			};

			const save = async (route) => {
				const d = draft[route] || {};
				const ops = [];
				for (const field of ["enabled", "type", "base", "apiKeyEnv", "url", "method", "headers", "body", "extractor", "accessKeyId", "secretAccessKey"]) {
					if (!(field in d)) continue;
					const value = d[field];
					if (value === "" || value === null || value === undefined) {
						// 清空该字段 (含恢复内置: type="")
						if (field === "type" && value === "") ops.push({ op: "unset", path: ["providers", route, "type"] });
						else ops.push({ op: "unset", path: ["providers", route, field] });
					} else {
						ops.push({ op: "set", path: ["providers", route, field], value });
					}
				}
				if (ops.length === 0) return;
				setView((v) => ({ ...v, saving: true, feedback: null }));
				const r = await rpc("settings.mutate", {
					ns: "dsh-usage",
					ops,
					...(view.revision !== null ? { expectedRevision: view.revision } : {})
				});
				setView((v) => ({ ...v, saving: false }));
				if (r.ok) {
					setDraft((prev) => { const n = { ...prev }; delete n[route]; return n; });
					setView((v) => ({ ...v, feedback: "已保存: " + route, revision: r.value ? r.value.revision : v.revision }));
					load();
				} else {
					setView((v) => ({ ...v, feedback: "保存失败: " + (r.error?.message || "未知错误") }));
				}
			};
			const resetRoute = async (route) => {
				setView((v) => ({ ...v, saving: true, feedback: null }));
				const r = await rpc("settings.mutate", {
					ns: "dsh-usage",
					ops: [{ op: "unset", path: ["providers", route] }],
					...(view.revision !== null ? { expectedRevision: view.revision } : {})
				});
				setView((v) => ({ ...v, saving: false }));
				if (r.ok) { setDraft((p) => { const n = { ...p }; delete n[route]; return n; }); load(); }
				else setView((v) => ({ ...v, feedback: "重置失败: " + (r.error?.message || "") }));
			};
			const saveInterval = async () => {
				const raw = (intervalDraft || "").trim();
				const n = raw === "" ? null : Number(raw);
				if (n !== null && (!Number.isFinite(n) || n < 10 || n > 86400)) {
					setView((v) => ({ ...v, feedback: "间隔需在 10 ~ 86400 秒之间 (留空=默认 300)" }));
					return;
				}
				setView((v) => ({ ...v, saving: true, feedback: null }));
				const r = await rpc("settings.mutate", {
					ns: "dsh-usage",
					ops: n === null
						? [{ op: "unset", path: ["interval"] }]
						: [{ op: "set", path: ["interval"], value: Math.round(n) }],
					...(view.revision !== null ? { expectedRevision: view.revision } : {})
				});
				setView((v) => ({ ...v, saving: false }));
				if (r.ok) { setView((v) => ({ ...v, feedback: "刷新间隔已保存: " + (n === null ? "默认 300s" : Math.round(n) + "s"), interval: n, revision: r.value ? r.value.revision : v.revision })); load(); }
				else setView((v) => ({ ...v, feedback: "保存失败: " + (r.error?.message || "未知错误") }));
			};

			if (view.status === "loading") return (0, react_jsx_runtime.jsx)("div", { style: { padding: 12, fontSize: 13 }, children: "加载中…" });
			if (view.status === "error") return (0, react_jsx_runtime.jsx)("div", { style: { padding: 12, fontSize: 13, color: "#C5221F" }, children: view.error });
			if (view.usageMissing) return (0, react_jsx_runtime.jsx)("div", {
				style: { padding: 12, fontSize: 13, display: "flex", flexDirection: "column", gap: 8 },
				children: [
					(0, react_jsx_runtime.jsx)("div", { children: "用量查询插件尚未加载 (dsh-usage 命名空间未注册)。请重启 DSH Web 后重试。" }),
					(0, react_jsx_runtime.jsx)("button", { style: BUTTON, onClick: load, children: "重新加载" })
				]
			});

			const fields = (route) => [
				["enabled", "启用用量查询", "checkbox"],
				["type", "查询类型", "select"],
				["base", "展示名 (徽标/名称)", "text"],
				["apiKeyEnv", "凭据引用 (apiKeyEnv)", "text"],
				["url", "自定义 URL", "text"],
				["method", "方法", "select"],
				["headers", "请求头 (JSON, 支持 {{apiKey}})", "textarea"],
				["body", "请求体 (JSON 模板)", "textarea"],
				["extractor", "Extractor: (response) => ({usage, usageColor?})", "textarea"],
				["accessKeyId", "AccessKeyId (密钥)", "password"],
				["secretAccessKey", "SecretAccessKey (密钥)", "password"]
			];
			const secretSet = (route, field) => view.secrets.includes("providers." + route + "." + field) || view.secrets.includes("providers." + route + "." + field);

			const cards = view.routes.map((route) => {
				const displayName = (view.config[route] && view.config[route].base) || "";
				const cfg = view.config[route] || {};
				const explicitType = cfg.type !== undefined && cfg.type !== null ? cfg.type : "";
				const effectiveType = fieldOf(route, "type");
				const showCustom = effectiveType === "custom" || (draft[route] && draft[route].type === "custom");
				const rows = [];
				for (const [field, label, kind] of fields(route)) {
					if ((field === "url" || field === "method" || field === "headers" || field === "body" || field === "extractor") && !showCustom) continue;
					let input;
					if (kind === "checkbox") {
						input = (0, react_jsx_runtime.jsx)("input", { type: "checkbox", checked: !!fieldOf(route, field), onChange: (e) => setField(route, field, e.target.checked), style: { width: 16, height: 16 } });
					} else if (kind === "select") {
						input = (0, react_jsx_runtime.jsx)("select", { value: fieldOf(route, field) || "", onChange: (e) => setField(route, field, e.target.value), style: SELECT, children: TYPES.map((t) => (0, react_jsx_runtime.jsx)("option", { value: t, children: TYPE_LABEL[t] }, t)) });
					} else if (kind === "textarea") {
						input = (0, react_jsx_runtime.jsx)("textarea", { value: fieldOf(route, field) || "", onChange: (e) => setField(route, field, e.target.value), style: TEXTAREA, placeholder: field === "extractor" ? '(r) => ({ usage: "余额 " + r.balance })' : "" });
					} else {
						const secret = kind === "password";
						input = (0, react_jsx_runtime.jsx)("input", { type: secret ? "password" : "text", value: fieldOf(route, field) || "", onChange: (e) => setField(route, field, e.target.value), style: INPUT, placeholder: secret ? (secretSet(route, field) ? "已配置 (留空保持不变)" : "") : "" });
					}
					rows.push((0, react_jsx_runtime.jsxs)("label", { style: FIELD, children: [(0, react_jsx_runtime.jsx)("span", { style: LABEL, children: label }), input] }, field));
				}
				return (0, react_jsx_runtime.jsxs)("div", { style: CARD, children: [
					(0, react_jsx_runtime.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
						(0, react_jsx_runtime.jsx)("strong", { style: { fontSize: 13 }, children: displayName || route }),
						(0, react_jsx_runtime.jsx)("code", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary, #999)" }, children: route }),
						effectiveType && (0, react_jsx_runtime.jsx)("span", { style: Object.assign({ fontSize: 11, padding: "0 6px", borderRadius: 8 }, COLORS[effectiveType === "none" ? "bad" : "ok"]), children: (explicitType ? "" : "自动: ") + (TYPE_LABEL[effectiveType] || effectiveType) })
					] }),
					(0, react_jsx_runtime.jsx)("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }, children: rows }),
					(0, react_jsx_runtime.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
						(0, react_jsx_runtime.jsx)("button", { type: "button", style: Object.assign({}, BUTTON, { background: "var(--dsw-alias-brand-primary, #2563eb)", color: "#fff", borderColor: "transparent" }), disabled: view.saving, onClick: () => save(route), children: "保存" }),
						(0, react_jsx_runtime.jsx)("button", { type: "button", style: BUTTON, disabled: view.saving, onClick: () => resetRoute(route), children: "恢复内置默认" }),
						view.feedback && (0, react_jsx_runtime.jsx)("span", { style: { fontSize: 12 }, children: view.feedback })
					] })
				] }, route);
			});

			return (0, react_jsx_runtime.jsxs)("div", { style: { padding: "4px 0", display: "flex", flexDirection: "column", gap: 4 }, children: [
				(0, react_jsx_runtime.jsx)("div", { style: { fontSize: 12, color: "var(--dsw-alias-label-secondary, #666)", marginBottom: 6 }, children: "配置供应商的用量查询 (Kimi / 智谱 / DeepSeek / 火山方舟内置; 其他供应商可用自定义 API + access token / access secret)。保存后立即生效 (热加载), 无需重启。" }),
				// 全局: 刷新间隔 (秒)
				(0, react_jsx_runtime.jsxs)("div", { style: Object.assign({}, CARD, { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }), children: [
					(0, react_jsx_runtime.jsx)("span", { style: { fontSize: 12, minWidth: 150 }, children: "用量刷新间隔 (秒)" }),
					(0, react_jsx_runtime.jsx)("input", { type: "number", min: 10, max: 86400, value: intervalDraft, onChange: (ev) => setIntervalDraft(ev.target.value), placeholder: String(view.interval || 300), style: Object.assign({}, INPUT, { width: 110 }) }),
					(0, react_jsx_runtime.jsx)("button", { type: "button", style: Object.assign({}, BUTTON, { background: "var(--dsw-alias-brand-primary, #2563eb)", color: "#fff", borderColor: "transparent" }), disabled: view.saving, onClick: saveInterval, children: "保存" }),
					view.feedback && (0, react_jsx_runtime.jsx)("span", { style: { fontSize: 12 }, children: view.feedback })
				] }),
				cards.length > 0 ? cards : (0, react_jsx_runtime.jsx)("div", { style: { fontSize: 13, color: "var(--dsw-alias-label-tertiary, #999)" }, children: "暂无已配置的 llm-pi-ai 供应商。" })
			] });
		}
		//#endregion

		const name = "dsh-usage";
		const inject = ["slots"];
		function apply(ctx) {
			// 输入框下方与「会话统计」同区的 ambient 读数 (conversation.composer.dock)
			ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
				name: "conversation.composer.dock",
				id: "dsh-usage",
				order: 10,
				locale: NS
			}, UsageStrip));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "dsh-usage",
				order: 20,
				label: () => "用量查询",
				locale: NS
			}, UsageConfigSection));
		}
		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
