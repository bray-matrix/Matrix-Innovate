import { pgTable, serial, text, integer, boolean, timestamp, jsonb, uniqueIndex, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { projectsTable } from "./execution";
import { initiativesTable } from "./initiatives";

const dates = () => ({
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const jiraConnectionStateTable = pgTable("jira_connection_state", {
  id: text("id").primaryKey().default("default"),
  baseUrl: text("base_url"),
  accountEmailMasked: text("account_email_masked"),
  configured: boolean("configured").notNull().default(false),
  lastTestStatus: text("last_test_status"),
  lastTestMessage: text("last_test_message"),
  lastTestAt: timestamp("last_test_at"),
  ...dates(),
});

export const jiraProjectsTable = pgTable("jira_projects", {
  id: serial("id").primaryKey(),
  jiraProjectId: text("jira_project_id").notNull().unique(),
  key: text("key").notNull(),
  name: text("name").notNull(),
  projectType: text("project_type"),
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  projectId: integer("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  lastDiscoveredAt: timestamp("last_discovered_at").notNull().defaultNow(),
  ...dates(),
});

export const jiraStatusMappingsTable = pgTable("jira_status_mappings", {
  id: serial("id").primaryKey(),
  jiraProjectId: integer("jira_project_id").references(() => jiraProjectsTable.id, { onDelete: "cascade" }),
  jiraStatusId: text("jira_status_id").notNull(),
  jiraStatusName: text("jira_status_name").notNull(),
  canonicalCategory: text("canonical_category").notNull().default("todo"),
  ...dates(),
}, (t) => [
  uniqueIndex("jira_status_scope_unique").on(t.jiraProjectId, t.jiraStatusId).where(sql`${t.jiraProjectId} is not null`),
  uniqueIndex("jira_status_global_unique").on(t.jiraStatusId).where(sql`${t.jiraProjectId} is null`),
  check("jira_status_category_check", sql`${t.canonicalCategory} in ('todo','in_progress','blocked','done')`),
]);

export const jiraFieldMappingsTable = pgTable("jira_field_mappings", {
  id: serial("id").primaryKey(),
  jiraProjectId: integer("jira_project_id").notNull().unique().references(() => jiraProjectsTable.id, { onDelete: "cascade" }),
  dueDateField: text("due_date_field"),
  blockedField: text("blocked_field"),
  storyPointsField: text("story_points_field"),
  additionalMappings: jsonb("additional_mappings").$type<Record<string, string> | null>(),
  ...dates(),
});

// Jira is authoritative. Persist a bounded, last-known metadata snapshot only
// so opening Linked Work does not require a live Jira request every time.
export const projectJiraLinksTable = pgTable("project_jira_links", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  jiraProjectId: integer("jira_project_id").references(() => jiraProjectsTable.id, { onDelete: "set null" }),
  jiraIssueId: text("jira_issue_id").notNull(),
  jiraIssueKey: text("jira_issue_key").notNull(),
  jiraIssueType: text("jira_issue_type").notNull(),
  relationshipType: text("relationship_type"),
  displayOrder: integer("display_order"),
  notes: text("notes"),
  createdBy: text("created_by"),
  cachedDetails: jsonb("cached_details").$type<{
    jiraIssueId: string; jiraIssueKey: string; jiraIssueType: string; summary: string;
    status: string; assignee: string | null; priority: string | null; updated: string | null;
    jiraProjectId: string; jiraProjectKey: string; jiraProjectName: string; url: string;
  } | null>(),
  jiraCheckedAt: timestamp("jira_checked_at"),
  jiraAttemptedAt: timestamp("jira_attempted_at"),
  ...dates(),
}, (t) => [
  uniqueIndex("project_jira_links_project_issue_unique").on(t.projectId, t.jiraIssueId),
]);

export type ProjectJiraLinkRecord = typeof projectJiraLinksTable.$inferSelect;

// Intake preserves only a verified Jira identity; details remain Jira-owned.
export const initiativeJiraLinksTable = pgTable("initiative_jira_links", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id").notNull().references(() => initiativesTable.id, { onDelete: "cascade" }),
  jiraProjectId: integer("jira_project_id").references(() => jiraProjectsTable.id, { onDelete: "set null" }),
  jiraIssueId: text("jira_issue_id").notNull(),
  jiraIssueKey: text("jira_issue_key").notNull(),
  jiraIssueType: text("jira_issue_type").notNull(),
  ...dates(),
}, (t) => [
  uniqueIndex("initiative_jira_links_initiative_issue_unique").on(t.initiativeId, t.jiraIssueId),
]);