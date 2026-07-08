export interface AcademicPaper {
  id: string;
  title: string;
  titleEn?: string;
  authors: string[];
  abstract: string;
  abstractEn?: string;
  year?: number;
  source: 'openalex' | 'arxiv';
  externalUrl: string;
  pdfUrl?: string;
  doi?: string;
  citationCount?: number;
  isOpenAccess?: boolean;
}

export interface AcademicSearchOptions {
  query: string;
  limit?: number;
  email?: string;
}

function extractYear(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const match = date.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : undefined;
}

export async function searchOpenAlex(options: AcademicSearchOptions): Promise<AcademicPaper[]> {
  const { query, limit = 10, email = '' } = options;
  const url = new URL('https://api.openalex.org/works');
  url.searchParams.set('search', query);
  url.searchParams.set('per-page', String(limit));
  if (email) url.searchParams.set('mailto', email);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`OpenAlex request failed: ${res.status}`);
  const data = await res.json();

  return (data.results || []).map((work: any): AcademicPaper => {
    const primaryLocation = work.primary_location || {};
    const openAccess = work.open_access || {};
    return {
      id: `openalex:${work.id}`,
      title: work.display_name || 'Untitled',
      titleEn: work.display_name,
      authors: (work.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean),
      abstract: work.abstract_inverted_index ? reconstructAbstract(work.abstract_inverted_index) : (work.abstract || ''),
      abstractEn: work.abstract_inverted_index ? reconstructAbstract(work.abstract_inverted_index) : undefined,
      year: work.publication_year,
      source: 'openalex',
      externalUrl: primaryLocation.landing_page_url || work.id,
      pdfUrl: openAccess.oa_url || primaryLocation.pdf_url,
      doi: work.doi,
      citationCount: work.cited_by_count,
      isOpenAccess: openAccess.is_oa,
    };
  });
}

function reconstructAbstract(invertedIndex: Record<string, number[]>): string {
  // Inverted index maps words to positions. Reconstruct approximate abstract.
  const positions: { word: string; pos: number }[] = [];
  for (const [word, idxs] of Object.entries(invertedIndex)) {
    for (const pos of idxs) {
      positions.push({ word, pos });
    }
  }
  positions.sort((a, b) => a.pos - b.pos);
  return positions.map((p) => p.word).join(' ');
}

export async function searchArxiv(options: AcademicSearchOptions): Promise<AcademicPaper[]> {
  const { query, limit = 10 } = options;
  const encoded = encodeURIComponent(query);
  const url = `https://export.arxiv.org/api/query?search_query=all:${encoded}&start=0&max_results=${limit}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`arXiv request failed: ${res.status}`);
  const text = await res.text();

  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');
  const entries = Array.from(xml.querySelectorAll('entry'));

  return entries.map((entry): AcademicPaper => {
    const id = entry.querySelector('id')?.textContent || '';
    const title = entry.querySelector('title')?.textContent?.replace(/\s+/g, ' ').trim() || 'Untitled';
    const summary = entry.querySelector('summary')?.textContent?.trim() || '';
    const authors = Array.from(entry.querySelectorAll('author > name'))
      .map((el) => el.textContent)
      .filter(Boolean) as string[];
    const published = entry.querySelector('published')?.textContent || '';
    const pdfLink = entry.querySelector('link[title="pdf"]')?.getAttribute('href');
    const primaryLink = entry.querySelector('link:not([rel="self"]):not([title="pdf"])')?.getAttribute('href') || id;

    return {
      id: `arxiv:${id}`,
      title,
      titleEn: title,
      authors,
      abstract: summary,
      abstractEn: summary,
      year: extractYear(published),
      source: 'arxiv',
      externalUrl: primaryLink,
      pdfUrl: pdfLink || undefined,
      doi: undefined,
      citationCount: undefined,
      isOpenAccess: true,
    };
  });
}

export async function searchAcademicAll(options: AcademicSearchOptions): Promise<AcademicPaper[]> {
  const [openalex, arxiv] = await Promise.allSettled([
    searchOpenAlex(options),
    searchArxiv(options),
  ]);
  const results: AcademicPaper[] = [];
  if (openalex.status === 'fulfilled') results.push(...openalex.value);
  if (arxiv.status === 'fulfilled') results.push(...arxiv.value);
  // Deduplicate by DOI if possible, otherwise by title similarity
  const seen = new Set<string>();
  return results.filter((p) => {
    const key = p.doi || p.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
