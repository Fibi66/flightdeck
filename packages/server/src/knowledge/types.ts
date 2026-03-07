/** The 4-tier knowledge categories. */
export type KnowledgeCategory = 'core' | 'episodic' | 'procedural' | 'semantic';

/** All valid category values. */
export const KNOWLEDGE_CATEGORIES: readonly KnowledgeCategory[] = [
  'core',
  'episodic',
  'procedural',
  'semantic',
] as const;

/** Optional metadata attached to a knowledge entry. */
export interface KnowledgeMetadata {
  /** Where this knowledge came from (e.g., 'user', 'agent', 'auto') */
  source?: string;
  /** Confidence score 0–1 */
  confidence?: number;
  /** Freeform tags for filtering */
  tags?: string[];
  /** Extensible — callers can add domain-specific fields */
  [key: string]: unknown;
}

/** A single knowledge entry as returned by KnowledgeStore. */
export interface KnowledgeEntry {
  id: number;
  projectId: string;
  category: KnowledgeCategory;
  key: string;
  content: string;
  metadata: KnowledgeMetadata | null;
  createdAt: string;
  updatedAt: string;
}

/** Options for full-text search queries. */
export interface SearchOptions {
  /** Restrict search to a specific category */
  category?: KnowledgeCategory;
  /** Maximum number of results (default: 20) */
  limit?: number;
}
