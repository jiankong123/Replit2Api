import { Router, type IRouter, type Request, type Response } from "express";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { readJson, writeJson } from "../lib/cloudPersist";
import { getSillyTavernMode } from "./settings";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

const OPENAI_CHAT_MODELS = [
  "gpt-5.2", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano",
  "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
  "gpt-4o", "gpt-4o-mini",
  "o4-mini", "o3", "o3-mini",
];
const OPENAI_THINKING_ALIASES = OPENAI_CHAT_MODELS
  .filter((m) => m.startsWith("o"))
  .map((m) => `${m}-thinking`);

const ANTHROPIC_BASE_MODELS = [
  "claude-opus-4-6", "claude-opus-4-5", "claude-opus-4-1",
  "claude-sonnet-4-6", "claude-sonnet-4-5",
  "claude-haiku-4-5",
];

const GEMINI_BASE_MODELS = [
  "gemini-3.1-pro-preview", "gemini-3-flash-preview",
  "gemini-2.5-pro", "gemini-2.5-flash",
];

const OPENROUTER_FEATURED = [
  "x-ai/grok-4.20", "x-ai/grok-4.1-fast", "x-ai/grok-4-fast",
  "meta-llama/llama-4-maverick", "meta-llama/llama-4-scout",
  "deepseek/deepseek-v3.2", "deepseek/deepseek-r1", "deepseek/deepseek-r1-0528",
  "mistralai/mistral-small-2603", "qwen/qwen3.5-122b-a10b",
  "google/gemini-2.5-pro", "anthropic/claude-opus-4.6",
  "cohere/command-a", "amazon/nova-premier-v1", "baidu/ernie-4.5-300b-a47b",
];

const ALL_MODELS = [
  ...OPENAI_CHAT_MODELS.map((id) => ({ id })),
  ...OPENAI_THINKING_ALIASES.map((id) => ({ id })),
  ...ANTHROPIC_BASE_MODELS.flatMap((id) => [
    { id },
    { id: `${id}-thinking` },
    { id: `${id}-thinking-visible` },
  ]),
  ...GEMINI_BASE_MODELS.flatMap((id) => [
    { id }, { id: `${id}-thinking` }, { id: `${id}-thinking-visible` },
  ]),
  ...OPENROUTER_FEATURED.map((id) => ({ id })),
];

// ---------------------------------------------------------------------------
// Model provider map + enable/disable management
// ---------------------------------------------------------------------------

type ModelProvider = "openai" | "anthropic" | "gemini" | "openrouter";

const MODEL_PROVIDER_MAP = new Map<string, ModelProvider>();

for (const id of OPENAI_CHAT_MODELS) { MODEL_PROVIDER_MAP.set(id, "openai"); }
for (const id of OPENAI_THINKING_ALIASES) { MODEL_PROVIDER_MAP.set(id, "openai"); }
for (const base of ANTHROPIC_BASE_MODELS) {
  MODEL_PROVIDER_MAP.set(base, "anthropic");
  MODEL_PROVIDER_MAP.set(`${base}-thinking`, "anthropic");
  MODEL_PROVIDER_MAP.set(`${base}-thinking-visible`, "anthropic");
}
for (const base of GEMINI_BASE_MODELS) {
  MODEL_PROVIDER_MAP.set(base, "gemini");
  MODEL_PROVIDER_MAP.set(`${base}-thinking`, "gemini");
  MODEL_PROVIDER_MAP.set(`${base}-thinking-visible`, "gemini");
}
for (const id of OPENROUTER_FEATURED) { MODEL_PROVIDER_MAP.set(id, "openrouter"); }

let disabledModels: Set<string> = new Set<string>();

function saveDisabledModels(set: Set<string>): void {
  writeJson("disabled_models.json", [...set]).catch((err) => {
    console.error("[persist] failed to save disabled_models:", err);
  });
}

export const initReady: Promise<void> = (async () => {
  const savedDisabled = await readJson<string[]>("disabled_models.json").catch(() => null);
  if (Array.isArray(savedDisabled)) {
    disabledModels = new Set<string>(savedDisabled);
    console.log(`[init] loaded ${disabledModels.size} disabled model(s)`);
  }
})();

function isModelEnabled(id: string): boolean {
  return !disabledModels.has(id);
}

// ---------------------------------------------------------------------------
// Client factories
// ---------------------------------------------------------------------------

const clientCache = new Map<string, OpenAI | Anthropic | GoogleGenAI>();

function makeLocalOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      "OpenAI integration is not configured. Please add the OpenAI integration in Replit (Tools → Integrations) to use GPT models."
    );
  }
  const cacheKey = `openai:${apiKey}:${baseURL}`;
  let client = clientCache.get(cacheKey) as OpenAI | undefined;
  if (!client) { client = new OpenAI({ apiKey, baseURL }); clientCache.set(cacheKey, client); }
  return client;
}

function makeLocalAnthropic(): Anthropic {
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      "Anthropic integration is not configured. Please add the Anthropic integration in Replit (Tools → Integrations) to use Claude models."
    );
  }
  const cacheKey = `anthropic:${apiKey}:${baseURL}`;
  let client = clientCache.get(cacheKey) as Anthropic | undefined;
  if (!client) { client = new Anthropic({ apiKey, baseURL }); clientCache.set(cacheKey, client); }
  return client;
}

