import { afterEach, expect, test, vi } from 'vitest';
import mermaid from 'mermaid';
import { renderGanttDiagram } from '@/app/graph/gantt';
import { DEFAULT_SETTINGS } from '@/app/graph/constants';

vi.mock('mermaid', () => ({
  default: {
    mermaidAPI: { getDiagramFromText: vi.fn(), getConfig: vi.fn(() => ({})) },
    render: vi.fn(),
  },
}));

afterEach(() => vi.clearAllMocks());

test.each([
  {},
  { getTasks: [], getDisplayMode: (): string => '' },
  { getTasks: () => [], getDisplayMode: (): string => 'compact' },
  { getTasks: () => [{ vert: true }], getDisplayMode: (): string => '' },
])('fails closed before rendering incompatible Gantt DB %#', async (db) => {
  vi.mocked(mermaid.mermaidAPI.getDiagramFromText).mockResolvedValue({ db } as never);
  const { childElementCount: before } = document.body;
  await expect(renderGanttDiagram('guard', 'gantt', DEFAULT_SETTINGS)).rejects.toThrow(
    'This Gantt diagram is not supported',
  );
  expect(mermaid.render).not.toHaveBeenCalled();
  expect(document.body.childElementCount).toBe(before);
});

test('cleans up the measurement host when Mermaid rejects source', async () => {
  vi.mocked(mermaid.mermaidAPI.getDiagramFromText).mockRejectedValue(new Error('Invalid date'));
  const { childElementCount: before } = document.body;
  await expect(renderGanttDiagram('bad-date', 'gantt', DEFAULT_SETTINGS)).rejects.toThrow(
    'Invalid date',
  );
  expect(document.body.childElementCount).toBe(before);
});
