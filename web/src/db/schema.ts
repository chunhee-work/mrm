import { pgTable, jsonb, text, timestamp, boolean, integer, bigint, serial, numeric, index, uniqueIndex } from "drizzle-orm/pg-core";

// ---- Better Auth tables (names/fields required by Better Auth) ----
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ---- Product tables ----
export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const memberships = pgTable("memberships", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("owner"), // owner | member
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("memberships_org_user").on(t.orgId, t.userId)]);

// Stage 2: Merimen session params are secret -> stored encrypted only (AES-GCM, key SESSION_ENC_KEY).
export const merimenConnections = pgTable("merimen_connections", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  browserbaseSessionId: text("browserbase_session_id"),
  status: text("status").notNull().default("none"), // none | waiting_login | connected | expired
  sessionParamsEnc: text("session_params_enc"),
  connectedAt: timestamp("connected_at"),
  lastCheckAt: timestamp("last_check_at"),
});

export const cases = pgTable("cases", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  plate: text("plate").notNull(),
  // uploaded | reading | naming | phase_a | waiting_user | phase_b | checking | done | failed | pending_doc
  status: text("status").notNull().default("uploaded"),
  merimenCaseId: text("merimen_caseid"),
  merimenExtId: text("merimen_extid"),
  insurer: text("insurer"),
  carModel: text("car_model"),
  totalRm: numeric("total_rm", { precision: 12, scale: 2 }),
  pendingDoc: text("pending_doc"),
  caseData: jsonb("case_data"), // extracted by Claude (step 1)
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  doneAt: timestamp("done_at"),
}, (t) => [index("cases_org_idx").on(t.orgId, t.createdAt)]);

export const caseFiles = pgTable("case_files", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // bundle_zip | pdf | photo
  blobUrl: text("blob_url").notNull(),
  originalName: text("original_name").notNull(),
  size: bigint("size", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const casePhotos = pgTable("case_photos", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  modelName: text("model_name"),
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  finalName: text("final_name"),
  confirmed: boolean("confirmed").notNull().default(false),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  step: text("step").notNull(), // intake | read_docs | photo_model | phase_a | phase_b | checks | report
  state: text("state").notNull().default("queued"), // queued | running | done | failed
  attempts: integer("attempts").notNull().default(0),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("jobs_state_idx").on(t.state, t.createdAt)]);

export const caseEvents = pgTable("case_events", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  at: timestamp("at").notNull().defaultNow(),
  step: text("step").notNull(),
  message: text("message").notNull(),
});

export const usage = pgTable("usage", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
  cacheTokens: bigint("cache_tokens", { mode: "number" }).notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
  browserMinutes: numeric("browser_minutes", { precision: 8, scale: 2 }).notNull().default("0"),
});

export const creditsLedger = pgTable("credits_ledger", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  caseId: text("case_id"),
  at: timestamp("at").notNull().defaultNow(),
});

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  orgId: text("org_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  detail: text("detail"),
  at: timestamp("at").notNull().defaultNow(),
});
