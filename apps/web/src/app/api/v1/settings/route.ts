import "server-only";

import { z } from "zod";
import { getDatabaseClient } from "@aios/data";
import { domainSuccess, getDomainServiceContext, withDomainApi } from "@/lib/api/domain-service";

const integrationStatusSchema = z.strictObject({
  workspace: z.strictObject({
    ownerEmail: z.string(),
    ownerName: z.string(),
    environment: z.string(),
    authMode: z.string(),
    database: z.string(),
    agentRuntime: z.string(),
    rateLimitBackend: z.string(),
  }),
  integrations: z.array(z.strictObject({
    id: z.string(),
    label: z.string(),
    group: z.string(),
    configured: z.boolean(),
    envVars: z.array(z.string()),
    effect: z.string(),
  })),
  generatedAt: z.string(),
});

export type SettingsDto = z.infer<typeof integrationStatusSchema>;

const noopMap = (error: unknown): unknown => error;

export const GET = withDomainApi(noopMap, async (_request, context) => {
  const services = await getDomainServiceContext(context, () => undefined);
  const database = getDatabaseClient();
  const owner = await database.ownerAccount.findFirst({ where: { active: true }, select: { email: true } });

  const has = (name: string) => Boolean(process.env[name]);
  const runtime = getAgentRuntimeStatus();

  const integrations = [
    {
      id: "openai",
      label: "OpenAI",
      group: "AI models",
      configured: has("AIOS_OPENAI_API_KEY"),
      envVars: ["AIOS_OPENAI_API_KEY"],
      effect: "Live agent and chatbot completions. Without it, runs use the clearly-labeled local simulation.",
    },
    {
      id: "anthropic",
      label: "Anthropic",
      group: "AI models",
      configured: has("AIOS_ANTHROPIC_API_KEY"),
      envVars: ["AIOS_ANTHROPIC_API_KEY"],
      effect: "Adds Claude models to the agent model catalog.",
    },
    {
      id: "stripe",
      label: "Stripe",
      group: "Payments",
      configured: has("STRIPE_SECRET_KEY"),
      envVars: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
      effect: "Hosted invoice payment pages and webhook reconciliation. Payments can still be recorded manually.",
    },
    {
      id: "email",
      label: "Email delivery",
      group: "Outreach",
      configured: has("SMTP_URL") || has("SENDGRID_API_KEY") || has("RESEND_API_KEY"),
      envVars: ["SMTP_URL", "SENDGRID_API_KEY", "RESEND_API_KEY"],
      effect: "Sends approved outreach sequences. Sequences remain draft/approval-only until configured.",
    },
    {
      id: "publishing",
      label: "Social & blog publishing",
      group: "Content",
      configured: has("LINKEDIN_ACCESS_TOKEN") || has("X_ACCESS_TOKEN") || has("WORDPRESS_URL"),
      envVars: ["LINKEDIN_ACCESS_TOKEN", "X_ACCESS_TOKEN", "WORDPRESS_URL"],
      effect: "Auto-publishes scheduled content. Publishing can be done manually and recorded locally.",
    },
    {
      id: "n8n",
      label: "n8n / Make",
      group: "Automations",
      configured: has("N8N_BASE_URL") || has("MAKE_API_KEY"),
      envVars: ["N8N_BASE_URL", "MAKE_API_KEY", "WORKFLOW_SIGNING_SECRET"],
      effect: "Deploys and monitors real provider workflows. Blueprints, validation, tests, and the execution-event webhook already work.",
    },
    {
      id: "channels",
      label: "WhatsApp / Instagram",
      group: "Chatbot channels",
      configured: has("TWILIO_AUTH_TOKEN") || has("INSTAGRAM_ACCESS_TOKEN"),
      envVars: ["TWILIO_AUTH_TOKEN", "INSTAGRAM_ACCESS_TOKEN"],
      effect: "Adds messaging channels to deployed chatbots. The website widget and custom API work without them.",
    },
    {
      id: "email_ingest",
      label: "Gmail ingestion",
      group: "Communications",
      configured: has("GOOGLE_GMAIL_CLIENT_ID") && has("GOOGLE_GMAIL_CLIENT_SECRET"),
      envVars: ["GOOGLE_GMAIL_CLIENT_ID", "GOOGLE_GMAIL_CLIENT_SECRET"],
      effect: "Ingests client email replies into the communication timeline.",
    },
    {
      id: "realtime",
      label: "Realtime updates",
      group: "Platform",
      configured: has("AIOS_REALTIME_ENABLED") && process.env.AIOS_REALTIME_ENABLED === "true",
      envVars: ["AIOS_REALTIME_ENABLED"],
      effect: "Live graph and agent status broadcasts. Durable outbox events queue regardless and replay when enabled.",
    },
  ];

  const data = integrationStatusSchema.parse({
    workspace: {
      ownerEmail: owner?.email ?? services.identity.ownerSubject,
      ownerName: process.env.AIOS_OWNER_DISPLAY_NAME ?? "Agency Owner",
      environment: process.env.AIOS_ENVIRONMENT ?? "local",
      authMode: process.env.AIOS_AUTH_BYPASS === "development-shell" && process.env.NODE_ENV !== "production"
        ? "development bypass (never active in production)"
        : "Supabase session",
      database: "connected",
      agentRuntime: runtime,
      rateLimitBackend: process.env.AIOS_RATE_LIMIT_BACKEND === "upstash" ? "Upstash Redis" : "in-memory (local only)",
    },
    integrations,
    generatedAt: new Date().toISOString(),
  });

  return domainSuccess(data, context.requestId);
});

export const OPTIONS = GET;

function getAgentRuntimeStatus(): string {
  if (process.env.AIOS_AGENT_RUNTIME_DISABLED === "true") return "disabled";
  return "in-process queue + scheduler";
}
