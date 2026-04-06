import { useState, useEffect, useCallback } from "react";

const GITHUB_URL = "https://github.com/Akatsuki03/Replit2Api";

const UPDATE_PROMPT = `请帮我将 AI Proxy Gateway 更新到最新版本：
从 GitHub 仓库 ${GITHUB_URL} 拉取 main 分支的最新代码，运行 pnpm install，然后重启 "API Server" 工作流。`;

interface VersionInfo {
  version: string;
  name?: string;
  releaseNotes?: string;
  hasUpdate: boolean;
  latestVersion?: string;
  latestReleaseNotes?: string;
  latestReleaseDate?: string;
  checkError?: string;
}

interface Props {
  baseUrl: string;
  apiKey: string;
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div style={{
      background: "rgba(0,0,0,0.35)", border: "1px solid rgba(99,102,241,0.3)",
      borderRadius: "8px", padding: "12px 14px", marginTop: "4px",
    }}>
      <pre style={{
        margin: "0 0 10px 0", color: "#a5b4fc", fontSize: "12.5px",
        fontFamily: "Menlo, monospace", lineHeight: "1.6",
        whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>{text}</pre>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "11.5px", color: "#818cf8", textDecoration: "none" }}
        >
          📦 {GITHUB_URL}
        </a>
        <button
          onClick={copy}
          style={{
            marginLeft: "auto", padding: "4px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
            border: `1px solid ${copied ? "rgba(74,222,128,0.4)" : "rgba(99,102,241,0.4)"}`,
            background: copied ? "rgba(74,222,128,0.12)" : "rgba(99,102,241,0.15)",
            color: copied ? "#4ade80" : "#818cf8", cursor: "pointer", transition: "all 0.2s",
          }}
        >
          {copied ? "已复制 ✓" : "复制指令"}
        </button>
      </div>
    </div>
  );
}

export default function UpdateBadge({ baseUrl, apiKey: _apiKey }: Props) {
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [open, setOpen] = useState(false);

  const fetchVersion = useCallback(async () => {
    try {
      const r = await fetch(`${baseUrl}/api/update/version`);
      if (r.ok) setInfo(await r.json());
    } catch {}
  }, [baseUrl]);

  useEffect(() => {
    fetchVersion();
    const t = setInterval(fetchVersion, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [fetchVersion]);

  if (!info) return null;

  const hasUpdate = info.hasUpdate;

  return (
    <>
      {/* 版本徽标 */}
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex", alignItems: "center", gap: "5px",
          padding: "3px 10px", borderRadius: "12px", fontFamily: "Menlo, monospace",
          border: `1px solid ${hasUpdate ? "rgba(251,191,36,0.45)" : "rgba(255,255,255,0.1)"}`,
          background: hasUpdate ? "rgba(251,191,36,0.1)" : "rgba(255,255,255,0.05)",
          color: hasUpdate ? "#fbbf24" : "#475569",
          fontSize: "11.5px", fontWeight: 600, cursor: "pointer", transition: "all 0.2s",
        }}
      >
        {hasUpdate && (
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            background: "#fbbf24", flexShrink: 0, animation: "pulse 2s ease-in-out infinite",
          }} />
        )}
        v{info.version}
        {hasUpdate && <span style={{ fontSize: "10px" }}>↑ {info.latestVersion}</span>}
      </button>

      {/* 详情弹窗 */}
      {open && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center",
            padding: "24px", backdropFilter: "blur(6px)",
          }}
        >
          <div style={{
            background: "hsl(222,47%,12%)", border: "1px solid rgba(99,102,241,0.25)",
            borderRadius: "16px", width: "100%", maxWidth: "500px",
            padding: "24px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          }}>
            {/* 标题 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div>
                <div style={{ fontWeight: 700, color: "#f1f5f9", fontSize: "15px" }}>AI 网关 版本信息</div>
                <div style={{ color: "#475569", fontSize: "12px", marginTop: "2px" }}>
                  当前版本 <span style={{ color: "#a5b4fc", fontFamily: "Menlo, monospace" }}>v{info.version}</span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: "none", border: "none", color: "#334155", fontSize: "22px", cursor: "pointer" }}
              >×</button>
            </div>

            {/* 当前版本说明 */}
            {info.releaseNotes && (
              <div style={{
                background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.18)",
                borderRadius: "10px", padding: "12px 14px", marginBottom: "16px",
              }}>
                <div style={{ color: "#818cf8", fontSize: "11px", fontWeight: 700, marginBottom: "6px" }}>当前版本说明</div>
                <div style={{ color: "#94a3b8", fontSize: "13px", lineHeight: "1.6" }}>{info.releaseNotes}</div>
              </div>
            )}

            {info.checkError && !hasUpdate && (
              <div style={{
                background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)",
                borderRadius: "10px", padding: "12px 14px", marginBottom: "16px",
                color: "#f87171", fontSize: "12.5px",
              }}>
                版本检测失败：{info.checkError}
              </div>
            )}

            {/* 新版本信息 + 更新指令 */}
            {hasUpdate && (
              <div style={{
                background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)",
                borderRadius: "10px", padding: "14px", marginBottom: "16px",
              }}>
                <div style={{ color: "#fbbf24", fontSize: "12px", fontWeight: 700, marginBottom: "6px" }}>
                  发现新版本 v{info.latestVersion}
                  {info.latestReleaseDate && (
                    <span style={{ fontWeight: 400, color: "#92400e", marginLeft: "8px" }}>{info.latestReleaseDate}</span>
                  )}
                </div>
                {info.latestReleaseNotes && (
                  <div style={{ color: "#94a3b8", fontSize: "12.5px", lineHeight: "1.6", marginBottom: "12px" }}>
                    {info.latestReleaseNotes}
                  </div>
                )}
                <div style={{ color: "#64748b", fontSize: "11.5px", marginBottom: "8px" }}>
                  将下方指令复制发给 Replit Agent，由 Agent 拉取最新代码并重启服务器：
                </div>
                <CopyBlock text={UPDATE_PROMPT} />
              </div>
            )}

            {/* 底部按钮 */}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => { fetchVersion(); }}
                style={{
                  padding: "8px 16px", borderRadius: "8px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#475569", fontSize: "13px", cursor: "pointer",
                }}
              >
                重新检测
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  padding: "8px 16px", borderRadius: "8px",
                  border: "1px solid rgba(99,102,241,0.25)",
                  background: "rgba(99,102,241,0.08)",
                  color: "#818cf8", fontSize: "13px", cursor: "pointer",
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
    </>
  );
}
