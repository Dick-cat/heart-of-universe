export interface ParsedNode {
  id: string;
  label: string;
  level: number;
  parentId?: string | null;
}

export interface ParseResult {
  nodes: ParsedNode[];
  links: { source: string; target: string; label: string }[];
}

function generateId(label: string, index: number): string {
  const base = label
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'node'}-${index}`;
}

/**
 * Parse indented text into a tree.
 *
 * Syntax:
 * - Each line is one node.
 * - Indentation (2 or 4 spaces, or tabs) indicates depth.
 * - Optional `- ` or `* ` or `1. ` prefix is stripped.
 *
 * Example:
 *   研究目标
 *     子目标 A
 *       任务 A1
 *     子目标 B
 */
export function parseIndentedTree(text: string): ParseResult {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r/g, ''))
    .filter((l) => l.trim());

  const nodes: ParsedNode[] = [];
  const links: { source: string; target: string; label: string }[] = [];
  const stack: { id: string; level: number }[] = [];

  lines.forEach((raw, index) => {
    const leading = raw.match(/^(\s*)/)?.[1] || '';
    const level = leading.replace(/\t/g, '  ').length;
    const label = raw.trim().replace(/^[-*\d]+\.\s*/, '').trim();
    if (!label) return;

    const id = generateId(label, index);
    nodes.push({ id, label, level });

    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    if (parent) {
      links.push({ source: parent.id, target: id, label: '包含' });
    }

    stack.push({ id, level });
  });

  return { nodes, links };
}

/**
 * Parse arrow syntax into a graph.
 *
 * Syntax:
 *   A -> B -> C
 *   D -> E
 *
 * Each unique label becomes a node; arrows become links.
 */
export function parseArrowGraph(text: string): ParseResult {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r/g, ''))
    .filter((l) => l.trim());

  const nodeMap = new Map<string, string>();
  const nodes: ParsedNode[] = [];
  const links: { source: string; target: string; label: string }[] = [];

  const getId = (label: string) => {
    if (!nodeMap.has(label)) {
      const id = generateId(label, nodeMap.size);
      nodeMap.set(label, id);
      nodes.push({ id, label, level: 0, parentId: null });
    }
    return nodeMap.get(label)!;
  };

  lines.forEach((line) => {
    const parts = line.split(/\s*->\s*/).map((p) => p.trim()).filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      const source = getId(parts[i]);
      const target = getId(parts[i + 1]);
      links.push({ source, target, label: '推导/相关' });
    }
  });

  return { nodes, links };
}

export function parseLogicTree(text: string, mode: 'indent' | 'arrow' = 'indent'): ParseResult {
  return mode === 'arrow' ? parseArrowGraph(text) : parseIndentedTree(text);
}
