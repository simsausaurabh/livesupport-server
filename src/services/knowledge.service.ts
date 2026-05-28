import { prisma }    from '../lib/prisma';
import { Plan }      from '../types';
import { PLAN_LIMITS } from '../types';

// ── helpers ───────────────────────────────────────────────────────────────

function planOf(org: { plan: string }): Plan {
  return org.plan as Plan;
}

async function getOrg(orgId: string) {
  return prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
}

async function countSources(orgId: string) {
  return prisma.knowledgeSource.count({ where: { organizationId: orgId } });
}

/** Naïve HTML → plain-text stripper (no external deps). */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Fetch a URL and extract readable text (best-effort). */
async function scrapeUrl(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'LiveSupport-Bot/1.0 (knowledge-indexer)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const html = await res.text();
  const text = stripHtml(html);
  if (text.length < 50) throw new Error('Page returned too little readable text');
  return text.slice(0, 200_000); // cap at 200 k chars
}

// ── public API ────────────────────────────────────────────────────────────

export async function listKnowledgeSources(organizationId: string) {
  return prisma.knowledgeSource.findMany({
    where: { organizationId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, type: true, title: true, sourceUrl: true,
      fileName: true, isIndexed: true, charCount: true,
      createdAt: true, updatedAt: true,
    },
  });
}

export async function createUrlSource(
  organizationId: string,
  title: string,
  url: string,
) {
  const org    = await getOrg(organizationId);
  const limits = PLAN_LIMITS[planOf(org)];
  const count  = await countSources(organizationId);

  if (limits.maxKnowledgeSources !== -1 && count >= limits.maxKnowledgeSources) {
    throw Object.assign(new Error('Knowledge source limit reached for your plan'), { code: 'PLAN_LIMIT' });
  }

  // Create placeholder, then index in background
  const source = await prisma.knowledgeSource.create({
    data: {
      organizationId,
      type:       'URL',
      title,
      sourceUrl:  url,
      contentText: '',
      isIndexed:  false,
      charCount:  0,
    },
  });

  // Non-blocking index
  scrapeAndIndex(source.id, url).catch(console.error);
  return source;
}

export async function createManualSource(
  organizationId: string,
  title: string,
  content: string,
) {
  const org    = await getOrg(organizationId);
  const limits = PLAN_LIMITS[planOf(org)];
  const count  = await countSources(organizationId);

  if (limits.maxKnowledgeSources !== -1 && count >= limits.maxKnowledgeSources) {
    throw Object.assign(new Error('Knowledge source limit reached for your plan'), { code: 'PLAN_LIMIT' });
  }

  return prisma.knowledgeSource.create({
    data: {
      organizationId,
      type:        'MANUAL',
      title,
      contentText: content,
      isIndexed:   true,
      charCount:   content.length,
    },
  });
}

export async function createFileSource(
  organizationId: string,
  title: string,
  fileName: string,
  textContent: string,
) {
  const org    = await getOrg(organizationId);
  const limits = PLAN_LIMITS[planOf(org)];
  const count  = await countSources(organizationId);

  if (limits.maxKnowledgeSources !== -1 && count >= limits.maxKnowledgeSources) {
    throw Object.assign(new Error('Knowledge source limit reached for your plan'), { code: 'PLAN_LIMIT' });
  }

  return prisma.knowledgeSource.create({
    data: {
      organizationId,
      type:        'FILE',
      title,
      fileName,
      contentText: textContent,
      isIndexed:   true,
      charCount:   textContent.length,
    },
  });
}

export async function reindexSource(id: string, organizationId: string) {
  const source = await prisma.knowledgeSource.findFirstOrThrow({
    where: { id, organizationId },
  });

  if (source.type === 'URL' && source.sourceUrl) {
    await prisma.knowledgeSource.update({
      where: { id },
      data: { isIndexed: false },
    });
    scrapeAndIndex(id, source.sourceUrl).catch(console.error);
  }
  return { queued: true };
}

export async function deleteKnowledgeSource(id: string, organizationId: string) {
  await prisma.knowledgeSource.deleteMany({ where: { id, organizationId } });
}

/** Retrieve all indexed content for a set of source IDs (for bot context). */
export async function getKnowledgeContext(sourceIds: string[]): Promise<string> {
  if (!sourceIds.length) return '';
  const sources = await prisma.knowledgeSource.findMany({
    where: { id: { in: sourceIds }, isIndexed: true },
    select: { title: true, contentText: true },
  });
  return sources
    .map(s => `## ${s.title}\n${s.contentText}`)
    .join('\n\n---\n\n')
    .slice(0, 80_000); // cap context at 80k chars
}

// ── background indexer ────────────────────────────────────────────────────

async function scrapeAndIndex(id: string, url: string) {
  try {
    const text = await scrapeUrl(url);
    await prisma.knowledgeSource.update({
      where: { id },
      data: { contentText: text, charCount: text.length, isIndexed: true },
    });
    console.log(`[knowledge] indexed ${id} (${text.length} chars)`);
  } catch (err) {
    console.error(`[knowledge] failed to index ${id}:`, err);
    // Leave isIndexed: false so agent knows it failed
  }
}
