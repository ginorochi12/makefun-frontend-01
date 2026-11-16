// A small, safe Markdown renderer for bounty descriptions and rules. It
// handles headings, fenced code, lists (bulleted and numbered), quotes and
// paragraphs, with inline code, bold, italic and links inside them. The source
// is escaped before any markup is added, links must be http(s), and nothing
// in the source can inject an element or an attribute.
//
// The parser works in two passes: split the source into blocks (blank lines
// and fence lines are the boundaries), then render each block by its shape.

import { escapeHtml } from './format.js';

const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
const CODE_PATTERN = /`([^`\n]+)`/g;
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g;
const ITALIC_PATTERN = /(^|[^*A-Za-z0-9])\*([^*\n]+)\*/g;

/** Inline spans inside one line of text: code, bold, italic, links. */
function renderInline(text) {
  return escapeHtml(text)
    .replace(CODE_PATTERN, (_match, code) => `<code>${code}</code>`)
    .replace(BOLD_PATTERN, '<strong>$1</strong>')
    .replace(ITALIC_PATTERN, '$1<em>$2</em>')
    .replace(LINK_PATTERN, (_match, label, href) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`);
}

/** Split source into blocks: a fence, a heading, a quote run, a list run, or
 *  a run of plain lines. Returns { kind, lines } per block. */
function splitBlocks(source) {
  const lines = String(source ?? '').split('\n');
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const body = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // skip the closing fence
      blocks.push({ kind: 'code', lines: body });
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1].length, lines: [heading[2]] });
      i += 1;
      continue;
    }
    if (line.startsWith('>')) {
      const body = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        body.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', lines: body });
      continue;
    }
    const listItem = line.match(/^([-*]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      const ordered = /^\d/.test(line);
      const body = [];
      while (i < lines.length) {
        const item = lines[i].match(/^([-*]|\d+[.)])\s+(.+)$/);
        if (!item) break;
        body.push(item[2]);
        i += 1;
      }
      blocks.push({ kind: ordered ? 'ordered' : 'list', lines: body });
      continue;
    }
    const body = [];
    while (i < lines.length) {
      const current = lines[i];
      if (current.trim() === '' || current.startsWith('```') || current.startsWith('>')) break;
      if (/^(#{1,4}\s|[-*]\s|\d+[.)]\s)/.test(current)) break;
      body.push(current);
      i += 1;
    }
    blocks.push({ kind: 'paragraph', lines: body });
  }
  return blocks;
}

/** Render one block to HTML. */
function renderBlock(block) {
  if (block.kind === 'code') return `<pre><code>${escapeHtml(block.lines.join('\n'))}</code></pre>`;
  if (block.kind === 'heading') {
    // Headings shift one level down: the page already owns the h1.
    const level = Math.min(block.level + 1, 6);
    return `<h${level}>${renderInline(block.lines[0])}</h${level}>`;
  }
  if (block.kind === 'quote') return `<blockquote><p>${renderInline(block.lines.join(' '))}</p></blockquote>`;
  if (block.kind === 'list') return `<ul>${block.lines.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`;
  if (block.kind === 'ordered') return `<ol>${block.lines.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`;
  return `<p>${renderInline(block.lines.join(' '))}</p>`;
}

/** Render Markdown source to HTML. Empty source renders nothing. */
export function renderMarkdown(source) {
  if (!String(source ?? '').trim()) return '';
  return splitBlocks(source).map(renderBlock).join('\n');
}
