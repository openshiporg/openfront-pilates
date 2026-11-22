import type { Context } from ".keystone/types";
import { currentRoleActor } from "../access/currentRoleActor";
import { guardKeystonePrismaResults, withKeystonePrismaTransaction } from "../lib/prisma-result";
import { lockTransactionKey } from "./classCapacity";
import { registerClassPayLineHooks } from "./fees";

/**
 * Instructor pay (dissertation D8, W10, §4.9). Lines are written by Close class and appointment
 * completion; nothing moves money to instructors. A run locks a period's lines, exports CSV, and
 * records how each instructor was paid.
 */

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function classPay(rate: { classBase: number; perHeadBonus: number; bonusAbove: number; floor: number }, headcount: number) {
  const extra = Math.max(headcount - rate.bonusAbove, 0);
  const computed = rate.classBase + extra * rate.perHeadBonus;
  const amount = Math.max(computed, rate.floor);
  const rule = `${money(rate.classBase)} base + ${extra} × ${money(rate.perHeadBonus)} above ${rate.bonusAbove}${amount > computed ? `, raised to the ${money(rate.floor)} floor` : ""} = ${money(amount)}`;
  return { amount, rule };
}

export async function rateFor(tx: any, organizationId: string, instructorId: string, at: Date) {
  return tx.payRate.findFirst({ where: { organizationId, instructorId, effectiveFrom: { lte: at } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
}

/** Close class writes (or re-accrues) the class's pay line from its headcount (attended). */
export async function writeClassPayLineInTx(txIn: any, input: { organizationId: string; classInstanceId: string; actorId: string }) {
  const tx = guardKeystonePrismaResults(txIn);
  const instance = await tx.classInstance.findFirst({ where: { id: input.classInstanceId, organizationId: input.organizationId }, include: { classSchedule: { select: { instructorId: true } } } });
  const instructorId = instance?.instructorId ?? instance?.classSchedule?.instructorId;
  if (!instance || !instructorId || instance.isCancelled) return null;
  const rate = await rateFor(tx, input.organizationId, instructorId, instance.date);
  if (!rate) return null;
  const headcount = await tx.classBooking.count({ where: { classInstanceId: instance.id, organizationId: input.organizationId, status: "attended" } });
  const { amount, rule } = classPay(rate, headcount);
  const lineKey = `class:${instance.id}`;
  const existing = await tx.payLine.findFirst({ where: { organizationId: input.organizationId, lineKey } });
  if (existing && ["locked", "paid"].includes(existing.status)) return existing;
  const data = { instructorId, kind: "class", classInstanceId: instance.id, workDate: instance.date, headcount, amount, currencyCode: rate.currencyCode || "USD", rule, status: "accrued", payRateId: rate.id, createdById: input.actorId };
  return existing ? tx.payLine.update({ where: { id: existing.id }, data }) : tx.payLine.create({ data: { ...data, organizationId: input.organizationId, lineKey } });
}

export async function voidClassPayLineInTx(txIn: any, input: { organizationId: string; classInstanceId: string }) {
  const tx = guardKeystonePrismaResults(txIn);
  const line = await tx.payLine.findFirst({ where: { organizationId: input.organizationId, lineKey: `class:${input.classInstanceId}` } });
  if (!line) return null;
  if (["locked", "paid"].includes(line.status)) throw new Error("This pay line is in a locked payroll run");
  return tx.payLine.update({ where: { id: line.id }, data: { status: "void" } });
}

registerClassPayLineHooks(writeClassPayLineInTx, voidClassPayLineInTx);

/** Completing an appointment writes the instructor's per-session line (private, duet or trio). */
export async function writeAppointmentPayLineInTx(txIn: any, input: { organizationId: string; appointmentId: string; actorId: string }) {
  const tx = guardKeystonePrismaResults(txIn);
  const appt = await tx.appointment.findFirst({ where: { id: input.appointmentId, organizationId: input.organizationId }, include: { sessionType: { select: { capacity: true, name: true } } } });
  if (!appt) return null;
  const rate = await rateFor(tx, input.organizationId, appt.instructorId, appt.startTime);
  if (!rate) return null;
  const size = appt.sessionType?.capacity ?? 1;
  const amount = size >= 3 ? rate.trioAmount : size === 2 ? rate.duetAmount : rate.privateAmount;
  const label = size >= 3 ? "trio" : size === 2 ? "duet" : "private";
  const lineKey = `appointment:${appt.id}`;
  const existing = await tx.payLine.findFirst({ where: { organizationId: input.organizationId, lineKey } });
  if (existing) return existing;
  return tx.payLine.create({ data: { organizationId: input.organizationId, lineKey, instructorId: appt.instructorId, kind: "appointment", appointmentId: appt.id, workDate: appt.startTime, headcount: size, amount, currencyCode: rate.currencyCode || "USD", rule: `${money(amount)} per ${label} session`, status: "accrued", payRateId: rate.id, createdById: input.actorId } });
}

async function payrollActor(context: Context) {
  const actor = await currentRoleActor(context);
  if (!(actor as any).canManagePayroll && !actor.canManageAllRecords) throw new Error("Payroll permission required");
  return actor;
}

const cents = (value: unknown, label: string) => {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 10_000_000) throw new Error(`${label} must be whole cents from 0`);
  return n;
};

export async function savePayRate(_root: unknown, args: { instructorId: string; data: any }, context: Context) {
  const actor = await payrollActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const instructor = await prisma.instructor.findFirst({ where: { id: args.instructorId, organizationId: actor.organizationId }, select: { id: true } });
  if (!instructor) throw new Error("Instructor not found");
  const d = args.data || {};
  const effectiveFrom = d.effectiveFrom ? new Date(d.effectiveFrom) : new Date();
  if (!Number.isFinite(effectiveFrom.getTime())) throw new Error("Effective date is invalid");
  const bonusAbove = Number(d.bonusAbove ?? 0);
  if (!Number.isInteger(bonusAbove) || bonusAbove < 0 || bonusAbove > 500) throw new Error("Bonus threshold must be 0 to 500 clients");
  // A new rate row applies from its date; past lines keep the rate they were computed with.
  return prisma.payRate.create({ data: {
    organizationId: actor.organizationId, instructorId: instructor.id, effectiveFrom, bonusAbove,
    classBase: cents(d.classBase, "Class base"), perHeadBonus: cents(d.perHeadBonus, "Per-head bonus"), floor: cents(d.floor, "Floor"),
    privateAmount: cents(d.privateAmount, "Private"), duetAmount: cents(d.duetAmount, "Duet"), trioAmount: cents(d.trioAmount, "Trio"), hourlyAmount: cents(d.hourlyAmount, "Hourly"),
    currencyCode: String(d.currencyCode || "USD").toUpperCase(),
  } });
}

/** Manual lines: hourly work (desk shift, training) or an adjustment (may be negative), with a note. */
export async function addPayLine(_root: unknown, args: { instructorId: string; kind: string; workDate: string; minutes?: number | null; amount?: number | null; note: string; idempotencyKey: string }, context: Context) {
  const actor = await payrollActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const instructor = await prisma.instructor.findFirst({ where: { id: args.instructorId, organizationId: actor.organizationId }, select: { id: true } });
  if (!instructor) throw new Error("Instructor not found");
  const note = String(args.note || "").trim();
  if (note.length < 3) throw new Error("A note is required");
  const workDate = new Date(args.workDate);
  if (!Number.isFinite(workDate.getTime())) throw new Error("Work date is invalid");
  const lineKey = `manual:${String(args.idempotencyKey || "").slice(0, 200)}`;
  if (lineKey.length < 15) throw new Error("A request key is required");
  const existing = await prisma.payLine.findFirst({ where: { organizationId: actor.organizationId, lineKey } });
  if (existing) return existing;
  if (args.kind === "hourly") {
    const minutes = Number(args.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 24 * 60) throw new Error("Minutes must be 1 to 1440");
    const rate = await rateFor(prisma, actor.organizationId, instructor.id, workDate);
    if (!rate?.hourlyAmount) throw new Error("This instructor has no hourly rate");
    const amount = Math.round((rate.hourlyAmount * minutes) / 60);
    return prisma.payLine.create({ data: { organizationId: actor.organizationId, lineKey, instructorId: instructor.id, kind: "hourly", workDate, hours: minutes, amount, currencyCode: rate.currencyCode, rule: `${minutes} min × ${money(rate.hourlyAmount)}/h = ${money(amount)}`, note, status: "accrued", payRateId: rate.id, createdById: actor.userId } });
  }
  if (args.kind !== "adjustment") throw new Error("A manual line is hourly or an adjustment");
  const amount = Number(args.amount);
  if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10_000_000) throw new Error("Adjustment must be non-zero whole cents");
  return prisma.payLine.create({ data: { organizationId: actor.organizationId, lineKey, instructorId: instructor.id, kind: "adjustment", workDate, amount, rule: `Adjustment ${money(amount)}`, note, status: "accrued", createdById: actor.userId } });
}

export async function openPayrollRun(_root: unknown, args: { from: string; to: string }, context: Context) {
  const actor = await payrollActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const from = new Date(args.from), to = new Date(args.to);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) throw new Error("The period is invalid");
  const lines = await prisma.payLine.findMany({ where: { organizationId: actor.organizationId, status: "accrued", runId: null, workDate: { gte: from, lt: to } }, select: { id: true, amount: true }, take: 10000 });
  return prisma.$transaction(async (tx: any) => {
    const run = await tx.payrollRun.create({ data: { organizationId: actor.organizationId, periodStart: from, periodEnd: to, status: "draft", total: lines.reduce((sum: number, l: any) => sum + l.amount, 0) } });
    if (lines.length) await tx.payLine.updateMany({ where: { id: { in: lines.map((l: any) => l.id) }, status: "accrued", runId: null }, data: { runId: run.id } });
    return { ...run, lines: lines.length };
  });
}

