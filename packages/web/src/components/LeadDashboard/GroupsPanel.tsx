import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useLeadStore } from '../../stores/leadStore';
import { useAppStore } from '../../stores/appStore';
import { MentionText } from '../../utils/markdown';
import type { ChatGroup, GroupMessage } from '../../types';
import { roleColor } from './CommsPanel';

export function GroupsPanelContent({
  groups,
  groupMessages,
  leadId,
}: {
  groups: ChatGroup[];
  groupMessages: Record<string, GroupMessage[]>;
  leadId: string | null;
}) {
  const feedRef = useRef<HTMLDivElement>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [fetchedGroups, setFetchedGroups] = useState<Set<string>>(new Set());

  // Reset expanded state when lead changes
  useEffect(() => {
    setExpandedGroup(null);
    setFetchedGroups(new Set());
  }, [leadId]);

  // Fetch messages when a group is first expanded
  useEffect(() => {
    if (!expandedGroup || !leadId || fetchedGroups.has(expandedGroup)) return;
    setFetchedGroups((prev) => new Set(prev).add(expandedGroup));
    fetch(`/api/lead/${leadId}/groups/${encodeURIComponent(expandedGroup)}/messages`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const store = useLeadStore.getState();
          // Bulk-set messages for this group
          const proj = store.projects[leadId];
          if (proj) {
            data.forEach((msg: GroupMessage) => {
              store.addGroupMessage(leadId, expandedGroup, msg);
            });
          }
        }
      })
      .catch(() => {});
  }, [expandedGroup, leadId, fetchedGroups]);

  // Auto-scroll when messages change for expanded group
  useEffect(() => {
    if (expandedGroup) {
      requestAnimationFrame(() => {
        feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight });
      });
    }
  }, [expandedGroup, groupMessages[expandedGroup ?? '']?.length]);

  return (
    <div ref={feedRef} className="h-full overflow-y-auto">
      {groups.length === 0 ? (
        <p className="text-xs text-th-text-muted text-center py-4 font-mono">No groups yet</p>
      ) : (
        groups.map((g) => {
          const isExpanded = expandedGroup === g.name;
          const msgs = groupMessages[g.name] ?? [];
          return (
            <div key={g.name} className="border-b border-th-border/30">
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-th-bg-muted/30 transition-colors flex items-center gap-2"
                onClick={() => setExpandedGroup(isExpanded ? null : g.name)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-th-text-muted shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-th-text-muted shrink-0" />
                )}
                <span className="text-xs font-mono font-semibold text-teal-400 truncate flex-1">{g.name}</span>
                <span className="text-[10px] font-mono text-th-text-muted shrink-0">{g.memberIds.length} members</span>
              </button>
              {isExpanded && (
                <div className="px-2 pb-2 space-y-0.5 max-h-60 overflow-y-auto">
                  {msgs.length === 0 ? (
                    <p className="text-[10px] text-th-text-muted text-center py-2 font-mono">No messages</p>
                  ) : (
                    msgs.map((m) => {
                      const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                      const shortId = m.fromAgentId?.slice(0, 6) ?? '';
                      return (
                        <div key={m.id} className="px-2 py-1 rounded bg-th-bg-alt/50 text-xs font-mono">
                          <div className="flex items-center gap-1">
                            <span className="text-th-text-muted text-[10px] shrink-0">{time}</span>
                            <span className={`${roleColor(m.fromRole)} font-semibold truncate`}>
                              {m.fromRole}{shortId ? ` (${shortId})` : ''}:
                            </span>
                          </div>
                          <p className="text-th-text-alt break-words mt-0.5 whitespace-pre-wrap">
                            <MentionText text={m.content} agents={useAppStore.getState().agents} onClickAgent={(id) => useAppStore.getState().setSelectedAgent(id)} />
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
