import { sql } from "drizzle-orm";
import { pgTable, jsonb, text, timestamp, boolean, integer, bigint, serial, numeric, uuid, index, uniqueIndex, check, smallint, primaryKey } from "drizzle-orm/pg-core";

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
  openedBy: text("opened_by"), // the user who opened the in-app browser (plan #40); only they get its live view
  openedAt: timestamp("opened_at"),
}, (t) => [uniqueIndex("merimen_conn_org").on(t.orgId)]);

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
  photosDoneAt: timestamp("photos_done_at", { withTimezone: true }), // photo naming desk: "done" pressed
  photosRev: integer("photos_rev").notNull().default(0), // bumped on every reorder
  photosSnapshot: text("photos_snapshot"), // fingerprint of names + order + extras when 完成 was pressed (null = not done)
  photosArrangedAt: timestamp("photos_arranged_at", { withTimezone: true }), // opening order applied once after naming
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // soft delete by the user (0015): hidden everywhere, files and the audit row stay
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

// Photo naming desk (plan #9). Shown name = finalName ?? modelName.
export const casePhotos = pgTable("case_photos", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  position: integer("position").notNull(), // current display order (0-based)
  modelName: text("model_name"), // Claude's pick after code normalisation; null = not named / "__none__"
  confidence: numeric("confidence", { precision: 5, scale: 4 }),
  finalName: text("final_name"), // only when the adjuster changed it
  confirmed: boolean("confirmed").notNull().default(false),
  origN: integer("orig_n").notNull().default(0), // 1-based upload order, never changes
  srcName: text("src_name").notNull().default(""),
  blobPath: text("blob_path").notNull().default(""), // private Blob pathnames, never sent to the client
  thumbPath: text("thumb_path").notNull().default(""),
  nameState: text("name_state").notNull().default("pending"), // pending | running | named | failed
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  how: text("how"), // rule (fixed opening shot) | model
  alts: jsonb("alts").$type<string[]>().notNull().default([]),
  nameError: text("name_error"),
  namedAt: timestamp("named_at", { withTimezone: true }),
  version: integer("version").notNull().default(0), // bumped on every user write
  contentHash: text("content_hash"),
}, (t) => [
  uniqueIndex("case_photos_case_orig").on(t.caseId, t.origN),
  index("case_photos_case_pos").on(t.caseId, t.position),
  index("case_photos_case_state").on(t.caseId, t.nameState),
  uniqueIndex("case_photos_case_hash").on(t.caseId, t.contentHash).where(sql`${t.contentHash} IS NOT NULL`),
]);

// Parts the car needs that have no photo.
export const caseExtras = pgTable("case_extras", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("case_extras_case_name").on(t.caseId, sql`lower(${t.name})`)]);