export async function lockPayrollRun(_root: unknown, { runId }: { runId: string }, context: Context) {
  const actor = await payrollActor(context);
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `payroll-run:${runId}`);
    const run = await tx.payrollRun.findFirst({ where: { id: runId, organizationId: actor.organizationId } });
    if (!run) throw new Error("Payroll run not found");
    if (run.status !== "draft") return run;
    const lines = await tx.payLine.findMany({ where: { runId: run.id, status: "accrued" }, select: { id: true, amount: true } });
    await tx.payLine.updateMany({ where: { runId: run.id, status: "accrued" }, data: { status: "locked" } });
    // Lines voided after the run was drafted leave it.
    await tx.payLine.updateMany({ where: { runId: run.id, status: "void" }, data: { runId: null } });
    return tx.payrollRun.update({ where: { id: run.id }, data: { status: "locked", lockedAt: new Date(), lockedById: actor.userId, total: lines.reduce((s: number, l: any) => s + l.amount, 0) } });
  });
}

export async function markPayrollPaid(_root: unknown, args: { runId: string; payouts: Array<{ instructorId: string; method: string; reference?: string | null; paidAt?: string | null }> }, context: Context) {
  const actor = await payrollActor(context);
  return withKeystonePrismaTransaction(context.prisma, async (tx: any) => {
    await lockTransactionKey(tx, `payroll-run:${args.runId}`);
    const run = await tx.payrollRun.findFirst({ where: { id: args.runId, organizationId: actor.organizationId } });
    if (!run) throw new Error("Payroll run not found");
    if (run.status === "draft") throw new Error("Lock the run before recording payments");
    const lines = await tx.payLine.findMany({ where: { runId: run.id, status: { in: ["locked", "paid"] } }, include: { instructor: { include: { user: { select: { name: true } } } } } });
    const totals = new Map<string, { name: string; amount: number }>();
    for (const l of lines) totals.set(l.instructorId, { name: l.instructor?.user?.name ?? "", amount: (totals.get(l.instructorId)?.amount ?? 0) + l.amount });
    const previous: any[] = Array.isArray(run.payouts) ? run.payouts : [];
    const payouts = [...previous];
    for (const p of args.payouts || []) {
      if (!totals.has(p.instructorId)) throw new Error("An instructor in the payouts has no lines in this run");
      if (!["bank_transfer", "cash", "check", "payroll_provider", "other"].includes(p.method)) throw new Error("Method is bank_transfer, cash, check, payroll_provider or other");
      const entry = { instructorId: p.instructorId, name: totals.get(p.instructorId)!.name, amount: totals.get(p.instructorId)!.amount, method: p.method, reference: String(p.reference || "").slice(0, 200), paidAt: p.paidAt ? new Date(p.paidAt).toISOString() : new Date().toISOString(), recordedBy: actor.userId };
      const i = payouts.findIndex((x) => x.instructorId === p.instructorId);
      if (i >= 0) payouts[i] = entry; else payouts.push(entry);
      await tx.payLine.updateMany({ where: { runId: run.id, instructorId: p.instructorId, status: "locked" }, data: { status: "paid" } });
    }
    const allPaid = [...totals.keys()].every((id) => payouts.some((p) => p.instructorId === id));
    return tx.payrollRun.update({ where: { id: run.id }, data: { payouts, status: allPaid ? "paid" : "locked", paidAt: allPaid ? new Date() : null } });
  });
}

