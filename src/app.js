import crypto from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { assert, hash, now, publicUser } from './utils/core.js';
import {
  businessSchema,
  productSchema,
  evidenceSchema,
  planEditSchema,
  campaignActionSchema,
} from './modules/schemas.js';
import { executeViaMcp } from './mcp/client.js';
import { passwordHash } from './modules/auth/service.js';
import multer from 'multer';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { projectSchema, reportEditSchema, countryNames } from './modules/research/workbench.js';
import { servicePlanInput, createServicePlan } from './modules/campaigns/service-plan.js';
import { createBudgetPresets } from './modules/campaigns/budget-presets.js';
import { locationSearchSchema, searchLocations } from './modules/research/locations.js';
import {
  outcomeSchema,
  periodSchema,
  saveOutcome,
  voidOutcome,
  actualResults,
  outcomeCsv,
} from './modules/analytics/outcomes.js';
import { accountSnapshot, latestAccountSnapshot } from './modules/analytics/account.js';
import { operationLocks, redisRateStore } from './modules/auth/operation-lock.js';

const parse = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success)
    return res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Check the submitted fields',
        details: result.error.flatten(),
      },
    });
  req.input = result.data;
  next();
};
const credentials = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();
const comment = z.string().trim().max(2000).default('');
const cookieToken = (req) =>
  req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith('adpilot_session='))
    ?.split('=')[1];

