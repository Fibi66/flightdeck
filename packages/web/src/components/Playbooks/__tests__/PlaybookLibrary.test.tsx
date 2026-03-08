import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlaybookLibrary } from '../PlaybookLibrary';
import { BUILT_IN_PLAYBOOKS } from '../types';

// ── Mocks ────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockApiFetch = vi.fn() as Mock;
vi.mock('../../../hooks/useApi', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('../../Toast', () => ({
  useToastStore: () => vi.fn(),
}));

function renderLib() {
  return render(
    <MemoryRouter>
      <PlaybookLibrary />
    </MemoryRouter>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────

describe('PlaybookLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiFetch.mockResolvedValue({ user: [] });
  });

  it('renders built-in playbooks', async () => {
    renderLib();
    await waitFor(() => {
      expect(screen.getByText(BUILT_IN_PLAYBOOKS[0].name)).toBeTruthy();
    });
  });

  it('creates project on Apply and navigates', async () => {
    const projectResp = { id: 'proj-new', name: 'Code Review Crew' };
    mockApiFetch
      .mockResolvedValueOnce({ user: [] }) // fetchUserPlaybooks
      .mockResolvedValueOnce(projectResp); // POST /projects

    renderLib();

    await waitFor(() => {
      expect(screen.getByText(BUILT_IN_PLAYBOOKS[0].name)).toBeTruthy();
    });

    const applyBtn = screen.getByTestId(`playbook-apply-${BUILT_IN_PLAYBOOKS[0].id}`);
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/projects',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockNavigate).toHaveBeenCalledWith(`/projects/${projectResp.id}`);
    });
  });

  it('shows error toast on API failure', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ user: [] })
      .mockRejectedValueOnce(new Error('name is required'));

    renderLib();

    await waitFor(() => {
      expect(screen.getByText(BUILT_IN_PLAYBOOKS[0].name)).toBeTruthy();
    });

    const applyBtn = screen.getByTestId(`playbook-apply-${BUILT_IN_PLAYBOOKS[0].id}`);
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledTimes(2);
    });
  });
});
