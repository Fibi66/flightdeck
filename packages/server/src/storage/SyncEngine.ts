import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';
import type { StorageManager } from './StorageManager.js';
import { atomicWriteFile } from './StorageManager.js';
import type { ProjectMetadata, SyncManifest } from './types.js';
import { SYNC_SCHEMA_VERSION } from './types.js';
import { logger } from '../utils/logger.js';

/** Data provider interface — abstracts SQLite reads for the sync engine. */
export interface SyncDataProvider {
  /** Get all active project IDs */
  getActiveProjectIds(): string[];
  /** Get project metadata by ID */
  getProject(id: string): { id: string; name: string; cwd: string | null; status: string; createdAt: string; updatedAt: string } | undefined;
  /** Get agents for a project (id, role, status) */
  getAgentRoster(projectId: string): Array<{ id: string; role: string; status: string; model?: string; task?: string }>;
}

const DEFAULT_SYNC_INTERVAL_MS = 30_000;

/**
 * Periodically syncs SQLite state to the filesystem mirror.
 *
 * - SQLite → Filesystem: every ~30s (project.yaml, agents/roster.yaml)
 * - Filesystem → SQLite: on demand via reverseSync() (detects user edits)
 */
export class SyncEngine {
  private timer: ReturnType<typeof setInterval> | null = null;
  private intervalMs: number;

  constructor(
    private storage: StorageManager,
    private provider: SyncDataProvider,
    options?: { intervalMs?: number },
  ) {
    this.intervalMs = options?.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  }

  /** Start the periodic sync loop. */
  startSync(intervalMs?: number): void {
    if (this.timer) return; // already running
    this.intervalMs = intervalMs ?? this.intervalMs;
    logger.debug({ module: 'storage', msg: 'SyncEngine started', intervalMs: this.intervalMs });

    // Run initial sync immediately
    this.syncNow();

    this.timer = setInterval(() => {
      try {
        this.syncNow();
      } catch (err) {
        logger.error({ module: 'storage', msg: 'Sync cycle failed', err: (err as Error).message });
      }
    }, this.intervalMs);
  }

  /** Stop the sync loop. */
  stopSync(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.debug({ module: 'storage', msg: 'SyncEngine stopped' });
    }
  }

  /** Whether the sync loop is running. */
  get isRunning(): boolean {
    return this.timer !== null;
  }

  /**
   * Run a single sync cycle: SQLite → Filesystem for all active projects.
   * Returns the number of projects synced.
   */
  syncNow(): number {
    const projectIds = this.provider.getActiveProjectIds();
    let synced = 0;

    for (const projectId of projectIds) {
      try {
        this.syncProject(projectId);
        synced++;
      } catch (err) {
        logger.warn({ module: 'storage', msg: 'Failed to sync project', projectId, err: (err as Error).message });
      }
    }

    return synced;
  }

  /**
   * Sync a single project: write project.yaml and agents/roster.yaml.
   */
  private syncProject(projectId: string): void {
    const project = this.provider.getProject(projectId);
    if (!project) return;

    // Ensure directory structure
    this.storage.ensureProjectDirs(projectId);
    const projectDir = this.storage.getProjectDir(projectId);
    const manifest = this.storage.readSyncManifest(projectId);
    const newFiles: Record<string, string> = {};

    // 1. Write project.yaml
    const metadata: ProjectMetadata = {
      title: project.name,
      id: project.id,
      workingDir: project.cwd,
      storageMode: this.storage.getStorageMode(projectId),
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
    const yamlContent = YAML.stringify(metadata, { lineWidth: 0 });
    const yamlHash = contentHash(yamlContent);
    const existingYamlHash = manifest.files['project.yaml'];

    if (yamlHash !== existingYamlHash) {
      atomicWriteFile(join(projectDir, 'project.yaml'), yamlContent);
      newFiles['project.yaml'] = yamlHash;
    } else {
      newFiles['project.yaml'] = existingYamlHash;
    }

    // 2. Write agents/roster.yaml
    const agents = this.provider.getAgentRoster(projectId);
    const rosterContent = YAML.stringify({ agents }, { lineWidth: 0 });
    const rosterHash = contentHash(rosterContent);
    const existingRosterHash = manifest.files['agents/roster.yaml'];

    if (rosterHash !== existingRosterHash) {
      atomicWriteFile(join(projectDir, 'agents', 'roster.yaml'), rosterContent);
      newFiles['agents/roster.yaml'] = rosterHash;
    } else {
      newFiles['agents/roster.yaml'] = existingRosterHash;
    }

    // Update manifest
    const newManifest: SyncManifest = {
      lastSyncedAt: new Date().toISOString(),
      files: newFiles,
      schemaVersion: SYNC_SCHEMA_VERSION,
    };
    this.storage.writeSyncManifest(projectId, newManifest);
  }

  /**
   * Reverse sync: detect user edits to filesystem and report them.
   * Compares current file content hashes against the sync manifest.
   *
   * Returns a list of files that were modified by the user since last sync.
   * Callers are responsible for reading the files and applying changes to SQLite.
   */
  reverseSync(projectId: string): string[] {
    const projectDir = this.storage.getProjectDir(projectId);
    const manifest = this.storage.readSyncManifest(projectId);
    const modified: string[] = [];

    for (const [relPath, lastHash] of Object.entries(manifest.files)) {
      const absPath = join(projectDir, relPath);
      if (!existsSync(absPath)) {
        // File was deleted by user
        modified.push(relPath);
        continue;
      }
      try {
        const currentContent = readFileSync(absPath, 'utf-8');
        const currentHash = contentHash(currentContent);
        if (currentHash !== lastHash) {
          modified.push(relPath);
        }
      } catch {
        // Can't read — treat as modified
        modified.push(relPath);
      }
    }

    if (modified.length > 0) {
      logger.info({ module: 'storage', msg: 'Reverse sync detected user edits', projectId, modifiedFiles: modified });
    }

    return modified;
  }
}

/** SHA-256 content hash, truncated to 16 hex chars for compactness. */
function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}