const csvCell = (value: unknown) => {
  const text = String(value ?? "");
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export async function exportPayrollRun(_root: unknown, { runId }: { runId: string }, context: Context) {
  const actor = await payrollActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, organizationId: actor.organizationId } });
  if (!run) throw new Error("Payroll run not found");
  const lines = await prisma.payLine.findMany({ where: { runId: run.id, status: { not: "void" } }, include: { instructor: { include: { user: { select: { name: true, email: true } } } }, classInstance: { include: { classSchedule: { select: { name: true } } } } }, orderBy: [{ instructorId: "asc" }, { workDate: "asc" }], take: 10000 });
  const header = ["Instructor", "Email", "Date", "Kind", "Class or session", "Headcount", "Minutes", "Amount", "Currency", "Rule", "Note", "Status"];
  const rows = lines.map((l: any) => [l.instructor?.user?.name, l.instructor?.user?.email, new Date(l.workDate).toISOString().slice(0, 10), l.kind, l.classInstance?.classSchedule?.name ?? (l.appointmentId ? "Appointment" : ""), l.headcount, l.hours, (l.amount / 100).toFixed(2), l.currencyCode, l.rule, l.note, l.status]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
  return { filename: `payroll-${new Date(run.periodStart).toISOString().slice(0, 10)}-to-${new Date(run.periodEnd).toISOString().slice(0, 10)}.csv`, csv, lines: lines.length, total: lines.reduce((s: number, l: any) => s + l.amount, 0) };
}

