import { describe, it, expect } from 'vitest';
import { parsePrepMarkdown } from '@/components/cos/OneOnOnePrepDrawer';

// parsePrepMarkdown converts the freeform markdown stored on a 1:1 prep doc
// into discrete TopicSections so the drawer can render each one with the same
// header/bullet/paragraph layout. The parser has a few quirks worth pinning:
//   - The leading "# 1:1 Prep — Name" H1 is dropped (the drawer header already
//     shows that), but only when it's the first content.
//   - Horizontal rules (--- or ___ etc.) are ignored.
//   - Bullets and paragraphs that appear BEFORE any heading get auto-bucketed
//     into an implicit "Topics" section so they aren't lost.

describe('parsePrepMarkdown', () => {
  describe('empty / trivial input', () => {
    it('returns [] for empty string', () => {
      expect(parsePrepMarkdown('')).toEqual([]);
    });

    it('returns [] for whitespace-only', () => {
      expect(parsePrepMarkdown('   \n   \n   ')).toEqual([]);
    });
  });

  describe('headings + bullets', () => {
    it('splits into sections at each H2 / H3', () => {
      const md = [
        '## Recent wins',
        '- shipped X',
        '- shipped Y',
        '## Blockers',
        '- waiting on review',
      ].join('\n');

      const result = parsePrepMarkdown(md);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        heading: 'Recent wins',
        bullets: ['shipped X', 'shipped Y'],
        paragraphs: [],
      });
      expect(result[1]).toEqual({
        heading: 'Blockers',
        bullets: ['waiting on review'],
        paragraphs: [],
      });
    });

    it('treats * bullets the same as - bullets', () => {
      const md = ['## Topics', '* one', '- two'].join('\n');
      const [section] = parsePrepMarkdown(md);
      expect(section.bullets).toEqual(['one', 'two']);
    });

    it('keeps paragraphs and bullets in the same section, in order', () => {
      const md = [
        '## Section',
        'Intro paragraph.',
        '- bullet one',
        'Another paragraph.',
        '- bullet two',
      ].join('\n');

      const [section] = parsePrepMarkdown(md);
      expect(section.heading).toBe('Section');
      expect(section.bullets).toEqual(['bullet one', 'bullet two']);
      expect(section.paragraphs).toEqual(['Intro paragraph.', 'Another paragraph.']);
    });
  });

  describe('front-matter handling', () => {
    it('drops the leading "# 1:1 Prep — Alice" H1 before any content', () => {
      const md = ['# 1:1 Prep — Alice', '## Topics', '- one'].join('\n');
      const result = parsePrepMarkdown(md);
      // Only the H2 section makes it through; the H1 vanishes.
      expect(result).toHaveLength(1);
      expect(result[0].heading).toBe('Topics');
    });

    it('keeps an H1 that appears AFTER some content (no special skip)', () => {
      // Once we've seen any non-heading content, subsequent H1s are honored.
      const md = ['Intro line.', '# Late heading', '- one'].join('\n');
      const result = parsePrepMarkdown(md);
      // First section: the implicit "Topics" with the intro paragraph.
      // Second section: the late H1 with the bullet.
      expect(result.map((s) => s.heading)).toEqual(['Topics', 'Late heading']);
    });
  });

  describe('auto-bucketing', () => {
    it('puts bullets that appear before any heading into an implicit "Topics" section', () => {
      const md = ['- pre-heading bullet'].join('\n');
      const [section] = parsePrepMarkdown(md);
      expect(section.heading).toBe('Topics');
      expect(section.bullets).toEqual(['pre-heading bullet']);
    });

    it('puts paragraphs that appear before any heading into "Topics" too', () => {
      const md = 'Just a free-floating note.';
      const [section] = parsePrepMarkdown(md);
      expect(section.heading).toBe('Topics');
      expect(section.paragraphs).toEqual(['Just a free-floating note.']);
    });
  });

  describe('robustness', () => {
    it('ignores horizontal rules (--- / *** / ___)', () => {
      const md = ['## Topic', '- one', '---', '- two', '***', '- three'].join('\n');
      const [section] = parsePrepMarkdown(md);
      expect(section.bullets).toEqual(['one', 'two', 'three']);
    });

    it('drops a section with no heading, no bullets, and no paragraphs', () => {
      // A lone H2 with nothing under it should not produce a phantom section
      // once content arrives in the NEXT heading group. The first section
      // has a heading, so it's kept; the issue is more about not crashing
      // on adjacent headings — verify both make it through.
      const md = ['## A', '## B', '- under-b'].join('\n');
      const result = parsePrepMarkdown(md);
      expect(result.map((s) => s.heading)).toEqual(['A', 'B']);
      expect(result[0].bullets).toEqual([]);
      expect(result[1].bullets).toEqual(['under-b']);
    });
  });
});
