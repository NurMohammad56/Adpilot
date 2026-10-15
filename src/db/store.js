import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { AsyncLocalStorage } from 'node:async_hooks';
import { id, now, AppError } from '../utils/core.js';

export const collections = [
  'ai_usage',
  'operational_snapshots',
  'schema_migrations',
  'users',
  'sessions',
  'businesses',
  'products',
  'service_profiles',
  'product_costs',
  'market_research_reports',
  'competitors',
  'audience_recommendations',
  'pricing_recommendations',
  'budget_recommendations',
  'campaign_strategies',
  'campaign_plans',
  'campaigns',
  'ad_sets',
  'ads',
  'creatives',
  'ad_performance',
  'optimization_recommendations',
  'approval_requests',
  'approval_actions',
  'ai_decisions',
  'integrations',
  'jobs',
  'audit_logs',
  'workspace_memberships',
  'media_assets',
  'research_projects',
  'research_versions',
  'offers',
  'targeting_locations',
  'business_outcomes',
  'account_snapshots',
  'campaign_launch_checks',
  'manual_campaigns',
  'visual_analyses',
  'catalog_feeds',
  'ad_library_observations',
  'report_translations',
  'product_discoveries',
  'research_cache',
  'ad_library_history',
];
const stamp = (value) => ({
  ...value,
  id: value.id || id(),
  createdAt: value.createdAt || now(),
  updatedAt: now(),
});
const match = (row, filter) => Object.entries(filter).every(([key, value]) => row[key] === value);

