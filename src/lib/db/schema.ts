import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Users ───────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 256 }).unique().notNull(),
  displayName: varchar("display_name", { length: 256 }),
  planTier: varchar("plan_tier", { length: 20 }).default("free"),
  creditsRemaining: integer("credits_remaining").default(3),
  creditsUsedTotal: integer("credits_used_total").default(0),
  sessionCount: integer("session_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── DNA Profiles ────────────────────────────────────────────────────────────────
export const dnaProfiles = pgTable("dna_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  skillContent: text("skill_content").notNull(),
  confidence: real("confidence").default(0.3),
  sourceType: varchar("source_type", { length: 20 }),
  sourceUrl: varchar("source_url", { length: 512 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── Projects ────────────────────────────────────────────────────────────────────
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  title: varchar("title", { length: 256 }),
  platform: varchar("platform", { length: 20 }),
  clipCount: integer("clip_count"),
  status: varchar("status", { length: 20 }).default("pending"),
  dnaProfileId: uuid("dna_profile_id").references(() => dnaProfiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ── Jobs ────────────────────────────────────────────────────────────────────────
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id),
  userId: uuid("user_id").references(() => users.id),
  status: varchar("status", { length: 20 }).default("pending"),
  currentStep: varchar("current_step", { length: 100 }),
  progressPct: integer("progress_pct").default(0),
  errorMessage: text("error_message"),
  videoUrls: jsonb("video_urls"),
  resultUrls: jsonb("result_urls"),
  creditsConsumed: real("credits_consumed").default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Clips ───────────────────────────────────────────────────────────────────────
export const clips = pgTable("clips", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobs.id),
  projectId: uuid("project_id").references(() => projects.id),
  title: varchar("title", { length: 256 }),
  startS: real("start_s"),
  endS: real("end_s"),
  durationS: real("duration_s"),
  mood: varchar("mood", { length: 20 }),
  hookText: text("hook_text"),
  why: text("why"),
  scores: jsonb("scores"),
  renderUrl: varchar("render_url", { length: 512 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── B-Roll Catalog ──────────────────────────────────────────────────────────────
export const brollCatalog = pgTable("broll_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  storageUrl: varchar("storage_url", { length: 512 }).notNull(),
  autoTags: jsonb("auto_tags"),
  userTags: jsonb("user_tags"),
  durationS: real("duration_s"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Feedback Comments ───────────────────────────────────────────────────────────
export const feedbackComments = pgTable("feedback_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  clipId: uuid("clip_id").references(() => clips.id),
  sessionId: varchar("session_id", { length: 100 }),
  timestampS: real("timestamp_s").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Credit Transactions ─────────────────────────────────────────────────────────
export const creditTransactions = pgTable("credit_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  jobId: uuid("job_id").references(() => jobs.id),
  creditsAmount: real("credits_amount").notNull(),
  transactionType: varchar("transaction_type", { length: 20 }),
  breakdown: jsonb("breakdown"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── Relations ───────────────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  dnaProfiles: many(dnaProfiles),
  projects: many(projects),
  jobs: many(jobs),
  brollCatalog: many(brollCatalog),
  feedbackComments: many(feedbackComments),
  creditTransactions: many(creditTransactions),
}));

export const dnaProfilesRelations = relations(dnaProfiles, ({ one, many }) => ({
  user: one(users, {
    fields: [dnaProfiles.userId],
    references: [users.id],
  }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, {
    fields: [projects.userId],
    references: [users.id],
  }),
  dnaProfile: one(dnaProfiles, {
    fields: [projects.dnaProfileId],
    references: [dnaProfiles.id],
  }),
  jobs: many(jobs),
  clips: many(clips),
}));

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  project: one(projects, {
    fields: [jobs.projectId],
    references: [projects.id],
  }),
  user: one(users, {
    fields: [jobs.userId],
    references: [users.id],
  }),
  clips: many(clips),
  creditTransactions: many(creditTransactions),
}));

export const clipsRelations = relations(clips, ({ one, many }) => ({
  job: one(jobs, {
    fields: [clips.jobId],
    references: [jobs.id],
  }),
  project: one(projects, {
    fields: [clips.projectId],
    references: [projects.id],
  }),
  feedbackComments: many(feedbackComments),
}));

export const brollCatalogRelations = relations(brollCatalog, ({ one }) => ({
  user: one(users, {
    fields: [brollCatalog.userId],
    references: [users.id],
  }),
}));

export const feedbackCommentsRelations = relations(feedbackComments, ({ one }) => ({
  user: one(users, {
    fields: [feedbackComments.userId],
    references: [users.id],
  }),
  clip: one(clips, {
    fields: [feedbackComments.clipId],
    references: [clips.id],
  }),
}));

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  user: one(users, {
    fields: [creditTransactions.userId],
    references: [users.id],
  }),
  job: one(jobs, {
    fields: [creditTransactions.jobId],
    references: [jobs.id],
  }),
}));