function makeLocalGemini(): GoogleGenAI {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (!apiKey || !baseUrl) {
    throw new Error(
      "Gemini integration is not configured. Please add the Gemini integration in Replit (Tools → Integrations) to use Gemini models."
    );
  }
  const cacheKey = `gemini:${apiKey}:${baseUrl}`;
  let client = clientCache.get(cacheKey) as GoogleGenAI | undefined;
  if (!client) { client = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "", baseUrl } }); clientCache.set(cacheKey, client); }
  return client;
}

function makeLocalOpenRouter(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      "OpenRouter integration is not configured. Please add the OpenRouter integration in Replit (Tools → Integrations) to use OpenRouter models."
    );
  }
  const cacheKey = `openrouter:${apiKey}:${baseURL}`;
  let client = clientCache.get(cacheKey) as OpenAI | undefined;
  if (!client) { client = new OpenAI({ apiKey, baseURL }); clientCache.set(cacheKey, client); }
  return client;
}

// ---------------------------------------------------------------------------
// Usage statistics — persisted to cloudPersist ("usage_stats.json")
// ---------------------------------------------------------------------------

const STATS_FILE = "usage_stats.json";

interface BackendStat {
  calls: number;
  errors: number;
  promptTokens: number;
  completionTokens: number;
  totalDurationMs: number;
  totalTtftMs: number;
  streamingCalls: number;
}

interface ModelStat {
  calls: number;
  promptTokens: number;
  completionTokens: number;
}

const EMPTY_STAT = (): BackendStat => ({
  calls: 0, errors: 0, promptTokens: 0, completionTokens: 0,
  totalDurationMs: 0, totalTtftMs: 0, streamingCalls: 0,
});

const EMPTY_MODEL_STAT = (): ModelStat => ({
  calls: 0, promptTokens: 0, completionTokens: 0,
});

const statsMap = new Map<string, BackendStat>();
const modelStatsMap = new Map<string, ModelStat>();

function statsToObject(): { backends: Record<string, BackendStat>; models: Record<string, ModelStat> } {
  return {
    backends: Object.fromEntries(statsMap.entries()),
    models: Object.fromEntries(modelStatsMap.entries()),
  };
}

async function persistStats(): Promise<void> {
  try { await writeJson(STATS_FILE, statsToObject()); } catch {}
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _saveTimer = null; void persistStats(); }, 2_000);
}

setInterval(() => { void persistStats(); }, 60_000);

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    console.log(`[stats] ${sig} received, flushing stats…`);
    persistStats().finally(() => process.exit(0));
    setTimeout(() => process.exit(1), 3000);
  });
}

export const statsReady: Promise<void> = (async () => {
  try {
    const saved = await readJson<Record<string, unknown>>(STATS_FILE);
    if (saved && typeof saved === "object") {
      const backendsRaw = (saved as { backends?: Record<string, BackendStat> }).backends ?? saved as Record<string, BackendStat>;
      const modelsRaw = (saved as { models?: Record<string, ModelStat> }).models;

      for (const [label, raw] of Object.entries(backendsRaw)) {
        if (raw && typeof raw === "object" && "calls" in (raw as unknown as Record<string, unknown>)) {
          statsMap.set(label, {
            calls:            Number((raw as BackendStat).calls)            || 0,
            errors:           Number((raw as BackendStat).errors)           || 0,
            promptTokens:     Number((raw as BackendStat).promptTokens)     || 0,
            completionTokens: Number((raw as BackendStat).completionTokens) || 0,
            totalDurationMs:  Number((raw as BackendStat).totalDurationMs)  || 0,
            totalTtftMs:      Number((raw as BackendStat).totalTtftMs)      || 0,
            streamingCalls:   Number((raw as BackendStat).streamingCalls)   || 0,
          });
        }
      }

      if (modelsRaw && typeof modelsRaw === "object") {
        for (const [model, raw] of Object.entries(modelsRaw)) {
          if (raw && typeof raw === "object") {
            modelStatsMap.set(model, {
              calls:            Number(raw.calls)            || 0,
              promptTokens:     Number(raw.promptTokens)     || 0,
              completionTokens: Number(raw.completionTokens) || 0,
            });
          }
        }
      }

      console.log(`[stats] loaded ${statsMap.size} backend(s), ${modelStatsMap.size} model(s) from ${STATS_FILE}`);
    }
  } catch {
    console.warn(`[stats] could not load ${STATS_FILE}, starting fresh`);
  }
})();

function getStat(label: string): BackendStat {
  if (!statsMap.has(label)) statsMap.set(label, EMPTY_STAT());
  return statsMap.get(label)!;
}

function recordCallStat(label: string, durationMs: number, prompt: number, completion: number, ttftMs?: number, model?: string): void {
  const s = getStat(label);
  s.calls++;
  s.promptTokens += prompt;
  s.completionTokens += completion;
  s.totalDurationMs += durationMs;
  if (ttftMs !== undefined) { s.totalTtftMs += ttftMs; s.streamingCalls++; }
  if (model) {
    const ms = getModelStat(model);
    ms.calls++;
    ms.promptTokens += prompt;
    ms.completionTokens += completion;
  }
  scheduleSave();
}

