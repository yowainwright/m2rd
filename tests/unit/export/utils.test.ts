import { describe, expect, it, vi } from 'vitest';
import { captureSvg } from '@/app/export';

describe('SVG capture', () => {
  it('captures edited content without initiating a download', async () => {
    const element = document.createElement('div');
    element.textContent = 'Edited';
    element.style.backgroundColor = 'blue';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    document.body.append(element);
    try {
      const svg = await captureSvg(element);
      expect(svg).toContain('foreignObject');
      expect(svg).toContain('Edited');
      expect(click).not.toHaveBeenCalled();
    } finally {
      click.mockRestore();
      element.remove();
    }
  });
});