/** Rates, open lines and runs for the Payroll page; an instructor sees only their own (D13). */
export async function payrollWorkspace(_root: unknown, _args: unknown, context: Context) {
  const actor = await currentRoleActor(context);
  const prisma = guardKeystonePrismaResults(context.prisma as any);
  const staff = (actor as any).canManagePayroll || actor.canManageAllRecords;
  const own = staff ? null : await prisma.instructor.findFirst({ where: { organizationId: actor.organizationId, userId: actor.userId }, select: { id: true } });
  if (!staff && !own) throw new Error("Payroll permission required");
  const scope = own ? { instructorId: own.id } : {};
  const [instructors, rates, lines, runs] = await Promise.all([
    prisma.instructor.findMany({ where: { organizationId: actor.organizationId, ...(own ? { id: own.id } : {}) }, include: { user: { select: { name: true } } }, take: 500 }),
    prisma.payRate.findMany({ where: { organizationId: actor.organizationId, ...scope }, orderBy: [{ effectiveFrom: "desc" }], take: 1000 }),
    prisma.payLine.findMany({ where: { organizationId: actor.organizationId, ...scope, status: { in: ["accrued", "locked"] } }, orderBy: [{ workDate: "desc" }], take: 500 }),
    staff ? prisma.payrollRun.findMany({ where: { organizationId: actor.organizationId }, orderBy: [{ periodStart: "desc" }], take: 50 }) : Promise.resolve([]),
  ]);
  return { canManage: Boolean(staff), instructors: instructors.map((i: any) => ({ id: i.id, name: i.user?.name ?? "", currentRate: rates.find((r: any) => r.instructorId === i.id) ?? null })), lines, runs };
}

export const payrollTypeDefs = `
  extend type Query {
    payrollWorkspace: JSON!
    exportPayrollRun(runId: ID!): JSON!
  }
  extend type Mutation {
    savePayRate(instructorId: ID!, data: JSON!): JSON!
    addPayLine(instructorId: ID!, kind: String!, workDate: String!, minutes: Int, amount: Int, note: String!, idempotencyKey: String!): JSON!
    openPayrollRun(from: String!, to: String!): JSON!
    lockPayrollRun(runId: ID!): JSON!
    markPayrollPaid(runId: ID!, payouts: JSON!): JSON!
  }
`;