export function createApp(runtime) {
  const { config, store, platform, auth, jobs, media, research } = runtime;
  const app = express();
  const exclusive = operationLocks(jobs?.connection);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const supplied = req.headers['x-request-id'];
    req.requestId =
      typeof supplied === 'string' && /^[a-f0-9-]{36}$/i.test(supplied)
        ? supplied
        : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    next();
  });
  app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'https:', 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: '250kb' }));
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ...(jobs?.connection ? { store: redisRateStore(jobs.connection, 'api') } : {}),
    }),
  );
  app.get('/api/health', (req, res) =>
    res.json({
      status: 'ok',
      mode: config.mode,
      liveExecutionEnabled: config.liveExecution,
      backgroundJobsEnabled: config.mode === 'live' && Boolean(jobs),
    }),
  );
  // Internal service auth is isolated from cookie auth. The key never reaches the browser.
  app.use('/api/internal', (req, res, next) => {
    const actual = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || '');
    const expected = Buffer.from(config.serviceKey || '');
    if (
      !expected.length ||
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected)
    )
      return res
        .status(401)
        .json({ error: { code: 'SERVICE_AUTH', message: 'Service authentication required' } });
    next();
  });
  app.post(
    '/api/internal/mcp/action',
    parse(
      z
        .object({
          approvalId: z.string().uuid(),
          toolName: z.enum([
            'create_campaign',
            'pause_campaign',
            'resume_campaign',
            'update_budget',
            'update_ad_set',
            'update_ad',
          ]),
        })
        .strict(),
    ),
    async (req, res) =>
      res.json(await platform.executeApproved(req.input.approvalId, req.input.toolName)),
  );
  app.post(
    '/api/internal/mcp/insights',
    parse(
      z
        .object({ campaignId: z.string().uuid(), level: z.enum(['campaign', 'adset', 'ad']) })
        .strict(),
    ),
    async (req, res) => res.json(await store.list('ad_performance', req.input)),
  );
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = [config.origin];
      if (config.mode === 'demo')
        allowed.push('http://localhost:4000', 'http://127.0.0.1:5173', 'http://127.0.0.1:4000');
      if (!origin || !allowed.includes(origin))
        return res.status(403).json({
          error: {
            code: 'ORIGIN_REJECTED',
            message: 'Requests must originate from the configured application',
          },
        });
    }
    next();
  });
  function setSession(res, session) {
    res.cookie('adpilot_session', session.token, {
      httpOnly: true,
      secure: config.production,
      sameSite: 'strict',
      maxAge: 12 * 3600000,
      path: config.basePath ? `${config.basePath}/` : '/',
    });
    return res.json({ user: session.user });
  }
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(jobs?.connection ? { store: redisRateStore(jobs.connection, 'auth') } : {}),
  });
  app.post('/api/auth/login', authLimit, parse(credentials), async (req, res) =>
    setSession(res, await auth.session(await auth.login(req.input.email, req.input.password))),
  );
  app.post(
    '/api/auth/register',
    authLimit,
    parse(
      credentials.extend({
        name: z.string().trim().min(2).max(100),
        businessName: z.string().trim().min(2).max(200),
      }),
    ),
    async (req, res) => setSession(res, await auth.session(await auth.register(req.input))),
  );
  app.post('/api/auth/demo', authLimit, async (req, res) => {
    assert(config.mode === 'demo', 404, 'NOT_FOUND', 'Not found');
    const user = await store.find('users', { email: 'demo@adpilot.local' });
    assert(user, 503, 'DEMO_UNAVAILABLE', 'Demo is not initialized');
    return setSession(res, await auth.session(user));
  });
  app.post('/api/auth/logout', async (req, res) => {
    await auth.logout(cookieToken(req));
    res.clearCookie('adpilot_session', {
      path: config.basePath ? `${config.basePath}/` : '/',
      secure: config.production,
      httpOnly: true,
      sameSite: 'strict',
    });
    res.json({ success: true });
  });
  app.use('/api', async (req, res, next) => {
    req.user = await auth.resolve(cookieToken(req));
    if (!req.user)
      return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Please sign in' } });
    if (req.headers['x-workspace-id'] && req.headers['x-workspace-id'] !== req.user.businessId)
      return res.status(409).json({
        error: {
          code: 'WORKSPACE_CHANGED',
          message:
            'The selected workspace changed in another tab. Reload before continuing; this request was stopped.',
        },
      });
    next();
  });
  app.get('/api/auth/me', (req, res) =>
    res.json({ user: publicUser(req.user), mode: config.mode }),
  );
  app.get('/api/overview', async (req, res) => res.json(await platform.overview(req.user)));
  const budgetPresets = createBudgetPresets();
  app.get('/api/campaigns/budget-preset', async (req, res) => {
    const integration = await platform.integration(req.user.businessId);
    res.json(await budgetPresets.get(integration?.currency || 'BDT'));
  });
  app.get('/api/workspaces', async (req, res) => res.json(await auth.workspaces(req.user)));
  app.post(
    '/api/workspaces',
    parse(z.object({ name: z.string().trim().min(2).max(200) }).strict()),
    async (req, res) => res.status(201).json(await auth.createWorkspace(req.user, req.input.name)),
  );
  app.post(
    '/api/workspaces/switch',
    parse(z.object({ businessId: z.string().uuid() }).strict()),
    async (req, res) =>
      res.json({
        user: publicUser(await auth.switchWorkspace(cookieToken(req), req.input.businessId)),
      }),
  );
  app.post(
    '/api/integrations/ai',
    parse(
      z
        .object({
          provider: z.enum(['gemini', 'openai', 'gateway']),
          apiKey: z.string().trim().min(10).max(4000).or(z.literal('')).optional(),
          model: z
            .string()
            .regex(/^[a-zA-Z0-9.-]+$/)
            .max(150),
          endpoint: z.string().url().optional(),
          researchModel: z
            .string()
            .regex(/^[a-zA-Z0-9.-]+$/)
            .max(150)
            .optional(),
          researchThinking: z.enum(['low', 'high']).default('high'),
          grounding: z.boolean().default(false),
        })
        .strict(),
    ),
    async (req, res) => res.json(await platform.configureAI(req.user, req.input)),
  );
  const upload = multer({
    dest: path.join(os.tmpdir(), 'adpilot-uploads'),
    limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 0 },
  });
  app.get('/api/media', async (req, res) =>
    res.json(
      (await store.list('media_assets', { businessId: req.user.businessId, status: 'ready' })).map(
        (row) => media.public(row),
      ),
    ),
  );
  app.post('/api/media', upload.single('file'), async (req, res) =>
    res.status(201).json(await media.upload(req.user, req.file)),
  );
  app.get('/api/media/:id/content', async (req, res) => {
    const asset = await media.asset(req.user, req.params.id);
    let range;
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      assert(match && (match[1] || match[2]), 416, 'RANGE_INVALID', 'Invalid byte range');
      const start = match[1] ? Number(match[1]) : Math.max(0, asset.size - Number(match[2]));
      const end =
        match[1] && match[2] ? Math.min(Number(match[2]), asset.size - 1) : asset.size - 1;
      assert(
        Number.isSafeInteger(start) &&
          Number.isSafeInteger(end) &&
          start >= 0 &&
          start <= end &&
          start < asset.size,
        416,
        'RANGE_INVALID',
        'Byte range is outside the file',
      );
      range = { start, end };
      res.status(206).set('Content-Range', `bytes ${start}-${end}/${asset.size}`);
    }
    const object = await media.storage.read(asset.storageKey, range);
    res.set({
      'Content-Type': asset.mime,
      'Content-Length': String(object.size),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${asset.id}.${asset.mime.split('/')[1]}"`,
    });
    await pipeline(object.body, res);
  });
  app.get('/api/research/countries', (req, res) => res.json(countryNames));
  app.get('/api/research/locations', async (req, res) =>
    res.json(await store.list('targeting_locations', { businessId: req.user.businessId })),
  );
  app.post('/api/research/locations/search', parse(locationSearchSchema), async (req, res) => {
    assert(countryNames[req.input.country], 422, 'LOCATION_COUNTRY', 'Choose a supported country');
    res.json(await searchLocations(platform, req.user, req.input));
  });
  app.get('/api/operations/account', async (req, res) =>
    res.json(await latestAccountSnapshot(platform, req.user)),
  );
  app.post('/api/operations/account/check', parse(z.object({}).strict()), async (req, res) =>
    res.json(
      await exclusive(`account:${req.user.businessId}`, () => accountSnapshot(platform, req.user)),
    ),
  );
  app.post('/api/operations/outcomes', parse(outcomeSchema), async (req, res) =>
    res.status(201).json(await saveOutcome(platform, req.user, req.input)),
  );
  app.post('/api/operations/outcomes/:id/void', parse(z.object({}).strict()), async (req, res) =>
    res.json(await voidOutcome(platform, req.user, req.params.id)),
  );
  app.get('/api/operations/results', async (req, res) =>
    res.json(await actualResults(platform, req.user, periodSchema.parse(req.query))),
  );
  app.get('/api/operations/outcomes.csv', async (req, res) => {
    const results = await actualResults(platform, req.user, periodSchema.parse(req.query));
    res
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="adpilot-outcomes.csv"',
      })
      .send('\uFEFF' + outcomeCsv(results.outcomes));
  });
  app.get('/api/research', async (req, res) =>
    res.json(await store.list('research_projects', { businessId: req.user.businessId })),
  );
  app.post('/api/research', parse(projectSchema), async (req, res) =>
    res.status(201).json(await research.create(req.user, req.input)),
  );
  app.put('/api/research/:id', parse(projectSchema), async (req, res) =>
    res.json(await research.update(req.user, req.params.id, req.input)),
  );
  app.get('/api/research/:id/versions', async (req, res) => {
    await platform.owned('research_projects', req.params.id, req.user);
    res.json(
      await store.list('research_versions', {
        projectId: req.params.id,
        businessId: req.user.businessId,
      }),
    );
  });
  app.post(
    '/api/research/:id/run',
    parse(z.object({ instruction: z.string().max(5000).default('') }).strict()),
    async (req, res) =>
      res
        .status(201)
        .json(
          await exclusive(`research:${req.user.businessId}:${req.params.id}`, () =>
            research.research(
              req.user,
              req.params.id,
              req.input.instruction,
              req.headers['accept-language']?.startsWith('bn') ? 'bn' : 'en',
            ),
          ),
        ),
  );
  app.post('/api/research/versions/:id/edit', parse(reportEditSchema), async (req, res) =>
    res.status(201).json(await research.edit(req.user, req.params.id, req.input)),
  );
  app.post('/api/research/versions/:id/submit', parse(z.object({}).strict()), async (req, res) =>
    res.json(await research.submit(req.user, req.params.id)),
  );
  app.post(
    '/api/research/versions/:id/decision',
    parse(
      z
        .object({ decision: z.enum(['approve', 'reject']), comment: z.string().min(5).max(2000) })
        .strict(),
    ),
    async (req, res) =>
      res.json(
        await research.decide(req.user, req.params.id, req.input.decision, req.input.comment),
      ),
  );
  app.post('/api/research/versions/:id/campaign', parse(servicePlanInput), async (req, res) =>
    res.status(201).json(await createServicePlan(platform, req.user, req.params.id, req.input)),
  );
  app.post(
    '/api/research/versions/:id/product-campaign',
    parse(z.object({}).strict()),
    async (req, res) => {
      const source = await research.approved(req.user, req.params.id);
      assert(
        source.project.kind === 'physical-product' && source.project.productId,
        422,
        'PRODUCT_LINK_REQUIRED',
        'Link this physical-product research to a product before creating a campaign.',
      );
      assert(
        source.version.report.recommendation.country === 'BD',
        422,
        'PRODUCT_MARKET',
        'The physical-product sales engine currently supports Bangladesh. Select and approve Bangladesh to continue.',
      );
      res
        .status(201)
        .json(await platform.createPlan(req.user, source.project.productId, {}, null, source));
    },
  );
  app.put('/api/business', parse(businessSchema), async (req, res) =>
    res.json(await platform.updateBusiness(req.user, req.input)),
  );
  app.post('/api/products', parse(productSchema), async (req, res) =>
    res.status(201).json(await platform.createProduct(req.user, req.input)),
  );
  app.put('/api/products/:id', parse(productSchema), async (req, res) =>
    res.json(await platform.updateProduct(req.user, req.params.id, req.input)),
  );
  app.post('/api/products/:id/evidence', parse(evidenceSchema), async (req, res) =>
    res.status(201).json(await platform.addEvidence(req.user, req.params.id, req.input)),
  );
  app.get('/api/products/:id/evidence', async (req, res) => {
    await platform.owned('products', req.params.id, req.user);
    res.json(
      await store.list('market_research_reports', {
        businessId: req.user.businessId,
        productId: req.params.id,
        type: 'evidence',
      }),
    );
  });
  app.post(
    '/api/products/:id/competitors',
    parse(
      z
        .object({
          name: z.string().min(1).max(200),
          product: z.string().min(1).max(500),
          price: z.number().finite().nonnegative(),
          offer: z.string().max(1000),
          positioning: z.string().max(1000),
          strengths: z.string().max(1000),
          weaknesses: z.string().max(1000),
          source: z
            .string()
            .url()
            .refine((url) => url.startsWith('https://')),
          observedAt: z.string().datetime(),
        })
        .strict(),
    ),
    async (req, res) => {
      await platform.owned('products', req.params.id, req.user);
      const row = await store.transaction(async () => {
        const saved = await store.insert('competitors', {
          ...req.input,
          businessId: req.user.businessId,
          productId: req.params.id,
          confidence: 'Medium',
          quality: 'Verified data',
          classification: 'observed',
          verifiedBy: req.user.id,
        });
        await platform.audit(req.user, 'competitor.recorded', saved.id);
        return saved;
      });
      res.status(201).json(row);
    },
  );
  app.post('/api/products/:id/plans', parse(z.object({}).strict()), async (req, res) =>
    res.status(201).json(await platform.createPlan(req.user, req.params.id)),
  );
  app.get('/api/plans/:id', async (req, res) =>
    res.json(await platform.owned('campaign_plans', req.params.id, req.user)),
  );
  app.post('/api/plans/:id/revisions', parse(planEditSchema), async (req, res) =>
    res.status(201).json(await platform.revisePlan(req.user, req.params.id, req.input)),
  );
  app.post('/api/plans/:id/preflight', parse(z.object({}).strict()), async (req, res) =>
    res.json(
      await exclusive(`launch-check:${req.user.businessId}:${req.params.id}`, () =>
        platform.checkLaunch(req.user, req.params.id),
      ),
    ),
  );
  app.post('/api/plans/:id/submit', parse(z.object({}).strict()), async (req, res) =>
    res.status(201).json(await platform.submitPlan(req.user, req.params.id)),
  );
  app.post(
    '/api/approvals/:id/decision',
    parse(z.object({ decision: z.enum(['approve', 'reject']), comment }).strict()),
    async (req, res) =>
      res.json(
        await platform.decide(req.user, req.params.id, req.input.decision, req.input.comment),
      ),
  );
  app.post('/api/approvals/:id/execute', parse(z.object({}).strict()), async (req, res) => {
    platform.requireApprover(req.user);
    const approval = await platform.owned('approval_requests', req.params.id, req.user);
    res.json(await executeViaMcp(approval, config));
  });
  app.post('/api/campaigns/:id/actions', parse(campaignActionSchema), async (req, res) =>
    res
      .status(201)
      .json(
        await platform.proposeAction(
          req.user,
          req.params.id,
          req.input.action,
          req.input.payload,
          req.input.reason,
        ),
      ),
  );
  app.post('/api/campaigns/:id/sync', parse(z.object({}).strict()), async (req, res) => {
    await platform.owned('campaigns', req.params.id, req.user);
    if (!jobs)
      return res.json({
        status: 'completed',
        rows: await platform.syncInsights(req.user, req.params.id),
      });
    const record = await store.insert('jobs', {
      businessId: req.user.businessId,
      type: 'insights-sync',
      campaignId: req.params.id,
      status: 'queued',
    });
    try {
      await jobs.queue.add(
        'insights-sync',
        { campaignId: req.params.id, businessId: req.user.businessId, jobRecordId: record.id },
        { jobId: record.id },
      );
    } catch (error) {
      await store.update('jobs', record.id, { status: 'failed', errorCode: 'QUEUE_UNAVAILABLE' });
      throw error;
    }
    res.status(202).json(record);
  });
  app.post('/api/campaigns/:id/analyze', parse(z.object({}).strict()), async (req, res) =>
    res.json(await platform.analyze(req.user, req.params.id)),
  );
  app.post(
    '/api/optimizations/:id/request-approval',
    parse(z.object({}).strict()),
    async (req, res) => {
      const opt = await platform.owned('optimization_recommendations', req.params.id, req.user);
      assert(
        opt.status === 'proposed',
        409,
        'OPTIMIZATION_STATE',
        'Recommendation already submitted',
      );
      res
        .status(201)
        .json(
          await platform.proposeAction(
            req.user,
            opt.campaignId,
            opt.action,
            opt.payload,
            opt.reason,
            opt.id,
          ),
        );
    },
  );
  app.post(
    '/api/integrations/meta',
    parse(
      z
        .object({
          accessToken: z
            .string()
            .trim()
            .min(20, 'Paste a Meta API access token, not your login password.')
            .max(4000)
            .or(z.literal(''))
            .optional(),
          adAccountId: z
            .string()
            .trim()
            .regex(
              /^(act_)?\d+$/,
              'Use the numeric ad account ID from Ads Manager, not an email address.',
            ),
          pageId: z
            .string()
            .trim()
            .regex(/^\d+$/, 'Use the Facebook Page numeric ID, not the Developer App ID.'),
          pixelId: z
            .string()
            .trim()
            .regex(/^\d+$/, 'Use the numeric pixel or dataset ID from Events Manager.'),
          appSecret: z.string().min(16).max(300).optional().or(z.literal('')),
        })
        .strict(),
    ),
    async (req, res) => res.json(await platform.configureMeta(req.user, req.input)),
  );
  app.get('/api/integrations/meta/targeting', async (req, res) => {
    assert(req.user.role === 'admin', 403, 'ROLE_REQUIRED', 'Administrator required');
    const query = z.string().min(1).max(100).parse(req.query.q);
    const type = z.enum(['city', 'region']).parse(req.query.type || 'city');
    res.json(
      await platform.meta.targetingSearch(
        query,
        type,
        await platform.integration(req.user.businessId),
      ),
    );
  });
  app.post(
    '/api/integrations/meta/locations',
    parse(
      z
        .object({
          name: z.enum([
            'Dhaka',
            'Chattogram',
            'Sylhet',
            'Rajshahi',
            'Khulna',
            'Barishal',
            'Rangpur',
            'Mymensingh',
          ]),
          key: z.string().min(1).max(50),
          type: z.enum(['city', 'region']),
        })
        .strict(),
    ),
    async (req, res) => {
      assert(req.user.role === 'admin', 403, 'ROLE_REQUIRED', 'Administrator required');
      const integration = await platform.integration(req.user.businessId);
      assert(integration, 409, 'INTEGRATION_REQUIRED', 'Configure Meta first');
      const matches = await platform.meta.targetingSearch(
        req.input.name,
        req.input.type,
        integration,
      );
      const match = matches.find((r) => String(r.key) === req.input.key && r.country_code === 'BD');
      assert(
        match,
        422,
        'LOCATION_INVALID',
        'Key must match a Bangladesh location returned by Meta',
      );
      const result = await store.transaction(async () => {
        const latest = await platform.integration(req.user.businessId);
        const saved = await store.update('integrations', latest.id, {
          locationMap: {
            ...latest.locationMap,
            [req.input.name]: {
              key: String(match.key),
              type: req.input.type,
              country_code: 'BD',
              verifiedAt: now(),
            },
          },
        });
        await platform.audit(req.user, 'integration.location_verified', saved.id, req.input);
        return saved;
      });
      res.json(platform.publicIntegration(result));
    },
  );
  app.get('/api/users', async (req, res) => {
    assert(req.user.role === 'admin', 403, 'ROLE_REQUIRED', 'Administrator required');
    const users = await store.list('users', { businessId: req.user.businessId });
    for (const membership of await store.list('workspace_memberships', {
      businessId: req.user.businessId,
    }))
      if (!users.some((user) => user.id === membership.userId)) {
        const user = await store.get('users', membership.userId);
        if (user) users.push({ ...user, businessId: membership.businessId, role: membership.role });
      }
    res.json(users.map(publicUser));
  });
  app.post(
    '/api/users',
    parse(
      credentials.extend({
        name: z.string().min(2).max(100),
        role: z.enum(['analyst', 'approver']),
      }),
    ),
    async (req, res) => {
      assert(req.user.role === 'admin', 403, 'ROLE_REQUIRED', 'Administrator required');
      const digest = await passwordHash(req.input.password);
      const result = await store.transaction(async () => {
        assert(
          !(await store.find('users', { email: req.input.email })),
          409,
          'EMAIL_EXISTS',
          'Email already exists',
        );
        const user = await store.insert('users', {
          name: req.input.name,
          email: req.input.email,
          passwordHash: digest,
          role: req.input.role,
          businessId: req.user.businessId,
        });
        await platform.audit(req.user, 'user.created', user.id, { role: user.role });
        return user;
      });
      res.status(201).json(publicUser(result));
    },
  );
  app.use('/api', (req, res) =>
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } }),
  );
  const dist = path.resolve('dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof multer.MulterError
        ? error.code === 'LIMIT_FILE_SIZE'
          ? 413
          : 422
        : error.status || (error instanceof z.ZodError ? 422 : error.code === 11000 ? 409 : 500);
    res.status(status).json({
      error: {
        code: error.code === 11000 ? 'DUPLICATE' : error.code || 'INTERNAL_ERROR',
        message: status >= 500 && !error.status ? 'An internal error occurred' : error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    });
    if (status >= 500)
      process.stderr.write(`[${req.method} ${req.path}] ${error.code || error.name}\n`);
  });
  return app;
}
