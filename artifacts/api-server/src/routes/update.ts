import { Router, type IRouter, type Request, type Response } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  readFileSync, writeFileSync, existsSync,
  readdirSync, statSync, mkdirSync,
} from "fs";
import { resolve, join, dirname, relative } from "path";

const router: IRouter = Router();
const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// 工作区根路径（monorepo 根）
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "../../");

// ---------------------------------------------------------------------------
// GitHub 配置
// 子节点设置 UPDATE_CHECK_URL 为 GITHUB_RAW_VERSION_URL 即可启用 GitHub 更新
// ---------------------------------------------------------------------------

const GITHUB_OWNER = "Akatsuki03";
const GITHUB_REPO  = "Replit2Api";
const GITHUB_BRANCH = "main";
const GITHUB_API  = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const GITHUB_RAW_VERSION_URL =
  `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/version.json`;

function githubHeaders(withToken = true): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Replit2Api-Updater",
  };
  const tok = process.env.GITHUB_TOKEN;
  if (withToken && tok) h.Authorization = `token ${tok}`;
  return h;
}

// ---------------------------------------------------------------------------
// 版本信息
// ---------------------------------------------------------------------------

interface VersionInfo {
  version: string;
  name?: string;
  releaseDate?: string;
  releaseNotes?: string;
}

function readLocalVersion(): VersionInfo {
  const candidates = [
    resolve(process.cwd(), "version.json"),
    resolve(WORKSPACE_ROOT, "version.json"),
  ];
  for (const p of candidates) {
    try {
      if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")) as VersionInfo;
    } catch {}
  }
  return { version: "unknown" };
}

// 解析版本号，支持 v1.2.3、v1.2.3α、v1.2.3-beta、v1.2.3rc1 等格式
// 返回 { nums: 数字段[], pre: 预发布后缀（空字符串表示正式版）}
function parseVersion(v: string): { nums: number[]; pre: string } {
  const clean = v.replace(/^v/i, "").trim();
  // 匹配数字部分（允许多段）和可选的预发布后缀
  const match = clean.match(/^([\d]+(?:\.[\d]+)*)(.*)$/);
  if (!match) return { nums: [0], pre: "" };
  const nums = match[1].split(".").map((n) => parseInt(n, 10) || 0);
  const pre  = match[2].trim(); // α β rc1 -alpha 等
  return { nums, pre };
}

function isNewer(remote: string, local: string): boolean {
  const r = parseVersion(remote);
  const l = parseVersion(local);
  const len = Math.max(r.nums.length, l.nums.length);

  // 先按数字段比较
  for (let i = 0; i < len; i++) {
    if ((r.nums[i] ?? 0) > (l.nums[i] ?? 0)) return true;
    if ((r.nums[i] ?? 0) < (l.nums[i] ?? 0)) return false;
  }

  // 数字段完全相同时，正式版 > 预发布版
  // remote 无后缀（正式版）而 local 有后缀（预发布）→ 有更新
  if (!r.pre && l.pre) return true;
  // remote 有后缀而 local 无后缀 → local 反而更新，无需升级
  if (r.pre && !l.pre) return false;

  // 两者都有后缀：按字符串字典序比较（rc2 > rc1 > beta > alpha > α）
  if (r.pre && l.pre) return r.pre > l.pre;

  return false;
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function checkApiKey(req: Request, res: Response): boolean {
  const proxyKey = process.env.PROXY_API_KEY;
  if (!proxyKey) {
    res.status(500).json({ error: "Server API key not configured" });
    return false;
  }
  const authHeader = req.headers["authorization"];
  const xApiKey = req.headers["x-api-key"];
  let provided: string | undefined;
  if (authHeader?.startsWith("Bearer ")) provided = authHeader.slice(7);
  else if (typeof xApiKey === "string") provided = xApiKey;
  if (!provided || provided !== proxyKey) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// 文件扫描：收集所有源文件内容（用于 bundle 和 GitHub 推送）
// ---------------------------------------------------------------------------

const BUNDLE_INCLUDE_DIRS = [
  "artifacts/api-server/src",
  "artifacts/api-portal/src",
];

const BUNDLE_INCLUDE_FILES = [
  "version.json",
  "artifacts/api-portal/index.html",
  "artifacts/api-server/build.mjs",
  "artifacts/api-portal/package.json",
  "artifacts/api-portal/tsconfig.json",
  "artifacts/api-portal/vite.config.ts",
  "artifacts/api-portal/components.json",
  "artifacts/api-server/package.json",
  "artifacts/api-server/tsconfig.json",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "tsconfig.base.json",
  ".npmrc",
  ".replitignore",
  "README.md",
];

const BUNDLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".css", ".html", ".md", ".yaml", ".yml"]);
const BUNDLE_EXCLUDE    = new Set(["node_modules", "dist", ".git", ".cache"]);

