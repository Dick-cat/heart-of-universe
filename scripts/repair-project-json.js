const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const fileName = process.argv[2] || 'heart-of-universe-1782136239972.json';
const filePath = path.resolve(process.cwd(), fileName);

if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

function tryRecoverGbkMojibake(input) {
  if (typeof input !== 'string' || !input) return input;
  try {
    const gbkBytes = iconv.encode(input, 'gbk');
    let recovered = iconv.decode(gbkBytes, 'utf8');
    recovered = recovered.replace(/\uFFFD+$/, '');
    if (recovered && recovered !== input && !recovered.includes('\uFFFD')) {
      return recovered;
    }
  } catch {
    // ignore
  }
  return input;
}

function asStringArray(arr, nodeLabels) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => {
      if (item === null || item === undefined) return '';
      const recovered = typeof item === 'string' ? tryRecoverGbkMojibake(item) : tryRecoverGbkMojibake(String(item));
      return matchToNodeLabel(recovered, nodeLabels);
    })
    .filter((s) => s.length > 0);
}

function matchToNodeLabel(text, nodeLabels) {
  if (!text) return '';
  if (nodeLabels.has(text)) return text;
  // Find a node label that starts with this (truncated) text
  for (const label of nodeLabels) {
    if (label.startsWith(text)) return label;
  }
  // Otherwise find one that contains it
  for (const label of nodeLabels) {
    if (label.includes(text)) return label;
  }
  return text;
}

function sanitizeNode(n) {
  if (!n || typeof n !== 'object') return null;
  const label = typeof n.label === 'string' ? tryRecoverGbkMojibake(n.label) : '未命名节点';
  return {
    ...n,
    id: typeof n.id === 'string' && n.id ? n.id : `node-${Math.random().toString(36).slice(2, 9)}`,
    label,
    type: n.type || 'concept',
    attachments: Array.isArray(n.attachments) ? n.attachments : [],
    contentItems: Array.isArray(n.contentItems) ? n.contentItems : [],
    metadata: {
      ...(n.metadata || {}),
      tags: Array.isArray(n.metadata?.tags) ? n.metadata.tags : [],
    },
  };
}

function sanitizeLink(l) {
  if (!l || typeof l !== 'object') return null;
  return {
    source: typeof l.source === 'string' ? l.source : '',
    target: typeof l.target === 'string' ? l.target : '',
    label: typeof l.label === 'string' ? tryRecoverGbkMojibake(l.label) : undefined,
    value: typeof l.value === 'number' ? l.value : undefined,
    color: typeof l.color === 'string' ? l.color : undefined,
    theme: typeof l.theme === 'string' ? l.theme : undefined,
    variant: l.variant === 'cycle' ? 'cycle' : undefined,
  };
}

function sanitizeChangeLogEntry(entry, nodeLabels) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    ...entry,
    id: typeof entry.id === 'string' && entry.id ? entry.id : `log-${Math.random().toString(36).slice(2, 9)}`,
    prompt: typeof entry.prompt === 'string' ? entry.prompt : '',
    summary: typeof entry.summary === 'string' ? entry.summary : '',
    nodesAdded: asStringArray(entry.nodesAdded, nodeLabels),
    nodesUpdated: asStringArray(entry.nodesUpdated, nodeLabels),
    nodesRemoved: asStringArray(entry.nodesRemoved, nodeLabels),
    linksAdded: typeof entry.linksAdded === 'number' ? entry.linksAdded : 0,
  };
}

console.log('Loading', filePath);
const raw = fs.readFileSync(filePath, 'utf8');
const project = JSON.parse(raw);

const originalAdded = (project.changeLog?.[0]?.nodesAdded || []).slice(0, 5);
console.log('Sample original nodesAdded:', originalAdded);

project.nodes = (project.nodes || [])
  .map(sanitizeNode)
  .filter(Boolean);
const nodeLabels = new Set(project.nodes.map((n) => n.label).filter(Boolean));
project.links = (project.links || [])
  .map(sanitizeLink)
  .filter((l) => l && l.source && l.target && l.source !== l.target);
project.changeLog = (project.changeLog || [])
  .map((entry) => sanitizeChangeLogEntry(entry, nodeLabels))
  .filter(Boolean);
project.reasoningThreads = project.reasoningThreads || [];
project.evidenceItems = project.evidenceItems || [];
project.executionTasks = project.executionTasks || [];
project.overviewReport = typeof project.overviewReport === 'string' ? project.overviewReport : '';
project.name = typeof project.name === 'string' ? tryRecoverGbkMojibake(project.name) : '未命名项目';

const repairedAdded = (project.changeLog[0]?.nodesAdded || []).slice(0, 5);
console.log('Sample repaired nodesAdded:', repairedAdded);

const backupPath = `${filePath}.bak`;
fs.writeFileSync(backupPath, raw, 'utf8');
console.log('Original backed up to', backupPath);

fs.writeFileSync(filePath, JSON.stringify(project, null, 2), 'utf8');
console.log('Repaired file written to', filePath);
