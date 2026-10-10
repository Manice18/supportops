-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPPORT_ENGINEER', 'SUPPORT_LEAD', 'ADMIN');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrgAccessRole" AS ENUM ('MEMBER', 'LEAD');

-- CreateEnum
CREATE TYPE "CaseStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'PENDING_APPROVAL', 'RESOLVED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('COMPLETED', 'FAILED', 'IN_PROGRESS');

-- CreateEnum
CREATE TYPE "BillingEntryType" AS ENUM ('CHARGE', 'CREDIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "BillingEntryStatus" AS ENUM ('POSTED', 'VOID', 'CREDITED');

-- CreateEnum
CREATE TYPE "CreditState" AS ENUM ('PROPOSED', 'APPROVED', 'APPLIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('RUNNING', 'COMPLETE', 'PARTIAL', 'NEEDS_ESCALATION', 'FAILED');

-- CreateEnum
CREATE TYPE "EnforcementMode" AS ENUM ('PROTECTED', 'BASELINE');

-- CreateEnum
CREATE TYPE "ToolAuthorizationStatus" AS ENUM ('PENDING', 'ALLOWED', 'DENIED', 'UNAVAILABLE', 'MALFORMED');

-- CreateEnum
CREATE TYPE "ToolExecutionStatus" AS ENUM ('NOT_EXECUTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOrganizationAccess" (
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "role" "OrgAccessRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserOrganizationAccess_pkey" PRIMARY KEY ("userId","orgId")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "CaseStatus" NOT NULL,
    "priority" "CasePriority" NOT NULL,
    "openedByUserId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "assistantId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "status" "CallStatus" NOT NULL,
    "failureCategory" TEXT,
    "durationSeconds" INTEGER,
    "requestId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "region" TEXT NOT NULL,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AxiomLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "callId" TEXT,
    "requestId" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "severity" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "safeMetadata" JSONB NOT NULL,

    CONSTRAINT "AxiomLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClickHouseEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "callId" TEXT,
    "requestId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "safeRequestMetadata" JSONB NOT NULL,
    "safeResponseMetadata" JSONB NOT NULL,

    CONSTRAINT "ClickHouseEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceSpan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "parentSpanId" TEXT,
    "callId" TEXT,
    "service" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,

    CONSTRAINT "TraceSpan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSample" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "tags" JSONB NOT NULL,

    CONSTRAINT "MetricSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlagSnapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "revision" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlagSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "callId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "type" "BillingEntryType" NOT NULL,
    "status" "BillingEntryStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Credit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "CreditState" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "Credit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLineItem" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "billingEntryId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "CreditLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investigation" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "InvestigationStatus" NOT NULL,
    "findings" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Investigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolAttempt" (
    "id" TEXT NOT NULL,
    "investigationId" TEXT,
    "supportCaseId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "sanitizedArguments" JSONB NOT NULL,
    "mode" "EnforcementMode" NOT NULL,
    "authorizationStatus" "ToolAuthorizationStatus" NOT NULL,
    "providerDecisionId" TEXT,
    "executed" BOOLEAN NOT NULL,
    "executionStatus" "ToolExecutionStatus" NOT NULL,
    "reasonCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "orgId" TEXT,
    "supportCaseId" TEXT,
    "action" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "sanitizedPayload" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL,
    "supportCaseId" TEXT NOT NULL,
    "proposedAction" JSONB NOT NULL,
    "status" "ApprovalStatus" NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserOrganizationAccess_orgId_idx" ON "UserOrganizationAccess"("orgId");

-- CreateIndex
CREATE INDEX "SupportCase_orgId_status_idx" ON "SupportCase"("orgId", "status");

-- CreateIndex
CREATE INDEX "SupportCase_assignedToUserId_idx" ON "SupportCase"("assignedToUserId");

-- CreateIndex
CREATE INDEX "Call_orgId_startedAt_idx" ON "Call"("orgId", "startedAt");

-- CreateIndex
CREATE INDEX "Call_requestId_idx" ON "Call"("requestId");

-- CreateIndex
CREATE INDEX "Call_traceId_idx" ON "Call"("traceId");

-- CreateIndex
CREATE INDEX "AxiomLog_orgId_timestamp_idx" ON "AxiomLog"("orgId", "timestamp");

-- CreateIndex
CREATE INDEX "AxiomLog_callId_idx" ON "AxiomLog"("callId");

-- CreateIndex
CREATE INDEX "AxiomLog_requestId_idx" ON "AxiomLog"("requestId");

-- CreateIndex
CREATE INDEX "ClickHouseEvent_orgId_timestamp_idx" ON "ClickHouseEvent"("orgId", "timestamp");

-- CreateIndex
CREATE INDEX "ClickHouseEvent_requestId_idx" ON "ClickHouseEvent"("requestId");

-- CreateIndex
CREATE INDEX "ClickHouseEvent_callId_idx" ON "ClickHouseEvent"("callId");

-- CreateIndex
CREATE INDEX "TraceSpan_orgId_traceId_idx" ON "TraceSpan"("orgId", "traceId");

-- CreateIndex
CREATE INDEX "TraceSpan_callId_idx" ON "TraceSpan"("callId");

-- CreateIndex
CREATE INDEX "MetricSample_region_service_metricName_timestamp_idx" ON "MetricSample"("region", "service", "metricName", "timestamp");

-- CreateIndex
CREATE INDEX "FeatureFlagSnapshot_orgId_flagKey_observedAt_idx" ON "FeatureFlagSnapshot"("orgId", "flagKey", "observedAt");

-- CreateIndex
CREATE INDEX "BillingEntry_orgId_createdAt_idx" ON "BillingEntry"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingEntry_callId_idx" ON "BillingEntry"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "Credit_idempotencyKey_key" ON "Credit"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Credit_orgId_supportCaseId_idx" ON "Credit"("orgId", "supportCaseId");

-- CreateIndex
CREATE INDEX "CreditLineItem_billingEntryId_idx" ON "CreditLineItem"("billingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLineItem_creditId_billingEntryId_key" ON "CreditLineItem"("creditId", "billingEntryId");

-- CreateIndex
CREATE INDEX "Investigation_supportCaseId_idx" ON "Investigation"("supportCaseId");

-- CreateIndex
CREATE INDEX "ToolAttempt_orgId_createdAt_idx" ON "ToolAttempt"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolAttempt_supportCaseId_idx" ON "ToolAttempt"("supportCaseId");

-- CreateIndex
CREATE INDEX "ToolAttempt_actorUserId_idx" ON "ToolAttempt"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditEvent_supportCaseId_timestamp_idx" ON "AuditEvent"("supportCaseId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_timestamp_idx" ON "AuditEvent"("orgId", "timestamp");

-- CreateIndex
CREATE INDEX "ApprovalRequest_supportCaseId_status_idx" ON "ApprovalRequest"("supportCaseId", "status");

-- AddForeignKey
ALTER TABLE "UserOrganizationAccess" ADD CONSTRAINT "UserOrganizationAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOrganizationAccess" ADD CONSTRAINT "UserOrganizationAccess_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_openedByUserId_fkey" FOREIGN KEY ("openedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AxiomLog" ADD CONSTRAINT "AxiomLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AxiomLog" ADD CONSTRAINT "AxiomLog_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickHouseEvent" ADD CONSTRAINT "ClickHouseEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClickHouseEvent" ADD CONSTRAINT "ClickHouseEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceSpan" ADD CONSTRAINT "TraceSpan_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceSpan" ADD CONSTRAINT "TraceSpan_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlagSnapshot" ADD CONSTRAINT "FeatureFlagSnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEntry" ADD CONSTRAINT "BillingEntry_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingEntry" ADD CONSTRAINT "BillingEntry_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Credit" ADD CONSTRAINT "Credit_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLineItem" ADD CONSTRAINT "CreditLineItem_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "Credit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLineItem" ADD CONSTRAINT "CreditLineItem_billingEntryId_fkey" FOREIGN KEY ("billingEntryId") REFERENCES "BillingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investigation" ADD CONSTRAINT "Investigation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolAttempt" ADD CONSTRAINT "ToolAttempt_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "Investigation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolAttempt" ADD CONSTRAINT "ToolAttempt_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolAttempt" ADD CONSTRAINT "ToolAttempt_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolAttempt" ADD CONSTRAINT "ToolAttempt_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "SupportCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

