import { Attachment, GraphNode, GraphLink } from './types';

export type CredibilityLevel = 'high' | 'medium' | 'low' | 'unknown';

export interface EvidenceReviewResult {
  level: CredibilityLevel;
  score: number; // 0-1
  reasons: string[];
  warnings: string[];
}

const TRUSTED_ACADEMIC_DOMAINS = new Set([
  'arxiv.org',
  'openalex.org',
  'semanticscholar.org',
  'crossref.org',
  'doi.org',
  'pubmed.ncbi.nlm.nih.gov',
  'ncbi.nlm.nih.gov',
  'europepmc.org',
  'biorxiv.org',
  'medrxiv.org',
  'ssrn.com',
  'jstor.org',
  'ieee.org',
  'acm.org',
  'springer.com',
  'nature.com',
  'science.org',
  'cell.com',
  'sciencedirect.com',
  'wiley.com',
  'cambridge.org',
  'oxfordacademic.com',
  'tandfonline.com',
  'sagepub.com',
  'frontiersin.org',
  'mdpi.com',
  'plos.org',
  'huggingface.co',
  'github.com',
  'gitlab.com',
]);

const KNOWN_LOW_QUALITY_DOMAINS = new Set([
  'medium.com',
  'blogspot.com',
  'wordpress.com',
  'substack.com',
  'zhihu.com',
  'weibo.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
]);

function extractDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function domainCredibility(domain: string): { score: number; reason: string } {
  if (TRUSTED_ACADEMIC_DOMAINS.has(domain)) {
    return { score: 0.9, reason: '来源为知名学术或技术平台' };
  }
  if (KNOWN_LOW_QUALITY_DOMAINS.has(domain)) {
    return { score: 0.4, reason: '来源为社交媒体或博客平台，需谨慎对待' };
  }
  return { score: 0.6, reason: '来源可信度一般，建议交叉验证' };
}

export function reviewAttachment(att: Attachment): EvidenceReviewResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 0.5;

  if (att.type === 'pdf') {
    if (att.blobRef) {
      score += 0.1;
      reasons.push('PDF 已本地持久化存储');
    } else if (att.url) {
      score += 0.05;
      reasons.push('PDF 链接可用');
    }
  }

  if (att.url) {
    const domain = extractDomain(att.url);
    if (domain) {
      const dc = domainCredibility(domain);
      score = score * 0.3 + dc.score * 0.7;
      reasons.push(dc.reason);
      if (dc.score < 0.7) {
        warnings.push('非学术来源，建议核查原始出处');
      }
    } else {
      warnings.push('无法解析链接域名');
    }
  } else if (att.blobRef) {
    // local file, no external URL
    score += 0.1;
    reasons.push('本地文件，来源由用户控制');
  } else {
    warnings.push('没有可访问的来源链接');
  }

  score = Math.max(0, Math.min(1, score));

  let level: CredibilityLevel = 'unknown';
  if (score >= 0.8) level = 'high';
  else if (score >= 0.55) level = 'medium';
  else level = 'low';

  return { level, score, reasons, warnings };
}

export interface NodeRigorResult {
  score: number; // 0-1
  contentScore: number;
  evidenceScore: number;
  relationScore: number;
  historyComparison?: {
    averageRigor: number;
    percentile: number;
  };
  suggestions: string[];
}

export function evaluateNodeRigor(
  node: GraphNode,
  links: GraphLink[],
  history?: { averageContentLength: number; averageEvidenceCount: number; averageRelationCount: number }
): NodeRigorResult {
  const contentLength = (node.contentItems || []).reduce((sum, ci) => sum + (ci.content || '').length, 0);
  const contentScore = Math.min(1, contentLength / 500);

  const evidenceCount = (node.attachments || []).length;
  const evidenceScore = Math.min(1, evidenceCount / 3);

  const relationCount = links.filter((l) => l.source === node.id || l.target === node.id).length;
  const relationScore = Math.min(1, relationCount / 3);

  const score = contentScore * 0.4 + evidenceScore * 0.35 + relationScore * 0.25;

  const suggestions: string[] = [];
  if (contentScore < 0.5) suggestions.push('补充更多文字说明或摘要');
  if (evidenceScore < 0.5) suggestions.push('添加论文、链接或数据作为证据');
  if (relationScore < 0.5) suggestions.push('建立与其他节点的关系，形成知识网络');

  let historyComparison: { averageRigor: number; percentile: number } | undefined;
  if (history) {
    const avgContent = Math.max(1, history.averageContentLength);
    const avgEvidence = Math.max(1, history.averageEvidenceCount);
    const avgRelation = Math.max(1, history.averageRelationCount);
    const thisRigor = contentLength / avgContent * 0.4 +
      evidenceCount / avgEvidence * 0.35 +
      relationCount / avgRelation * 0.25;
    historyComparison = {
      averageRigor: 1,
      percentile: Math.min(100, Math.round(thisRigor * 100)),
    };
  }

  return {
    score: Math.round(score * 100) / 100,
    contentScore: Math.round(contentScore * 100) / 100,
    evidenceScore: Math.round(evidenceScore * 100) / 100,
    relationScore: Math.round(relationScore * 100) / 100,
    historyComparison,
    suggestions,
  };
}

export function levelColor(level: CredibilityLevel): string {
  switch (level) {
    case 'high':
      return 'bg-emerald-500';
    case 'medium':
      return 'bg-amber-500';
    case 'low':
      return 'bg-crimson-500';
    default:
      return 'bg-cosmic-500';
  }
}

export function levelText(level: CredibilityLevel): string {
  switch (level) {
    case 'high':
      return '可信';
    case 'medium':
      return '待核';
    case 'low':
      return '存疑';
    default:
      return '未知';
  }
}
