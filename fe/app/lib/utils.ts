/**
 * Utility functions for text manipulation and formatting
 */

/**
 * Truncate text to a maximum length with ellipsis
 * @param text - Text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength).trim() + "...";
}

/**
 * Truncate text to a maximum number of words
 * @param text - Text to truncate
 * @param maxWords - Maximum number of words
 * @returns Truncated text with ellipsis if needed
 */
export function truncateWords(text: string, maxWords: number = 20): string {
  if (!text) return text;

  const words = text.split(/\s+/);
  if (words.length <= maxWords) {
    return text;
  }

  return words.slice(0, maxWords).join(" ") + "...";
}

/**
 * Get excerpt from text (first paragraph or first N characters)
 * @param text - Text to excerpt
 * @param maxLength - Maximum length of excerpt
 * @returns Excerpt with ellipsis if truncated
 */
export function getExcerpt(text: string, maxLength: number = 200): string {
  if (!text) return "";

  // Try to get first paragraph
  const firstParagraph = text.split("\n\n")[0];

  if (firstParagraph.length <= maxLength) {
    return firstParagraph;
  }

  // Truncate at word boundary
  const truncated = firstParagraph.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > 0) {
    return truncated.substring(0, lastSpace) + "...";
  }

  return truncated + "...";
}
