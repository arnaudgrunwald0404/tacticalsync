import { describe, it, expect, beforeEach } from 'vitest';
import {
  htmlToPlainText,
  htmlToDisplayText,
  htmlToDisplayItems,
  sanitizeHtmlForDisplay,
  htmlToFormattedDisplayItems,
  isEmptyHtml,
} from '@/lib/htmlUtils';

describe('htmlUtils', () => {
  describe('htmlToPlainText', () => {
    it('should strip HTML tags and return plain text', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const result = htmlToPlainText(html);
      expect(result).toBe('Hello World');
    });

    it('should handle empty string', () => {
      const result = htmlToPlainText('');
      expect(result).toBe('');
    });

    it('should handle nested HTML tags', () => {
      const html = '<div><p>Outer <span>Inner <strong>Bold</strong></span></p></div>';
      const result = htmlToPlainText(html);
      expect(result).toBe('Outer Inner Bold');
    });

    it('should handle HTML entities', () => {
      const html = '<p>Hello &amp; Goodbye</p>';
      const result = htmlToPlainText(html);
      expect(result).toBe('Hello & Goodbye');
    });
  });

  describe('htmlToDisplayText', () => {
    it('should convert HTML to display text', () => {
      const html = '<p>Hello <em>World</em></p>';
      const result = htmlToDisplayText(html);
      expect(result).toBe('Hello World');
    });

    it('should handle empty string', () => {
      const result = htmlToDisplayText('');
      expect(result).toBe('');
    });
  });

  describe('htmlToDisplayItems', () => {
    it('should extract list items from unordered list', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>';
      const result = htmlToDisplayItems(html);
      expect(result).toEqual(['Item 1', 'Item 2', 'Item 3']);
    });

    it('should extract list items from ordered list', () => {
      const html = '<ol><li>First</li><li>Second</li><li>Third</li></ol>';
      const result = htmlToDisplayItems(html);
      expect(result).toEqual(['First', 'Second', 'Third']);
    });

    it('should handle plain text without lists', () => {
      const html = '<p>Line 1\nLine 2\nLine 3</p>';
      const result = htmlToDisplayItems(html);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter empty items', () => {
      const html = '<ul><li>Item 1</li><li></li><li>Item 2</li></ul>';
      const result = htmlToDisplayItems(html);
      expect(result).toEqual(['Item 1', 'Item 2']);
    });

    it('should handle empty string', () => {
      const result = htmlToDisplayItems('');
      expect(result).toEqual([]);
    });

    it('should handle mixed list and text content', () => {
      const html = '<div><p>Intro text</p><ul><li>Item 1</li><li>Item 2</li></ul></div>';
      const result = htmlToDisplayItems(html);
      expect(result).toContain('Item 1');
      expect(result).toContain('Item 2');
    });
  });

  describe('sanitizeHtmlForDisplay', () => {
    it('should preserve allowed formatting tags', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const result = sanitizeHtmlForDisplay(html);
      expect(result).toContain('<p>');
      expect(result).toContain('<strong>');
    });

    it('should remove script tags', () => {
      const html = '<p>Safe content</p><script>alert("xss")</script>';
      const result = sanitizeHtmlForDisplay(html);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('</script>');
    });

    it('should remove dangerous attributes', () => {
      const html = '<p onclick="alert(\'xss\')">Click me</p>';
      const result = sanitizeHtmlForDisplay(html);
      expect(result).not.toContain('onclick');
    });

    it('should add security attributes to external links', () => {
      const html = '<a href="https://example.com">Link</a>';
      const result = sanitizeHtmlForDisplay(html);
      expect(result).toContain('target="_blank"');
      expect(result).toContain('rel="noopener noreferrer"');
    });

    it('should not modify internal links', () => {
      const html = '<a href="#section">Link</a>';
      const result = sanitizeHtmlForDisplay(html);
      expect(result).not.toContain('target="_blank"');
    });

    it('should handle empty string', () => {
      const result = sanitizeHtmlForDisplay('');
      expect(result).toBe('');
    });

    it('should preserve list structures', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li></ul>';
      const result = sanitizeHtmlForDisplay(html);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>');
    });
  });

  describe('htmlToFormattedDisplayItems', () => {
    it('should extract formatted list items', () => {
      const html = '<ul><li><strong>Bold</strong> item</li><li>Regular item</li></ul>';
      const result = htmlToFormattedDisplayItems(html);
      
      expect(result).toHaveLength(2);
      expect(result[0].isListItem).toBe(true);
      expect(result[0].content).toContain('<strong>Bold</strong>');
      expect(result[1].isListItem).toBe(true);
    });

    it('should handle paragraph content', () => {
      const html = '<p>First paragraph</p><p>Second paragraph</p>';
      const result = htmlToFormattedDisplayItems(html);
      
      expect(result).toHaveLength(2);
      expect(result[0].isListItem).toBe(false);
      expect(result[0].content).toBe('First paragraph');
    });

    it('should handle empty string', () => {
      const result = htmlToFormattedDisplayItems('');
      expect(result).toEqual([]);
    });

    it('should filter empty items', () => {
      const html = '<ul><li>Item</li><li></li></ul>';
      const result = htmlToFormattedDisplayItems(html);
      expect(result).toHaveLength(1);
    });

    it('should preserve inline formatting', () => {
      const html = '<ul><li><em>Italic</em> and <strong>bold</strong></li></ul>';
      const result = htmlToFormattedDisplayItems(html);
      
      expect(result[0].content).toContain('<em>');
      expect(result[0].content).toContain('<strong>');
    });
  });

  describe('isEmptyHtml', () => {
    it('should return true for empty string', () => {
      expect(isEmptyHtml('')).toBe(true);
    });

    it('should return true for whitespace only', () => {
      expect(isEmptyHtml('   \n\t  ')).toBe(true);
    });

    it('should return true for empty HTML tags', () => {
      expect(isEmptyHtml('<p></p>')).toBe(true);
      expect(isEmptyHtml('<p>   </p>')).toBe(true);
      expect(isEmptyHtml('<div><p></p></div>')).toBe(true);
    });

    it('should return false for content with text', () => {
      expect(isEmptyHtml('<p>Hello</p>')).toBe(false);
      expect(isEmptyHtml('Hello')).toBe(false);
    });

    it('should return false for HTML with list items', () => {
      expect(isEmptyHtml('<ul><li>Item</li></ul>')).toBe(false);
    });
  });
});

