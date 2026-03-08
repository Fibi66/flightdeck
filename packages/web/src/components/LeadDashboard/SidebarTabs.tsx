import { useState, useCallback } from 'react';
import {
  Bot,
  MessageSquare,
  Users,
  Network,
  Wrench,
  BarChart3,
  Clock,
  PanelRightClose,
  PanelRightOpen,
  Lightbulb,
  Settings,
  Eye,
  EyeOff,
} from 'lucide-react';
import { DecisionPanelContent } from './DecisionPanel';
import { CommsPanelContent } from './CommsPanel';
import { GroupsPanelContent } from './GroupsPanel';
import { TaskDagPanelContent } from './TaskDagPanel';
import { ModelConfigPanel } from './ModelConfigPanel';
import { CostBreakdown } from '../TokenEconomics/CostBreakdown';
import { TimerDisplay } from '../TimerDisplay/TimerDisplay';
import type { DagStatus } from '../../types';
import type { AgentComm } from '../../stores/leadStore';

interface SidebarTabsProps {
  // Sidebar state
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  sidebarWidth: number;
  startResize: (e: React.MouseEvent) => void;

  // Tab state
  sidebarTab: string;
  onTabChange: (tab: string) => void;
  tabOrder: string[];
  onTabOrderChange: (order: string[]) => void;
  hiddenTabs: Set<string>;
  onToggleTabVisibility: (tabId: string) => void;
  showTabConfig: boolean;
  onToggleTabConfig: () => void;

  // Decisions panel
  decisions: any[];
  pendingConfirmations: any[];
  decisionsPanelHeight: number;
  startDecisionsResize: (e: React.MouseEvent) => void;
  onConfirmDecision: (id: string, reason?: string) => Promise<void>;
  onRejectDecision: (id: string, reason?: string) => Promise<void>;
  onDismissDecision: (id: string) => Promise<void>;

  // Tab content
  teamTabContent: React.ReactNode;
  comms: AgentComm[];
  groups: any[];
  groupMessages: Record<string, any>;
  dagStatus: DagStatus | null;
  leadAgent: any;
  selectedLeadId: string | null;
  activeTimerCount: number;
  teamAgentIds: Set<string>;

  // Tab resize
  startTabResize: (e: React.MouseEvent) => void;
}

