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
 * Convert HTML content to an array of display-ready items
 * Handles lists properly by converting them to individual items
 */
export const htmlToDisplayItems = (html: string): string[] => {
  if (!html) return [];
  
  // Create a temporary div element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const items: string[] = [];
  
  // Check if content contains lists
  const lists = tempDiv.querySelectorAll('ul, ol');
  if (lists.length > 0) {
    // Handle lists - extract individual list items
    lists.forEach(list => {
      const listItems = list.querySelectorAll('li');
      listItems.forEach(item => {
        const text = item.textContent || item.innerText || '';
        if (text.trim()) {
          items.push(text.trim());
        }
      });
    });
  } else {
    // Handle plain text - split by newlines and filter empty lines
    const text = tempDiv.textContent || tempDiv.innerText || '';
    items.push(...text.split('\n').filter(line => line.trim()));
  }
  
  return items;
};

/**
 * Safely render HTML content while preserving formatting
 * Strips potentially dangerous tags but keeps formatting tags
 */
export const sanitizeHtmlForDisplay = (html: string): string => {
  if (!html) return '';
  
  // Create a temporary div element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // List of allowed tags for formatting
  const allowedTags = [
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 
    'a', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
  ];
  
  // List of allowed attributes
  const allowedAttributes = ['href', 'target', 'rel', 'class'];
  
  // Recursively clean the HTML
  const cleanElement = (element: Element): void => {
    const tagName = element.tagName.toLowerCase();
    
    // Remove disallowed tags but keep their content
    if (!allowedTags.includes(tagName)) {
      // Replace the element with its children
      const parent = element.parentNode;
      if (parent) {
        while (element.firstChild) {
          parent.insertBefore(element.firstChild, element);
        }
        parent.removeChild(element);
      }
      return;
    }
    
    // Clean attributes
    const attributes = Array.from(element.attributes);
    attributes.forEach(attr => {
      if (!allowedAttributes.includes(attr.name)) {
        element.removeAttribute(attr.name);
      }
    });
    
    // Add security attributes to links
    if (tagName === 'a') {
      const href = element.getAttribute('href');
      if (href && !href.startsWith('#')) {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
    
    // Recursively clean children
    Array.from(element.children).forEach(child => cleanElement(child));
  };
  
  // Clean all elements
  Array.from(tempDiv.children).forEach(child => cleanElement(child));
  
  return tempDiv.innerHTML;
};

/**
 * Convert HTML content to structured display items with preserved formatting
 * Handles lists properly while keeping rich text formatting
 */
export const htmlToFormattedDisplayItems = (html: string): { content: string; isListItem: boolean }[] => {
  if (!html) return [];
  
  const sanitizedHtml = sanitizeHtmlForDisplay(html);
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = sanitizedHtml;
  
  const items: { content: string; isListItem: boolean }[] = [];
  
  // Check if content contains lists
  const lists = tempDiv.querySelectorAll('ul, ol');
  if (lists.length > 0) {
    // Handle lists - extract individual list items with their HTML content
    lists.forEach(list => {
      const listItems = list.querySelectorAll('li');
      listItems.forEach(item => {
        if (item.innerHTML.trim()) {
          items.push({
            content: item.innerHTML.trim(),
            isListItem: true
          });
        }
      });
    });
  } else {
    // Handle plain text - split by paragraphs or newlines
    const paragraphs = tempDiv.querySelectorAll('p');
    if (paragraphs.length > 0) {
      paragraphs.forEach(p => {
        if (p.innerHTML.trim()) {
          items.push({
            content: p.innerHTML.trim(),
            isListItem: false
          });
        }
      });
    } else {
      // Fallback to text content split by newlines
      const text = tempDiv.textContent || tempDiv.innerText || '';
      text.split('\n').filter(line => line.trim()).forEach(line => {
        items.push({
          content: line.trim(),
          isListItem: false
        });
      });
    }
  }
  
  return items;
};

/**
 * Check if content is just empty HTML tags
 */
export const isEmptyHtml = (html: string): boolean => {
  const plainText = htmlToPlainText(html);
  return !plainText.trim();
};
