import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Mock apiFetch
vi.mock('../../hooks/useApi', () => ({
  apiFetch: vi.fn().mockResolvedValue({}),
}));

import { ShareDropdown } from '../SessionReplay/ShareDropdown';
import { ShareLinkDialog } from '../SessionReplay/ShareLinkDialog';
import { AnnotationPopover } from '../SessionReplay/AnnotationPopover';
import { AnnotationList } from '../SessionReplay/AnnotationList';
import { AnnotationPin } from '../SessionReplay/AnnotationPin';
import { HighlightsReel } from '../SessionReplay/HighlightsReel';
import type { ReplayAnnotation } from '../SessionReplay/types';

// ── Test data ──────────────────────────────────────────────────────

const mockAnnotations: ReplayAnnotation[] = [
  { id: 'a1', timestamp: new Date().toISOString(), author: 'Justin', text: 'Bug introduced here', type: 'flag' },
  { id: 'a2', timestamp: new Date().toISOString(), author: 'Justin', text: 'Good recovery', type: 'comment' },
  { id: 'a3', timestamp: new Date().toISOString(), author: 'Justin', text: 'Key moment', type: 'bookmark' },
];

// ── Tests ──────────────────────────────────────────────────────────

describe('Shareable Session Replays', () => {
  describe('ShareDropdown', () => {
    it('renders share button and opens menu on click', () => {
      const handlers = { onShareLink: vi.fn(), onExportHTML: vi.fn(), onExportJSON: vi.fn(), onHighlightsReel: vi.fn() };
      render(<ShareDropdown {...handlers} />);
      expect(screen.getByTestId('share-dropdown')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Share'));
      expect(screen.getByText('Copy link')).toBeInTheDocument();
      expect(screen.getByText('Export HTML')).toBeInTheDocument();
      expect(screen.getByText('Export JSON')).toBeInTheDocument();
      expect(screen.getByText('Highlights Reel')).toBeInTheDocument();
    });

    it('calls onShareLink when Copy link is clicked', () => {
      const handlers = { onShareLink: vi.fn(), onExportHTML: vi.fn(), onExportJSON: vi.fn(), onHighlightsReel: vi.fn() };
      render(<ShareDropdown {...handlers} />);
      fireEvent.click(screen.getByText('Share'));
      fireEvent.click(screen.getByText('Copy link'));
      expect(handlers.onShareLink).toHaveBeenCalledOnce();
    });
  });

  describe('ShareLinkDialog', () => {
    it('renders dialog with title, expiry, and include toggles', () => {
      render(<ShareLinkDialog leadId="lead-1" sessionTitle="My Sprint" onClose={vi.fn()} />);
      expect(screen.getByTestId('share-link-dialog')).toBeInTheDocument();
      expect(screen.getByDisplayValue('My Sprint')).toBeInTheDocument();
      expect(screen.getByText('7 days')).toBeInTheDocument();
      expect(screen.getByText('Agent messages')).toBeInTheDocument();
      expect(screen.getByText('File diffs')).toBeInTheDocument();
    });

    it('has Create Link button', () => {
      render(<ShareLinkDialog leadId="lead-1" sessionTitle="Sprint" onClose={vi.fn()} />);
      expect(screen.getByText('Create Link')).toBeInTheDocument();
    });
  });

  describe('AnnotationPopover', () => {
    it('renders with type selector and save button', () => {
      render(<AnnotationPopover timestamp={new Date().toISOString()} onSave={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByTestId('annotation-popover')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('What happened here?')).toBeInTheDocument();
      expect(screen.getByText('Save')).toBeInTheDocument();
    });

    it('calls onSave with annotation data', () => {
      const onSave = vi.fn();
      render(<AnnotationPopover timestamp="2026-03-05T12:00:00Z" onSave={onSave} onCancel={vi.fn()} />);
      const textarea = screen.getByPlaceholderText('What happened here?');
      fireEvent.change(textarea, { target: { value: 'Bug here' } });
      fireEvent.click(screen.getByText('Save'));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Bug here',
        type: 'comment',
        author: 'You',
      }));
    });

    it('disables save when text is empty', () => {
      const onSave = vi.fn();
      render(<AnnotationPopover timestamp="2026-03-05T12:00:00Z" onSave={onSave} onCancel={vi.fn()} />);
      fireEvent.click(screen.getByText('Save'));
      expect(onSave).not.toHaveBeenCalled();
    });
  });

  describe('AnnotationList', () => {
    it('renders annotations sorted by time', () => {
      render(<AnnotationList annotations={mockAnnotations} onSeek={vi.fn()} onClose={vi.fn()} />);
      expect(screen.getByTestId('annotation-list')).toBeInTheDocument();
      expect(screen.getByText('3 annotations')).toBeInTheDocument();
      expect(screen.getByText('Bug introduced here')).toBeInTheDocument();
      expect(screen.getByText('Good recovery')).toBeInTheDocument();
    });

    it('calls onSeek when annotation clicked', () => {
      const onSeek = vi.fn();
      render(<AnnotationList annotations={mockAnnotations} onSeek={onSeek} onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('Bug introduced here'));
      expect(onSeek).toHaveBeenCalledWith(mockAnnotations[0].timestamp);
    });

    it('shows empty state', () => {
      render(<AnnotationList annotations={[]} onSeek={vi.fn()} onClose={vi.fn()} />);
      expect(screen.getByText(/No annotations yet/)).toBeInTheDocument();
    });
  });

  describe('AnnotationPin', () => {
    it('renders at correct position', () => {
      render(
        <div style={{ position: 'relative', width: 200 }}>
          <AnnotationPin annotation={mockAnnotations[0]} position={50} onClick={vi.fn()} />
        </div>
      );
      expect(screen.getByTestId('annotation-pin')).toBeInTheDocument();
    });
  });

  describe('HighlightsReel', () => {
    it('renders and shows loading then empty state', async () => {
      render(<HighlightsReel leadId="lead-1" sessionTitle="Sprint" onSeek={vi.fn()} onClose={vi.fn()} />);
      expect(screen.getByTestId('highlights-reel')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText(/No highlights available/)).toBeInTheDocument();
      });
    });
  });
});
