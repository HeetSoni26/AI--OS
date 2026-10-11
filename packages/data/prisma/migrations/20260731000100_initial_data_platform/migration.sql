-- AI OS Part 2 baseline: PostgreSQL 16+ and pgvector.
-- Prisma generated the relational DDL below; this reviewed prelude makes extension
-- types available on both Supabase and self-hosted pgvector installations.
CREATE SCHEMA IF NOT EXISTS "public";
CREATE SCHEMA IF NOT EXISTS "extensions";
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA "extensions";
SET search_path TO "public", "extensions";

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('prospect', 'onboarding', 'active', 'paused', 'churned');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('chatbot', 'workflow', 'content', 'lead_gen', 'custom');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('planning', 'in_progress', 'review', 'delivered', 'revision', 'complete');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('backlog', 'todo', 'in_progress', 'blocked', 'review', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('agent', 'human');

-- CreateEnum
CREATE TYPE "TimeEntrySource" AS ENUM ('manual', 'agent_run');

-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('email', 'note', 'call_summary', 'slack_message', 'social_dm', 'chatbot');

-- CreateEnum
CREATE TYPE "CommunicationDirection" AS ENUM ('inbound', 'outbound', 'internal');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('chatbot_builder', 'workflow_designer', 'content_writer', 'lead_generator', 'invoice_chaser', 'crm_manager', 'reporter', 'analyst', 'custom');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('idle', 'running', 'error', 'paused', 'scheduled');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('queued', 'running', 'success', 'failed', 'timeout', 'cancelled');

-- CreateEnum
CREATE TYPE "AgentTriggerType" AS ENUM ('manual', 'scheduled', 'event', 'chain', 'webhook');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('key_value', 'vector', 'summary');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('agent_tool_use', 'outreach_send', 'workflow_deploy', 'content_publish', 'invoice_send', 'proposal_send', 'knowledge_promotion', 'other');

-- CreateEnum
CREATE TYPE "ChatbotPlatform" AS ENUM ('website_widget', 'whatsapp', 'instagram_dm', 'custom_api');

-- CreateEnum
CREATE TYPE "ChatbotStatus" AS ENUM ('draft', 'review', 'active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "ChatbotSourceType" AS ENUM ('file', 'url', 'faq', 'product', 'knowledge');

-- CreateEnum
CREATE TYPE "IngestionStatus" AS ENUM ('pending', 'scanning', 'processing', 'ready', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'bot_active', 'human_takeover', 'escalated', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('system', 'user', 'assistant', 'owner', 'tool');

-- CreateEnum
CREATE TYPE "WorkflowProvider" AS ENUM ('n8n', 'make');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('draft', 'validated', 'tested', 'deployed', 'paused', 'error', 'archived');

-- CreateEnum
CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('queued', 'running', 'success', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ContentScope" AS ENUM ('client', 'agency');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('linkedin_post', 'x_post', 'x_thread', 'instagram', 'newsletter', 'blog', 'video_script', 'case_study', 'other');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('draft', 'owner_review', 'client_review', 'review', 'approved', 'scheduled', 'published', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('queued', 'publishing', 'published', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "LeadScope" AS ENUM ('client', 'agency');

-- CreateEnum
CREATE TYPE "SourcedLeadCategory" AS ENUM ('hot', 'warm', 'cold');

-- CreateEnum
CREATE TYPE "SourcedLeadStage" AS ENUM ('sourced', 'qualified', 'outreach_sent', 'replied', 'meeting_booked', 'converted', 'disqualified');

-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'scheduled', 'sent', 'delivered', 'opened', 'replied', 'bounced', 'cancelled', 'failed');

-- CreateEnum
CREATE TYPE "CrmLeadStage" AS ENUM ('new', 'contacted', 'qualified', 'proposal', 'negotiating', 'won', 'lost');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('one_time', 'recurring', 'usage');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'sent', 'paid', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded', 'disputed');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('api_cost', 'tool_subscription', 'hosting', 'domain', 'contractor', 'other');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('revenue', 'expense', 'credit', 'refund');

-- CreateEnum
CREATE TYPE "KnowledgeCategory" AS ENUM ('sop', 'template', 'brand_voice', 'client_data', 'research', 'lesson', 'decision', 'meeting_note', 'other');

-- CreateEnum
CREATE TYPE "KnowledgeLinkType" AS ENUM ('client', 'agent', 'project', 'sop', 'decision', 'knowledge');

-- CreateEnum
CREATE TYPE "SopExecutionStatus" AS ENUM ('running', 'success', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "GraphNodeType" AS ENUM ('client', 'agent', 'tool', 'sop', 'human', 'task', 'decision', 'knowledge', 'finance', 'hub');

-- CreateEnum
CREATE TYPE "GraphEdgeType" AS ENUM ('ownership', 'assignment', 'data_flow', 'dependency', 'trigger', 'reference', 'financial');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('agent_error', 'invoice_overdue', 'new_lead', 'client_reply', 'task_due', 'task_overdue', 'cost_alert', 'report_ready', 'renewal_due', 'content_publish', 'knowledge_suggestion');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'in_app', 'slack');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'deferred', 'sending', 'delivered', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('openai', 'anthropic', 'n8n', 'make', 'stripe', 'gmail', 'google', 'slack', 'linkedin', 'x', 'wordpress', 'mailchimp', 'sendgrid', 'resend', 'smtp', 'twilio', 'instagram', 'calendly', 'cal_com', 'notion', 'github', 'apollo', 'crunchbase', 'google_maps', 'storage', 'malware_scan', 'other');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('not_configured', 'connected', 'degraded', 'revoked', 'error', 'disabled');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('received', 'processing', 'processed', 'failed', 'dead_letter', 'ignored');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'published', 'failed', 'dead_letter');

-- CreateEnum
CREATE TYPE "ScheduledJobStatus" AS ENUM ('active', 'paused', 'running', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('client_file', 'logo', 'receipt', 'template', 'media', 'chatbot_source', 'export', 'report', 'proposal', 'other');

-- CreateEnum
CREATE TYPE "MalwareScanStatus" AS ENUM ('pending', 'clean', 'infected', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('weekly_summary', 'monthly_review', 'client', 'chatbot_weekly', 'workflow_impact', 'content_performance', 'content_roi', 'lead_weekly', 'profit_and_loss', 'client_profitability', 'other');

-- CreateEnum
CREATE TYPE "ArtifactStatus" AS ENUM ('pending', 'generating', 'ready', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('json', 'csv', 'zip');

-- CreateEnum
CREATE TYPE "DeletionStatus" AS ENUM ('pending', 'cancelled', 'executing', 'completed', 'failed', 'recovered');

-- CreateTable
CREATE TABLE "owner_accounts" (
    "id" UUID NOT NULL,
    "auth_subject" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "owner_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "industry" VARCHAR(100),
    "status" "ClientStatus" NOT NULL DEFAULT 'prospect',
    "contact_name" VARCHAR(255),
    "contact_email" VARCHAR(320),
    "contact_phone" VARCHAR(50),
    "website" VARCHAR(500),
    "logo_url" TEXT,
    "mrr" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "start_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "role" VARCHAR(150),
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "notes" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "last_contact_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communications" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "contact_id" UUID,
    "sourced_lead_id" UUID,
    "crm_lead_id" UUID,
    "type" "CommunicationType" NOT NULL,
    "direction" "CommunicationDirection" NOT NULL DEFAULT 'internal',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT,
    "next_action" TEXT,
    "source" VARCHAR(100),
    "provider_message_id" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "ProjectType" NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'planning',
    "description" TEXT,
    "start_date" DATE,
    "due_date" DATE,
    "price" DECIMAL(10,2),
    "hours_spent" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "deliverables_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_task_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "due_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "agent_id" UUID,
    "assignee_type" "AssignmentType" NOT NULL,
    "owner_subject" VARCHAR(255),
    "role" VARCHAR(150),
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliverables" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_entries" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "task_id" UUID,
    "agent_run_id" UUID,
    "source" "TimeEntrySource" NOT NULL,
    "description" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "minutes" INTEGER NOT NULL,
    "hourly_rate" DECIMAL(10,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "time_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "AgentType" NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'idle',
    "model" VARCHAR(100) NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "temperature" DECIMAL(3,2) NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER NOT NULL DEFAULT 4096,
    "top_p" DECIMAL(3,2) NOT NULL DEFAULT 1,
    "frequency_penalty" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "schedule_cron" VARCHAR(100),
    "daily_token_budget" INTEGER,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "total_cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "success_rate" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "last_run_at" TIMESTAMPTZ(6),
    "last_run_status" "AgentRunStatus",
    "config_json" JSONB,
    "current_config_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_config_versions" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "temperature" DECIMAL(3,2) NOT NULL,
    "max_tokens" INTEGER NOT NULL,
    "top_p" DECIMAL(3,2) NOT NULL,
    "frequency_penalty" DECIMAL(3,2) NOT NULL,
    "tools" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "trigger_config" JSONB,
    "config_json" JSONB,
    "change_summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(255),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_config_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "client_id" UUID,
    "config_version_id" UUID,
    "parent_run_id" UUID,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'queued',
    "trigger_type" "AgentTriggerType" NOT NULL,
    "idempotency_key" VARCHAR(255),
    "input_text" TEXT,
    "output_text" TEXT,
    "partial_output" TEXT,
    "tokens_input" INTEGER NOT NULL DEFAULT 0,
    "tokens_output" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error_message" TEXT,
    "metadata" JSONB,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_memories" (
    "id" UUID NOT NULL,
    "agent_id" UUID NOT NULL,
    "client_id" UUID,
    "source_run_id" UUID,
    "kind" "MemoryKind" NOT NULL,
    "key" VARCHAR(255),
    "value" TEXT NOT NULL,
    "embedding" vector(1536),
    "embedding_model" VARCHAR(100),
    "version" INTEGER NOT NULL DEFAULT 1,
    "token_count" INTEGER,
    "source_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "summarized_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "agent_id" UUID,
    "agent_run_id" UUID,
    "config_version_id" UUID,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_version" INTEGER,
    "requested_by" VARCHAR(255),
    "decided_by" VARCHAR(255),
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "payload_hash" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbots" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "agent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "platform" "ChatbotPlatform" NOT NULL,
    "status" "ChatbotStatus" NOT NULL DEFAULT 'draft',
    "activeVersion" INTEGER,
    "allowed_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chatbots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_versions" (
    "id" UUID NOT NULL,
    "chatbot_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "brand_voice" TEXT NOT NULL,
    "greeting_message" TEXT NOT NULL,
    "fallback_response" TEXT NOT NULL,
    "escalation_rules" JSONB NOT NULL,
    "confidence_threshold" DECIMAL(4,3) NOT NULL DEFAULT 0.7,
    "model" VARCHAR(100) NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "custom_actions" JSONB,
    "booking_config" JSONB,
    "recommendation_config" JSONB,
    "status" "ChatbotStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chatbot_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_sources" (
    "id" UUID NOT NULL,
    "chatbot_id" UUID NOT NULL,
    "file_id" UUID,
    "type" "ChatbotSourceType" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "source_url" VARCHAR(2000),
    "content_hash" VARCHAR(128),
    "status" "IngestionStatus" NOT NULL DEFAULT 'pending',
    "failure_reason" TEXT,
    "provenance" JSONB,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chatbot_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_qa_pairs" (
    "id" UUID NOT NULL,
    "chatbot_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "chatbot_version_id" UUID,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "confidence" DECIMAL(4,3),
    "evidence" TEXT,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chatbot_qa_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_conversations" (
    "id" UUID NOT NULL,
    "chatbot_id" UUID NOT NULL,
    "chatbot_version_id" UUID,
    "client_id" UUID NOT NULL,
    "sourced_lead_id" UUID,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "external_id" VARCHAR(255),
    "channel" "ChatbotPlatform" NOT NULL,
    "intent" VARCHAR(150),
    "sentiment_score" DECIMAL(4,3),
    "confidence" DECIMAL(4,3),
    "is_low_confidence" BOOLEAN NOT NULL DEFAULT false,
    "lead_captured" BOOLEAN NOT NULL DEFAULT false,
    "escalated_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chatbot_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chatbot_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "provider_id" VARCHAR(255),
    "confidence" DECIMAL(4,3),
    "intent" VARCHAR(150),
    "sentiment_score" DECIMAL(4,3),
    "response_latency_ms" INTEGER,
    "tokens_input" INTEGER NOT NULL DEFAULT 0,
    "tokens_output" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "citations" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "chatbot_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "agent_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "provider" "WorkflowProvider" NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'draft',
    "provider_workflow_id" VARCHAR(255),
    "currentVersion" INTEGER,
    "webhook_url" VARCHAR(2000),
    "total_executions" INTEGER NOT NULL DEFAULT 0,
    "success_rate" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "average_duration_ms" INTEGER,
    "last_executed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "approval_id" UUID,
    "version" INTEGER NOT NULL,
    "blueprint" JSONB NOT NULL,
    "human_plan" TEXT NOT NULL,
    "assumptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validation" JSONB,
    "change_summary" TEXT,
    "is_immutable" BOOLEAN NOT NULL DEFAULT false,
    "tested_at" TIMESTAMPTZ(6),
    "deployed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "workflow_version_id" UUID NOT NULL,
    "provider_execution_id" VARCHAR(255),
    "status" "WorkflowExecutionStatus" NOT NULL DEFAULT 'queued',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "failure_step" VARCHAR(255),
    "error_message" TEXT,
    "duration_ms" INTEGER,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_credential_bindings" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "integration_connection_id" UUID NOT NULL,
    "purpose" VARCHAR(255) NOT NULL,
    "provider_credential_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workflow_credential_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_strategies" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "scope" "ContentScope" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "target_audience" TEXT NOT NULL,
    "key_topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "brand_voice" TEXT NOT NULL,
    "content_pillars" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "offers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_profiles" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "scope" "ContentScope" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "tone" TEXT NOT NULL,
    "vocabulary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "target_audience" TEXT NOT NULL,
    "key_messages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "prohibited_claims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "examples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "platform_rules" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_artifacts" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "strategy_id" UUID,
    "brand_profile_id" UUID,
    "parent_artifact_id" UUID,
    "generated_by_agent_id" UUID,
    "scope" "ContentScope" NOT NULL,
    "type" "ContentType" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "title" VARCHAR(500) NOT NULL,
    "brief" TEXT,
    "body" TEXT NOT NULL,
    "source_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "claims_to_verify" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "seo_metadata" JSONB,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_artifact_versions" (
    "id" UUID NOT NULL,
    "artifact_id" UUID NOT NULL,
    "approval_id" UUID,
    "version" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'draft',
    "title" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "prompt_model" VARCHAR(100),
    "prompt_version" VARCHAR(100),
    "cost_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_artifact_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_calendar_entries" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "artifact_id" UUID NOT NULL,
    "artifact_version_id" UUID NOT NULL,
    "scope" "ContentScope" NOT NULL,
    "platform" "IntegrationProvider" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'scheduled',
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "timezone" VARCHAR(100) NOT NULL,
    "recommendation_basis" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_calendar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_publish_events" (
    "id" UUID NOT NULL,
    "calendar_entry_id" UUID NOT NULL,
    "artifact_id" UUID NOT NULL,
    "integration_connection_id" UUID,
    "status" "PublishStatus" NOT NULL DEFAULT 'queued',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "provider_post_id" VARCHAR(255),
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error_message" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_publish_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_metrics" (
    "id" UUID NOT NULL,
    "artifact_id" UUID NOT NULL,
    "publish_event_id" UUID,
    "metric" VARCHAR(100) NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "content_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sourced_leads" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "scope" "LeadScope" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "company" VARCHAR(255),
    "title" VARCHAR(255),
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "linkedin_url" VARCHAR(1000),
    "company_domain" VARCHAR(255),
    "source" "IntegrationProvider" NOT NULL,
    "provider_lead_id" VARCHAR(255),
    "date_found" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fit_score" INTEGER,
    "fit_explanation" TEXT,
    "category" "SourcedLeadCategory",
    "stage" "SourcedLeadStage" NOT NULL DEFAULT 'sourced',
    "is_competitor" BOOLEAN NOT NULL DEFAULT false,
    "is_blocked_domain" BOOLEAN NOT NULL DEFAULT false,
    "dedupe_fingerprint" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sourced_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_research" (
    "id" UUID NOT NULL,
    "sourced_lead_id" UUID NOT NULL,
    "agent_run_id" UUID,
    "brief" TEXT NOT NULL,
    "citations" JSONB NOT NULL,
    "researched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "lead_research_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_sequences" (
    "id" UUID NOT NULL,
    "sourced_lead_id" UUID NOT NULL,
    "approval_id" UUID,
    "version" INTEGER NOT NULL,
    "status" "OutreachStatus" NOT NULL DEFAULT 'draft',
    "subject" VARCHAR(500),
    "steps" JSONB NOT NULL,
    "channel" VARCHAR(50) NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "outreach_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outreach_events" (
    "id" UUID NOT NULL,
    "sourced_lead_id" UUID NOT NULL,
    "sequence_id" UUID,
    "communication_id" UUID,
    "status" "OutreachStatus" NOT NULL,
    "step_number" INTEGER,
    "provider_event_id" VARCHAR(255),
    "scheduled_for" TIMESTAMPTZ(6),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "outreach_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_leads" (
    "id" UUID NOT NULL,
    "converted_client_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(50),
    "company" VARCHAR(255),
    "source" VARCHAR(100),
    "interest" TEXT,
    "notes" TEXT,
    "stage" "CrmLeadStage" NOT NULL DEFAULT 'new',
    "value" DECIMAL(12,2),
    "expected_close_probability" DECIMAL(5,2),
    "follow_up_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "crm_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lead_stage_history" (
    "id" UUID NOT NULL,
    "crm_lead_id" UUID NOT NULL,
    "from_stage" "CrmLeadStage",
    "to_stage" "CrmLeadStage" NOT NULL,
    "reason" TEXT,
    "changed_by" VARCHAR(255),
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_lead_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposals" (
    "id" UUID NOT NULL,
    "crm_lead_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'draft',
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "sent_at" TIMESTAMPTZ(6),
    "viewed_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposal_versions" (
    "id" UUID NOT NULL,
    "proposal_id" UUID NOT NULL,
    "file_id" UUID,
    "version" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "deliverables" JSONB NOT NULL,
    "timeline" TEXT NOT NULL,
    "pricing" JSONB NOT NULL,
    "terms" TEXT NOT NULL,
    "change_summary" TEXT,
    "content_hash" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "proposal_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "stripe_invoice_id" VARCHAR(255),
    "type" "InvoiceType" NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "line_items" JSONB NOT NULL,
    "due_date" DATE NOT NULL,
    "payment_terms" VARCHAR(255),
    "hosted_invoice_url" VARCHAR(2000),
    "paid_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "service_type" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL,
    "rate" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "stripe_payment_id" VARCHAR(255),
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "paid_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "receipt_file_id" UUID,
    "category" "ExpenseCategory" NOT NULL,
    "vendor" VARCHAR(255),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "expense_date" DATE NOT NULL,
    "notes" TEXT,
    "is_automatic" BOOLEAN NOT NULL DEFAULT false,
    "source_ref" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_ledger_entries" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "agent_id" UUID,
    "agent_run_id" UUID,
    "invoice_id" UUID,
    "payment_id" UUID,
    "expense_id" UUID,
    "entry_type" "LedgerEntryType" NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(14,6) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "source_id" UUID,
    "idempotency_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cost_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "created_by_agent_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "category" "KnowledgeCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding" vector(1536),
    "embedding_model" VARCHAR(100),
    "linked_entity_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_versions" (
    "id" UUID NOT NULL,
    "knowledge_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "category" "KnowledgeCategory" NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "embedding" vector(1536),
    "embedding_model" VARCHAR(100),
    "change_summary" TEXT,
    "created_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "knowledge_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_links" (
    "id" UUID NOT NULL,
    "source_knowledge_id" UUID NOT NULL,
    "target_type" "KnowledgeLinkType" NOT NULL,
    "target_id" UUID NOT NULL,
    "target_knowledge_id" UUID,
    "client_id" UUID,
    "agent_id" UUID,
    "project_id" UUID,
    "sop_id" UUID,
    "label" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "knowledge_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sops" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "agent_id" UUID,
    "knowledge_entry_id" UUID,
    "title" VARCHAR(500) NOT NULL,
    "materials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expected_outcome" TEXT NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "last_tested_at" TIMESTAMPTZ(6),
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_executed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_steps" (
    "id" UUID NOT NULL,
    "sop_id" UUID NOT NULL,
    "sop_version" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "instructions" TEXT NOT NULL,
    "expected_result" TEXT,
    "is_optional" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sop_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sop_executions" (
    "id" UUID NOT NULL,
    "sop_id" UUID NOT NULL,
    "agent_run_id" UUID,
    "sop_version" INTEGER NOT NULL,
    "status" "SopExecutionStatus" NOT NULL DEFAULT 'running',
    "step_results" JSONB,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "sop_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_nodes" (
    "id" UUID NOT NULL,
    "type" "GraphNodeType" NOT NULL,
    "entity_id" UUID,
    "stable_key" VARCHAR(255) NOT NULL,
    "label" VARCHAR(500) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "graph_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "graph_edges" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "source_type" "GraphNodeType" NOT NULL,
    "target_id" UUID NOT NULL,
    "target_type" "GraphNodeType" NOT NULL,
    "edge_type" "GraphEdgeType" NOT NULL,
    "label" VARCHAR(255),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "graph_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "body" TEXT,
    "entity_type" VARCHAR(100),
    "entity_id" UUID,
    "channels" "NotificationChannel"[] DEFAULT ARRAY[]::"NotificationChannel"[],
    "dedupe_key" VARCHAR(255),
    "read" BOOLEAN NOT NULL DEFAULT false,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "channels" "NotificationChannel"[] DEFAULT ARRAY[]::"NotificationChannel"[],
    "quiet_hours_start" TIME(0),
    "quiet_hours_end" TIME(0),
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "include_in_digest" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "integration_connection_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "provider_message_id" VARCHAR(255),
    "next_attempt_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_references" (
    "id" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "label" VARCHAR(255) NOT NULL,
    "vault_reference" VARCHAR(500) NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "last_rotated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "credential_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "credential_reference_id" UUID,
    "provider" "IntegrationProvider" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'not_configured',
    "external_account_id" VARCHAR(255),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "safe_metadata" JSONB,
    "connected_at" TIMESTAMPTZ(6),
    "last_health_check_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_receipts" (
    "id" UUID NOT NULL,
    "integration_connection_id" UUID NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "provider_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(255) NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'received',
    "signature_valid" BOOLEAN NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "raw_payload" JSONB,
    "headers" JSONB,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "retention_until" TIMESTAMPTZ(6) NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_subject" VARCHAR(255) NOT NULL,
    "actor_type" VARCHAR(50) NOT NULL,
    "action" VARCHAR(150) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "change_summary" JSONB,
    "ip_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(255) NOT NULL,
    "payload" JSONB NOT NULL,
    "correlation_id" VARCHAR(128) NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" VARCHAR(255) NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "job_type" VARCHAR(150) NOT NULL,
    "entity_type" VARCHAR(100),
    "entity_id" UUID,
    "cron_expression" VARCHAR(100),
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'UTC',
    "run_at" TIMESTAMPTZ(6),
    "status" "ScheduledJobStatus" NOT NULL DEFAULT 'active',
    "payload" JSONB,
    "idempotency_key" VARCHAR(255),
    "last_run_at" TIMESTAMPTZ(6),
    "next_run_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_metadata" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "project_id" UUID,
    "purpose" "FilePurpose" NOT NULL,
    "bucket" VARCHAR(100) NOT NULL,
    "object_path" VARCHAR(1000) NOT NULL,
    "original_name" VARCHAR(500) NOT NULL,
    "content_type" VARCHAR(255) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "owner_entity_type" VARCHAR(100),
    "owner_entity_id" UUID,
    "malware_scan_status" "MalwareScanStatus" NOT NULL DEFAULT 'pending',
    "scanned_at" TIMESTAMPTZ(6),
    "storage_version" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "file_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_artifacts" (
    "id" UUID NOT NULL,
    "client_id" UUID,
    "file_id" UUID,
    "type" "ReportType" NOT NULL,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'pending',
    "title" VARCHAR(500) NOT NULL,
    "period_start" DATE,
    "period_end" DATE,
    "methodology" TEXT,
    "source_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "metadata" JSONB,
    "generated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "report_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "file_id" UUID,
    "format" "ExportFormat" NOT NULL,
    "status" "ArtifactStatus" NOT NULL DEFAULT 'pending',
    "requested_by" VARCHAR(255) NOT NULL,
    "scope" JSONB NOT NULL,
    "manifest" JSONB,
    "record_count" INTEGER,
    "checksum_sha256" CHAR(64),
    "expires_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deletion_requests" (
    "id" UUID NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID NOT NULL,
    "status" "DeletionStatus" NOT NULL DEFAULT 'pending',
    "requested_by" VARCHAR(255) NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "execute_after" TIMESTAMPTZ(6) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "recovery_until" TIMESTAMPTZ(6) NOT NULL,
    "impact_manifest" JSONB NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_accounts_auth_subject_key" ON "owner_accounts"("auth_subject");

-- CreateIndex
CREATE UNIQUE INDEX "owner_accounts_email_key" ON "owner_accounts"("email");

-- CreateIndex
CREATE INDEX "owner_accounts_active_idx" ON "owner_accounts"("active");

-- CreateIndex
CREATE INDEX "clients_status_archived_at_idx" ON "clients"("status", "archived_at");

-- CreateIndex
CREATE INDEX "clients_name_idx" ON "clients"("name");

-- CreateIndex
CREATE INDEX "clients_contact_email_idx" ON "clients"("contact_email");

-- CreateIndex
CREATE INDEX "contacts_client_id_deleted_at_idx" ON "contacts"("client_id", "deleted_at");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE INDEX "communications_client_id_occurred_at_idx" ON "communications"("client_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "communications_contact_id_idx" ON "communications"("contact_id");

-- CreateIndex
CREATE INDEX "communications_crm_lead_id_idx" ON "communications"("crm_lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "communications_source_provider_message_id_key" ON "communications"("source", "provider_message_id");

-- CreateIndex
CREATE INDEX "projects_client_id_status_idx" ON "projects"("client_id", "status");

-- CreateIndex
CREATE INDEX "projects_due_date_idx" ON "projects"("due_date");

-- CreateIndex
CREATE INDEX "tasks_project_id_status_idx" ON "tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "tasks_due_at_status_idx" ON "tasks"("due_at", "status");

-- CreateIndex
CREATE INDEX "assignments_project_id_idx" ON "assignments"("project_id");

-- CreateIndex
CREATE INDEX "assignments_task_id_idx" ON "assignments"("task_id");

-- CreateIndex
CREATE INDEX "assignments_agent_id_idx" ON "assignments"("agent_id");

-- CreateIndex
CREATE INDEX "deliverables_project_id_completed_at_idx" ON "deliverables"("project_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "deliverables_project_id_position_key" ON "deliverables"("project_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "time_entries_agent_run_id_key" ON "time_entries"("agent_run_id");

-- CreateIndex
CREATE INDEX "time_entries_project_id_started_at_idx" ON "time_entries"("project_id", "started_at");

-- CreateIndex
CREATE INDEX "time_entries_task_id_idx" ON "time_entries"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "agents_current_config_version_id_key" ON "agents"("current_config_version_id");

-- CreateIndex
CREATE INDEX "agents_status_deleted_at_idx" ON "agents"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "agents_type_idx" ON "agents"("type");

-- CreateIndex
CREATE INDEX "agent_config_versions_agent_id_created_at_idx" ON "agent_config_versions"("agent_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "agent_config_versions_agent_id_version_key" ON "agent_config_versions"("agent_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_idempotency_key_key" ON "agent_runs"("idempotency_key");

-- CreateIndex
CREATE INDEX "agent_runs_agent_id_created_at_idx" ON "agent_runs"("agent_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_runs_client_id_created_at_idx" ON "agent_runs"("client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "agent_runs_status_created_at_idx" ON "agent_runs"("status", "created_at");

-- CreateIndex
CREATE INDEX "agent_memories_agent_id_client_id_kind_idx" ON "agent_memories"("agent_id", "client_id", "kind");

-- CreateIndex
CREATE INDEX "agent_memories_source_run_id_idx" ON "agent_memories"("source_run_id");

-- CreateIndex
CREATE INDEX "approvals_status_requested_at_idx" ON "approvals"("status", "requested_at");

-- CreateIndex
CREATE INDEX "approvals_entity_type_entity_id_idx" ON "approvals"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "chatbots_client_id_status_idx" ON "chatbots"("client_id", "status");

-- CreateIndex
CREATE INDEX "chatbot_versions_chatbot_id_status_idx" ON "chatbot_versions"("chatbot_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_versions_chatbot_id_version_key" ON "chatbot_versions"("chatbot_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_sources_file_id_key" ON "chatbot_sources"("file_id");

-- CreateIndex
CREATE INDEX "chatbot_sources_chatbot_id_status_idx" ON "chatbot_sources"("chatbot_id", "status");

-- CreateIndex
CREATE INDEX "chatbot_sources_source_url_idx" ON "chatbot_sources"("source_url");

-- CreateIndex
CREATE INDEX "chatbot_qa_pairs_chatbot_id_approved_at_idx" ON "chatbot_qa_pairs"("chatbot_id", "approved_at");

-- CreateIndex
CREATE INDEX "chatbot_qa_pairs_source_id_idx" ON "chatbot_qa_pairs"("source_id");

-- CreateIndex
CREATE INDEX "chatbot_conversations_client_id_created_at_idx" ON "chatbot_conversations"("client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "chatbot_conversations_status_is_low_confidence_idx" ON "chatbot_conversations"("status", "is_low_confidence");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_conversations_chatbot_id_external_id_key" ON "chatbot_conversations"("chatbot_id", "external_id");

-- CreateIndex
CREATE INDEX "chatbot_messages_conversation_id_created_at_idx" ON "chatbot_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_messages_conversation_id_sequence_key" ON "chatbot_messages"("conversation_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "chatbot_messages_conversation_id_provider_id_key" ON "chatbot_messages"("conversation_id", "provider_id");

-- CreateIndex
CREATE INDEX "workflows_client_id_status_idx" ON "workflows"("client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_provider_provider_workflow_id_key" ON "workflows"("provider", "provider_workflow_id");

-- CreateIndex
CREATE INDEX "workflow_versions_workflow_id_created_at_idx" ON "workflow_versions"("workflow_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_versions_workflow_id_version_key" ON "workflow_versions"("workflow_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_executions_idempotency_key_key" ON "workflow_executions"("idempotency_key");

-- CreateIndex
CREATE INDEX "workflow_executions_workflow_id_created_at_idx" ON "workflow_executions"("workflow_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "workflow_executions_status_created_at_idx" ON "workflow_executions"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_executions_workflow_id_provider_execution_id_key" ON "workflow_executions"("workflow_id", "provider_execution_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_credential_bindings_workflow_id_integration_connec_key" ON "workflow_credential_bindings"("workflow_id", "integration_connection_id", "purpose");

-- CreateIndex
CREATE INDEX "content_strategies_client_id_scope_idx" ON "content_strategies"("client_id", "scope");

-- CreateIndex
CREATE INDEX "brand_profiles_client_id_scope_idx" ON "brand_profiles"("client_id", "scope");

-- CreateIndex
CREATE INDEX "content_artifacts_client_id_status_idx" ON "content_artifacts"("client_id", "status");

-- CreateIndex
CREATE INDEX "content_artifacts_scope_type_status_idx" ON "content_artifacts"("scope", "type", "status");

-- CreateIndex
CREATE INDEX "content_artifacts_parent_artifact_id_idx" ON "content_artifacts"("parent_artifact_id");

-- CreateIndex
CREATE INDEX "content_artifact_versions_artifact_id_status_idx" ON "content_artifact_versions"("artifact_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_artifact_versions_artifact_id_version_key" ON "content_artifact_versions"("artifact_id", "version");

-- CreateIndex
CREATE INDEX "content_calendar_entries_scheduled_for_status_idx" ON "content_calendar_entries"("scheduled_for", "status");

-- CreateIndex
CREATE INDEX "content_calendar_entries_client_id_scheduled_for_idx" ON "content_calendar_entries"("client_id", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "content_publish_events_idempotency_key_key" ON "content_publish_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "content_publish_events_status_created_at_idx" ON "content_publish_events"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_publish_events_integration_connection_id_provider_p_key" ON "content_publish_events"("integration_connection_id", "provider_post_id");

-- CreateIndex
CREATE INDEX "content_metrics_artifact_id_observed_at_idx" ON "content_metrics"("artifact_id", "observed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_metrics_artifact_id_metric_source_observed_at_key" ON "content_metrics"("artifact_id", "metric", "source", "observed_at");

-- CreateIndex
CREATE INDEX "sourced_leads_client_id_stage_idx" ON "sourced_leads"("client_id", "stage");

-- CreateIndex
CREATE INDEX "sourced_leads_email_idx" ON "sourced_leads"("email");

-- CreateIndex
CREATE INDEX "sourced_leads_company_domain_idx" ON "sourced_leads"("company_domain");

-- CreateIndex
CREATE INDEX "sourced_leads_dedupe_fingerprint_idx" ON "sourced_leads"("dedupe_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "sourced_leads_scope_client_id_source_provider_lead_id_key" ON "sourced_leads"("scope", "client_id", "source", "provider_lead_id");

-- CreateIndex
CREATE INDEX "lead_research_sourced_lead_id_researched_at_idx" ON "lead_research"("sourced_lead_id", "researched_at" DESC);

-- CreateIndex
CREATE INDEX "outreach_sequences_status_idx" ON "outreach_sequences"("status");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_sequences_sourced_lead_id_version_key" ON "outreach_sequences"("sourced_lead_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "outreach_events_communication_id_key" ON "outreach_events"("communication_id");

-- CreateIndex
CREATE INDEX "outreach_events_sourced_lead_id_occurred_at_idx" ON "outreach_events"("sourced_lead_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "outreach_events_sequence_id_provider_event_id_key" ON "outreach_events"("sequence_id", "provider_event_id");

-- CreateIndex
CREATE INDEX "crm_leads_stage_follow_up_at_idx" ON "crm_leads"("stage", "follow_up_at");

-- CreateIndex
CREATE INDEX "crm_leads_email_idx" ON "crm_leads"("email");

-- CreateIndex
CREATE INDEX "crm_lead_stage_history_crm_lead_id_changed_at_idx" ON "crm_lead_stage_history"("crm_lead_id", "changed_at");

-- CreateIndex
CREATE INDEX "proposals_crm_lead_id_status_idx" ON "proposals"("crm_lead_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_versions_file_id_key" ON "proposal_versions"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "proposal_versions_proposal_id_version_key" ON "proposal_versions"("proposal_id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_stripe_invoice_id_key" ON "invoices"("stripe_invoice_id");

-- CreateIndex
CREATE INDEX "invoices_client_id_status_idx" ON "invoices"("client_id", "status");

-- CreateIndex
CREATE INDEX "invoices_due_date_status_idx" ON "invoices"("due_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_line_items_invoice_id_position_key" ON "invoice_line_items"("invoice_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_payment_id_key" ON "payments"("stripe_payment_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_status_idx" ON "payments"("invoice_id", "status");

-- CreateIndex
CREATE INDEX "payments_client_id_paid_at_idx" ON "payments"("client_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_receipt_file_id_key" ON "expenses"("receipt_file_id");

-- CreateIndex
CREATE INDEX "expenses_expense_date_category_idx" ON "expenses"("expense_date", "category");

-- CreateIndex
CREATE INDEX "expenses_client_id_idx" ON "expenses"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_ledger_entries_idempotency_key_key" ON "cost_ledger_entries"("idempotency_key");

-- CreateIndex
CREATE INDEX "cost_ledger_entries_occurred_at_entry_type_idx" ON "cost_ledger_entries"("occurred_at", "entry_type");

-- CreateIndex
CREATE INDEX "cost_ledger_entries_client_id_occurred_at_idx" ON "cost_ledger_entries"("client_id", "occurred_at");

-- CreateIndex
CREATE INDEX "cost_ledger_entries_agent_id_occurred_at_idx" ON "cost_ledger_entries"("agent_id", "occurred_at");

-- CreateIndex
CREATE INDEX "knowledge_entries_category_archived_at_idx" ON "knowledge_entries"("category", "archived_at");

-- CreateIndex
CREATE INDEX "knowledge_entries_client_id_category_idx" ON "knowledge_entries"("client_id", "category");

-- CreateIndex
CREATE INDEX "knowledge_entries_tags_idx" ON "knowledge_entries" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "knowledge_versions_knowledge_id_created_at_idx" ON "knowledge_versions"("knowledge_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_versions_knowledge_id_version_key" ON "knowledge_versions"("knowledge_id", "version");

-- CreateIndex
CREATE INDEX "knowledge_links_target_type_target_id_idx" ON "knowledge_links"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_links_source_knowledge_id_target_type_target_id_key" ON "knowledge_links"("source_knowledge_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "sops_knowledge_entry_id_key" ON "sops"("knowledge_entry_id");

-- CreateIndex
CREATE INDEX "sops_client_id_archived_at_idx" ON "sops"("client_id", "archived_at");

-- CreateIndex
CREATE INDEX "sops_last_executed_at_idx" ON "sops"("last_executed_at");

-- CreateIndex
CREATE UNIQUE INDEX "sop_steps_sop_id_sop_version_position_key" ON "sop_steps"("sop_id", "sop_version", "position");

-- CreateIndex
CREATE INDEX "sop_executions_sop_id_started_at_idx" ON "sop_executions"("sop_id", "started_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "graph_nodes_stable_key_key" ON "graph_nodes"("stable_key");

-- CreateIndex
CREATE INDEX "graph_nodes_type_archived_at_idx" ON "graph_nodes"("type", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "graph_nodes_id_type_key" ON "graph_nodes"("id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "graph_nodes_type_entity_id_key" ON "graph_nodes"("type", "entity_id");

-- CreateIndex
CREATE INDEX "graph_edges_source_type_source_id_idx" ON "graph_edges"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "graph_edges_target_type_target_id_idx" ON "graph_edges"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "graph_edges_edge_type_idx" ON "graph_edges"("edge_type");

-- CreateIndex
CREATE UNIQUE INDEX "graph_edges_source_id_source_type_target_id_target_type_edg_key" ON "graph_edges"("source_id", "source_type", "target_id", "target_type", "edge_type");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_read_sent_at_idx" ON "notifications"("read", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_type_priority_idx" ON "notifications"("type", "priority");

-- CreateIndex
CREATE INDEX "notifications_entity_type_entity_id_idx" ON "notifications"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_type_key" ON "notification_preferences"("type");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_next_attempt_at_idx" ON "notification_deliveries"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "credential_references_vault_reference_key" ON "credential_references"("vault_reference");

-- CreateIndex
CREATE INDEX "credential_references_provider_idx" ON "credential_references"("provider");

-- CreateIndex
CREATE INDEX "integration_connections_client_id_provider_idx" ON "integration_connections"("client_id", "provider");

-- CreateIndex
CREATE INDEX "integration_connections_status_idx" ON "integration_connections"("status");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_provider_external_account_id_key" ON "integration_connections"("provider", "external_account_id");

-- CreateIndex
CREATE INDEX "webhook_receipts_provider_provider_event_id_idx" ON "webhook_receipts"("provider", "provider_event_id");

-- CreateIndex
CREATE INDEX "webhook_receipts_status_received_at_idx" ON "webhook_receipts"("status", "received_at");

-- CreateIndex
CREATE INDEX "webhook_receipts_retention_until_idx" ON "webhook_receipts"("retention_until");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_receipts_integration_connection_id_provider_event_i_key" ON "webhook_receipts"("integration_connection_id", "provider_event_id");

-- CreateIndex
CREATE INDEX "audit_events_entity_type_entity_id_created_at_idx" ON "audit_events"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_events_correlation_id_idx" ON "audit_events"("correlation_id");

-- CreateIndex
CREATE INDEX "audit_events_actor_subject_created_at_idx" ON "audit_events"("actor_subject", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_idempotency_key_key" ON "outbox_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- CreateIndex
CREATE INDEX "outbox_events_aggregate_type_aggregate_id_idx" ON "outbox_events"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_idempotency_key_key" ON "scheduled_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "scheduled_jobs_status_next_run_at_idx" ON "scheduled_jobs"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "scheduled_jobs_entity_type_entity_id_idx" ON "scheduled_jobs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "file_metadata_object_path_key" ON "file_metadata"("object_path");

-- CreateIndex
CREATE INDEX "file_metadata_client_id_purpose_idx" ON "file_metadata"("client_id", "purpose");

-- CreateIndex
CREATE INDEX "file_metadata_owner_entity_type_owner_entity_id_idx" ON "file_metadata"("owner_entity_type", "owner_entity_id");

-- CreateIndex
CREATE INDEX "file_metadata_malware_scan_status_idx" ON "file_metadata"("malware_scan_status");

-- CreateIndex
CREATE INDEX "report_artifacts_type_status_created_at_idx" ON "report_artifacts"("type", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "report_artifacts_client_id_idx" ON "report_artifacts"("client_id");

-- CreateIndex
CREATE INDEX "export_jobs_status_created_at_idx" ON "export_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "deletion_requests_entity_type_entity_id_status_idx" ON "deletion_requests"("entity_type", "entity_id", "status");

-- CreateIndex
CREATE INDEX "deletion_requests_status_execute_after_idx" ON "deletion_requests"("status", "execute_after");

-- CreateIndex
CREATE INDEX "deletion_requests_recovery_until_idx" ON "deletion_requests"("recovery_until");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_sourced_lead_id_fkey" FOREIGN KEY ("sourced_lead_id") REFERENCES "sourced_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communications" ADD CONSTRAINT "communications_crm_lead_id_fkey" FOREIGN KEY ("crm_lead_id") REFERENCES "crm_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_current_config_version_id_fkey" FOREIGN KEY ("current_config_version_id") REFERENCES "agent_config_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_config_versions" ADD CONSTRAINT "agent_config_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_config_version_id_fkey" FOREIGN KEY ("config_version_id") REFERENCES "agent_config_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_parent_run_id_fkey" FOREIGN KEY ("parent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_memories" ADD CONSTRAINT "agent_memories_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_config_version_id_fkey" FOREIGN KEY ("config_version_id") REFERENCES "agent_config_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbots" ADD CONSTRAINT "chatbots_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbots" ADD CONSTRAINT "chatbots_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_versions" ADD CONSTRAINT "chatbot_versions_chatbot_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_sources" ADD CONSTRAINT "chatbot_sources_chatbot_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_sources" ADD CONSTRAINT "chatbot_sources_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_qa_pairs" ADD CONSTRAINT "chatbot_qa_pairs_chatbot_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_qa_pairs" ADD CONSTRAINT "chatbot_qa_pairs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "chatbot_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_qa_pairs" ADD CONSTRAINT "chatbot_qa_pairs_chatbot_version_id_fkey" FOREIGN KEY ("chatbot_version_id") REFERENCES "chatbot_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_chatbot_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_chatbot_version_id_fkey" FOREIGN KEY ("chatbot_version_id") REFERENCES "chatbot_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_conversations" ADD CONSTRAINT "chatbot_conversations_sourced_lead_id_fkey" FOREIGN KEY ("sourced_lead_id") REFERENCES "sourced_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chatbot_messages" ADD CONSTRAINT "chatbot_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chatbot_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflow_version_id_fkey" FOREIGN KEY ("workflow_version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_credential_bindings" ADD CONSTRAINT "workflow_credential_bindings_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_credential_bindings" ADD CONSTRAINT "workflow_credential_bindings_integration_connection_id_fkey" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_strategies" ADD CONSTRAINT "content_strategies_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_artifacts" ADD CONSTRAINT "content_artifacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_artifacts" ADD CONSTRAINT "content_artifacts_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "content_strategies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_artifacts" ADD CONSTRAINT "content_artifacts_brand_profile_id_fkey" FOREIGN KEY ("brand_profile_id") REFERENCES "brand_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_artifacts" ADD CONSTRAINT "content_artifacts_parent_artifact_id_fkey" FOREIGN KEY ("parent_artifact_id") REFERENCES "content_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_artifacts" ADD CONSTRAINT "content_artifacts_generated_by_agent_id_fkey" FOREIGN KEY ("generated_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_artifact_versions" ADD CONSTRAINT "content_artifact_versions_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "content_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_artifact_versions" ADD CONSTRAINT "content_artifact_versions_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_calendar_entries" ADD CONSTRAINT "content_calendar_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_calendar_entries" ADD CONSTRAINT "content_calendar_entries_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "content_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_calendar_entries" ADD CONSTRAINT "content_calendar_entries_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "content_artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_publish_events" ADD CONSTRAINT "content_publish_events_calendar_entry_id_fkey" FOREIGN KEY ("calendar_entry_id") REFERENCES "content_calendar_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_publish_events" ADD CONSTRAINT "content_publish_events_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "content_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_publish_events" ADD CONSTRAINT "content_publish_events_integration_connection_id_fkey" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "content_artifacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_publish_event_id_fkey" FOREIGN KEY ("publish_event_id") REFERENCES "content_publish_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sourced_leads" ADD CONSTRAINT "sourced_leads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_research" ADD CONSTRAINT "lead_research_sourced_lead_id_fkey" FOREIGN KEY ("sourced_lead_id") REFERENCES "sourced_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_research" ADD CONSTRAINT "lead_research_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_sourced_lead_id_fkey" FOREIGN KEY ("sourced_lead_id") REFERENCES "sourced_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_sequences" ADD CONSTRAINT "outreach_sequences_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_sourced_lead_id_fkey" FOREIGN KEY ("sourced_lead_id") REFERENCES "sourced_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "outreach_sequences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outreach_events" ADD CONSTRAINT "outreach_events_communication_id_fkey" FOREIGN KEY ("communication_id") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_leads" ADD CONSTRAINT "crm_leads_converted_client_id_fkey" FOREIGN KEY ("converted_client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_lead_stage_history" ADD CONSTRAINT "crm_lead_stage_history_crm_lead_id_fkey" FOREIGN KEY ("crm_lead_id") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_crm_lead_id_fkey" FOREIGN KEY ("crm_lead_id") REFERENCES "crm_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receipt_file_id_fkey" FOREIGN KEY ("receipt_file_id") REFERENCES "file_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_ledger_entries" ADD CONSTRAINT "cost_ledger_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_ledger_entries" ADD CONSTRAINT "cost_ledger_entries_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_ledger_entries" ADD CONSTRAINT "cost_ledger_entries_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_ledger_entries" ADD CONSTRAINT "cost_ledger_entries_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_ledger_entries" ADD CONSTRAINT "cost_ledger_entries_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_ledger_entries" ADD CONSTRAINT "cost_ledger_entries_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_created_by_agent_id_fkey" FOREIGN KEY ("created_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_versions" ADD CONSTRAINT "knowledge_versions_knowledge_id_fkey" FOREIGN KEY ("knowledge_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_source_knowledge_id_fkey" FOREIGN KEY ("source_knowledge_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_target_knowledge_id_fkey" FOREIGN KEY ("target_knowledge_id") REFERENCES "knowledge_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_links" ADD CONSTRAINT "knowledge_links_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sops" ADD CONSTRAINT "sops_knowledge_entry_id_fkey" FOREIGN KEY ("knowledge_entry_id") REFERENCES "knowledge_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_steps" ADD CONSTRAINT "sop_steps_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_executions" ADD CONSTRAINT "sop_executions_sop_id_fkey" FOREIGN KEY ("sop_id") REFERENCES "sops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sop_executions" ADD CONSTRAINT "sop_executions_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_source_id_source_type_fkey" FOREIGN KEY ("source_id", "source_type") REFERENCES "graph_nodes"("id", "type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_edges" ADD CONSTRAINT "graph_edges_target_id_target_type_fkey" FOREIGN KEY ("target_id", "target_type") REFERENCES "graph_nodes"("id", "type") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_integration_connection_id_fkey" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_credential_reference_id_fkey" FOREIGN KEY ("credential_reference_id") REFERENCES "credential_references"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_receipts" ADD CONSTRAINT "webhook_receipts_integration_connection_id_fkey" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_artifacts" ADD CONSTRAINT "report_artifacts_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Custom PostgreSQL guarantees that Prisma schema syntax cannot express.

-- Database-side UUIDs and update timestamps support reviewed administrative SQL,
-- seed tooling, and future workers that do not write through Prisma Client.
DO $aios$
DECLARE row_record record;
BEGIN
  FOR row_record IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'id' AND data_type = 'uuid'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN id SET DEFAULT gen_random_uuid()',
      row_record.table_schema,
      row_record.table_name
    );
  END LOOP;

  FOR row_record IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type = 'ARRAY' AND is_nullable = 'YES'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I SET NOT NULL',
      row_record.table_schema,
      row_record.table_name,
      row_record.column_name
    );
  END LOOP;
END
$aios$;

CREATE OR REPLACE FUNCTION public.aios_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END
$function$;

DO $aios$
DECLARE row_record record;
BEGIN
  FOR row_record IN
    SELECT table_schema, table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP',
      row_record.table_schema,
      row_record.table_name
    );
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.aios_set_updated_at()',
      'set_' || row_record.table_name || '_updated_at',
      row_record.table_schema,
      row_record.table_name
    );
  END LOOP;
END
$aios$;

-- Active-record uniqueness and replay safety.
CREATE UNIQUE INDEX owner_accounts_single_active_idx
  ON public.owner_accounts ((1)) WHERE active;

CREATE UNIQUE INDEX contacts_one_live_primary_per_client_idx
  ON public.contacts (client_id)
  WHERE is_primary AND archived_at IS NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX deletion_requests_one_active_per_entity_idx
  ON public.deletion_requests (entity_type, entity_id)
  WHERE status IN ('pending', 'executing');

CREATE UNIQUE INDEX sourced_leads_agency_provider_event_idx
  ON public.sourced_leads (source, provider_lead_id)
  WHERE scope = 'agency' AND client_id IS NULL AND provider_lead_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX sourced_leads_client_provider_event_idx
  ON public.sourced_leads (client_id, source, provider_lead_id)
  WHERE scope = 'client' AND client_id IS NOT NULL AND provider_lead_id IS NOT NULL AND deleted_at IS NULL;

-- Semantic search uses cosine distance (<=>). HNSW is suitable before cardinality
-- is known and does not require an IVFFlat training population.
CREATE INDEX agent_memories_embedding_hnsw_idx
  ON public.agent_memories USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX knowledge_entries_embedding_hnsw_idx
  ON public.knowledge_entries USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX knowledge_versions_embedding_hnsw_idx
  ON public.knowledge_versions USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL AND deleted_at IS NULL;

-- Full-text expression indexes. Queries must use the same regconfig and expression.
CREATE INDEX clients_search_idx ON public.clients USING gin (
  to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(industry, '') || ' ' || coalesce(notes, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX communications_search_idx ON public.communications USING gin (
  to_tsvector('english'::regconfig, coalesce(summary, '') || ' ' || coalesce(body, '') || ' ' || coalesce(next_action, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX projects_search_idx ON public.projects USING gin (
  to_tsvector('english'::regconfig, coalesce(name, '') || ' ' || coalesce(description, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX tasks_search_idx ON public.tasks USING gin (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(description, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX knowledge_entries_search_idx ON public.knowledge_entries USING gin (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX knowledge_versions_search_idx ON public.knowledge_versions USING gin (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX crm_leads_search_idx ON public.crm_leads USING gin (
  to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(interest, '') || ' ' || coalesce(notes, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX sourced_leads_search_idx ON public.sourced_leads USING gin (
  to_tsvector('simple'::regconfig, coalesce(name, '') || ' ' || coalesce(company, '') || ' ' || coalesce(title, ''))
) WHERE deleted_at IS NULL;
CREATE INDEX sops_search_idx ON public.sops USING gin (
  to_tsvector('english'::regconfig, coalesce(title, '') || ' ' || coalesce(expected_outcome, ''))
) WHERE deleted_at IS NULL;

-- Scope, lifecycle, assignment, range, and financial integrity.
ALTER TABLE public.content_strategies ADD CONSTRAINT content_strategies_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);
ALTER TABLE public.brand_profiles ADD CONSTRAINT brand_profiles_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);
ALTER TABLE public.content_artifacts ADD CONSTRAINT content_artifacts_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);
ALTER TABLE public.content_calendar_entries ADD CONSTRAINT content_calendar_entries_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);
ALTER TABLE public.sourced_leads ADD CONSTRAINT sourced_leads_scope_client_ck CHECK (
  (scope = 'client' AND client_id IS NOT NULL) OR (scope = 'agency' AND client_id IS NULL)
);

ALTER TABLE public.assignments ADD CONSTRAINT assignments_assignee_ck CHECK (
  (assignee_type = 'agent' AND agent_id IS NOT NULL AND owner_subject IS NULL)
  OR (assignee_type = 'human' AND agent_id IS NULL AND owner_subject IS NOT NULL)
);
ALTER TABLE public.time_entries ADD CONSTRAINT time_entries_values_ck CHECK (
  minutes >= 0 AND (hourly_rate IS NULL OR hourly_rate >= 0) AND (ended_at IS NULL OR ended_at >= started_at)
);
ALTER TABLE public.agent_memories ADD CONSTRAINT agent_memories_kind_ck CHECK (
  (kind <> 'vector' OR (embedding IS NOT NULL AND embedding_model IS NOT NULL))
  AND (kind <> 'key_value' OR key IS NOT NULL)
  AND version > 0
  AND (token_count IS NULL OR token_count >= 0)
);
ALTER TABLE public.knowledge_entries ADD CONSTRAINT knowledge_entries_embedding_model_ck CHECK (
  embedding IS NULL OR embedding_model IS NOT NULL
);
ALTER TABLE public.knowledge_versions ADD CONSTRAINT knowledge_versions_embedding_model_ck CHECK (
  embedding IS NULL OR embedding_model IS NOT NULL
);
ALTER TABLE public.webhook_receipts ADD CONSTRAINT webhook_receipts_retention_ck CHECK (
  attempt >= 0 AND retention_until >= received_at AND payload_hash ~ '^[0-9a-f]{64}$'
);
ALTER TABLE public.deletion_requests ADD CONSTRAINT deletion_requests_timeline_ck CHECK (
  execute_after >= requested_at AND recovery_until >= execute_after
);
ALTER TABLE public.file_metadata ADD CONSTRAINT file_metadata_size_ck CHECK (size_bytes >= 0);
ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_record_count_ck CHECK (record_count IS NULL OR record_count >= 0);
ALTER TABLE public.notification_deliveries ADD CONSTRAINT notification_deliveries_attempt_ck CHECK (attempt >= 0);
ALTER TABLE public.outbox_events ADD CONSTRAINT outbox_events_attempt_ck CHECK (attempt >= 0);
ALTER TABLE public.deliverables ADD CONSTRAINT deliverables_position_ck CHECK (position > 0);
ALTER TABLE public.sop_steps ADD CONSTRAINT sop_steps_position_ck CHECK (position > 0 AND sop_version > 0);
ALTER TABLE public.sop_executions ADD CONSTRAINT sop_executions_timeline_ck CHECK (
  sop_version > 0 AND (completed_at IS NULL OR completed_at >= started_at)
);

ALTER TABLE public.clients ADD CONSTRAINT clients_money_ck CHECK (mrr >= 0 AND total_revenue >= 0);
ALTER TABLE public.projects ADD CONSTRAINT projects_values_ck CHECK (
  (price IS NULL OR price >= 0) AND hours_spent >= 0 AND (due_date IS NULL OR start_date IS NULL OR due_date >= start_date)
);
ALTER TABLE public.agents ADD CONSTRAINT agents_values_ck CHECK (
  temperature BETWEEN 0 AND 2 AND max_tokens > 0 AND top_p BETWEEN 0 AND 1
  AND frequency_penalty BETWEEN -2 AND 2 AND (daily_token_budget IS NULL OR daily_token_budget >= 0)
  AND total_runs >= 0 AND total_cost_usd >= 0 AND success_rate BETWEEN 0 AND 100
);
ALTER TABLE public.agent_config_versions ADD CONSTRAINT agent_config_versions_values_ck CHECK (
  version > 0 AND temperature BETWEEN 0 AND 2 AND max_tokens > 0
  AND top_p BETWEEN 0 AND 1 AND frequency_penalty BETWEEN -2 AND 2
);
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_values_ck CHECK (
  tokens_input >= 0 AND tokens_output >= 0 AND cost_usd >= 0
  AND (duration_ms IS NULL OR duration_ms >= 0) AND attempt > 0
  AND (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);
ALTER TABLE public.content_artifact_versions ADD CONSTRAINT content_artifact_versions_values_ck CHECK (version > 0 AND cost_usd >= 0);
ALTER TABLE public.content_metrics ADD CONSTRAINT content_metrics_value_ck CHECK (value >= 0);
ALTER TABLE public.sourced_leads ADD CONSTRAINT sourced_leads_fit_score_ck CHECK (fit_score IS NULL OR fit_score BETWEEN 0 AND 100);
ALTER TABLE public.crm_leads ADD CONSTRAINT crm_leads_values_ck CHECK (
  (value IS NULL OR value >= 0) AND (expected_close_probability IS NULL OR expected_close_probability BETWEEN 0 AND 100)
);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_amount_ck CHECK (amount >= 0);
ALTER TABLE public.invoice_line_items ADD CONSTRAINT invoice_line_items_values_ck CHECK (
  position > 0 AND quantity >= 0 AND rate >= 0 AND amount >= 0
);
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_ck CHECK (amount >= 0);
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_ck CHECK (amount >= 0);
ALTER TABLE public.cost_ledger_entries ADD CONSTRAINT cost_ledger_entries_amount_ck CHECK (amount >= 0);
ALTER TABLE public.knowledge_entries ADD CONSTRAINT knowledge_entries_values_ck CHECK (version > 0 AND access_count >= 0);
ALTER TABLE public.knowledge_versions ADD CONSTRAINT knowledge_versions_version_ck CHECK (version > 0);
ALTER TABLE public.sops ADD CONSTRAINT sops_values_ck CHECK (current_version > 0 AND usage_count >= 0);

-- Preserve append-only evidence. Audit rows may only be updated to set archived_at.
CREATE OR REPLACE FUNCTION public.aios_protect_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'audit events are append-only';
  END IF;
  IF (to_jsonb(NEW) - 'archived_at') IS DISTINCT FROM (to_jsonb(OLD) - 'archived_at') THEN
    RAISE EXCEPTION 'audit events are immutable except for archived_at';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER protect_audit_events
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.aios_protect_audit_event();

-- The application uses a trusted server-only Prisma connection. Browser-facing
-- Supabase roles receive no direct table access; authorization is enforced by
-- validated owner identity before this connection is used.
DO $aios$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
  END IF;
END
$aios$;

RESET search_path;
