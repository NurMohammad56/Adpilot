import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { assert, hash, id, now, publicUser } from '../../utils/core.js';
const scrypt = promisify(crypto.scrypt);
export async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password, salt, 64)).toString('hex')}`;
}
export async function passwordMatches(password, stored) {
  const [salt, digest] = stored.split(':');
  const actual = await scrypt(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
export class AuthService {
  constructor(store) {
    this.store = store;
  }
  async register({ name, email, password, businessName }) {
    const digest = await passwordHash(password);
    return this.store.transaction(async () => {
      assert(
        !(await this.store.find('users', { email })),
        409,
        'EMAIL_EXISTS',
        'An account with this email already exists',
      );
      const business = await this.store.insert('businesses', {
        name: businessName,
        location: 'Dhaka',
        dailyBudgetCeiling: 2000,
        totalBudgetCeiling: 14000,
        deliveryRegions: ['Dhaka'],
        budgetVersion: 0,
      });
      const user = await this.store.insert('users', {
        name,
        email,
        passwordHash: digest,
        role: 'admin',
        businessId: business.id,
      });
      await this.store.insert('workspace_memberships', {
        userId: user.id,
        businessId: business.id,
        role: 'admin',
      });
      await this.store.insert('audit_logs', {
        businessId: business.id,
        actorId: user.id,
        action: 'account.registered',
        entityId: user.id,
        detail: 'Initial business administrator created',
      });
      return user;
    });
  }
  async login(email, password) {
    const user = await this.store.find('users', { email });
    // Run the same KDF for unknown accounts to reduce email enumeration by timing.
    const digest = user?.passwordHash || `00000000000000000000000000000000:${'00'.repeat(64)}`;
    const valid = await passwordMatches(password, digest);
    assert(user && valid, 401, 'INVALID_LOGIN', 'Email or password is incorrect');
    return user;
  }
  async session(user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 12 * 3600000).toISOString();
    await this.store.insert('sessions', {
      tokenHash: hash(token),
      userId: user.id,
      businessId: user.businessId,
      expiresAt,
      expiresAtDate: new Date(expiresAt),
    });
    return { token, user: publicUser(user) };
  }
  async resolve(token) {
    if (!token) return null;
    const session = await this.store.find('sessions', { tokenHash: hash(token) });
    if (!session || Date.parse(session.expiresAt) <= Date.now()) return null;
    const user = await this.store.get('users', session.userId);
    if (!user) return null;
    if (session.businessId === user.businessId) return user;
    const membership = await this.store.find('workspace_memberships', {
      userId: user.id,
      businessId: session.businessId,
    });
    return membership
      ? { ...user, businessId: membership.businessId, role: membership.role }
      : null;
  }
  async workspaces(user) {
    const original = await this.store.get('users', user.id);
    const memberships = await this.store.list('workspace_memberships', { userId: user.id });
    const mapping = new Map(memberships.map((item) => [item.businessId, item.role]));
    mapping.set(original.businessId, original.role);
    const result = [];
    for (const [businessId, role] of mapping) {
      const business = await this.store.get('businesses', businessId);
      if (business)
        result.push({
          id: businessId,
          name: business.name,
          role,
          active: businessId === user.businessId,
        });
    }
    return result;
  }
  async createWorkspace(user, name) {
    return this.store.transaction(async () => {
      const business = await this.store.insert('businesses', {
        name,
        location: 'Dhaka',
        dailyBudgetCeiling: 2000,
        totalBudgetCeiling: 14000,
        deliveryRegions: ['Dhaka'],
        budgetVersion: 0,
      });
      await this.store.insert('workspace_memberships', {
        userId: user.id,
        businessId: business.id,
        role: 'admin',
      });
      await this.store.insert('audit_logs', {
        businessId: business.id,
        actorId: user.id,
        action: 'workspace.created',
        entityId: business.id,
      });
      return business;
    });
  }
  async switchWorkspace(token, businessId) {
    const user = await this.resolve(token);
    assert(user, 401, 'AUTH_REQUIRED', 'Please sign in');
    assert(
      (await this.workspaces(user)).some((item) => item.id === businessId),
      403,
      'WORKSPACE_ACCESS',
      'You do not have access to this workspace',
    );
    const session = await this.store.find('sessions', { tokenHash: hash(token) });
    await this.store.transaction(async () => {
      await this.store.update('sessions', session.id, { businessId });
      await this.store.insert('audit_logs', {
        businessId,
        actorId: user.id,
        action: 'workspace.selected',
        entityId: businessId,
      });
    });
    return this.resolve(token);
  }
  async logout(token) {
    const session = await this.store.find('sessions', { tokenHash: hash(token || '') });
    if (session) await this.store.remove('sessions', session.id);
  }
}