// Copy-on-write transactions for the ONE-process development store. Production uses Mongo transactions.
export class DemoStore {
  constructor(file) {
    this.file = file;
    this.data = Object.fromEntries(collections.map((c) => [c, []]));
    this.context = new AsyncLocalStorage();
    this.tail = Promise.resolve();
  }
  async connect() {
    if (this.file) {
      try {
        this.data = { ...this.data, ...JSON.parse(await fs.readFile(this.file, 'utf8')) };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  rows(collection) {
    if (!collections.includes(collection)) throw new Error('Invalid collection');
    return (this.context.getStore() || this.data)[collection];
  }
  async list(collection, filter = {}) {
    return structuredClone(this.rows(collection).filter((row) => match(row, filter)));
  }
  async get(collection, recordId) {
    return structuredClone(this.rows(collection).find((row) => row.id === recordId) || null);
  }
  async ping() {
    return true;
  }
  async page(
    collection,
    filter = {},
    { limit = 25, cursor = '', sort = 'createdAt', from, to } = {},
  ) {
    const rows = (await this.list(collection, filter))
      .filter((row) => !row.deletedAt && (!from || row[sort] >= from) && (!to || row[sort] <= to))
      .sort((a, b) => (b[sort] || '').localeCompare(a[sort] || '') || b.id.localeCompare(a.id));
    if (cursor && !rows.some((row) => row.id === cursor))
      throw new AppError(422, 'PAGE_CURSOR', 'The page changed. Return to the first page.');
    const start = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0,
      items = rows.slice(start, start + limit);
    return {
      items,
      total: rows.length,
      nextCursor: start + limit < rows.length ? items.at(-1)?.id : null,
    };
  }
  async count(collection, filter = {}) {
    return (await this.list(collection, filter)).length;
  }
  async monthlyUsage(businessId, month) {
    return (await this.list('ai_usage', { businessId })).filter((row) =>
      row.day?.startsWith(month),
    );
  }
  async performanceTotals(filter) {
    const rows = await this.list('ad_performance', filter);
    const totals = rows.reduce(
      (result, row) => {
        for (const key of ['spend', 'impressions', 'clicks', 'conversions', 'revenue'])
          result[key] += Number(row[key]) || 0;
        return result;
      },
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, revenue: 0 },
    );
    if (!rows.length || rows.some((row) => row.revenue == null)) totals.revenue = null;
    return totals;
  }
  async find(collection, filter) {
    return (await this.list(collection, filter))[0] || null;
  }
  async insert(collection, value) {
    if (!this.context.getStore()) return this.transaction(() => this.insert(collection, value));
    const row = stamp(value);
    if (
      this.rows(collection).some(
        (r) =>
          r.id === row.id ||
          (collection === 'users' && r.email === row.email) ||
          (collection === 'campaigns' && r.approvalId === row.approvalId) ||
          (collection === 'manual_campaigns' &&
            r.businessId === row.businessId &&
            (r.planId === row.planId || r.metaCampaignId === row.metaCampaignId)) ||
          (collection === 'ad_library_observations' &&
            r.businessId === row.businessId &&
            r.libraryAdId === row.libraryAdId &&
            r.country === row.country) ||
          (collection === 'product_discoveries' &&
            typeof row.jobId === 'string' &&
            r.businessId === row.businessId &&
            r.jobId === row.jobId) ||
          (collection === 'research_cache' &&
            r.businessId === row.businessId &&
            r.requestHash === row.requestHash) ||
          (collection === 'ad_library_history' &&
            r.businessId === row.businessId &&
            r.observationId === row.observationId &&
            r.revision === row.revision),
      )
    )
      throw new AppError(409, 'DUPLICATE', 'Record already exists');
    this.rows(collection).push(row);
    return structuredClone(row);
  }
  async update(collection, recordId, changes) {
    if (!this.context.getStore())
      return this.transaction(() => this.update(collection, recordId, changes));
    const row = this.rows(collection).find((r) => r.id === recordId);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Record not found');
    Object.assign(row, structuredClone(changes), { id: recordId, updatedAt: now() });
    return structuredClone(row);
  }
  async remove(collection, recordId) {
    if (!this.context.getStore()) return this.transaction(() => this.remove(collection, recordId));
    const rows = this.rows(collection);
    const index = rows.findIndex((r) => r.id === recordId);
    if (index >= 0) rows.splice(index, 1);
  }
  async transaction(callback) {
    if (this.context.getStore()) return callback();
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const candidate = structuredClone(this.data);
      const result = await this.context.run(candidate, callback);
      if (this.file) {
        await fs.mkdir(path.dirname(this.file), { recursive: true });
        await fs.writeFile(`${this.file}.tmp`, JSON.stringify(candidate), { mode: 0o600 });
        await fs.rename(`${this.file}.tmp`, this.file);
      }
      this.data = candidate;
      return result;
    } finally {
      release();
    }
  }
  async close() {}
}

export class MongoStore {
  constructor(uri) {
    this.uri = uri;
    this.context = new AsyncLocalStorage();
    this.models = {};
  }
  async connect() {
    await mongoose.connect(this.uri);
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid')
      throw new Error(
        'MongoDB replica set is required; standalone Mongo cannot protect approval/budget transactions',
      );
    for (const collection of collections) {
      const schema = new mongoose.Schema(
        {
          _id: String,
          id: { type: String, required: true },
          businessId: { type: String, index: true },
          createdAt: String,
          updatedAt: String,
        },
        { strict: false, minimize: false, versionKey: false, collection },
      );
      schema.index({ id: 1 }, { unique: true });
      schema.index({ businessId: 1, createdAt: -1, id: -1 });
      if (collection === 'ai_usage') schema.index({ businessId: 1, day: 1 });
      if (collection === 'jobs') schema.index({ businessId: 1, updatedAt: -1, id: -1 });
      if (collection === 'ad_performance') schema.index({ businessId: 1, level: 1, date: 1 });
      if (collection === 'users') schema.index({ email: 1 }, { unique: true });
      if (collection === 'workspace_memberships')
        schema.index({ userId: 1, businessId: 1 }, { unique: true });
      if (collection === 'research_versions')
        schema.index({ projectId: 1, number: 1 }, { unique: true });
      if (collection === 'research_projects')
        schema.index(
          { businessId: 1, serviceProfileId: 1, serviceCountry: 1 },
          { unique: true, partialFilterExpression: { serviceCountry: { $type: 'string' } } },
        );
      if (collection === 'business_outcomes')
        schema.index({ businessId: 1, campaignId: 1, reference: 1 }, { unique: true });
      if (collection === 'targeting_locations')
        schema.index(
          { businessId: 1, accountId: 1, key: 1, country: 1, type: 1 },
          { unique: true },
        );
      if (collection === 'campaigns') schema.index({ approvalId: 1 }, { unique: true });
      if (collection === 'manual_campaigns') {
        schema.index({ businessId: 1, planId: 1 }, { unique: true });
        schema.index({ businessId: 1, metaCampaignId: 1 }, { unique: true });
      }
      if (collection === 'ad_performance')
        schema.index({ campaignId: 1, level: 1, entityId: 1, date: 1 }, { unique: true });
      if (collection === 'ad_library_observations')
        schema.index({ businessId: 1, libraryAdId: 1, country: 1 }, { unique: true });
      if (collection === 'product_discoveries')
        schema.index(
          { businessId: 1, jobId: 1 },
          { unique: true, partialFilterExpression: { jobId: { $type: 'string' } } },
        );
      if (collection === 'research_cache')
        schema.index({ businessId: 1, requestHash: 1 }, { unique: true });
      if (collection === 'ad_library_history')
        schema.index({ businessId: 1, observationId: 1, revision: 1 }, { unique: true });
      if (['sessions', 'research_cache'].includes(collection)) {
        schema.add({ expiresAtDate: Date });
        schema.index({ expiresAtDate: 1 }, { expireAfterSeconds: 0 });
      }
      this.models[collection] = mongoose.model(collection, schema);
      await this.models[collection].init();
    }
  }
  query(q) {
    const session = this.context.getStore();
    return session ? q.session(session) : q;
  }
  clean(row) {
    if (!row) return null;
    const { _id, ...rest } = row.toObject ? row.toObject() : row;
    return rest;
  }
  async list(collection, filter = {}) {
    return (await this.query(this.models[collection].find(filter).lean())).map((row) =>
      this.clean(row),
    );
  }
  async ping() {
    await mongoose.connection.db.command({ ping: 1 }, { maxTimeMS: 2000 });
    return true;
  }
  async page(
    collection,
    filter = {},
    { limit = 25, cursor = '', sort = 'createdAt', from, to } = {},
  ) {
    const base = { ...filter, deletedAt: { $exists: false } };
    if (from || to) base[sort] = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    let query = { ...base };
    if (cursor) {
      const anchor = await this.find(collection, { ...base, id: cursor });
      if (anchor)
        query.$or = [
          { [sort]: { $lt: anchor[sort] } },
          { [sort]: anchor[sort], id: { $lt: anchor.id } },
        ];
      else throw new AppError(422, 'PAGE_CURSOR', 'The page changed. Return to the first page.');
    }
    const rows = (
      await this.query(
        this.models[collection]
          .find(query)
          .sort({ [sort]: -1, id: -1 })
          .limit(limit + 1)
          .lean(),
      )
    ).map((r) => this.clean(r));
    return {
      items: rows.slice(0, limit),
      nextCursor: rows.length > limit ? rows[limit - 1].id : null,
      total: await this.query(this.models[collection].countDocuments(base)),
    };
  }
  async count(collection, filter = {}) {
    return this.query(this.models[collection].countDocuments(filter));
  }
  async monthlyUsage(businessId, month) {
    return this.list('ai_usage', { businessId, day: { $gte: `${month}-00`, $lte: `${month}-99` } });
  }
  async performanceTotals(filter) {
    const rows = await this.query(
      this.models.ad_performance.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            missingRevenue: {
              $sum: { $cond: [{ $eq: [{ $ifNull: ['$revenue', null] }, null] }, 1, 0] },
            },
            ...Object.fromEntries(
              ['spend', 'impressions', 'clicks', 'conversions', 'revenue'].map((key) => [
                key,
                { $sum: { $ifNull: [`$${key}`, 0] } },
              ]),
            ),
          },
        },
      ]),
    );
    return Object.fromEntries(
      ['spend', 'impressions', 'clicks', 'conversions', 'revenue'].map((key) => [
        key,
        key === 'revenue' && (!rows.length || rows[0].missingRevenue > 0)
          ? null
          : rows[0]?.[key] || 0,
      ]),
    );
  }
  async get(collection, recordId) {
    return this.clean(await this.query(this.models[collection].findOne({ id: recordId }).lean()));
  }
  async find(collection, filter) {
    return this.clean(await this.query(this.models[collection].findOne(filter).lean()));
  }
  async insert(collection, value) {
    const row = stamp(value);
    const [doc] = await this.models[collection].create([{ ...row, _id: row.id }], {
      session: this.context.getStore(),
    });
    return this.clean(doc);
  }
  async update(collection, recordId, changes) {
    const { id: ignored, _id, ...safe } = changes;
    const row = await this.query(
      this.models[collection]
        .findOneAndUpdate(
          { id: recordId },
          { $set: { ...safe, updatedAt: now() } },
          { returnDocument: 'after' },
        )
        .lean(),
    );
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Record not found');
    return this.clean(row);
  }
  async remove(collection, recordId) {
    await this.query(this.models[collection].deleteOne({ id: recordId }));
  }
  async transaction(callback) {
    if (this.context.getStore()) return callback();
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(() => this.context.run(session, callback), {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } finally {
      await session.endSession();
    }
  }
  async close() {
    await mongoose.disconnect();
  }
}
export async function createStore(config) {
  const store =
    config.mode === 'demo' ? new DemoStore(config.dataFile) : new MongoStore(config.mongoUri);
  await store.connect();
  return store;
}
