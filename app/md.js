// A tiny safe Markdown subset for bounty descriptions and rules:
// headings, fenced code, lists, quotes, paragraphs, and inline code, bold,
// italic and links. Everything is HTML-escaped first, so no markup in the
// source can run; links are http(s) only and open in a new tab.

import { esc } from './format.js';

const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(LINK, (_, label, href) => `<a href="${href}" target="_blank" rel="noopener">${label}</a>`);
}

/** Render Markdown text to HTML. */
export function md(source) {
  const lines = String(source ?? '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length + 1; // h2..h5: the page already has its h1
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`);
      continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const items = [];
      const ordered = /^\d/.test(line);
      while (i < lines.length && (/^[-*]\s+/.test(lines[i]) || /^\d+[.)]\s+/.test(lines[i]))) {
        items.push(lines[i].replace(/^([-*]|\d+[.)])\s+/, ''));
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((item) => `<li>${inline(item)}</li>`).join('')}</${tag}>`);
      continue;
    }
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].startsWith('```') && !/^(#{1,4}\s|[-*]\s|\d+[.)]\s|>)/.test(lines[i])) {
      para.push(lines[i]);
      i += 1;
    }
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
