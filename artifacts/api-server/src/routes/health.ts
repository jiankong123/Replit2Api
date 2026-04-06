import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/setup-status", (_req, res) => {
  const configured = !!process.env.PROXY_API_KEY;
  const integrationsReady =
    !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY &&
    !!process.env.AI_INTEGRATIONS_OPENAI_BASE_URL &&
    !!process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY &&
    !!process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  res.json({ configured, integrationsReady });
});

export default router;