function getModelStat(model: string): ModelStat {
  if (!modelStatsMap.has(model)) modelStatsMap.set(model, EMPTY_MODEL_STAT());
  return modelStatsMap.get(model)!;
}

function recordErrorStat(label: string): void { getStat(label).errors++; scheduleSave(); }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setSseHeaders(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Access-Control-Allow-Origin", "*");
  (res.socket as import("net").Socket | null)?.setNoDelay(true);
  res.flushHeaders();
}

function writeAndFlush(res: Response, data: string) {
  res.write(data);
  (res as unknown as { flush?: () => void }).flush?.();
}

async function fakeStreamResponse(
  res: Response,
  json: Record<string, unknown>,
  startTime: number,
): Promise<{ promptTokens: number; completionTokens: number; ttftMs: number }> {
  const id = (json["id"] as string) ?? `chatcmpl-fake-${Date.now()}`;
  const model = (json["model"] as string) ?? "unknown";
  const created = (json["created"] as number) ?? Math.floor(Date.now() / 1000);
  const choices = (json["choices"] as Array<Record<string, unknown>>) ?? [];
  const usage = json["usage"] as { prompt_tokens?: number; completion_tokens?: number } | undefined;

  setSseHeaders(res);

  const roleChunk = {
    id, object: "chat.completion.chunk", created, model,
    choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }],
  };
  writeAndFlush(res, `data: ${JSON.stringify(roleChunk)}\n\n`);
  const ttftMs = Date.now() - startTime;

  const fullContent = (choices[0]?.["message"] as { content?: string })?.content ?? "";
  const toolCalls = (choices[0]?.["message"] as { tool_calls?: unknown[] })?.tool_calls;

  if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
    const tcChunk = {
      id, object: "chat.completion.chunk", created, model,
      choices: [{ index: 0, delta: { tool_calls: toolCalls }, finish_reason: null }],
    };
    writeAndFlush(res, `data: ${JSON.stringify(tcChunk)}\n\n`);
  }

  const CHUNK_SIZE = 20;
  for (let i = 0; i < fullContent.length; i += CHUNK_SIZE) {
    const slice = fullContent.slice(i, i + CHUNK_SIZE);
    const chunk = {
      id, object: "chat.completion.chunk", created, model,
      choices: [{ index: 0, delta: { content: slice }, finish_reason: null }],
    };
    writeAndFlush(res, `data: ${JSON.stringify(chunk)}\n\n`);
    if (i + CHUNK_SIZE < fullContent.length) {
      await new Promise((r) => setImmediate(r));
    }
  }

  const finishReason = (choices[0]?.["finish_reason"] as string) ?? "stop";
  const stopChunk = {
    id, object: "chat.completion.chunk", created, model,
    choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
    ...(usage ? { usage } : {}),
  };
  writeAndFlush(res, `data: ${JSON.stringify(stopChunk)}\n\n`);
  writeAndFlush(res, "data: [DONE]\n\n");
  res.end();

  return {
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    ttftMs,
  };
}

function requireApiKey(req: Request, res: Response, next: () => void) {
  const proxyKey = process.env.PROXY_API_KEY;
  if (!proxyKey) {
    res.status(500).json({ error: { message: "Server API key not configured", type: "server_error" } });
    return;
  }

  const authHeader = req.headers["authorization"];
  const xApiKey = req.headers["x-api-key"];

  let providedKey: string | undefined;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    providedKey = authHeader.slice(7);
  } else if (typeof xApiKey === "string") {
    providedKey = xApiKey;
  }

  if (!providedKey) {
    res.status(401).json({ error: { message: "Missing API key (provide Authorization: Bearer <key> or x-api-key header)", type: "invalid_request_error" } });
    return;
  }
  if (providedKey !== proxyKey) {
    res.status(401).json({ error: { message: "Invalid API key", type: "invalid_request_error" } });
    return;
  }
  next();
}

function requireApiKeyWithQuery(req: Request, res: Response, next: () => void) {
  const queryKey = req.query["key"] as string | undefined;
  if (queryKey) {
    req.headers["authorization"] = `Bearer ${queryKey}`;
  }
  requireApiKey(req, res, next);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get("/v1/models", requireApiKeyWithQuery, (_req: Request, res: Response) => {
  res.json({
    object: "list",
    data: ALL_MODELS.filter((m) => isModelEnabled(m.id)).map((m) => ({
      id: m.id,
      object: "model",
      created: 1700000000,
      owned_by: "replit-proxy",
    })),
  });
});

// ---------------------------------------------------------------------------
// Format conversion: OpenAI ↔ Anthropic
// ---------------------------------------------------------------------------

type OAIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: string } }
  | Record<string, unknown>;

type OAIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OAITool = {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
};

type OAIMessage =
  | { role: "system"; content: string | OAIContentPart[] }
  | { role: "user"; content: string | OAIContentPart[] }
  | { role: "assistant"; content: string | OAIContentPart[] | null; tool_calls?: OAIToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string }
  | { role: string; content: string | OAIContentPart[] | null };

type AnthropicImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string };

type AnthropicContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: AnthropicImageSource }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = { role: "user" | "assistant"; content: string | AnthropicContentPart[] };

