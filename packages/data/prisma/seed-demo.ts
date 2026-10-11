import "dotenv/config";
/**
 * Demo data seeder: populates a coherent, clearly-labeled demo agency so a
 * fresh clone demonstrates every module without any external credentials.
 * Idempotent: skips domains that already have data.
 *
 * Run: npm run db:seed:demo
 */
import { randomUUID } from "node:crypto";
import { getDatabaseClient } from "../src/index";
import { embedTextLocal, LOCAL_EMBEDDING_MODEL } from "../src/knowledge/local-embeddings";

const prisma = getDatabaseClient();

const DEMO_TAG = "[Demo]";

async function main(): Promise<void> {
  const owner = await prisma.ownerAccount.findFirst({ where: { active: true } });
  if (!owner) throw new Error("Run npm run db:bootstrap-owner first.");

  const existingClient = await prisma.client.findFirst({ where: { name: { startsWith: DEMO_TAG }, deletedAt: null } });
  if (existingClient) {
    console.log("Demo data already present - skipping (idempotent).");
    return;
  }

  console.log("Seeding demo agency data...");

  // ── Client ──
  const client = await prisma.client.create({
    data: {
      id: randomUUID(),
      name: `${DEMO_TAG} Harbor & Main Coffee`,
      industry: "Hospitality",
      status: "ACTIVE",
      contactName: "Dana Whitfield",
      contactEmail: "dana@harbormain.demo",
      mrr: 1800,
      totalRevenue: 5400,
      startDate: new Date("2026-06-01"),
      notes: "Demo client: two-location specialty coffee roaster expanding online orders.",
    },
  });

  await prisma.contact.create({
    data: { id: randomUUID(), clientId: client.id, name: "Dana Whitfield", email: "dana@harbormain.demo", isPrimary: true },
  });

  // ── Agent with run history ──
  const agent = await prisma.agent.create({
    data: {
      id: randomUUID(),
      name: `${DEMO_TAG} Retention Analyst`,
      description: "Analyzes client delivery and suggests retention plays.",
      type: "ANALYST",
      status: "IDLE",
      model: "gpt-4o-mini",
      systemPrompt: "You analyze agency delivery data and recommend one concrete retention action per client.",
      temperature: 0.6,
      maxTokens: 2048,
      dailyTokenBudget: 100_000,
    },
  });
  const agentVersion = await prisma.agentConfigVersion.create({
    data: {
      agentId: agent.id,
      version: 1,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      temperature: agent.temperature,
      maxTokens: agent.maxTokens,
      topP: agent.topP,
      frequencyPenalty: agent.frequencyPenalty,
      tools: [],
      changeSummary: "Initial demo configuration",
      createdBy: owner.authSubject,
    },
  });
  await prisma.agent.update({ where: { id: agent.id }, data: { currentConfigVersionId: agentVersion.id } });

  const runInput = "Review this week's delivery and recommend one retention action.";
  const runOutput = "Recommendation: schedule a mid-month check-in with Harbor & Main - their online orders grew 18% week over week, and a proactive training offer would lock in the retainer renewal.";
  await prisma.agentRun.create({
    data: {
      id: randomUUID(),
      agentId: agent.id,
      configVersionId: agentVersion.id,
      status: "SUCCESS",
      triggerType: "MANUAL",
      inputText: runInput,
      outputText: runOutput,
      tokensInput: 210,
      tokensOutput: 96,
      costUsd: 0.00014,
      durationMs: 1400,
      startedAt: new Date(Date.now() - 3_600_000),
      completedAt: new Date(Date.now() - 3_598_600),
      metadata: { provider: "simulated", simulated: true, model: "gpt-4o-mini" },
    },
  });
  await prisma.agent.update({
    where: { id: agent.id },
    data: { totalRuns: 1, successRate: 100, totalCostUsd: 0.00014, lastRunAt: new Date(Date.now() - 3_598_600), lastRunStatus: "SUCCESS" },
  });
  await prisma.costLedgerEntry.create({
    data: {
      id: randomUUID(),
      agentId: agent.id,
      clientId: client.id,
      entryType: "EXPENSE",
      category: "ai_usage",
      amount: 0.00014,
      occurredAt: new Date(),
      sourceType: "agent_run",
      description: "Demo retention analysis run",
    },
  });
  await prisma.agentMemory.create({
    data: {
      id: randomUUID(),
      agentId: agent.id,
      clientId: client.id,
      kind: "KEY_VALUE",
      key: "retention_style",
      value: "Harbor & Main responds well to proactive, data-backed suggestions framed around growth.",
      sourceIds: [],
    },
  });

  // ── CRM lead + proposal ──
  const lead = await prisma.crmLead.create({
    data: {
      id: randomUUID(),
      name: "Bloom & Co Florists",
      email: "hello@bloomco.demo",
      company: "Bloom & Co Florists",
      source: "Referral",
      interest: "Wants automated order-status updates and review responses.",
      value: 14_400,
      expectedCloseProbability: 0.6,
      stage: "QUALIFIED",
    },
  });
  await prisma.crmLeadStageHistory.create({
    data: { crmLeadId: lead.id, fromStage: "NEW", toStage: "QUALIFIED", reason: "Discovery call completed", changedBy: owner.authSubject },
  });

  // ── Invoice + payment ──
  const invoice = await prisma.invoice.create({
    data: {
      id: randomUUID(),
      clientId: client.id,
      type: "RECURRING",
      status: "PAID",
      amount: 1800,
      currency: "USD",
      dueDate: new Date(Date.now() + 14 * 86_400_000),
      paidAt: new Date(Date.now() - 86_400_000),
      sentAt: new Date(Date.now() - 3 * 86_400_000),
      notes: "Demo retainer invoice",
      lineItems: [{ serviceType: "Automation retainer", quantity: 1, rate: 1800, amount: 1800 }],
    },
  });
  await prisma.invoiceLineItem.create({
    data: { id: randomUUID(), invoiceId: invoice.id, position: 1, serviceType: "Automation retainer", quantity: 1, rate: 1800, amount: 1800 },
  });
  await prisma.payment.create({
    data: {
      id: randomUUID(),
      invoiceId: invoice.id,
      clientId: client.id,
      status: "SUCCEEDED",
      amount: 1800,
      currency: "USD",
      paidAt: new Date(Date.now() - 86_400_000),
    },
  });
  await prisma.expense.create({
    data: {
      id: randomUUID(),
      clientId: client.id,
      category: "TOOL_SUBSCRIPTION",
      vendor: "Design tool",
      amount: 42,
      currency: "USD",
      expenseDate: new Date(),
      notes: "Demo tool subscription",
    },
  });

  // ── Knowledge with local embeddings ──
  const knowledgeSeeds = [
    {
      title: `${DEMO_TAG} Client onboarding checklist`,
      category: "SOP" as const,
      content: "1. Send the welcome pack.\n2. Create the shared channel.\n3. Book the kickoff.\n4. Log the first-week goals in the client workspace.",
      tags: ["onboarding", "process"],
    },
    {
      title: `${DEMO_TAG} Pricing guardrails`,
      category: "DECISION" as const,
      content: "Retainers start at $1,800/month. One-time automation builds start at $4,500. Never discount below 90% without owner approval.",
      tags: ["pricing", "sales"],
    },
    {
      title: `${DEMO_TAG} Escalation lesson`,
      category: "LESSON" as const,
      content: "When a chatbot answer falls below the confidence threshold, escalate to a human instead of improvising. Grounded answers produced zero complaints in testing.",
      tags: ["chatbots", "quality"],
    },
  ];
  for (const seed of knowledgeSeeds) {
    const entry = await prisma.knowledgeEntry.create({
      data: {
        id: randomUUID(),
        clientId: client.id,
        title: seed.title,
        category: seed.category,
        content: seed.content,
        tags: seed.tags,
        version: 1,
      },
    });
    await prisma.knowledgeVersion.create({
      data: {
        knowledgeId: entry.id,
        version: 1,
        title: entry.title,
        category: entry.category,
        content: entry.content,
        tags: entry.tags,
        changeSummary: "Initial demo version",
        createdBy: owner.authSubject,
      },
    });
    await prisma.$executeRaw`
      UPDATE public.knowledge_entries
      SET embedding = ${"[" + embedTextLocal(`${entry.title}\n${entry.content}`).join(",") + "]"}::extensions.vector,
          embedding_model = ${LOCAL_EMBEDDING_MODEL}
      WHERE id = ${entry.id}::uuid
    `;
  }

  // ── SOP ──
  const sop = await prisma.sop.create({
    data: {
      id: randomUUID(),
      clientId: client.id,
      title: `${DEMO_TAG} Weekly client reporting`,
      materials: ["Finance dashboard", "Agent run log"],
      expectedOutcome: "A one-page summary sent to the client every Monday.",
      usageCount: 2,
      lastExecutedAt: new Date(Date.now() - 2 * 86_400_000),
      lastTestedAt: new Date(Date.now() - 2 * 86_400_000),
    },
  });
  await prisma.sopStep.create({
    data: { id: randomUUID(), sopId: sop.id, sopVersion: 1, position: 1, title: "Pull metrics", instructions: "Collect revenue, agent activity, and open tasks from the dashboards." },
  });
  await prisma.sopStep.create({
    data: { id: randomUUID(), sopId: sop.id, sopVersion: 1, position: 2, title: "Draft summary", instructions: "Write three highlights, one risk, one ask." },
  });
  await prisma.sopStep.create({
    data: { id: randomUUID(), sopId: sop.id, sopVersion: 1, position: 3, title: "Send and log", instructions: "Email the client and log the communication." },
  });

  // ── Content artifact (approved) ──
  await prisma.contentArtifact.create({
    data: {
      id: randomUUID(),
      clientId: client.id,
      scope: "CLIENT",
      type: "LINKEDIN_POST",
      status: "APPROVED",
      title: `${DEMO_TAG} How Harbor & Main cut order errors by 60%`,
      body: "Three months ago, every online order was re-keyed by hand. Today, a single automation routes them straight to the bar. The result: 60% fewer order errors and two recovered staff hours a day. Automation is not about replacing people - it is about giving them their time back.",
      claimsToVerify: ["60% fewer order errors", "two recovered staff hours a day"],
      currentVersion: 1,
    },
  });

  // ── Workflow ──
  const workflow = await prisma.workflow.create({
    data: {
      id: randomUUID(),
      clientId: client.id,
      name: `${DEMO_TAG} Review Response`,
      description: "Responds to new public reviews with brand-approved replies.",
      provider: "N8N",
      status: "TESTED",
      currentVersion: 1,
    },
  });
  await prisma.workflowVersion.create({
    data: {
      workflowId: workflow.id,
      version: 1,
      blueprint: {
        trigger: "review_received",
        nodes: [
          { id: "review_received", type: "webhook", name: "Review received", parameters: {} },
          { id: "draft_reply", type: "agent", name: "Draft brand reply", parameters: { agent: "review_responder" } },
        ],
        connections: [{ from: "review_received", to: "draft_reply" }],
      },
      humanPlan: "1. Review webhook fires.\n2. The agent drafts a brand-approved reply.\n3. Owner approves before posting.",
      assumptions: ["Owner approval before any public post"],
      validation: { valid: true, issues: [] },
      changeSummary: "Initial demo blueprint",
      testedAt: new Date(Date.now() - 86_400_000),
    },
  });

  console.log("Demo data seeded: 1 client, 1 agent (+run, memory, cost), 1 lead, invoice+payment, expense, 3 knowledge entries (embedded), 1 SOP (3 steps), 1 content artifact, 1 workflow.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