function scanDir(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  if (!existsSync(dir)) return files;
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (BUNDLE_EXCLUDE.has(entry)) continue;
      const full = join(current, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        const ext = entry.slice(entry.lastIndexOf("."));
        if (BUNDLE_EXTENSIONS.has(ext)) {
          const rel = relative(WORKSPACE_ROOT, full);
          try { files[rel] = readFileSync(full, "utf8"); } catch {}
        }
      }
    }
  };
  walk(dir);
  return files;
}

function buildBundle(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const dir of BUNDLE_INCLUDE_DIRS) {
    Object.assign(files, scanDir(join(WORKSPACE_ROOT, dir)));
  }
  for (const rel of BUNDLE_INCLUDE_FILES) {
    const full = join(WORKSPACE_ROOT, rel);
    try {
      if (existsSync(full)) files[rel] = readFileSync(full, "utf8");
    } catch {}
  }
  return files;
}


// ---------------------------------------------------------------------------
// GitHub: 从 GitHub 下载最新文件并应用到本地
// 使用 GitHub Git Trees API（公开仓库无需 token，有 token 则提升速率限制）
// ---------------------------------------------------------------------------

async function applyFromGitHub(): Promise<{ written: number }> {
  // 获取完整文件树
  const treeRes = await fetch(`${GITHUB_API}/git/trees/${GITHUB_BRANCH}?recursive=1`, {
    headers: githubHeaders(),
  });
  if (!treeRes.ok) throw new Error(`获取 GitHub tree 失败: HTTP ${treeRes.status}`);
  const treeData = await treeRes.json() as {
    tree: { path: string; type: string; sha: string; url: string }[];
  };

  // 过滤出 bundle 需要的文件
  const bundleFilesSet = new Set(BUNDLE_INCLUDE_FILES);
  const filesToFetch = treeData.tree.filter((item) => {
    if (item.type !== "blob") return false;
    if (bundleFilesSet.has(item.path)) return true;
    return BUNDLE_INCLUDE_DIRS.some((dir) => item.path.startsWith(dir + "/"));
  });

  let written = 0;
  for (const file of filesToFetch) {
    try {
      // 用 Contents API 直接获取 base64 内容
      const r = await fetch(`${GITHUB_API}/contents/${file.path}?ref=${GITHUB_BRANCH}`, {
        headers: githubHeaders(),
      });
      if (!r.ok) { console.warn(`[apply-github] 跳过 ${file.path}: HTTP ${r.status}`); continue; }
      const data = await r.json() as { content: string };
      const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
      const fullPath = join(WORKSPACE_ROOT, file.path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, content, "utf8");
      written++;
    } catch (e) {
      console.warn(`[apply-github] 写入失败 ${file.path}:`, e);
    }
  }
  return { written };
}

// ---------------------------------------------------------------------------
// 检测 UPDATE_CHECK_URL 是否指向 GitHub
// ---------------------------------------------------------------------------

function isGitHubCheckUrl(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes("raw.githubusercontent.com") || url.includes("github.com");
}

// ---------------------------------------------------------------------------
// GET /update/version — 本地版本 + 可选远端检测
// ---------------------------------------------------------------------------

