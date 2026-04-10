import { useState, useEffect, useCallback } from "react";
import UpdateBadge from "./components/UpdateBadge";

type Provider = "openai" | "anthropic" | "gemini" | "openrouter";

interface ModelEntry {
  id: string;
  label: string;
  provider: Provider;
  desc: string;
  badge?: "thinking" | "thinking-visible" | "tools" | "reasoning";
  context?: string;
}

const OPENAI_MODELS: ModelEntry[] = [
  { id: "gpt-5.2", label: "GPT-5.2", provider: "openai", desc: "最新旗舰多模态模型", context: "128K", badge: "tools" },
  { id: "gpt-5.1", label: "GPT-5.1", provider: "openai", desc: "旗舰多模态模型", context: "128K", badge: "tools" },
  { id: "gpt-5", label: "GPT-5", provider: "openai", desc: "旗舰多模态模型", context: "128K", badge: "tools" },
  { id: "gpt-5-mini", label: "GPT-5 Mini", provider: "openai", desc: "高性价比快速模型", context: "128K", badge: "tools" },
  { id: "gpt-5-nano", label: "GPT-5 Nano", provider: "openai", desc: "超轻量边缘模型", context: "128K", badge: "tools" },
  { id: "gpt-4.1", label: "GPT-4.1", provider: "openai", desc: "稳定通用旗舰模型", context: "1M", badge: "tools" },
  { id: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai", desc: "均衡速度与质量", context: "1M", badge: "tools" },
  { id: "gpt-4.1-nano", label: "GPT-4.1 Nano", provider: "openai", desc: "超高速轻量模型", context: "1M", badge: "tools" },
  { id: "gpt-4o", label: "GPT-4o", provider: "openai", desc: "多模态旗舰", context: "128K", badge: "tools" },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai", desc: "轻量多模态模型", context: "128K", badge: "tools" },
  { id: "o4-mini", label: "o4 Mini", provider: "openai", desc: "推理模型，快速高效", context: "200K", badge: "reasoning" },
  { id: "o4-mini-thinking", label: "o4 Mini (thinking)", provider: "openai", desc: "o4 Mini 思考别名", context: "200K", badge: "thinking" },
  { id: "o3", label: "o3", provider: "openai", desc: "强推理旗舰模型", context: "200K", badge: "reasoning" },
  { id: "o3-thinking", label: "o3 (thinking)", provider: "openai", desc: "o3 思考别名", context: "200K", badge: "thinking" },
  { id: "o3-mini", label: "o3 Mini", provider: "openai", desc: "高效推理模型", context: "200K", badge: "reasoning" },
  { id: "o3-mini-thinking", label: "o3 Mini (thinking)", provider: "openai", desc: "o3 Mini 思考别名", context: "200K", badge: "thinking" },
];

const ANTHROPIC_MODELS: ModelEntry[] = [
  { id: "claude-opus-4-6", label: "Claude Opus 4.6", provider: "anthropic", desc: "顶级推理与智能体任务", context: "200K", badge: "tools" },
  { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (thinking)", provider: "anthropic", desc: "扩展思考（隐藏）", context: "200K", badge: "thinking" },
  { id: "claude-opus-4-6-thinking-visible", label: "Claude Opus 4.6 (thinking visible)", provider: "anthropic", desc: "扩展思考（可见）", context: "200K", badge: "thinking-visible" },
  { id: "claude-opus-4-5", label: "Claude Opus 4.5", provider: "anthropic", desc: "旗舰推理模型", context: "200K", badge: "tools" },
  { id: "claude-opus-4-5-thinking", label: "Claude Opus 4.5 (thinking)", provider: "anthropic", desc: "扩展思考（隐藏）", context: "200K", badge: "thinking" },
  { id: "claude-opus-4-5-thinking-visible", label: "Claude Opus 4.5 (thinking visible)", provider: "anthropic", desc: "扩展思考（可见）", context: "200K", badge: "thinking-visible" },
  { id: "claude-opus-4-1", label: "Claude Opus 4.1", provider: "anthropic", desc: "旗舰模型（稳定版）", context: "200K", badge: "tools" },
  { id: "claude-opus-4-1-thinking", label: "Claude Opus 4.1 (thinking)", provider: "anthropic", desc: "扩展思考（隐藏）", context: "200K", badge: "thinking" },
  { id: "claude-opus-4-1-thinking-visible", label: "Claude Opus 4.1 (thinking visible)", provider: "anthropic", desc: "扩展思考（可见）", context: "200K", badge: "thinking-visible" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic", desc: "速度与智能最佳平衡", context: "200K", badge: "tools" },
  { id: "claude-sonnet-4-6-thinking", label: "Claude Sonnet 4.6 (thinking)", provider: "anthropic", desc: "扩展思考（隐藏）", context: "200K", badge: "thinking" },
  { id: "claude-sonnet-4-6-thinking-visible", label: "Claude Sonnet 4.6 (thinking visible)", provider: "anthropic", desc: "扩展思考（可见）", context: "200K", badge: "thinking-visible" },
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic", desc: "均衡性价比旗舰", context: "200K", badge: "tools" },
  { id: "claude-sonnet-4-5-thinking", label: "Claude Sonnet 4.5 (thinking)", provider: "anthropic", desc: "扩展思考（隐藏）", context: "200K", badge: "thinking" },
  { id: "claude-sonnet-4-5-thinking-visible", label: "Claude Sonnet 4.5 (thinking visible)", provider: "anthropic", desc: "扩展思考（可见）", context: "200K", badge: "thinking-visible" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", provider: "anthropic", desc: "超快速轻量模型", context: "200K", badge: "tools" },
  { id: "claude-haiku-4-5-thinking", label: "Claude Haiku 4.5 (thinking)", provider: "anthropic", desc: "扩展思考（隐藏）", context: "200K", badge: "thinking" },
  { id: "claude-haiku-4-5-thinking-visible", label: "Claude Haiku 4.5 (thinking visible)", provider: "anthropic", desc: "扩展思考（可见）", context: "200K", badge: "thinking-visible" },
];

const GEMINI_MODELS: ModelEntry[] = [
  { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro Preview", provider: "gemini", desc: "最新旗舰多模态模型", context: "2M", badge: "tools" },
  { id: "gemini-3.1-pro-preview-thinking", label: "Gemini 3.1 Pro Preview (thinking)", provider: "gemini", desc: "扩展思考（隐藏）", context: "2M", badge: "thinking" },
  { id: "gemini-3.1-pro-preview-thinking-visible", label: "Gemini 3.1 Pro Preview (thinking visible)", provider: "gemini", desc: "扩展思考（可见）", context: "2M", badge: "thinking-visible" },
  { id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", provider: "gemini", desc: "极速多模态模型", context: "1M", badge: "tools" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini", desc: "推理旗舰，强代码能力", context: "1M", badge: "tools" },
  { id: "gemini-2.5-pro-thinking", label: "Gemini 2.5 Pro (thinking)", provider: "gemini", desc: "扩展思考（隐藏）", context: "1M", badge: "thinking" },
  { id: "gemini-2.5-pro-thinking-visible", label: "Gemini 2.5 Pro (thinking visible)", provider: "gemini", desc: "扩展思考（可见）", context: "1M", badge: "thinking-visible" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini", desc: "速度与质量兼备", context: "1M", badge: "tools" },
  { id: "gemini-2.5-flash-thinking", label: "Gemini 2.5 Flash (thinking)", provider: "gemini", desc: "扩展思考（隐藏）", context: "1M", badge: "thinking" },
  { id: "gemini-2.5-flash-thinking-visible", label: "Gemini 2.5 Flash (thinking visible)", provider: "gemini", desc: "扩展思考（可见）", context: "1M", badge: "thinking-visible" },
];

const OPENROUTER_MODELS: ModelEntry[] = [
  { id: "x-ai/grok-4.20", label: "Grok 4.20", provider: "openrouter", desc: "xAI 最新旗舰推理模型", badge: "tools" },
  { id: "x-ai/grok-4.1-fast", label: "Grok 4.1 Fast", provider: "openrouter", desc: "xAI 高速对话模型", badge: "tools" },
  { id: "x-ai/grok-4-fast", label: "Grok 4 Fast", provider: "openrouter", desc: "xAI 快速模型", badge: "tools" },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "openrouter", desc: "Meta 多模态旗舰" },
  { id: "meta-llama/llama-4-scout", label: "Llama 4 Scout", provider: "openrouter", desc: "Meta 长上下文模型", context: "10M" },
  { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2", provider: "openrouter", desc: "中文/代码强模型", badge: "tools" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "openrouter", desc: "开源强推理模型", badge: "reasoning" },
  { id: "deepseek/deepseek-r1-0528", label: "DeepSeek R1 0528", provider: "openrouter", desc: "R1 最新版本", badge: "reasoning" },
  { id: "mistralai/mistral-small-2603", label: "Mistral Small 2603", provider: "openrouter", desc: "轻量高效模型", badge: "tools" },
  { id: "qwen/qwen3.5-122b-a10b", label: "Qwen 3.5 122B", provider: "openrouter", desc: "Alibaba 大参数旗舰" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (OR)", provider: "openrouter", desc: "通过 OpenRouter 的 Gemini" },
  { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6 (OR)", provider: "openrouter", desc: "通过 OpenRouter 的 Claude", badge: "tools" },
  { id: "cohere/command-a", label: "Command A", provider: "openrouter", desc: "Cohere 企业级模型", badge: "tools" },
  { id: "amazon/nova-premier-v1", label: "Nova Premier V1", provider: "openrouter", desc: "Amazon 旗舰多模态" },
  { id: "baidu/ernie-4.5-300b-a47b", label: "ERNIE 4.5 300B", provider: "openrouter", desc: "百度 MoE 大参数模型" },
];

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-5.2": { input: 2.5, output: 10 },
  "gpt-5.1": { input: 2.5, output: 10 },
  "gpt-5": { input: 2.5, output: 10 },
  "gpt-5-mini": { input: 0.15, output: 0.6 },
  "gpt-5-nano": { input: 0.075, output: 0.3 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "o4-mini": { input: 1.1, output: 4.4 },
  "o3": { input: 10, output: 40 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus-4-5": { input: 15, output: 75 },
  "claude-opus-4-1": { input: 15, output: 75 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-sonnet-4-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "gemini-3.1-pro-preview": { input: 1.25, output: 10 },
  "gemini-3-flash-preview": { input: 0.15, output: 0.6 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  "grok-4.20": { input: 3, output: 15 },
  "grok-4.1-fast": { input: 3, output: 15 },
  "grok-4-fast": { input: 3, output: 15 },
  "llama-4": { input: 0.2, output: 0.8 },
  "deepseek-v3.2": { input: 0.27, output: 1.1 },
  "deepseek-r1": { input: 0.55, output: 2.19 },
  "mistral-small-2603": { input: 0.1, output: 0.3 },
  "qwen3.5-122b": { input: 0.3, output: 1.2 },
  "command-a": { input: 2.5, output: 10 },
  "nova-premier": { input: 2.5, output: 10 },
  "ernie-4.5": { input: 1, output: 4 },
};

const PROVIDER_COLORS: Record<Provider, { bg: string; border: string; dot: string; text: string; label: string }> = {
  openai: { bg: "bg-blue-500/10", border: "border-blue-500/25", dot: "bg-blue-400", text: "text-blue-300", label: "OpenAI" },
  anthropic: { bg: "bg-orange-500/10", border: "border-orange-500/25", dot: "bg-orange-400", text: "text-orange-300", label: "Anthropic" },
  gemini: { bg: "bg-emerald-500/8", border: "border-emerald-500/25", dot: "bg-emerald-400", text: "text-emerald-300", label: "Google Gemini" },
  openrouter: { bg: "bg-purple-500/10", border: "border-purple-500/25", dot: "bg-purple-400", text: "text-purple-300", label: "OpenRouter" },
};

function getModelPrice(modelId: string): { input: number; output: number } | null {
  const base = modelId.replace(/-thinking(-visible)?$/, "");
  for (const [k, v] of Object.entries(MODEL_PRICING)) {
    if (base.includes(k) || k.includes(base.split("-").slice(0, 2).join("-"))) return v;
  }
  return null;
}

type BackendStat = { calls: number; errors: number; streamingCalls: number; promptTokens: number; completionTokens: number; totalTokens: number; avgDurationMs: number; avgTtftMs: number | null };
type ModelStat = { calls: number; promptTokens: number; completionTokens: number };
type ModelStatus = { id: string; provider: string; enabled: boolean };
type ModelSummary = Record<string, { total: number; enabled: number }>;

function App() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("proxy_api_key") || "");
  const [online, setOnline] = useState<boolean | null>(null);
  const [sillyTavernMode, setSillyTavernMode] = useState(false);
  const [stLoading, setStLoading] = useState(false);
  const [stats, setStats] = useState<Record<string, BackendStat> | null>(null);
  const [modelStats, setModelStats] = useState<Record<string, ModelStat> | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus[]>([]);
  const [modelSummary, setModelSummary] = useState<ModelSummary>({});
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({ openai: true, anthropic: false, gemini: false, openrouter: false });

  const baseUrl = window.location.origin;

  const checkHealth = useCallback(async () => {
    try {
      const r = await fetch(`${baseUrl}/api/healthz`);
      setOnline(r.ok);
    } catch {
      setOnline(false);
    }
  }, [baseUrl]);

  const fetchSTMode = useCallback(async () => {
    try {
      const r = await fetch(`${baseUrl}/api/settings/sillytavern`);
      if (r.ok) {
        const d = await r.json();
        setSillyTavernMode(d.enabled ?? false);
      }
    } catch {}
  }, [baseUrl]);

  const fetchStats = useCallback(async (key: string) => {
    if (!key) { setStats(null); setModelStats(null); return; }
    try {
      const r = await fetch(`${baseUrl}/api/v1/stats`, { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) return;
      const d = await r.json();
      setStats(d.stats ?? null);
      setModelStats(d.modelStats && typeof d.modelStats === "object" ? d.modelStats : null);
    } catch {}
  }, [baseUrl]);

  const fetchModels = useCallback(async (key: string = apiKey) => {
    if (!key) return;
    try {
      const r = await fetch(`${baseUrl}/api/v1/admin/models`, { headers: { Authorization: `Bearer ${key}` } });
      if (!r.ok) return;
      const d = await r.json();
      setModelStatus(d.models ?? []);
      setModelSummary(d.summary ?? {});
    } catch {}
  }, [baseUrl, apiKey]);

  const toggleSTMode = async () => {
    const newVal = !sillyTavernMode;
    setSillyTavernMode(newVal);
    setStLoading(true);
    try {
      await fetch(`${baseUrl}/api/settings/sillytavern`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({ enabled: newVal }),
      });
    } catch {
      setSillyTavernMode(!newVal);
    }
    setStLoading(false);
  };

  const toggleModelProvider = async (provider: string, enabled: boolean) => {
    setModelStatus((prev) => prev.map((m) => m.provider === provider ? { ...m, enabled } : m));
    setModelSummary((prev) => {
      const grp = prev[provider];
      if (!grp) return prev;
      return { ...prev, [provider]: { total: grp.total, enabled: enabled ? grp.total : 0 } };
    });
    try {
      await fetch(`${baseUrl}/api/v1/admin/models`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider, enabled }),
      });
    } catch {}
    fetchModels();
  };

  const toggleModelById = async (id: string, enabled: boolean) => {
    setModelStatus((prev) => prev.map((m) => m.id === id ? { ...m, enabled } : m));
    try {
      await fetch(`${baseUrl}/api/v1/admin/models`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id], enabled }),
      });
    } catch {}
    fetchModels();
  };

  useEffect(() => {
    checkHealth();
    fetchSTMode();
    fetchStats(apiKey);
    fetchModels(apiKey);
    const iv1 = setInterval(checkHealth, 30000);
    const iv2 = setInterval(() => fetchStats(apiKey), 15000);
    return () => { clearInterval(iv1); clearInterval(iv2); };
  }, [checkHealth, fetchSTMode, fetchStats, fetchModels, apiKey]);

  const local = stats?.local;
  const totalCalls = local?.calls ?? 0;
  const totalTokens = local?.totalTokens ?? 0;
  const promptTokens = local?.promptTokens ?? 0;
  const completionTokens = local?.completionTokens ?? 0;
  const avgDuration = local?.avgDurationMs ?? 0;
  const avgTtft = local?.avgTtftMs;
  const successRate = totalCalls > 0 ? ((totalCalls - (local?.errors ?? 0)) / totalCalls * 100).toFixed(1) : "0";

  const totalCost = (() => {
    if (!modelStats) return 0;
    let cost = 0;
    for (const [model, s] of Object.entries(modelStats)) {
      const price = getModelPrice(model);
      if (price) {
        cost += (s.promptTokens / 1_000_000) * price.input + (s.completionTokens / 1_000_000) * price.output;
      }
    }
    return cost;
  })();

  function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon?: string }) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 flex flex-col">
        {icon && <span className="text-2xl mb-2">{icon}</span>}
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="text-foreground text-3xl font-bold mt-1">{value}</span>
        {sub && <span className="text-muted-foreground text-xs mt-1">{sub}</span>}
      </div>
    );
  }

  function ModelGroup({ provider, title, models, summary }: { provider: Provider; title: string; models: ModelEntry[]; summary?: { total: number; enabled: number } }) {
    const expanded = expandedProviders[provider];
    const c = PROVIDER_COLORS[provider];
    const allEnabled = summary ? summary.enabled === summary.total : false;
    const someEnabled = summary ? summary.enabled > 0 && summary.enabled < summary.total : false;

    return (
      <div className="mb-4">
        <button
          onClick={() => setExpandedProviders((p) => ({ ...p, [provider]: !p[provider] }))}
          className={`w-full flex items-center gap-3 p-4 rounded-xl border transition ${c.bg} ${c.border} hover:opacity-80`}
        >
          <div className={`w-3 h-3 rounded-full ${c.dot} shrink-0`} />
          <span className={`font-semibold ${c.text} flex-1 text-left`}>{title}</span>
          <span className="text-muted-foreground text-sm">{models.length} 模型</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleModelProvider(provider, !allEnabled);
            }}
            className={`w-12 h-6 rounded-full border transition ${allEnabled ? "bg-primary border-primary" : someEnabled ? "bg-accent border-accent" : "bg-muted border-border"}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow transition ${allEnabled || someEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
          </button>
          <span className="text-muted-foreground text-sm">{expanded ? "▲" : "▼"}</span>
        </button>
        {expanded && (
          <div className="mt-2 flex flex-col gap-2">
            {models.map((m) => {
              const enabled = modelStatus.find((s) => s.id === m.id)?.enabled ?? true;
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition ${enabled ? "bg-card border-border" : "bg-muted/50 border-border/50 opacity-60"}`}
                >
                  <code className={`font-mono text-sm flex-1 ${enabled ? c.text : "text-muted-foreground"}`}>{m.id}</code>
                  <span className="text-muted-foreground text-xs">{m.desc}</span>
                  {m.context && <span className="text-xs px-2 py-0.5 rounded bg-muted border">{m.context}</span>}
                  {m.badge && (
                    <span className={`text-xs px-2 py-0.5 rounded ${m.badge === "thinking" ? "bg-purple-500/20 text-purple-300" : m.badge === "thinking-visible" ? "bg-indigo-500/20 text-indigo-300" : m.badge === "reasoning" ? "bg-amber-500/20 text-amber-300" : "bg-blue-500/20 text-blue-300"}`}>
                      {m.badge === "thinking-visible" ? "思考可见" : m.badge === "thinking" ? "思考" : m.badge === "reasoning" ? "推理" : "工具"}
                    </span>
                  )}
                  <button
                    onClick={() => toggleModelById(m.id, !enabled)}
                    className={`w-10 h-5 rounded-full border transition ${enabled ? "bg-primary border-primary" : "bg-muted border-border"}`}
                  >
                    <div className={`w-4 h-4 bg-white rounded-full shadow transition ${enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <header className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl">⚡</div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">Replit2Api</h1>
              <p className="text-muted-foreground text-sm">AI Proxy Gateway · OpenAI / Anthropic / Gemini / OpenRouter</p>
            </div>
            <div className="flex items-center gap-3">
              <UpdateBadge baseUrl={baseUrl} apiKey={apiKey} />
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${online ? "bg-emerald-500/10 border-emerald-500/25" : online === false ? "bg-red-500/10 border-red-500/25" : "bg-muted border-border"}`}>
                <div className={`w-2 h-2 rounded-full ${online ? "bg-emerald-400" : online === false ? "bg-red-400" : "bg-muted-foreground"}`} />
                <span className={`text-sm ${online ? "text-emerald-400" : online === false ? "text-red-400" : "text-muted-foreground"}`}>
                  {online === null ? "..." : online ? "在线" : "离线"}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Connection Info */}
        <section className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">连接信息</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-muted-foreground text-sm">Base URL</label>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 bg-muted px-4 py-2 rounded-lg font-mono text-primary">{baseUrl}</code>
                <button
                  onClick={() => navigator.clipboard.writeText(baseUrl)}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition"
                >
                  复制
                </button>
              </div>
            </div>
            <div>
              <label className="text-muted-foreground text-sm">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); localStorage.setItem("proxy_api_key", e.target.value); }}
                placeholder="输入你的 PROXY_API_KEY"
                className="w-full mt-1 bg-muted border border-border rounded-lg px-4 py-2 font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <span className="text-muted-foreground text-sm">SillyTavern 兼容模式</span>
            <button
              onClick={toggleSTMode}
              disabled={stLoading || !apiKey}
              className={`w-14 h-7 rounded-full border transition ${sillyTavernMode ? "bg-primary border-primary" : "bg-muted border-border"} ${stLoading || !apiKey ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full shadow transition ${sillyTavernMode ? "translate-x-8" : "translate-x-0.5"}`} />
            </button>
            <span className="text-muted-foreground text-sm">
              {sillyTavernMode ? "已启用 — Claude 模型自动追加 user 消息" : "已禁用 — 消息原样发送"}
            </span>
          </div>
        </section>

        {/* Stats Cards */}
        <section>
          <h2 className="text-lg font-semibold mb-4">使用统计</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="总调用次数" value={totalCalls.toLocaleString()} icon="📊" />
            <StatCard label="总 Token 数" value={totalTokens.toLocaleString()} sub={`输入 ${promptTokens.toLocaleString()} / 输出 ${completionTokens.toLocaleString()}`} icon="🔢" />
            <StatCard label="估算费用" value={`$${totalCost.toFixed(4)}`} sub="按模型定价计算" icon="💰" />
            <StatCard label="成功率" value={`${successRate}%`} icon="✅" />
            <StatCard label="平均延迟" value={`${avgDuration}ms`} icon="⏱️" />
            <StatCard label="平均 TTFT" value={avgTtft !== null ? `${avgTtft}ms` : "—"} sub="首字响应时间" icon="🚀" />
            <StatCard label="流式调用" value={local?.streamingCalls?.toLocaleString() ?? "0"} icon="📡" />
            <StatCard label="错误次数" value={local?.errors?.toLocaleString() ?? "0"} icon="❌" />
          </div>
        </section>

        {/* Model Management */}
        <section>
          <h2 className="text-lg font-semibold mb-4">模型管理</h2>
          <ModelGroup provider="openai" title="OpenAI" models={OPENAI_MODELS} summary={modelSummary.openai} />
          <ModelGroup provider="anthropic" title="Anthropic" models={ANTHROPIC_MODELS} summary={modelSummary.anthropic} />
          <ModelGroup provider="gemini" title="Google Gemini" models={GEMINI_MODELS} summary={modelSummary.gemini} />
          <ModelGroup provider="openrouter" title="OpenRouter" models={OPENROUTER_MODELS} summary={modelSummary.openrouter} />
        </section>

        {/* Footer */}
        <footer className="text-center text-muted-foreground text-sm py-8">
          Powered by Replit AI Integrations · OpenAI · Anthropic · Gemini · OpenRouter
        </footer>
      </div>
    </div>
  );
}

export default App;