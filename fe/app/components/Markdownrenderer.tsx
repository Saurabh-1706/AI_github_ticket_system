"use client";

interface MarkdownProps {
  content: string;
  maxLength?: number;
  className?: string;
}

export default function MarkdownRenderer({ content, maxLength = 200, className = "" }: MarkdownProps) {
  if (!content) return null;

  // Truncate content
  let text = content;
  if (text.length > maxLength) {
    text = text.substring(0, maxLength) + "...";
  }

  // Simple markdown to HTML conversion
  const renderMarkdown = (md: string) => {
    let html = md;

    // IMPORTANT: Remove images completely (no placeholders)
    // Remove markdown images
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '');
    
    // Remove HTML img tags
    html = html.replace(/<img[^>]*>/gi, '');
    
    // Remove HTML picture tags
    html = html.replace(/<picture[^>]*>[\s\S]*?<\/picture>/gi, '');

    // Escape HTML 
    html = html.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');

    // Headers
    html = html.replace(/^### (.*$)/gm, '<h3 class="text-base font-semibold mt-3 mb-2">$1</h3>');
    html = html.replace(/^## (.*$)/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>');
    html = html.replace(/^# (.*$)/gm, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-slate-200">$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong class="font-semibold text-slate-200">$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    html = html.replace(/_(.*?)_/g, '<em class="italic">$1</em>');

    // Code blocks (inline)
    html = html.replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 bg-slate-800 text-indigo-300 rounded text-xs font-mono">$1</code>');

    // Lists
    html = html.replace(/^\* (.*$)/gm, '<li class="ml-4">• $1</li>');
    html = html.replace(/^- (.*$)/gm, '<li class="ml-4">• $1</li>');
    html = html.replace(/^\d+\. (.*$)/gm, '<li class="ml-4">$1</li>');

    // Links (convert back the escaped characters for URLs)
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
      const unescapedUrl = url.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      return `<a href="${unescapedUrl}" class="text-indigo-400 hover:text-indigo-300 underline" target="_blank" rel="noopener noreferrer">${text}</a>`;
    });

    // Line breaks (convert \n to <br> but not inside HTML tags we just created)
    const lines = html.split('\n');
    html = lines.map((line, i) => {
      // If line is empty, just return a <br>
      if (line.trim() === '') return '<br />';
      // If line doesn't start with an HTML tag, add <br> after it
      if (!line.trim().match(/^<(h\d|li|strong|em|code|a)/)) {
        return line + (i < lines.length - 1 ? '<br />' : '');
      }
      return line;
    }).join('\n');

    // Clean up multiple consecutive line breaks
    html = html.replace(/(<br \/>){3,}/g, '<br /><br />');

    return html;
  };

  return (
    <div 
      className={`markdown-content text-sm leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }}
    />
  );
}