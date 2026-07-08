import { GraphNode, ContentItem } from './types';

export interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

function readBalanced(
  text: string,
  start: number,
  open: string,
  close: string
): { value: string; end: number } {
  const same = open === close;
  let depth = 1;
  let i = start + 1;
  let value = '';
  while (i < text.length && depth > 0) {
    if (same) {
      if (text[i] === open) {
        depth--;
        if (depth === 0) break;
      }
      value += text[i];
    } else {
      if (text[i] === open) depth++;
      else if (text[i] === close) depth--;
      if (depth > 0) value += text[i];
    }
    i++;
  }
  return { value, end: same ? i : i - 1 };
}

/**
 * Parse a BibTeX string into entries.
 * Handles braced values with nested braces and quoted strings.
 */
export function parseBibtex(text: string): BibEntry[] {
  const entries: BibEntry[] = [];
  let i = 0;

  while (i < text.length) {
    // Skip to the next entry marker
    while (i < text.length && text[i] !== '@') i++;
    if (i >= text.length) break;
    i++; // skip '@'

    // Read entry type (e.g. article, book, inproceedings)
    let type = '';
    while (i < text.length && /[a-zA-Z]/.test(text[i])) {
      type += text[i];
      i++;
    }
    type = type.toLowerCase();
    if (!type) continue;

    // Skip whitespace
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] !== '{') continue;
    i++; // skip '{'

    // Read cite key, respecting nested braces
    let key = '';
    let depth = 1;
    while (i < text.length && depth > 0 && !(depth === 1 && text[i] === ',')) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') depth--;
      if (depth > 0) key += text[i];
      i++;
    }
    key = key.trim();

    // Skip the comma after the key
    if (text[i] === ',') i++;

    // Parse fields until the matching closing brace
    const fields: Record<string, string> = {};
    while (i < text.length) {
      // Skip whitespace and stray commas between fields
      while (i < text.length && /[\s,]/.test(text[i])) i++;
      if (i >= text.length) break;
      if (text[i] === '}') {
        i++;
        break;
      }

      // Read field name
      let fieldName = '';
      while (i < text.length && /[a-zA-Z0-9_-]/.test(text[i])) {
        fieldName += text[i];
        i++;
      }
      fieldName = fieldName.toLowerCase().trim();
      if (!fieldName) break;

      // Skip whitespace
      while (i < text.length && /\s/.test(text[i])) i++;
      if (text[i] !== '=') break;
      i++; // skip '='
      while (i < text.length && /\s/.test(text[i])) i++;

      // Read field value
      let value = '';
      if (text[i] === '{' || text[i] === '"') {
        const open = text[i];
        const close = open === '{' ? '}' : '"';
        const result = readBalanced(text, i, open, close);
        value = result.value;
        i = result.end + 1;
      } else {
        while (i < text.length && text[i] !== ',' && text[i] !== '}') {
          value += text[i];
          i++;
        }
      }

      fields[fieldName] = value.trim();

      // Skip trailing whitespace/comma
      while (i < text.length && /[\s,]/.test(text[i])) i++;
    }

    entries.push({ type, key, fields });
  }

  return entries;
}

/**
 * Convert a single BibTeX entry to a GraphNode draft (paper type).
 */
export function bibEntryToNode(
  entry: BibEntry,
  generateId: (prefix?: string) => string
): Partial<GraphNode> & { id: string; label: string } {
  const f = entry.fields;
  const title = f.title || entry.key;
  const authors = f.author
    ? f.author.split(/\s+and\s+/i).map((a) => a.trim()).filter(Boolean)
    : [];
  const year = f.year || '';
  const journal = f.journal || f.booktitle || f.publisher || '';
  const doi = f.doi || '';
  const url = f.url || (doi ? `https://doi.org/${doi}` : '');
  const abstract = f.abstract || '';

  const contentItems: ContentItem[] = [];
  if (abstract) {
    contentItems.push({
      id: generateId('content'),
      title: '摘要',
      content: abstract,
      type: 'abstract',
      tags: [],
      sourceUrl: url,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const tags = [entry.type];
  if (f.keywords) {
    tags.push(...f.keywords.split(/[,;]/).map((k) => k.trim()).filter(Boolean));
  }

  const descriptionParts = [
    authors.join(', '),
    year ? `(${year})` : '',
    journal,
  ].filter(Boolean);

  return {
    id: generateId('paper'),
    label: title,
    type: 'paper',
    description: descriptionParts.join('. '),
    attachments: [],
    contentItems,
    metadata: {
      source: doi || url || entry.type,
      authors,
      tags,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
}

/**
 * Convert a GraphNode to a BibTeX entry string.
 */
export function nodeToBibtex(node: GraphNode): string {
  const authors = node.metadata?.authors?.join(' and ') || '';
  const yearMatch = node.description?.match(/\((\d{4})\)/);
  const year = yearMatch?.[1] || '';
  const url =
    node.contentItems?.find((c) => c.sourceUrl)?.sourceUrl ||
    '';
  const abstractItem = node.contentItems?.find((c) => c.type === 'abstract');
  const abstract = abstractItem?.content || '';

  const keyBase = node.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'item';
  const citeKey = `${keyBase}${year ? `_${year}` : ''}_${node.id.slice(-6)}`;

  const entryType = node.type === 'paper' ? 'article' : 'misc';
  const lines: string[] = [`@${entryType}{${citeKey},`];
  if (authors) lines.push(`  author = {${authors}},`);
  lines.push(`  title = {${node.label}},`);
  if (year) lines.push(`  year = {${year}},`);
  if (url) lines.push(`  url = {${url}},`);
  if (abstract) lines.push(`  abstract = {${abstract}},`);
  lines.push('}');

  return lines.join('\n');
}

/**
 * Export a list of GraphNodes to a BibTeX string.
 */
export function exportNodesToBibtex(nodes: GraphNode[]): string {
  return nodes.map(nodeToBibtex).join('\n\n');
}
