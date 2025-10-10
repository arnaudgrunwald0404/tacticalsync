/**
 * Utility functions for handling HTML content from rich text editors
 */

/**
 * Convert HTML to plain text by stripping tags
 * Used for displaying rich text content in a clean format
 */
export const htmlToPlainText = (html: string): string => {
  if (!html) return '';
  
  // Create a temporary div element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Get text content, which automatically strips HTML tags
  return tempDiv.textContent || tempDiv.innerText || '';
};

/**
 * Convert HTML to display-ready format
 * Preserves some formatting but makes it safe for display
 */
export const htmlToDisplayText = (html: string): string => {
  if (!html) return '';
  
  // For now, just strip tags and return plain text
  // In the future, we could enhance this to preserve some formatting
  return htmlToPlainText(html);
};

/**
 * Check if content is just empty HTML tags
 */
export const isEmptyHtml = (html: string): boolean => {
  const plainText = htmlToPlainText(html);
  return !plainText.trim();
};