export function SidebarTabs({
  sidebarCollapsed,
  onToggleSidebar,
  sidebarWidth,
  startResize,
  sidebarTab,
  onTabChange,
  tabOrder,
  onTabOrderChange,
  hiddenTabs,
  onToggleTabVisibility,
  showTabConfig,
  onToggleTabConfig,
  decisions,
  pendingConfirmations,
  decisionsPanelHeight,
  startDecisionsResize,
  onConfirmDecision,
  onRejectDecision,
  onDismissDecision,
  teamTabContent,
  comms,
  groups,
  groupMessages,
  dagStatus,
  leadAgent,
  selectedLeadId,
  activeTimerCount,
  teamAgentIds,
  startTabResize,
}: SidebarTabsProps) {
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  const handleTabDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    e.dataTransfer.setData('text/plain', tabId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleTabDragOver = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTab(tabId);
  }, []);

  const handleTabDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    setDragOverTab(null);
    const sourceTabId = e.dataTransfer.getData('text/plain');
    if (!sourceTabId || sourceTabId === targetTabId) return;
    const newOrder = [...tabOrder];
    const srcIdx = newOrder.indexOf(sourceTabId);
    const tgtIdx = newOrder.indexOf(targetTabId);
    if (srcIdx === -1 || tgtIdx === -1) return;
    [newOrder[srcIdx], newOrder[tgtIdx]] = [newOrder[tgtIdx], newOrder[srcIdx]];
    onTabOrderChange(newOrder);
  }, [tabOrder, onTabOrderChange]);

  const handleTabDragEnd = useCallback(() => {
    setDragOverTab(null);
  }, []);

  const allTabs: Record<string, { icon: React.ReactNode; label: string; badge?: number }> = {
    team: { icon: <Bot className="w-3 h-3" />, label: 'Team' },
    comms: { icon: <MessageSquare className="w-3 h-3" />, label: 'Comms', badge: comms.length },
    groups: { icon: <Users className="w-3 h-3" />, label: 'Groups', badge: groups.length },
    dag: { icon: <Network className="w-3 h-3" />, label: 'DAG', badge: dagStatus?.tasks.length },
    models: { icon: <Wrench className="w-3 h-3" />, label: 'Models' },
    costs: { icon: <BarChart3 className="w-3 h-3" />, label: 'Attribution' },
    timers: { icon: <Clock className="w-3 h-3" />, label: 'Timers', badge: activeTimerCount || undefined },
  };

  if (sidebarCollapsed) {
    return (
      <div className="border-l border-th-border flex flex-col items-center py-2 w-10 shrink-0">
        <button
          type="button"
          aria-label="Expand sidebar"
          onClick={() => onToggleSidebar()}
          className="p-1.5 rounded hover:bg-th-bg-muted text-th-text-muted hover:text-th-text relative"
          title="Expand sidebar"
        >
          <PanelRightOpen className="w-4 h-4" />
          {pendingConfirmations.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-yellow-500 rounded-full text-[8px] font-bold text-black flex items-center justify-center" title={`${pendingConfirmations.length} decision(s) need confirmation`}>
              {pendingConfirmations.length}
            </span>
          )}
        </button>
      </div>
    );
  }

  const orderedIds = tabOrder.filter((id) => id in allTabs && !hiddenTabs.has(id));
  // Append any missing visible tabs (safety net)
  for (const id of Object.keys(allTabs)) {
    if (!orderedIds.includes(id) && !hiddenTabs.has(id)) orderedIds.push(id);
  }

  return (
    <div className="flex shrink-0" style={{ width: sidebarWidth }}>
      {/* Drag handle */}
      <div
        onMouseDown={startResize}
        className="w-1 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors shrink-0"
      />
      <div className="flex-1 border-l border-th-border flex flex-col overflow-hidden min-w-0">
        <div className="px-2 py-1 border-b border-th-border flex items-center justify-end shrink-0">
          <button
            type="button"
            aria-label="Collapse sidebar"
            onClick={() => onToggleSidebar()}
            className="p-1 rounded hover:bg-th-bg-muted text-th-text-muted hover:text-th-text"
            title="Collapse sidebar"
          >
            <PanelRightClose className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Decisions — always visible at top */}
        <div className="shrink-0 flex flex-col relative" style={{ height: decisionsPanelHeight, maxHeight: '30%' }}>
          <div className="px-3 py-1.5 flex items-center gap-2 border-b border-th-border shrink-0">
            <Lightbulb className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400" />
            <span className="text-xs font-semibold">Decisions</span>
            {pendingConfirmations.length > 0 && (
              <span className="w-2 h-2 bg-yellow-500 rounded-full" title={`${pendingConfirmations.length} pending`} />
            )}
            <span className="text-[10px] text-th-text-muted ml-auto">{decisions.length}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <DecisionPanelContent decisions={decisions} onConfirm={onConfirmDecision} onReject={onRejectDecision} onDismiss={onDismissDecision} />
          </div>
          {/* Resize handle for decisions panel */}
          <div
            onMouseDown={startDecisionsResize}
            className="h-1 cursor-row-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors shrink-0 absolute bottom-0 left-0 right-0"
            style={{ transform: 'translateY(2px)', zIndex: 10 }}
          />
        </div>

        {/* Tabbed bottom panels */}
        <div className="flex-1 min-h-0 border-t border-th-border flex flex-col relative">
          <div className="flex flex-wrap border-b border-th-border shrink-0 items-center">
            {orderedIds.map((tabId) => {
              const tab = allTabs[tabId];
              return (
                <button
                  key={tabId}
                  draggable
                  onDragStart={(e) => handleTabDragStart(e, tabId)}
                  onDragOver={(e) => handleTabDragOver(e, tabId)}
                  onDrop={(e) => handleTabDrop(e, tabId)}
                  onDragEnd={handleTabDragEnd}
                  onDragLeave={() => setDragOverTab(null)}
                  onClick={() => onTabChange(tabId)}
                  className={`flex items-center gap-1 px-2 py-1.5 text-[11px] whitespace-nowrap border-b-2 transition-colors cursor-grab active:cursor-grabbing ${
                    dragOverTab === tabId
                      ? 'border-blue-400 bg-blue-500/10 text-blue-600 dark:text-blue-300'
                      : sidebarTab === tabId
                        ? 'border-yellow-500 text-yellow-600 dark:text-yellow-400'
                        : 'border-transparent text-th-text-muted hover:text-th-text-alt'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="text-[9px] bg-th-bg-muted text-th-text-muted px-1 rounded-full ml-0.5">{tab.badge}</span>
                  )}
                </button>
              );
            })}
            {/* Tab visibility settings */}
            <div className="relative ml-auto">
              <button
                onClick={() => onToggleTabConfig()}
                className="flex items-center px-1.5 py-1.5 text-th-text-muted hover:text-th-text-alt transition-colors"
                title="Configure visible tabs"
              >
                <Settings className="w-3 h-3" />
              </button>
              {showTabConfig && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => onToggleTabConfig()} />
                  <div className="absolute right-0 top-full mt-1 z-50 glass-dropdown rounded-md py-1 min-w-[140px]">
                    {(['team', 'comms', 'groups', 'dag', 'models', 'costs', 'timers'] as const).map((tabId) => (
                      <button
                        key={tabId}
                        onClick={() => onToggleTabVisibility(tabId)}
                        className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] hover:bg-th-bg-muted transition-colors"
                      >
                        {hiddenTabs.has(tabId)
                          ? <EyeOff className="w-3 h-3 text-th-text-muted" />
                          : <Eye className="w-3 h-3 text-blue-500" />
                        }
                        <span className={hiddenTabs.has(tabId) ? 'text-th-text-muted' : ''}>{tabId.charAt(0).toUpperCase() + tabId.slice(1)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            {sidebarTab === 'team' && teamTabContent}
            {sidebarTab === 'comms' && <CommsPanelContent comms={comms} groupMessages={groupMessages} leadId={selectedLeadId ?? undefined} />}

            {sidebarTab === 'groups' && <GroupsPanelContent groups={groups} groupMessages={groupMessages} leadId={selectedLeadId} projectId={leadAgent?.projectId ?? (selectedLeadId?.startsWith('project:') ? selectedLeadId.slice(8) : null)} />}
            {sidebarTab === 'dag' && <TaskDagPanelContent dagStatus={dagStatus} />}
            {sidebarTab === 'models' && leadAgent?.projectId && (
              <div className="h-full overflow-y-auto p-2">
                <ModelConfigPanel projectId={leadAgent.projectId} compact />
              </div>
            )}
            {sidebarTab === 'models' && !leadAgent?.projectId && (
              <div className="flex items-center justify-center h-full text-th-text-muted text-xs">
                No project selected
              </div>
            )}
            {sidebarTab === 'costs' && <CostBreakdown />}
            {sidebarTab === 'timers' && <TimerDisplay projectAgentIds={teamAgentIds} />}
          </div>
          {/* Resize handle for tabbed section */}
          <div
            onMouseDown={startTabResize}
            className="h-1 cursor-row-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors shrink-0 absolute top-0 left-0 right-0"
            style={{ transform: 'translateY(-2px)' }}
          />
        </div>
      </div>
    </div>
  );
}