function convertContentForClaude(content: string | OAIContentPart[] | null | undefined): string | AnthropicContentPart[] {
  if (!content) return "";
  if (typeof content === "string") return content;

  return content.map((part): AnthropicContentPart => {
    if (part.type === "image_url") {
      const url = (part as { type: "image_url"; image_url: { url: string } }).image_url.url;
      if (url.startsWith("data:")) {
        const [header, data] = url.split(",");
        const media_type = header.replace("data:", "").replace(";base64", "");
        return { type: "image", source: { type: "base64", media_type, data } };
      } else {
        return { type: "image", source: { type: "url", url } };
      }
    }
    if (part.type === "text") {
      return { type: "text", text: (part as { type: "text"; text: string }).text };
    }
    return { type: "text", text: JSON.stringify(part) };
  });
}

function convertToolsForClaude(tools: OAITool[]): { name: string; description: string; input_schema: unknown }[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description ?? "",
    input_schema: t.function.parameters ?? { type: "object", properties: {} },
  }));
}

function convertMessagesForClaude(messages: OAIMessage[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "assistant") {
      const assistantMsg = msg as Extract<OAIMessage, { role: "assistant" }>;
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        const parts: AnthropicContentPart[] = [];
        const textContent = assistantMsg.content;
        if (textContent && (typeof textContent === "string" ? textContent.trim() : textContent.length > 0)) {
          const converted = convertContentForClaude(textContent as string | OAIContentPart[]);
          if (typeof converted === "string") {
            if (converted.trim()) parts.push({ type: "text", text: converted });
          } else {
            parts.push(...converted);
          }
        }
        for (const tc of assistantMsg.tool_calls) {
          let input: unknown = {};
          try { input = JSON.parse(tc.function.arguments); } catch {}
          parts.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
        }
        result.push({ role: "assistant", content: parts });
      } else {
        result.push({
          role: "assistant",
          content: convertContentForClaude(assistantMsg.content as string | OAIContentPart[]),
        });
      }
    } else if (msg.role === "tool") {
      const toolMsg = msg as Extract<OAIMessage, { role: "tool" }>;
      result.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolMsg.tool_call_id, content: toolMsg.content }],
      });
    } else {
      result.push({
        role: "user",
        content: convertContentForClaude(msg.content as string | OAIContentPart[]),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// POST /v1/chat/completions
// ---------------------------------------------------------------------------

router.post("/v1/chat/completions", requireApiKey, async (req: Request, res: Response) => {
  const { model, messages, stream, max_tokens, tools, tool_choice } = req.body as {
    model?: string;
    messages: OAIMessage[];
    stream?: boolean;
    max_tokens?: number;
    tools?: OAITool[];
    tool_choice?: unknown;
  };

  if (model && !isModelEnabled(model)) {
    res.status(403).json({ error: { message: `Model '${model}' is disabled on this gateway`, type: "invalid_request_error", code: "model_disabled" } });
    return;
  }

  const selectedModel = model && ALL_MODELS.some((m) => m.id === model) ? model : "gpt-5.2";
  const provider = MODEL_PROVIDER_MAP.get(selectedModel) ?? "openai";
  const isClaudeModel = provider === "anthropic";
  const isGeminiModel = provider === "gemini";
  const isOpenRouterModel = provider === "openrouter";
  const shouldStream = stream ?? false;
  const startTime = Date.now();

  const finalMessages = (isClaudeModel && getSillyTavernMode() && !tools?.length)
    ? [...messages, { role: "user" as const, content: "继续" }]
    : messages;

  req.log.info({ model: selectedModel, sillyTavern: isClaudeModel && getSillyTavernMode(), toolCount: tools?.length ?? 0 }, "Proxy request");

  try {
    let result: { promptTokens: number; completionTokens: number; ttftMs?: number };

    if (isClaudeModel) {
      const thinkingVisible = selectedModel.endsWith("-thinking-visible");
      const thinkingEnabled = thinkingVisible || selectedModel.endsWith("-thinking");
      const actualModel = thinkingVisible
        ? selectedModel.replace(/-thinking-visible$/, "")
        : thinkingEnabled
          ? selectedModel.replace(/-thinking$/, "")
          : selectedModel;
      const CLAUDE_MODEL_MAX: Record<string, number> = {
        "claude-haiku-4-5": 8096,
        "claude-sonnet-4-5": 64000,
        "claude-sonnet-4-6": 64000,
        "claude-opus-4-1": 64000,
        "claude-opus-4-5": 64000,
        "claude-opus-4-6": 64000,
      };
      const modelMax = CLAUDE_MODEL_MAX[actualModel] ?? 32000;
      const defaultMaxTokens = thinkingEnabled ? Math.max(modelMax, 32000) : modelMax;
      const client = makeLocalAnthropic();
      result = await handleClaude({ req, res, client, model: actualModel, messages: finalMessages, stream: shouldStream, maxTokens: max_tokens ?? defaultMaxTokens, thinking: thinkingEnabled, tools, toolChoice: tool_choice, startTime });
    } else if (isGeminiModel) {
      const thinkingVisible = selectedModel.endsWith("-thinking-visible");
      const thinkingEnabled = thinkingVisible || selectedModel.endsWith("-thinking");
      const actualModel = thinkingVisible
        ? selectedModel.replace(/-thinking-visible$/, "")
        : thinkingEnabled
          ? selectedModel.replace(/-thinking$/, "")
          : selectedModel;
      result = await handleGemini({ req, res, model: actualModel, messages: finalMessages, stream: shouldStream, maxTokens: max_tokens, thinking: thinkingEnabled, startTime });
    } else if (isOpenRouterModel) {
      const client = makeLocalOpenRouter();
      result = await handleOpenAI({ req, res, client, model: selectedModel, messages: finalMessages, stream: shouldStream, maxTokens: max_tokens, tools, toolChoice: tool_choice, startTime });
    } else {
      const client = makeLocalOpenAI();
      result = await handleOpenAI({ req, res, client, model: selectedModel, messages: finalMessages, stream: shouldStream, maxTokens: max_tokens, tools, toolChoice: tool_choice, startTime });
    }

    const duration = Date.now() - startTime;
    recordCallStat("local", duration, result.promptTokens, result.completionTokens, result.ttftMs, selectedModel);
  } catch (err: unknown) {
    recordErrorStat("local");
    const errMsg = err instanceof Error ? err.message : "";
    req.log.error({ err }, "Proxy request failed");
    if (!res.headersSent) {
      res.status(500).json({ error: { message: errMsg || "Unknown error", type: "server_error" } });
    } else if (!res.writableEnded) {
      writeAndFlush(res, `data: ${JSON.stringify({ error: { message: errMsg || "Unknown error" } })}\n\n`);
      writeAndFlush(res, "data: [DONE]\n\n");
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// POST /v1/messages — Anthropic-native endpoint
// ---------------------------------------------------------------------------

router.post("/v1/messages", requireApiKey, async (req: Request, res: Response) => {
  const body = req.body as {
    model?: string;
    messages: AnthropicMessage[];
    system?: string | { type: string; text: string }[];
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
    thinking?: { type: "enabled"; budget_tokens: number };
    [key: string]: unknown;
  };

  const { model, messages, system, stream, max_tokens, ...rest } = body;
  const selectedModel = model ?? "claude-sonnet-4-5";
  const maxTokens = max_tokens ?? 4096;
  const shouldStream = stream ?? false;
  const startTime = Date.now();

  req.log.info({ model: selectedModel, stream: shouldStream }, "Anthropic /v1/messages request");

  try {
    const client = makeLocalAnthropic();

    const createParams = {
      model: selectedModel,
      max_tokens: maxTokens,
      messages,
      ...(system ? { system } : {}),
      ...rest,
    } as Parameters<typeof client.messages.create>[0];

    if (shouldStream) {
      let keepalive: ReturnType<typeof setInterval> | undefined;
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        setSseHeaders(res);
        writeAndFlush(res, ": ok\n\n");
        keepalive = setInterval(() => { if (!res.writableEnded) writeAndFlush(res, ": keepalive\n\n"); }, 15_000);
        req.on("close", () => { if (keepalive) clearInterval(keepalive); });

        const claudeStream = client.messages.stream(createParams as Parameters<typeof client.messages.stream>[0]);

        for await (const event of claudeStream) {
          if (event.type === "message_start") {
            inputTokens = event.message.usage.input_tokens;
          } else if (event.type === "message_delta") {
            outputTokens = event.usage.output_tokens;
          }
          writeAndFlush(res, `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        }
        writeAndFlush(res, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");
        res.end();
        const dur = Date.now() - startTime;
        recordCallStat("local", dur, inputTokens, outputTokens, undefined, selectedModel);
      } finally {
        if (keepalive) clearInterval(keepalive);
      }
    } else {
      const result = await client.messages.create(createParams);
      const usage = (result as { usage?: { input_tokens?: number; output_tokens?: number } }).usage ?? {};
      const dur = Date.now() - startTime;
      recordCallStat("local", dur, usage.input_tokens ?? 0, usage.output_tokens ?? 0, undefined, selectedModel);
      res.json(result);
    }
  } catch (err: unknown) {
    recordErrorStat("local");
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err }, "/v1/messages request failed");
    if (!res.headersSent) {
      res.status(500).json({ error: { type: "server_error", message: errMsg } });
    } else {
      writeAndFlush(res, `event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "server_error", message: errMsg } })}\n\n`);
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// Stats + Admin
// ---------------------------------------------------------------------------

router.get("/v1/stats", requireApiKey, (_req: Request, res: Response) => {
  const s = getStat("local");
  const result: Record<string, unknown> = {
    local: {
      calls: s.calls,
      errors: s.errors,
      streamingCalls: s.streamingCalls,
      promptTokens: s.promptTokens,
      completionTokens: s.completionTokens,
      totalTokens: s.promptTokens + s.completionTokens,
      avgDurationMs: s.calls > 0 ? Math.round(s.totalDurationMs / s.calls) : 0,
      avgTtftMs: s.streamingCalls > 0 ? Math.round(s.totalTtftMs / s.streamingCalls) : null,
    },
  };
  const modelStats: Record<string, ModelStat> = Object.fromEntries(modelStatsMap.entries());
  res.json({ stats: result, modelStats, uptimeSeconds: Math.round(process.uptime()) });
});

router.post("/v1/admin/stats/reset", requireApiKey, (_req: Request, res: Response) => {
  statsMap.clear();
  modelStatsMap.clear();
  scheduleSave();
  res.json({ ok: true });
});

router.get("/v1/admin/models", requireApiKey, (_req: Request, res: Response) => {
  const models = ALL_MODELS.map((m) => ({
    id: m.id,
    provider: MODEL_PROVIDER_MAP.get(m.id) ?? "openrouter",
    enabled: isModelEnabled(m.id),
  }));
  const summary: Record<string, { total: number; enabled: number }> = {};
  for (const m of models) {
    if (!summary[m.provider]) summary[m.provider] = { total: 0, enabled: 0 };
    summary[m.provider].total++;
    if (m.enabled) summary[m.provider].enabled++;
  }
  res.json({ models, summary });
});

router.patch("/v1/admin/models", requireApiKey, (req: Request, res: Response) => {
  const { ids, provider, enabled } = req.body as { ids?: string[]; provider?: string; enabled?: boolean };
  if (typeof enabled !== "boolean") { res.status(400).json({ error: "enabled (boolean) required" }); return; }

  let targets: string[] = [];
  if (Array.isArray(ids) && ids.length > 0) {
    targets = ids.filter((id) => MODEL_PROVIDER_MAP.has(id));
  } else if (typeof provider === "string") {
    targets = ALL_MODELS.map((m) => m.id).filter((id) => MODEL_PROVIDER_MAP.get(id) === provider);
  } else {
    res.status(400).json({ error: "ids (string[]) or provider (string) required" }); return;
  }

  for (const id of targets) {
    if (enabled) disabledModels.delete(id);
    else disabledModels.add(id);
  }
  saveDisabledModels(disabledModels);
  res.json({ updated: targets.length, enabled, ids: targets });
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleOpenAI({
  req, res, client, model, messages, stream, maxTokens, tools, toolChoice, startTime,
}: {
  req: Request;
  res: Response;
  client: OpenAI;
  model: string;
  messages: OAIMessage[];
  stream: boolean;
  maxTokens?: number;
  tools?: OAITool[];
  toolChoice?: unknown;
  startTime: number;
}): Promise<{ promptTokens: number; completionTokens: number; ttftMs?: number }> {
  const params: Parameters<typeof client.chat.completions.create>[0] = {
    model,
    messages: messages as Parameters<typeof client.chat.completions.create>[0]["messages"],
    stream,
  };
  if (maxTokens) (params as unknown as Record<string, unknown>)["max_completion_tokens"] = maxTokens;
  if (tools?.length) (params as unknown as Record<string, unknown>)["tools"] = tools;
  if (toolChoice !== undefined) (params as unknown as Record<string, unknown>)["tool_choice"] = toolChoice;

  if (stream) {
    try {
      let ttftMs: number | undefined;
      let promptTokens = 0;
      let completionTokens = 0;
      setSseHeaders(res);
      writeAndFlush(res, ": ok\n\n");
      const streamResult = await client.chat.completions.create({
        ...params,
        stream: true,
        stream_options: { include_usage: true },
      });
      for await (const chunk of streamResult) {
        if (ttftMs === undefined && (chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.delta?.tool_calls)) {
          ttftMs = Date.now() - startTime;
        }
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens ?? 0;
          completionTokens = chunk.usage.completion_tokens ?? 0;
        }
        writeAndFlush(res, `data: ${JSON.stringify(chunk)}\n\n`);
      }
      writeAndFlush(res, "data: [DONE]\n\n");
      res.end();
      return { promptTokens, completionTokens, ttftMs };
    } catch (streamErr) {
      const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      req.log.warn({ err: streamErr }, "Real streaming failed");
      if (res.headersSent) {
        writeAndFlush(res, `data: ${JSON.stringify({ error: { message: errMsg || "Streaming error", type: "server_error" } })}\n\n`);
        writeAndFlush(res, "data: [DONE]\n\n");
        res.end();
        return { promptTokens: 0, completionTokens: 0, ttftMs: undefined };
      }
      const result = await client.chat.completions.create({ ...params, stream: false });
      return fakeStreamResponse(res, result as unknown as Record<string, unknown>, startTime);
    }
  } else {
    const result = await client.chat.completions.create({ ...params, stream: false });
    res.json(result);
    return {
      promptTokens: result.usage?.prompt_tokens ?? 0,
      completionTokens: result.usage?.completion_tokens ?? 0,
    };
  }
}

async function handleGemini({
  req, res, model, messages, stream, maxTokens, thinking = false, startTime,
}: {
  req: Request;
  res: Response;
  model: string;
  messages: OAIMessage[];
  stream: boolean;
  maxTokens?: number;
  thinking?: boolean;
  startTime: number;
}): Promise<{ promptTokens: number; completionTokens: number; ttftMs?: number }> {
  const client = makeLocalGemini();

  let systemInstruction: string | undefined;
  const contents: { role: string; parts: { text: string }[] }[] = [];

  for (const msg of messages) {
    const textContent = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? msg.content.filter((p: OAIContentPart) => p.type === "text").map((p) => (p as { type: "text"; text: string }).text).join("\n")
        : "";
    if (msg.role === "system") {
      systemInstruction = systemInstruction ? `${systemInstruction}\n${textContent}` : textContent;
    } else {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: textContent || " " }],
      });
    }
  }

  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: " " }] });
  }

  const config: Record<string, unknown> = {};
  if (maxTokens) config.maxOutputTokens = maxTokens;
  if (thinking) {
    config.thinkingConfig = { thinkingBudget: maxTokens ? Math.min(maxTokens, 32768) : 16384 };
  }

  if (stream) {
    try {
      let ttftMs: number | undefined;
      let promptTokens = 0;
      let completionTokens = 0;
      const chatId = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);

      setSseHeaders(res);
      writeAndFlush(res, ": ok\n\n");
      const response = await client.models.generateContentStream({
        model,
        contents,
        config: {
          ...config,
          ...(systemInstruction ? { systemInstruction } : {}),
        },
      });

      for await (const chunk of response) {
        const text = chunk.text ?? "";
        if (ttftMs === undefined && text) {
          ttftMs = Date.now() - startTime;
        }
        if (chunk.usageMetadata) {
          promptTokens = chunk.usageMetadata.promptTokenCount ?? 0;
          completionTokens = chunk.usageMetadata.candidatesTokenCount ?? 0;
        }
        const oaiChunk = {
          id: chatId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{
            index: 0,
            delta: { content: text },
            finish_reason: chunk.candidates?.[0]?.finishReason === "STOP" ? "stop" : null,
          }],
        };
        writeAndFlush(res, `data: ${JSON.stringify(oaiChunk)}\n\n`);
      }

      writeAndFlush(res, "data: [DONE]\n\n");
      res.end();
      return { promptTokens, completionTokens, ttftMs };
    } catch (streamErr) {
      const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      req.log.warn({ err: streamErr }, "Gemini streaming failed");
      if (res.headersSent) {
        writeAndFlush(res, `data: ${JSON.stringify({ error: { message: errMsg || "Gemini streaming error", type: "server_error" } })}\n\n`);
        writeAndFlush(res, "data: [DONE]\n\n");
        res.end();
        return { promptTokens: 0, completionTokens: 0, ttftMs: undefined };
      }
      const response = await client.models.generateContent({
        model, contents,
        config: { ...config, ...(systemInstruction ? { systemInstruction } : {}) },
      });
      const text = response.text ?? "";
      const pTokens = response.usageMetadata?.promptTokenCount ?? 0;
      const cTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      const json = {
        id: `chatcmpl-${Date.now()}`, object: "chat.completion",
        created: Math.floor(Date.now() / 1000), model,
        choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
        usage: { prompt_tokens: pTokens, completion_tokens: cTokens, total_tokens: pTokens + cTokens },
      };
      return fakeStreamResponse(res, json as unknown as Record<string, unknown>, startTime);
    }
  } else {
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        ...config,
        ...(systemInstruction ? { systemInstruction } : {}),
      },
    });

    const text = response.text ?? "";
    const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    });
    return { promptTokens, completionTokens };
  }
}

async function handleClaude({
  req, res, client, model, messages, stream, maxTokens, thinking = false, tools, toolChoice, startTime,
}: {
  req: Request;
  res: Response;
  client: Anthropic;
  model: string;
  messages: OAIMessage[];
  stream: boolean;
  maxTokens: number;
  thinking?: boolean;
  tools?: OAITool[];
  toolChoice?: unknown;
  startTime: number;
}): Promise<{ promptTokens: number; completionTokens: number; ttftMs?: number }> {
  const THINKING_BUDGET = 16000;

  const systemMessages = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : (m.content as OAIContentPart[]).map((p) => (p.type === "text" ? (p as { type: "text"; text: string }).text : "")).join("")))
    .join("\n")
    .trim();

  const chatMessages = convertMessagesForClaude(messages);

  const thinkingParam = thinking
    ? { thinking: { type: "enabled" as const, budget_tokens: THINKING_BUDGET } }
    : {};

  const anthropicTools = tools?.length ? convertToolsForClaude(tools) : undefined;
  let anthropicToolChoice: unknown;
  if (toolChoice !== undefined && anthropicTools?.length) {
    if (toolChoice === "auto") anthropicToolChoice = { type: "auto" };
    else if (toolChoice === "none") anthropicToolChoice = { type: "none" };
    else if (toolChoice === "required") anthropicToolChoice = { type: "any" };
    else if (typeof toolChoice === "object" && (toolChoice as Record<string, unknown>).type === "function") {
      anthropicToolChoice = { type: "tool", name: ((toolChoice as Record<string, unknown>).function as Record<string, unknown>).name };
    }
  }

  const buildCreateParams = () => ({
    model,
    max_tokens: maxTokens,
    ...(systemMessages ? { system: systemMessages } : {}),
    ...thinkingParam,
    messages: chatMessages,
    ...(anthropicTools?.length ? { tools: anthropicTools } : {}),
    ...(anthropicToolChoice ? { tool_choice: anthropicToolChoice } : {}),
  });

  const msgId = `msg_${Date.now()}`;

  if (stream) {
    let keepalive: ReturnType<typeof setInterval> | undefined;

    try {
      setSseHeaders(res);
      writeAndFlush(res, ": ok\n\n");
      keepalive = setInterval(() => { if (!res.writableEnded) writeAndFlush(res, ": keepalive\n\n"); }, 15_000);
      req.on("close", () => { if (keepalive) clearInterval(keepalive); });

      const claudeStream = client.messages.stream(buildCreateParams() as Parameters<typeof client.messages.stream>[0]);

      let inputTokens = 0;
      let outputTokens = 0;
      let thinkingStarted = false;
      let ttftMs: number | undefined;
      let currentToolIndex = -1;
      const toolIndexMap = new Map<number, number>();
      let toolCallCount = 0;

      const created = Math.floor(Date.now() / 1000);
      const chunkPrefix = { id: msgId, object: "chat.completion.chunk" as const, created, model };
      const emitDelta = (delta: Record<string, unknown>, extra?: Record<string, unknown>) => {
        writeAndFlush(res, `data: ${JSON.stringify({ ...chunkPrefix, choices: [{ index: 0, delta, finish_reason: null }], ...extra })}\n\n`);
      };

      for await (const event of claudeStream) {
        if (event.type === "message_start") {
          inputTokens = event.message.usage.input_tokens;
          emitDelta({ role: "assistant", content: "" });

        } else if (event.type === "content_block_start") {
          const block = event.content_block;

          if (block.type === "thinking") {
            if (!thinkingStarted) {
              thinkingStarted = true;
              emitDelta({ content: "<thinking>\n" });
            }
          } else if (block.type === "tool_use") {
            if (thinkingStarted) { emitDelta({ content: "\n</thinking>\n\n" }); thinkingStarted = false; }
            currentToolIndex = toolCallCount++;
            toolIndexMap.set(event.index, currentToolIndex);
            if (ttftMs === undefined) ttftMs = Date.now() - startTime;
            emitDelta({ tool_calls: [{ index: currentToolIndex, id: block.id, type: "function", function: { name: block.name, arguments: "" } }] });
          } else if (block.type === "text") {
            if (thinkingStarted) { emitDelta({ content: "\n</thinking>\n\n" }); thinkingStarted = false; }
          }

        } else if (event.type === "content_block_delta") {
          const delta = event.delta;

          if (delta.type === "thinking_delta") {
            const cleaned = delta.thinking.replace(/<\/?think>/g, "");
            if (cleaned) emitDelta({ content: cleaned });
          } else if (delta.type === "text_delta") {
            if (ttftMs === undefined) ttftMs = Date.now() - startTime;
            emitDelta({ content: delta.text });
          } else if (delta.type === "input_json_delta") {
            const toolIdx = toolIndexMap.get(event.index) ?? currentToolIndex;
            emitDelta({ tool_calls: [{ index: toolIdx, function: { arguments: delta.partial_json } }] });
          }

        } else if (event.type === "message_delta") {
          outputTokens = event.usage.output_tokens;
          const stopReason = event.delta.stop_reason;
          const finishReason = stopReason === "tool_use" ? "tool_calls" : (stopReason ?? "stop");
          writeAndFlush(res, `data: ${JSON.stringify({ ...chunkPrefix, choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } })}\n\n`);
        }
      }

      writeAndFlush(res, "data: [DONE]\n\n");
      res.end();
      return { promptTokens: inputTokens, completionTokens: outputTokens, ttftMs };
    } finally {
      if (keepalive) clearInterval(keepalive);
    }

  } else {
    let result: Anthropic.Message;
    try {
      result = await client.messages.create(buildCreateParams() as Parameters<typeof client.messages.create>[0]) as Anthropic.Message;
    } catch (nonStreamErr: unknown) {
      const errMsg = nonStreamErr instanceof Error ? nonStreamErr.message : String(nonStreamErr);
      if (/streaming.*required|requires.*stream/i.test(errMsg)) {
        req.log.warn("Claude model requires streaming — upgrading to stream+collect for non-stream request");
        const claudeStream = client.messages.stream(buildCreateParams() as Parameters<typeof client.messages.stream>[0]);
        const collected = await claudeStream.finalMessage();
        result = collected;
      } else {
        throw nonStreamErr;
      }
    }

    const textParts: string[] = [];
    const toolCalls: OAIToolCall[] = [];

    for (const block of result.content) {
      if (block.type === "thinking") {
        const rawThinking = (block as { type: "thinking"; thinking: string }).thinking.replace(/<\/?think>/g, "");
        textParts.push(`<thinking>\n${rawThinking}\n</thinking>`);
      } else if (block.type === "text") {
        textParts.push((block as { type: "text"; text: string }).text);
      } else if (block.type === "tool_use") {
        const toolBlock = block as { type: "tool_use"; id: string; name: string; input: unknown };
        toolCalls.push({
          id: toolBlock.id,
          type: "function",
          function: {
            name: toolBlock.name,
            arguments: JSON.stringify(toolBlock.input),
          },
        });
      }
    }

    const text = textParts.join("\n\n");
    const stopReason = result.stop_reason;
    const finishReason = stopReason === "tool_use" ? "tool_calls" : (stopReason ?? "stop");

    res.json({
      id: result.id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: text || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason,
      }],
      usage: {
        prompt_tokens: result.usage.input_tokens,
        completion_tokens: result.usage.output_tokens,
        total_tokens: result.usage.input_tokens + result.usage.output_tokens,
      },
    });
    return { promptTokens: result.usage.input_tokens, completionTokens: result.usage.output_tokens };
  }
}

export default router;
