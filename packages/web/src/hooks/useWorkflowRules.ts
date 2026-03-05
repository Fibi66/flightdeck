import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from './useApi';
import type {
  WorkflowRule,
  WorkflowTemplate,
  WorkflowActivityEntry,
  DryRunMatch,
} from '../components/Workflow/types';

export function useWorkflowRules() {
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRules = useCallback(async () => {
    try {
      const data = await apiFetch<WorkflowRule[]>('/workflows');
      setRules(Array.isArray(data) ? data : []);
    } catch {
      // Silently handle fetch errors — rules stay empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const createRule = useCallback(async (rule: Partial<WorkflowRule>) => {
    const created = await apiFetch<WorkflowRule>('/workflows', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
    setRules((prev) => [...prev, created]);
    return created;
  }, []);

  const updateRule = useCallback(async (id: string, updates: Partial<WorkflowRule>) => {
    const updated = await apiFetch<WorkflowRule>(`/workflows/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }, []);

  const deleteRule = useCallback(async (id: string) => {
    await apiFetch(`/workflows/${id}`, { method: 'DELETE' });
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const toggleRule = useCallback(async (id: string) => {
    const updated = await apiFetch<WorkflowRule>(`/workflows/${id}/toggle`, {
      method: 'POST',
    });
    setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
  }, []);

  const reorder = useCallback(async (ruleIds: string[]) => {
    await apiFetch('/workflows/reorder', {
      method: 'POST',
      body: JSON.stringify({ ruleIds }),
    });
    setRules((prev) => {
      const map = new Map(prev.map((r) => [r.id, r]));
      return ruleIds.map((id) => map.get(id)!).filter(Boolean);
    });
  }, []);

  const dryRun = useCallback(async (id: string) => {
    return apiFetch<{ matches: DryRunMatch[] }>(`/workflows/${id}/dry-run`, {
      method: 'POST',
    });
  }, []);

  return {
    rules,
    loading,
    createRule,
    updateRule,
    deleteRule,
    toggleRule,
    reorder,
    dryRun,
    refetch: fetchRules,
  };
}

export function useWorkflowTemplates() {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);

  useEffect(() => {
    apiFetch<WorkflowTemplate[]>('/workflows/templates')
      .then((d) => setTemplates(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  return templates;
}

export function useWorkflowActivity() {
  const [activity, setActivity] = useState<WorkflowActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<WorkflowActivityEntry[]>('/workflows/activity')
      .then((d) => setActivity(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { activity, loading };
}