// Blob paths handed out for upload but not registered yet; rows older than 24 h are swept with their blobs.
export const photoUploads = pgTable("photo_uploads", {
  path: text("path").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  step: text("step").notNull(), // intake | read_docs | photo_model | phase_a | phase_b | checks | report
  state: text("state").notNull().default("queued"), // queued | running | done | failed | paused | cancelled
  attempts: integer("attempts").notNull().default(0),
  lockedBy: text("locked_by"),
  lockedAt: timestamp("locked_at"),
  notBefore: timestamp("not_before"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [index("jobs_state_idx").on(t.state, t.createdAt)]);

export const caseEvents = pgTable("case_events", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  at: timestamp("at").notNull().defaultNow(),
  step: text("step").notNull(),
  message: text("message").notNull(),
  // the user removed the line from the Activity list (plan #148): display only, backend readers ignore it. hiddenBy = users.id
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenBy: text("hidden_by"),
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
}, (t) => [
  // One purchase row and one refund row per order, even from a manual script (plan #12, DPR-12-2 D8).
  uniqueIndex("credits_ledger_order_reason_uq").on(t.reason).where(sql`${t.reason} LIKE 'purchase:%' OR ${t.reason} LIKE 'refund:%'`),
  uniqueIndex("credits_ledger_case_once").on(t.reason).where(sql`${t.reason} LIKE 'case:%'`), // migration 0011
]);

// Payments (plan chunhee-work/mrm#12). Money in: one row per checkout attempt.
// The pack snapshot columns are written once at insert and never updated; only status, paid_at,
// provider_ref and test_mode change.
export const paymentOrders = pgTable("payment_orders", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  provider: text("provider").notNull(), // lemonsqueezy | toyyibpay | mock
  checkoutRef: text("checkout_ref"), // set at checkout creation: toyyibPay bill code / Lemon Squeezy checkout id
  providerRef: text("provider_ref"), // set when paid: Lemon Squeezy order id / toyyibPay reference number
  packId: text("pack_id").notNull(),
  packTitle: text("pack_title").notNull(),
  packVersion: integer("pack_version").notNull(),
  credits: integer("credits").notNull(),
  amountMinor: bigint("amount_minor", { mode: "number" }).notNull(), // US cents / MYR sen
  currency: text("currency").notNull(),
  status: text("status").notNull().default("pending"), // pending | paid | failed | refunded ("expired" is display-only)
  testMode: boolean("test_mode").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  paidAt: timestamp("paid_at"),
}, (t) => [
  index("payment_orders_org_idx").on(t.orgId, t.createdAt),
  uniqueIndex("payment_orders_provider_ref_uq").on(t.provider, t.providerRef).where(sql`${t.providerRef} IS NOT NULL`),
  check("payment_orders_status_chk", sql`${t.status} IN ('pending','paid','failed','refunded')`),
]);

export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  orgId: text("org_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  detail: text("detail"),
  at: timestamp("at").notNull().defaultNow(),
});

// ---- Admin backoffice ledgers (additive; plan: chunhee-work/mrm#4) ----
// One row per billed Claude response, or one row per failed call. No prompts, no document text.
// user/org/case ids have no foreign keys on purpose: history must survive deletes, and system calls have none.
export const llmCalls = pgTable("llm_calls", {
  id: serial("id").primaryKey(),
  at: timestamp("at").notNull().defaultNow(),
  requestId: text("request_id").notNull().unique(), // provider request id, or err:<call uuid> when none
  userId: text("user_id"),
  orgId: text("org_id"),
  caseId: text("case_id"),
  purpose: text("purpose").notNull(), // read_docs | name_photos | system_other
  model: text("model").notNull(),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
  cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }).notNull().default(0),
  cacheWrite5mTokens: bigint("cache_write_5m_tokens", { mode: "number" }).notNull().default(0),
  cacheWrite1hTokens: bigint("cache_write_1h_tokens", { mode: "number" }).notNull().default(0),
  costUsd: numeric("cost_usd", { precision: 14, scale: 8 }), // null = model has no price entry ("unpriced")
  latencyMs: integer("latency_ms"),
  ok: boolean("ok").notNull().default(true),
  errorClass: text("error_class"),
}, (t) => [
  index("llm_calls_at_idx").on(t.at),
  index("llm_calls_user_at_idx").on(t.userId, t.at),
  index("llm_calls_case_idx").on(t.caseId),
  check("llm_calls_request_id_len", sql`char_length(${t.requestId}) <= 80`),
]);

// Only the kind, the recipient's domain, and the outcome. Never the subject, body or links.
export const emailLog = pgTable("email_log", {
  id: serial("id").primaryKey(),
  at: timestamp("at").notNull().defaultNow(),
  kind: text("kind").notNull(), // verify | reset | other
  recipientDomain: text("recipient_domain").notNull(),
  status: text("status").notNull(), // sent | failed | skipped
  errorClass: text("error_class"),
}, (t) => [index("email_log_at_idx").on(t.at)]);

