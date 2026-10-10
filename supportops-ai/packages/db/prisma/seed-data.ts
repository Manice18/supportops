import type { PrismaClient } from "@prisma/client";
import {
  flagshipDataset,
  seedAccess,
  seedCalls,
  seedCases,
  seedCreditAdjustments,
  seedCustomers,
  seedOrganizations,
  seedPaymentReturns,
  seedRefunds,
  seedSubscriptions,
  seedUsers,
} from "@supportops/mock-data";

export async function seedDemoData(prisma: PrismaClient): Promise<void> {
  for (const org of seedOrganizations) {
    await prisma.organization.upsert({
      where: { id: org.id },
      create: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        region: org.region,
        status: org.status,
        createdAt: new Date(org.createdAt),
      },
      update: {
        name: org.name,
        plan: org.plan,
        region: org.region,
        status: org.status,
      },
    });
  }

  for (const user of seedUsers) {
    await prisma.user.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: new Date(user.createdAt),
      },
      update: {
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  }

  for (const access of seedAccess) {
    await prisma.userOrganizationAccess.upsert({
      where: { userId_orgId: { userId: access.userId, orgId: access.orgId } },
      create: {
        userId: access.userId,
        orgId: access.orgId,
        role: access.role,
        createdAt: new Date(access.createdAt),
      },
      update: { role: access.role },
    });
  }

  for (const supportCase of seedCases) {
    await prisma.supportCase.upsert({
      where: { id: supportCase.id },
      create: {
        id: supportCase.id,
        orgId: supportCase.orgId,
        title: supportCase.title,
        description: supportCase.description,
        status: supportCase.status,
        priority: supportCase.priority,
        openedByUserId: supportCase.openedByUserId,
        assignedToUserId: supportCase.assignedToUserId,
        createdAt: new Date(supportCase.createdAt),
        updatedAt: new Date(supportCase.updatedAt),
      },
      update: {
        orgId: supportCase.orgId,
        title: supportCase.title,
        description: supportCase.description,
        status: supportCase.status,
        priority: supportCase.priority,
        openedByUserId: supportCase.openedByUserId,
        assignedToUserId: supportCase.assignedToUserId,
        updatedAt: new Date(supportCase.updatedAt),
      },
    });
  }

  for (const customer of seedCustomers) {
    await prisma.customer.upsert({
      where: { id: customer.id },
      create: { ...customer, createdAt: new Date(customer.createdAt) },
      update: {
        displayName: customer.displayName,
        email: customer.email,
        plan: customer.plan,
        region: customer.region,
        status: customer.status,
        paymentBrand: customer.paymentBrand,
        paymentLast4: customer.paymentLast4,
      },
    });
  }

  for (const subscription of seedSubscriptions) {
    await prisma.subscription.upsert({
      where: { id: subscription.id },
      create: { ...subscription, renewalAt: new Date(subscription.renewalAt) },
      update: {
        planName: subscription.planName,
        status: subscription.status,
        amountCents: subscription.amountCents,
        renewalAt: new Date(subscription.renewalAt),
      },
    });
  }

  for (const item of [...seedCalls, ...flagshipDataset.calls]) {
    await prisma.call.upsert({
      where: { id: item.id },
      create: {
        ...item,
        startedAt: new Date(item.startedAt),
        endedAt: new Date(item.endedAt),
      },
      update: {
        status: item.status,
        failureCategory: item.failureCategory,
        durationSeconds: item.durationSeconds,
        customerId: item.customerId,
      },
    });
  }

  for (const refund of seedRefunds) {
    await prisma.refundRequest.upsert({
      where: { id: refund.id },
      create: {
        ...refund,
        decidedAt: refund.decidedAt ? new Date(refund.decidedAt) : null,
        createdAt: new Date(refund.createdAt),
      },
      update: {
        status: refund.status,
        decidedByUserId: refund.decidedByUserId,
        decidedAt: refund.decidedAt ? new Date(refund.decidedAt) : null,
      },
    });
  }

  for (const entry of seedCreditAdjustments) {
    await prisma.creditAdjustment.upsert({
      where: { id: entry.id },
      create: { ...entry, createdAt: new Date(entry.createdAt) },
      update: { amountCents: entry.amountCents, reason: entry.reason },
    });
  }

  for (const item of seedPaymentReturns) {
    await prisma.paymentReturn.upsert({
      where: { id: item.id },
      create: { ...item, createdAt: new Date(item.createdAt) },
      update: { status: item.status, providerReference: item.providerReference },
    });
  }

  for (const log of flagshipDataset.logs) {
    await prisma.axiomLog.upsert({
      where: { id: log.id },
      create: { ...log, timestamp: new Date(log.timestamp) },
      update: { message: log.message, safeMetadata: log.safeMetadata },
    });
  }
  for (const event of flagshipDataset.events) {
    await prisma.clickHouseEvent.upsert({
      where: { id: event.id },
      create: { ...event, timestamp: new Date(event.timestamp) },
      update: { statusCode: event.statusCode, latencyMs: event.latencyMs },
    });
  }
  for (const span of flagshipDataset.spans) {
    await prisma.traceSpan.upsert({
      where: { id: span.id },
      create: { ...span, startTime: new Date(span.startTime) },
      update: { status: span.status, durationMs: span.durationMs },
    });
  }
  for (const metric of flagshipDataset.metrics) {
    await prisma.metricSample.upsert({
      where: { id: metric.id },
      create: { ...metric, timestamp: new Date(metric.timestamp) },
      update: { value: metric.value },
    });
  }
  for (const flag of flagshipDataset.flags) {
    await prisma.featureFlagSnapshot.upsert({
      where: { id: flag.id },
      create: { ...flag, observedAt: new Date(flag.observedAt) },
      update: { enabled: flag.enabled, revision: flag.revision },
    });
  }
  for (const entry of flagshipDataset.billing) {
    await prisma.billingEntry.upsert({
      where: { id: entry.id },
      create: { ...entry, createdAt: new Date(entry.createdAt) },
      update: { amountCents: entry.amountCents, status: entry.status },
    });
  }
}

export async function clearDemoData(prisma: PrismaClient): Promise<void> {
  await prisma.paymentReturn.deleteMany();
  await prisma.creditAdjustment.deleteMany();
  await prisma.refundRequest.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.creditLineItem.deleteMany();
  await prisma.credit.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.toolAttempt.deleteMany();
  await prisma.investigation.deleteMany();
  await prisma.featureFlagSnapshot.deleteMany();
  await prisma.metricSample.deleteMany();
  await prisma.traceSpan.deleteMany();
  await prisma.clickHouseEvent.deleteMany();
  await prisma.axiomLog.deleteMany();
  await prisma.billingEntry.deleteMany();
  await prisma.call.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.supportCase.deleteMany();
  await prisma.userOrganizationAccess.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
}
