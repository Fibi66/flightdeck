import { useState, useCallback } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { apiFetch } from '../../hooks/useApi';

interface ShareLinkDialogProps {
  leadId: string;
  sessionTitle: string;
  onClose: () => void;
}

const EXPIRY_OPTIONS = [
  { label: '1 day', value: 1 },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: 'Never', value: 0 },
];

interface IncludeFlags {
  messages: boolean;
  diffs: boolean;
  costs: boolean;
  rawOutput: boolean;
}

export function ShareLinkDialog({ leadId, sessionTitle, onClose }: ShareLinkDialogProps) {
  const [title, setTitle] = useState(sessionTitle || 'Session Replay');
  const [expiryDays, setExpiryDays] = useState(7);
  const [includes, setIncludes] = useState<IncludeFlags>({
    messages: true, diffs: true, costs: true, rawOutput: false,
  });
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleInclude = (key: keyof IncludeFlags) =>
    setIncludes((prev) => ({ ...prev, [key]: !prev[key] }));

  const createLink = useCallback(async () => {
    setCreating(true);
    setError(null);
    try {
      const data = await apiFetch<{ url: string; token: string }>(`/replay/${leadId}/share`, {
        method: 'POST',
        body: JSON.stringify({ title, expiryDays: expiryDays || undefined, includes }),
      });
      setGeneratedLink(data.url ?? `${window.location.origin}/shared/${data.token}`);
    } catch (err: any) {
      setError(err.message ?? 'Failed to create share link');
    } finally {
      setCreating(false);
    }
  }, [leadId, title, expiryDays, includes]);

  const copyLink = useCallback(() => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [generatedLink]);

  // Escape to close
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose} onKeyDown={handleKeyDown}>
      <div
        className="bg-surface-raised border border-th-border rounded-xl shadow-2xl w-[420px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="share-link-dialog"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-th-border">
          <h2 className="text-sm font-semibold text-th-text-alt">🔗 Share Replay Link</h2>
          <button onClick={onClose} className="p-1 rounded text-th-text-muted hover:text-th-text hover:bg-th-bg-hover">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-[11px] text-th-text-muted block mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-th-bg border border-th-border rounded-md text-th-text focus:border-accent outline-none"
              placeholder="Session: My Sprint"
            />
          </div>

          {/* Expiry */}
          <div>
            <label className="text-[11px] text-th-text-muted block mb-1">Expires</label>
            <div className="flex gap-1.5">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setExpiryDays(opt.value)}
                  className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                    expiryDays === opt.value
                      ? 'bg-accent/20 text-accent border border-accent/30'
                      : 'bg-th-bg border border-th-border text-th-text-muted hover:text-th-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Include toggles */}
          <div>
            <label className="text-[11px] text-th-text-muted block mb-1">Include</label>
            <div className="space-y-1.5">
              <IncludeToggle checked={includes.messages} onChange={() => toggleInclude('messages')} label="Agent messages" />
              <IncludeToggle checked={includes.diffs} onChange={() => toggleInclude('diffs')} label="File diffs" />
              <IncludeToggle checked={includes.costs} onChange={() => toggleInclude('costs')} label="Token/cost data" />
              <IncludeToggle checked={includes.rawOutput} onChange={() => toggleInclude('rawOutput')} label="Raw agent output (verbose)" />
            </div>
          </div>

          {/* Generated link */}
          {generatedLink && (
            <div className="bg-th-bg rounded-md border border-th-border p-2.5">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={generatedLink}
                  className="flex-1 text-[11px] bg-transparent text-th-text-alt outline-none font-mono truncate"
                />
                <button
                  onClick={copyLink}
                  className="p-1.5 rounded-md bg-accent/20 text-accent hover:bg-accent/30"
                  title="Copy link"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-[11px] text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-th-border">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-th-text-muted hover:text-th-text rounded-md">
            Cancel
          </button>
          <button
            onClick={createLink}
            disabled={creating || !title.trim()}
            className="px-4 py-1.5 text-xs bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {creating ? 'Creating...' : 'Create Link'}
          </button>
        </div>
      </div>
    </div>
  );
}

function IncludeToggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-3.5 h-3.5 accent-accent rounded" />
      <span className="text-[11px] text-th-text-alt">{label}</span>
    </label>
  );
}