// ---- Merimen connection by browser extension (plan #38, P1). Additive; nothing outside src/lib/ext reads these. ----
// Per-org switch. A row with enabled = true needs a consent reference (the owner's written consent from Merimen or the firm).
export const extOrgSettings = pgTable("ext_org_settings", {
  orgId: text("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  consentAuthority: text("consent_authority"), // merimen_general | firm
  consentReference: text("consent_reference"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
// The customer's acknowledgement: user, org, time, wording version, optional firm label (never a password).
export const extConsents = pgTable("ext_consents", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  wordingVersion: text("wording_version").notNull(),
  firmLabel: text("firm_label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
// One-time pairing code, stored hashed. 10 minutes, single use.
export const extPairingCodes = pgTable("ext_pairing_codes", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull().unique(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  hourBucket: bigint("hour_bucket", { mode: "number" }).notNull(), // floor(epoch / 1 h): the rate-limit window
  slot: integer("slot").notNull(), // 1..5 inside the window; the unique index below makes the limit race-proof
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("ext_pairing_user_slot").on(t.userId, t.hourBucket, t.slot)]);
// Used from P2 on (install tokens, jobs, step checkpoints). Created now so the owner approves one migration.
export const extInstalls = pgTable("ext_installs", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  refreshHash: text("refresh_hash").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at"),
});
export const extJobs = pgTable("ext_jobs", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("queued"), // queued | claimed | running | done | failed | needs_user | cancelled
  leaseId: text("lease_id"),
  installId: text("install_id"),
  tabId: text("tab_id"),
  leaseUntil: timestamp("lease_until"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const extJobSteps = pgTable("ext_job_steps", {
  id: serial("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => extJobs.id, { onDelete: "cascade" }),
  stepCode: text("step_code").notNull(),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  actorUserId: text("actor_user_id"),
  at: timestamp("at").notNull().defaultNow(),
});

// Linux worker (not applied in production until the owner approves). Passwords are ciphertext only.
export const workerRuntimes = pgTable("worker_runtimes", {
  id: text("id").primaryKey(),
  seenAt: timestamp("seen_at").notNull().defaultNow(),
  photoModel: text("photo_model"),
  chromeOk: boolean("chrome_ok").notNull().default(false),
});
export const workerSessions = pgTable("worker_sessions", {
  orgId: text("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  accountKey: text("account_key").notNull().default("default"),
  port: integer("port"),
  status: text("status").notNull().default("idle"),
  wanted: text("wanted").notNull().default("none"),
  startedBy: text("started_by"),
  lastSeenAt: timestamp("last_seen_at"),
  detail: text("detail"),
});
export const merimenCredentials = pgTable("merimen_credentials", {
  orgId: text("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  usernameHint: text("username_hint").notNull(),
  wrappedDek: text("wrapped_dek").notNull(),
  dekNonce: text("dek_nonce").notNull(),
  usernameCt: text("username_ct").notNull(),
  usernameNonce: text("username_nonce").notNull(),
  passwordCt: text("password_ct").notNull(),
  passwordNonce: text("password_nonce").notNull(),
  verifyState: text("verify_state").notNull().default("queued"), // queued | checking | ok | bad_credentials | locked | otp | unknown
  loginAttempts: integer("login_attempts").notNull().default(0),
  blocked: boolean("blocked").notNull().default(false),
  workshopName: text("workshop_name"), // migration 0013: what the user types once on the front page
  managerName: text("manager_name"),
  adjusterName: text("adjuster_name"),
  profileVersion: integer("profile_version").notNull().default(0), // next value of merimen_profile_seq on every save: the worker replaces what it remembered
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
});
// migration 0014: up to three workshops per account, and the workshop (1..3) a case belongs to (no row = workshop 1)
export const merimenWorkshops = pgTable("merimen_workshops", {
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  slot: smallint("slot").notNull(),
  name: text("name").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.slot] })]);
export const merimenCaseWorkshop = pgTable("merimen_case_workshop", {
  caseId: text("case_id").primaryKey().references(() => cases.id, { onDelete: "cascade" }),
  slot: smallint("slot").notNull(),
  lockedName: text("locked_name"),
  lockedAt: timestamp("locked_at"), // set by the worker when it makes the case in Merimen: the workshop is then fixed
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
export const merimenCredAudit = pgTable("merimen_cred_audit", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull(),
  userId: text("user_id"),
  action: text("action").notNull(),
  at: timestamp("at").notNull().defaultNow(),
});
export const merimenOtp = pgTable("merimen_otp", {
  id: serial("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  caseId: text("case_id").references(() => cases.id, { onDelete: "cascade" }),
  state: text("state").notNull().default("waiting"),
  codeCt: text("code_ct"),
  codeNonce: text("code_nonce"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

// Progress screenshots of the Merimen tab (not applied in production until the owner approves). Private Blob pathname only.
// userId = the user who submitted the case; only that user can see a row.
export const caseScreenshots = pgTable("case_screenshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  jobId: integer("job_id"),
  step: text("step").notNull(), // login_verified | case_opened | photos_named | documents_uploaded | case_complete | failed
  captionZh: text("caption_zh").notNull(),
  captionEn: text("caption_en").notNull(),
  blobPathname: text("blob_pathname").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (t) => [index("case_screenshots_case_idx").on(t.caseId, t.userId, t.createdAt)]);

// Photo sync (migration 0010): what a Phase A / Phase B photo step uploaded to Merimen, or, in a dry run, would do.
export const photoUploadLog = pgTable("photo_upload_log", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  phase: text("phase").notNull(), // A | B
  mode: text("mode").notNull(), // dry | live
  action: text("action").notNull(), // upload | relabel_reorder | none | refused
  merimenCount: integer("merimen_count"),
  photos: jsonb("photos").$type<{ id: number; src: string; name: string; fileType: string; position: number }[]>().notNull().default([]),
  would: jsonb("would").$type<{ upload?: number; relabel?: number; reorder?: number }>().notNull().default({}),
  corrections: jsonb("corrections").$type<{ src: string; model: string | null; final: string }[]>().notNull().default([]),
  snapshot: text("snapshot"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("photo_upload_log_case_idx").on(t.caseId, t.createdAt)]);

// Step 2 (Select Parts + Labour) from the final photo names: what the worker planned, the two-way check, the AI's review (migration 0010).
export const step2Log = pgTable("step2_log", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  mode: text("mode").notNull(), // dry | live
  action: text("action").notNull(), // plan | applied | refused | unreadable | none
  plan: jsonb("plan").$type<Record<string, unknown>>().notNull().default({}),
  check: jsonb("check").$type<{ add?: string[]; remove?: string[]; ok?: boolean }>().notNull().default({}),
  ai: jsonb("ai").$type<Record<string, unknown>>().notNull().default({}),
  playbook: text("playbook"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("step2_log_case_idx").on(t.caseId, t.createdAt)]);

// The photo model's learning data (migration 0010): every photo's final name at Done, flagged when the adjuster changed the model's name.
export const photoLearning = pgTable("photo_learning", {
  id: serial("id").primaryKey(),
  caseId: text("case_id").notNull().references(() => cases.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull(),
  photoId: integer("photo_id").notNull(),
  contentHash: text("content_hash"),
  blobPath: text("blob_path").notNull().default(""),
  modelName: text("model_name"),
  label: text("label").notNull(), // the final name (the training label)
  changed: boolean("changed").notNull().default(false), // the adjuster's name differs from the model's
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  exportedAt: timestamp("exported_at", { withTimezone: true }), // null = not yet taken into a training build
}, (t) => [uniqueIndex("photo_learning_case_photo").on(t.caseId, t.photoId), index("photo_learning_open").on(t.exportedAt)]);
