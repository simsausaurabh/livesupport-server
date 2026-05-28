import { Router }   from 'express';
import multer        from 'multer';
import { requireAuth } from '../middleware/auth.js';
import {
  listKnowledgeSources,
  createUrlSource,
  createManualSource,
  createFileSource,
  reindexSource,
  deleteKnowledgeSource,
} from '../services/knowledge.service.js';

export const knowledgeRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain', 'text/markdown',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    cb(null, allowed.includes(file.mimetype) || file.originalname.endsWith('.md'));
  },
});

// GET /api/knowledge
knowledgeRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const sources = await listKnowledgeSources(req.agent!.organizationId);
    res.json({ success: true, data: sources });
  } catch (err) { next(err); }
});

// POST /api/knowledge/url
knowledgeRouter.post('/url', requireAuth, async (req, res, next) => {
  try {
    const { title, url } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: { message: 'Title required' } });
    if (!url?.startsWith('http')) return res.status(400).json({ success: false, error: { message: 'Valid URL required' } });
    const source = await createUrlSource(req.agent!.organizationId, title, url);
    res.status(201).json({ success: true, data: source });
  } catch (err: any) {
    if (err.code === 'PLAN_LIMIT') return res.status(403).json({ success: false, error: { code: 'PLAN_LIMIT', message: err.message } });
    next(err);
  }
});

// POST /api/knowledge/manual
knowledgeRouter.post('/manual', requireAuth, async (req, res, next) => {
  try {
    const { title, content } = req.body;
    if (!title?.trim())   return res.status(400).json({ success: false, error: { message: 'Title required' } });
    if (!content?.trim()) return res.status(400).json({ success: false, error: { message: 'Content required' } });
    const source = await createManualSource(req.agent!.organizationId, title, content);
    res.status(201).json({ success: true, data: source });
  } catch (err: any) {
    if (err.code === 'PLAN_LIMIT') return res.status(403).json({ success: false, error: { code: 'PLAN_LIMIT', message: err.message } });
    next(err);
  }
});

// POST /api/knowledge/file  (multipart)
knowledgeRouter.post('/file', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, error: { message: 'Title required' } });
    if (!req.file)      return res.status(400).json({ success: false, error: { message: 'File required' } });

    // Extract text from buffer (plain text / markdown / simple PDF text layer)
    let text = '';
    const mime = req.file.mimetype;

    if (mime === 'text/plain' || mime === 'text/markdown' || req.file.originalname.endsWith('.md')) {
      text = req.file.buffer.toString('utf-8');
    } else if (mime === 'application/pdf') {
      // Best-effort: extract raw text from PDF buffer (no external lib)
      // Works for text-layer PDFs; scanned PDFs return minimal text
      text = req.file.buffer.toString('latin1')
        .replace(/[^\x20-\x7E\n\r]/g, ' ')
        .replace(/ {3,}/g, ' ')
        .trim();
      if (text.length < 100) text = '(PDF content could not be extracted automatically. Please use manual entry.)';
    } else {
      // DOCX: strip XML tags best-effort
      text = req.file.buffer.toString('utf-8')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    const source = await createFileSource(
      req.agent!.organizationId,
      title,
      req.file.originalname,
      text.slice(0, 200_000),
    );
    res.status(201).json({ success: true, data: source });
  } catch (err: any) {
    if (err.code === 'PLAN_LIMIT') return res.status(403).json({ success: false, error: { code: 'PLAN_LIMIT', message: err.message } });
    next(err);
  }
});

// POST /api/knowledge/:id/reindex
knowledgeRouter.post('/:id/reindex', requireAuth, async (req, res, next) => {
  try {
    const result = await reindexSource(req.params.id!, req.agent!.organizationId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// DELETE /api/knowledge/:id
knowledgeRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    await deleteKnowledgeSource(req.params.id!, req.agent!.organizationId);
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});
