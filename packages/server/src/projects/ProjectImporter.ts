import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { KnowledgeStore } from '../knowledge/KnowledgeStore.js';
import type { KnowledgeCategory, KnowledgeMetadata } from '../knowledge/types.js';
import { KNOWLEDGE_CATEGORIES } from '../knowledge/types.js';
import type { CollectiveMemory, MemoryCategory } from '../coordination/knowledge/CollectiveMemory.js';
import type { ProjectRegistry } from './ProjectRegistry.js';
import { logger } from '../utils/logger.js';

// ── Types ────────────────────────────────────────────────────────────

const MEMORY_CATEGORIES: readonly MemoryCategory[] = ['pattern', 'decision', 'expertise', 'gotcha'];

export interface ProjectImportOptions {
  projectId: string;
  /** Path to the .flightdeck/ directory on disk */
  sourcePath: string;
  /** When true, counts what would be imported without writing */
  dryRun?: boolean;
}

export interface ImportSectionReport {
  imported: number;
  skipped: number;
  errors: string[];
}

export interface ProjectImportReport {
  success: boolean;
  projectId: string;
  knowledge: ImportSectionReport;
  memory: ImportSectionReport;
  sessions: ImportSectionReport;
  warnings: string[];
}

export interface ProjectImporterDeps {
  knowledgeStore: KnowledgeStore;
  collectiveMemory: CollectiveMemory;
  projectRegistry: ProjectRegistry;
}

// ── Helpers ──────────────────────────────────────────────────────────

interface KnowledgeFileEntry {
  key: string;
  content: string;
  metadata?: KnowledgeMetadata;
}

interface MemoryFileEntry {
  key: string;
  value: string;
  source: string;
}

interface SessionFileEntry {
  leadId: string;
  task?: string;
  role?: string;
  status?: string;
  startedAt?: string;
  endedAt?: string;
}

function isKnowledgeEntry(v: unknown): v is KnowledgeFileEntry {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.key === 'string' && typeof obj.content === 'string';
}

function isMemoryEntry(v: unknown): v is MemoryFileEntry {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.key === 'string' && typeof obj.value === 'string' && typeof obj.source === 'string';
}

function isSessionEntry(v: unknown): v is SessionFileEntry {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return typeof obj.leadId === 'string';
}

// ── Class ────────────────────────────────────────────────────────────

export class ProjectImporter {
  private readonly knowledgeStore: KnowledgeStore;
  private readonly collectiveMemory: CollectiveMemory;
  private readonly projectRegistry: ProjectRegistry;

  constructor(deps: ProjectImporterDeps) {
    this.knowledgeStore = deps.knowledgeStore;
    this.collectiveMemory = deps.collectiveMemory;
    this.projectRegistry = deps.projectRegistry;
  }

  import(options: ProjectImportOptions): ProjectImportReport {
    const report: ProjectImportReport = {
      success: true,
      projectId: options.projectId,
      knowledge: { imported: 0, skipped: 0, errors: [] },
      memory: { imported: 0, skipped: 0, errors: [] },
      sessions: { imported: 0, skipped: 0, errors: [] },
      warnings: [],
    };

    if (!existsSync(options.sourcePath)) {
      report.success = false;
      report.warnings.push(`Source path does not exist: ${options.sourcePath}`);
      return report;
    }

    this.importKnowledge(options, report);
    this.importMemory(options, report);
    this.importSessions(options, report);
    this.importSharedArtifacts(options, report);

    logger.info({
      module: 'project',
      msg: 'Project import completed',
      projectId: options.projectId,
      knowledge: report.knowledge.imported,
      memory: report.memory.imported,
      sessions: report.sessions.imported,
    });

    return report;
  }

  // ── Knowledge ────────────────────────────────────────────────────

  private importKnowledge(options: ProjectImportOptions, report: ProjectImportReport): void {
    const dir = join(options.sourcePath, 'knowledge');
    if (!existsSync(dir)) return;

    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch (err) {
      report.knowledge.errors.push(`Failed to read knowledge directory: ${String(err)}`);
      return;
    }

    for (const file of files) {
      const category = basename(file, '.json');
      if (!KNOWLEDGE_CATEGORIES.includes(category as KnowledgeCategory)) {
        report.warnings.push(`Skipping unknown knowledge category: ${category}`);
        continue;
      }

      let entries: unknown[];
      try {
        const raw = readFileSync(join(dir, file), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          report.knowledge.errors.push(`${file}: expected JSON array`);
          continue;
        }
        entries = parsed;
      } catch (err) {
        report.knowledge.errors.push(`${file}: ${String(err)}`);
        continue;
      }

      for (const entry of entries) {
        if (!isKnowledgeEntry(entry)) {
          report.knowledge.skipped++;
          report.knowledge.errors.push(`${file}: invalid entry (missing key or content)`);
          continue;
        }

        if (options.dryRun) {
          report.knowledge.imported++;
          continue;
        }

        try {
          this.knowledgeStore.put(
            options.projectId,
            category as KnowledgeCategory,
            entry.key,
            entry.content,
            entry.metadata,
          );
          report.knowledge.imported++;
        } catch (err) {
          report.knowledge.errors.push(`${file}/${entry.key}: ${String(err)}`);
        }
      }
    }
  }

