import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { parseCalendarDate } from '../../lib/finance/dates.ts';
import { euroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { goals, projectCapacity, projects } from '../db/schema.ts';

const name = z.string().trim().min(1).max(100);
const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const optional = <T extends z.ZodType>(schema: T) => schema.nullable().optional().default(null);
const goalInput = z.object({ name, targetCents: cents.refine((value) => value > 0), progressCents: cents, targetDate: optional(z.string()), priority: z.number().int().min(1).max(999) }).strict();
const projectInput = z.object({ goalId: optional(z.uuid()), name, status: z.enum(['backlog', 'active', 'paused', 'done']), priority: z.number().int().min(1).max(999), estimatedCostCents: optional(cents), estimatedEffortMinutes: optional(z.number().int().min(0).max(44_640)), nextAction: z.string().trim().max(240) }).strict();
const updateGoalInput = goalInput.extend({ id: z.uuid() }).strict();
const updateProjectInput = projectInput.extend({ id: z.uuid() }).strict();
const capacityInput = z.object({ monthlyCapacityMinutes: z.number().int().min(0).max(44_640) }).strict();
const activeProjectLimit = 2;

export type CreateGoal = z.input<typeof goalInput>;
export type UpdateGoal = z.input<typeof updateGoalInput>;
export type CreateProject = z.input<typeof projectInput>;
export type UpdateProject = z.input<typeof updateProjectInput>;
export type SetProjectCapacity = z.input<typeof capacityInput>;

function now() { return new Date().toISOString(); }

/** Intentions privées : elles restent séparées des transactions et des calculs CFO. */
export function goalsRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);
  function ownedGoal(id: string) { return db.select().from(goals).where(and(eq(goals.id, id), eq(goals.ownerId, ownerId))).get(); }
  function validateGoal(goalId: string | null) { if (goalId !== null && !ownedGoal(goalId)) throw new Error('Objectif introuvable.'); }
  function goalValues(values: z.output<typeof goalInput>) { return { ...values, targetCents: euroCents(values.targetCents), progressCents: euroCents(values.progressCents), targetDate: values.targetDate === null ? null : parseCalendarDate(values.targetDate) }; }
  function projectValues(values: z.output<typeof projectInput>) { validateGoal(values.goalId); return { ...values, estimatedCostCents: values.estimatedCostCents === null ? null : euroCents(values.estimatedCostCents) }; }
  return {
    createGoal(input: CreateGoal) { const values = goalValues(goalInput.parse(input)); const timestamp = now(); return db.insert(goals).values({ id: randomUUID(), ownerId, ...values, createdAt: timestamp, updatedAt: timestamp }).returning().get(); },
    updateGoal(input: UpdateGoal) { const { id, ...inputValues } = updateGoalInput.parse(input); if (!ownedGoal(id)) throw new Error('Objectif introuvable.'); return db.update(goals).set({ ...goalValues(inputValues), updatedAt: now() }).where(and(eq(goals.id, id), eq(goals.ownerId, ownerId))).returning().get(); },
    createProject(input: CreateProject) { const values = projectValues(projectInput.parse(input)); const timestamp = now(); return db.insert(projects).values({ id: randomUUID(), ownerId, ...values, createdAt: timestamp, updatedAt: timestamp }).returning().get(); },
    updateProject(input: UpdateProject) { const { id, ...inputValues } = updateProjectInput.parse(input); if (!db.select().from(projects).where(and(eq(projects.id, id), eq(projects.ownerId, ownerId))).get()) throw new Error('Projet introuvable.'); return db.update(projects).set({ ...projectValues(inputValues), updatedAt: now() }).where(and(eq(projects.id, id), eq(projects.ownerId, ownerId))).returning().get(); },
    setCapacity(input: SetProjectCapacity) {
      const values = capacityInput.parse(input); const timestamp = now();
      const existing = db.select({ id: projectCapacity.id }).from(projectCapacity).where(eq(projectCapacity.ownerId, ownerId)).get();
      return existing
        ? db.update(projectCapacity).set({ ...values, updatedAt: timestamp }).where(eq(projectCapacity.id, existing.id)).returning().get()
        : db.insert(projectCapacity).values({ id: randomUUID(), ownerId, ...values, createdAt: timestamp, updatedAt: timestamp }).returning().get();
    },
    dashboard() {
      const objectiveRows = db.select().from(goals).where(eq(goals.ownerId, ownerId)).orderBy(asc(goals.priority), asc(goals.targetDate), asc(goals.name)).all();
      const projectRows = db.select().from(projects).where(eq(projects.ownerId, ownerId)).orderBy(asc(projects.priority), asc(projects.name)).all();
      const capacity = db.select().from(projectCapacity).where(eq(projectCapacity.ownerId, ownerId)).get() ?? null;
      const activeProjects = projectRows.filter((project) => project.status === 'active');
      const activeWithEffort = activeProjects.filter((project) => project.estimatedEffortMinutes !== null);
      const activeEffortMinutes = activeWithEffort.reduce((total, project) => total + project.estimatedEffortMinutes!, 0);
      const capacityStatus = capacity === null || activeWithEffort.length !== activeProjects.length ? 'unknown' as const : activeEffortMinutes <= capacity.monthlyCapacityMinutes ? 'compatible' as const : 'watch' as const;
      return { goals: objectiveRows, projects: projectRows, capacity, activeProjectCount: activeProjects.length, activeProjectLimit, activeProjectLimitStatus: activeProjects.length <= activeProjectLimit ? 'within-limit' as const : 'watch' as const, activeEffortProjectCount: activeWithEffort.length, activeEffortMinutes, capacityStatus };
    },
  };
}