router.get("/update/version", async (_req: Request, res: Response) => {
  const local = readLocalVersion();
  // 优先使用环境变量，否则默认使用官方 GitHub 仓库
  const checkUrl = process.env.UPDATE_CHECK_URL || GITHUB_RAW_VERSION_URL;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(checkUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const remote = (await r.json()) as VersionInfo;
    const hasUpdate = isNewer(remote.version, local.version);
    res.json({
      ...local,
      hasUpdate,
      latestVersion: remote.version,
      latestReleaseNotes: remote.releaseNotes,
      latestReleaseDate: remote.releaseDate,
      source: isGitHubCheckUrl(checkUrl) ? "github" : "replit",
    });
  } catch (err) {
    res.json({ ...local, hasUpdate: false, checkError: err instanceof Error ? err.message : "检测失败" });
  }
});

// ---------------------------------------------------------------------------
// GET /update/bundle — 公开端点，返回 JSON 格式文件包（兼容旧版 Replit 更新）
// ---------------------------------------------------------------------------

router.get("/update/bundle", (_req: Request, res: Response) => {
  try {
    const local = readLocalVersion();
    const files = buildBundle();
    res.json({ version: local.version, releaseNotes: local.releaseNotes, fileCount: Object.keys(files).length, files });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "打包失败" });
  }
});

// ---------------------------------------------------------------------------
// POST /update/apply — 受保护：从 GitHub 或上游 Replit 拉取更新并重启
// 若 UPDATE_CHECK_URL 指向 GitHub raw → 从 GitHub 拉取
// 否则 → 沿用旧版 Replit bundle 模式
// ---------------------------------------------------------------------------

let updateInProgress = false;

router.post("/update/apply", async (req: Request, res: Response) => {
  if (!checkApiKey(req, res)) return;
  if (updateInProgress) {
    res.status(409).json({ error: "更新正在进行中，请稍候" });
    return;
  }

  const checkUrl = process.env.UPDATE_CHECK_URL;
  // 默认始终使用 GitHub 模式；若设置了非 GitHub 的 UPDATE_CHECK_URL 则用旧版 bundle 模式
  const useGitHub = !checkUrl || isGitHubCheckUrl(checkUrl) || process.env.GITHUB_APPLY === "true";

  res.json({
    status: "started",
    source: useGitHub ? "github" : "replit",
    message: useGitHub
      ? "正在从 GitHub 拉取最新代码，完成后服务器将自动重启（约 30-60 秒）…"
      : "正在从上游 Replit 实例下载更新包，完成后服务器将自动重启（约 30 秒）…",
  });
  updateInProgress = true;

  (async () => {
    try {
      if (useGitHub) {
        // GitHub 模式（默认）
        const { written } = await applyFromGitHub();
        console.log(`[update] 从 GitHub 写入 ${written} 个文件`);
      } else {
        // 旧版 Replit bundle 模式
        const bundleUrl = checkUrl!.replace(/\/update\/version$/, "/update/bundle");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        const r = await fetch(bundleUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (!r.ok) throw new Error(`下载失败 HTTP ${r.status}`);
        const bundle = (await r.json()) as { version: string; files: Record<string, string> };
        for (const [relPath, content] of Object.entries(bundle.files)) {
          const fullPath = join(WORKSPACE_ROOT, relPath);
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content, "utf8");
        }
        console.log(`[update] 从 Replit bundle 写入 ${Object.keys(bundle.files).length} 个文件`);
      }

      // 安装依赖
      await execFileAsync("pnpm", ["install", "--no-frozen-lockfile"], { cwd: WORKSPACE_ROOT });

      // 退出 → Workflow 自动重启
      setTimeout(() => process.exit(0), 500);
    } catch (err) {
      updateInProgress = false;
      console.error("[update] 更新失败:", err instanceof Error ? err.message : err);
    }
  })();
});

// ---------------------------------------------------------------------------
// GET /update/status
// ---------------------------------------------------------------------------

router.get("/update/status", (_req: Request, res: Response) => {
  res.json({
    inProgress: updateInProgress,
    githubRepo: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`,
    githubRawVersionUrl: GITHUB_RAW_VERSION_URL,
  });
});

export default router;