  // ── Memory ───────────────────────────────────────────────────────

  private importMemory(options: ProjectImportOptions, report: ProjectImportReport): void {
    const dir = join(options.sourcePath, 'memory');
    if (!existsSync(dir)) return;

    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch (err) {
      report.memory.errors.push(`Failed to read memory directory: ${String(err)}`);
      return;
    }

    for (const file of files) {
      const category = basename(file, '.json');
      if (!MEMORY_CATEGORIES.includes(category as MemoryCategory)) {
        report.warnings.push(`Skipping unknown memory category: ${category}`);
        continue;
      }

      let entries: unknown[];
      try {
        const raw = readFileSync(join(dir, file), 'utf-8');
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          report.memory.errors.push(`${file}: expected JSON array`);
          continue;
        }
        entries = parsed;
      } catch (err) {
        report.memory.errors.push(`${file}: ${String(err)}`);
        continue;
      }

      for (const entry of entries) {
        if (!isMemoryEntry(entry)) {
          report.memory.skipped++;
          report.memory.errors.push(`${file}: invalid entry (missing key, value, or source)`);
          continue;
        }

        if (options.dryRun) {
          report.memory.imported++;
          continue;
        }

        try {
          this.collectiveMemory.remember(
            category as MemoryCategory,
            entry.key,
            entry.value,
            entry.source,
            options.projectId,
          );
          report.memory.imported++;
        } catch (err) {
          report.memory.errors.push(`${file}/${entry.key}: ${String(err)}`);
        }
      }
    }
  }

  // ── Sessions ─────────────────────────────────────────────────────

  private importSessions(options: ProjectImportOptions, report: ProjectImportReport): void {
    const dir = join(options.sourcePath, 'sessions');
    if (!existsSync(dir)) return;

    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.json'));
    } catch (err) {
      report.sessions.errors.push(`Failed to read sessions directory: ${String(err)}`);
      return;
    }

    // Load existing sessions once to check for duplicates
    let existingSessions: Array<{ leadId: string; task?: string | null }> = [];
    try {
      existingSessions = this.projectRegistry.getSessions(options.projectId);
    } catch {
      // If getSessions fails, proceed without duplicate detection
    }

    for (const file of files) {
      let session: unknown;
      try {
        const raw = readFileSync(join(dir, file), 'utf-8');
        session = JSON.parse(raw);
      } catch (err) {
        report.sessions.errors.push(`${file}: ${String(err)}`);
        continue;
      }

      if (!isSessionEntry(session)) {
        report.sessions.skipped++;
        report.sessions.errors.push(`${file}: invalid session (missing leadId)`);
        continue;
      }

      // Duplicate detection: same leadId + task
      const isDuplicate = existingSessions.some(
        s => s.leadId === session.leadId && (s.task ?? null) === (session.task ?? null),
      );
      if (isDuplicate) {
        report.sessions.skipped++;
        continue;
      }

      if (options.dryRun) {
        report.sessions.imported++;
        continue;
      }

      try {
        this.projectRegistry.startSession(
          options.projectId,
          session.leadId,
          session.task,
          session.role,
        );
        report.sessions.imported++;
      } catch (err) {
        report.sessions.errors.push(`${file}: ${String(err)}`);
      }
    }
  }

  // ── Shared Artifacts ─────────────────────────────────────────────

  private importSharedArtifacts(options: ProjectImportOptions, report: ProjectImportReport): void {
    const dir = join(options.sourcePath, 'shared');
    if (!existsSync(dir)) return;

    let subdirs: string[];
    try {
      subdirs = readdirSync(dir).filter(name => {
        try {
          return statSync(join(dir, name)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch (err) {
      report.knowledge.errors.push(`Failed to read shared directory: ${String(err)}`);
      return;
    }

    for (const subdir of subdirs) {
      // Subdirectory naming: {role}-{shortId}
      const role = subdir.split('-')[0] || subdir;
      const subdirPath = join(dir, subdir);

      let mdFiles: string[];
      try {
        mdFiles = readdirSync(subdirPath).filter(f => f.endsWith('.md'));
      } catch {
        continue;
      }

      for (const mdFile of mdFiles) {
        const filename = basename(mdFile, '.md');
        const key = `artifact:${role}:${filename}`;

        let content: string;
        try {
          content = readFileSync(join(subdirPath, mdFile), 'utf-8');
        } catch (err) {
          report.knowledge.errors.push(`shared/${subdir}/${mdFile}: ${String(err)}`);
          continue;
        }

        if (options.dryRun) {
          report.knowledge.imported++;
          continue;
        }

        try {
          const metadata: KnowledgeMetadata = { source: 'import', role };
          this.knowledgeStore.put(
            options.projectId,
            'episodic',
            key,
            content,
            metadata,
          );
          report.knowledge.imported++;
        } catch (err) {
          report.knowledge.errors.push(`shared/${subdir}/${mdFile}: ${String(err)}`);
        }
      }
    }
  }
}
