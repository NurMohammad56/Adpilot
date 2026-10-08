import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import '@fontsource/noto-sans-bengali/bengali-400.css';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileText,
  FlaskConical,
  Globe2,
  Image,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MoreHorizontal,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import './styles.css';
import { ActionForm, ActionSummary } from './ActionForm.jsx';
import { Accounts, MediaLibrary, MediaPicker, ResearchDesk } from './WorkspaceTools.jsx';
import { api, selectApiWorkspace } from './api.js';
import { LanguageSwitch, useLanguage, getLanguage, translateText } from './i18n.js';
import { useDraft } from './use-draft.js';
import './usability.css';
import { GuidedProduct } from './GuidedProduct.jsx';
import { WorkflowGuide } from './WorkflowGuide.jsx';

let displayCurrency = 'BDT';
const taka = (value, compact = false) =>
  value == null
    ? '—'
    : new Intl.NumberFormat(getLanguage() === 'bn' ? 'bn-BD' : 'en-BD', {
        style: 'currency',
        currency: displayCurrency,
        maximumFractionDigits: compact ? 0 : 2,
        notation: compact ? 'compact' : 'standard',
      }).format(value);
const num = (value) =>
  value == null ? '—' : new Intl.NumberFormat(getLanguage() === 'bn' ? 'bn-BD' : 'en-BD', { maximumFractionDigits: 2 }).format(value);
const date = (value) =>
  new Date(value).toLocaleString(getLanguage() === 'bn' ? 'bn-BD' : 'en-GB', {
    timeZone: 'Asia/Dhaka',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
const navItems = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Products', icon: Package },
  { label: 'Research studio', icon: Sparkles },
  { label: 'Media library', icon: Image },
  { label: 'Accounts', icon: Settings2 },
  { label: 'Campaign plans', icon: FileText },
  { label: 'Approvals', icon: ClipboardCheck },
  { label: 'Performance', icon: BarChart3 },
  { label: 'Optimization', icon: Sparkles },
  { label: 'Audit log', icon: Clock3 },
];
function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
function Status({ value }) {
  const tone = ['active', 'approved', 'executed', 'completed'].includes(value)
    ? 'green'
    : ['pending', 'pending_approval', 'proposed', 'draft', 'queued'].includes(value)
      ? 'amber'
      : ['failed', 'rejected', 'needs_reconciliation'].includes(value)
        ? 'red'
        : 'neutral';
  return (
    <Badge tone={tone}>
      <i />
      {value?.replaceAll('_', ' ')}
    </Badge>
  );
}
function Empty({ icon: Icon = FileText, title, text, action }) {
  return (
    <div className="empty">
      <Icon size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Modal({ title, subtitle, onClose, children, wide = false }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current.querySelector('button')?.focus();
    const listener = (event) => {
      if (event.key === 'Escape') close.current();
      if (event.key === 'Tab') {
        const controls = [
          ...dialog.current.querySelectorAll(
            'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),a[href]',
          ),
        ].filter((el) => el.offsetParent !== null);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal ${wide ? 'wide' : ''}`}
      >
        <div className="modal-heading">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button aria-label="Close dialog" className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Login({ onLogin, run, busy, mode }) {
  const [register, setRegister] = useState(false);
  return (
    <div className="login-page">
      <div className="login-story">
        <div className="brand">
          <span className="brand-mark">
            <Zap size={21} fill="currentColor" />
          </span>
          adpilot<span className="brand-dot">.</span>
        </div>
        <div>
          <Badge tone="green">BUILT FOR BANGLADESH</Badge>
          <h1>
            Your next campaign.
            <br />
            <em>A better decision.</em>
          </h1>
          <p>
            Know your margins. Test with a plan.
            <br />
            Keep every advertising decision in your hands.
          </p>
          <div className="login-proof">
            <ShieldCheck size={20} /> AI recommends. You approve.
          </div>
        </div>
        <span className="login-footer">
          Facebook & Instagram · Research, review and approved campaigns
        </span>
      </div>
      <div className="login-form">
        <div className="login-card">
          <span className="eyebrow">WELCOME TO YOUR WORKSPACE</span>
          <h2>{register ? 'Build your business workspace' : 'Let’s get to work'}</h2>
          <p>
            {register
              ? 'Start with your business. Add products and costs next.'
              : 'Sign in to review, plan, and grow with confidence.'}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const values = Object.fromEntries(new FormData(event.currentTarget));
              run(async () =>
                onLogin(await api(`/auth/${register ? 'register' : 'login'}`, 'POST', values)),
              );
            }}
          >
            {register && (
              <>
                <Field label="Your name">
                  <input name="name" required minLength={2} />
                </Field>
                <Field label="Business name">
                  <input name="businessName" required minLength={2} />
                </Field>
              </>
            )}
            <Field label="Email address">
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                placeholder="you@business.com"
              />
            </Field>
            <Field label="Password" hint="Use at least 12 characters.">
              <input
                type="password"
                name="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={12}
                maxLength={128}
                required
              />
            </Field>
            <button className="button primary full" disabled={busy}>
              {register ? 'Create workspace' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <button className="text-button" onClick={() => setRegister(!register)}>
            {register ? 'Already have an account? Sign in' : 'New here? Create a workspace'}
          </button>
          {mode === 'demo' && (
            <div className="demo-entry">
              <span>Take a look around first</span>
              <button
                className="button secondary full"
                disabled={busy}
                onClick={() => run(async () => onLogin(await api('/auth/demo', 'POST', {})))}
              >
                <FlaskConical size={17} />
                Explore demo workspace
              </button>
              <small>Sample business, simulated results, zero real ad spend.</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Overview({ data, setPage, showPlan, showProduct }) {
  const m = data.metrics;
  const pending = data.approvals.filter((a) => a.status === 'pending');
  const active = data.campaigns.filter((c) => c.status === 'active');
  const series = Object.values(
    data.performance
      .filter((r) => r.level === 'campaign')
      .reduce((byDate, r) => {
        byDate[r.date] ||= { date: r.date, spend: 0, revenue: 0 };
        byDate[r.date].spend += r.spend;
        byDate[r.date].revenue += r.revenue || 0;
        return byDate;
      }, {}),
  ).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="breadcrumb">
            Workspace <ChevronRight size={13} /> Overview
          </div>
          <h1>
            Your campaigns, in focus<span>.</span>
          </h1>
          <p>A clear view of your business. A thoughtful next move.</p>
        </div>
        <button className="button primary" onClick={() => showProduct(null)}>
          <Plus size={17} />
          Add product
        </button>
      </div>
      <div className="market-strip">
        <span>
          <span className="flag">🇧🇩</span>
          <strong>Bangladesh market</strong>
          <span className="divider" />
          Facebook & Instagram
        </span>
        <Badge tone="green">
          <ShieldCheck size={12} />
          Approval-first mode
        </Badge>
      </div>
      <div className="stats-grid">
        {[
          {
            title: 'Ad spend',
            value: taka(m.spend),
            icon: Wallet,
            note: `${active.length} active campaign${active.length === 1 ? '' : 's'}`,
          },
          {
            title: 'Attributed revenue',
            value: taka(m.revenue),
            icon: TrendingUp,
            note:
              data.mode === 'demo'
                ? 'Simulated purchase values'
                : 'Meta-reported, not delivered revenue',
          },
          {
            title: 'Purchases',
            value: num(m.conversions),
            icon: Package,
            note: 'Validate against confirmed orders',
          },
          {
            title: 'Return on ad spend',
            value: m.roas == null ? '—' : `${num(m.roas)}×`,
            icon: Target,
            note: 'Purchase value ÷ ad spend',
          },
        ].map(({ title, value, icon: Icon, note }) => (
          <article className="stat-card" key={title}>
            <div>
              <span>{title}</span>
              <Icon size={17} />
            </div>
            <strong>{value}</strong>
            <small>{note}</small>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <article className="panel performance-panel">
          <div className="panel-heading">
            <div>
              <h2>Performance at a glance</h2>
              <p>Your campaign spend and attributed purchase value</p>
            </div>
            <Badge>Available history</Badge>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-revenue" />
              Revenue
            </span>
            <span>
              <i className="legend-spend" />
              Ad spend
            </span>
            {data.mode === 'demo' && <Badge tone="amber">Simulated data</Badge>}
          </div>
          <PerformanceChart series={series} />
        </article>
        <article className="panel approval-summary">
          <div className="panel-heading">
            <h2>Needs your approval</h2>
            <span className="count-chip">{pending.length}</span>
          </div>
          <div className="approval-illustration">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <ClipboardCheck size={38} />
            <span>
              <Sparkles size={15} />
            </span>
          </div>
          <h3>
            {pending.length
              ? `${pending.length} decision${pending.length === 1 ? '' : 's'}, in your hands`
              : 'You’re all caught up'}
          </h3>
          <p>
            {pending.length
              ? 'Review the reasoning, economics, and risks before anything goes live.'
              : 'New campaigns and sensitive changes will appear here for your review.'}
          </p>
          {pending.slice(0, 1).map((a) => (
            <button className="approval-preview" onClick={() => showPlan(a.snapshot, a)} key={a.id}>
              <span className="mini-icon">
                <Megaphone size={17} />
              </span>
              <span>
                <strong>{a.snapshot.name.split(' · ')[0]}</strong>
                <small>
                  {a.action.replaceAll('_', ' ')} ·{' '}
                  {taka(a.snapshot.budgetRecommendation.dailyBudget)}/day
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
          <button className="text-button" onClick={() => setPage('Approvals')}>
            View approval queue <ArrowRight size={15} />
          </button>
        </article>
      </div>
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Campaign workspace</h2>
            <p>From a considered plan to a controlled test</p>
          </div>
          <button className="text-button" onClick={() => setPage('Campaign plans')}>
            View all plans
            <ArrowRight size={15} />
          </button>
        </div>
        {data.plans.filter((p) => p.status !== 'superseded').length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Campaign / product</th>
                  <th>Status</th>
                  <th>Daily budget</th>
                  <th>Target CPA</th>
                  <th>Confidence</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.plans
                  .filter((p) => p.status !== 'superseded')
                  .slice(0, 4)
                  .map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        <button className="row-title" onClick={() => showPlan(plan)}>
                          <span className="product-icon">
                            <Package size={20} />
                          </span>
                          <span>
                            <strong>{plan.name.split(' · ')[0]}</strong>
                            <small>Sales · Bangladesh · v{plan.version}</small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <Status value={plan.status} />
                      </td>
                      <td>{taka(plan.budgetRecommendation.dailyBudget)}</td>
                      <td>{taka(plan.pricingRecommendation.targetCPA)}</td>
                      <td>
                        <span className="confidence">
                          <i />
                          {plan.confidence}
                        </span>
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          aria-label={`Review ${plan.name}`}
                          onClick={() => showPlan(plan)}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Your first campaign starts with a product"
            text="Add the actual costs, then generate a campaign plan."
          />
        )}
      </article>
      <div className="principle">
        <ShieldCheck size={18} />
        <span>
          <strong>You’re always in control.</strong> Every launch and budget change needs your
          approval.
        </span>
        <span>AI researches → You decide</span>
      </div>
    </>
  );
}

function PerformanceChart({ series }) {
  if (!series.length)
    return (
      <Empty
        icon={BarChart3}
        title="Performance will appear here"
        text="Launch an approved campaign and synchronize its insights."
      />
    );
  const max = Math.max(...series.map((r) => Math.max(r.revenue, r.spend)), 1) * 1.15;
  const points = (key) =>
    series.map((r, i) => [
      50 + i * (610 / Math.max(series.length - 1, 1)),
      190 - (r[key] / max) * 160,
    ]);
  const revenue = points('revenue');
  const spend = points('spend');
  return (
    <div className="chart">
      <svg
        viewBox="0 0 710 235"
        role="img"
        aria-label="Revenue and ad spend over the available campaign history"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#439371" stopOpacity=".16" />
            <stop offset="100%" stopColor="#439371" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="50"
              x2="675"
              y1={30 + i * 53.3}
              y2={30 + i * 53.3}
              stroke="#e9ece8"
              strokeDasharray="3 4"
            />
            <text x="0" y={34 + i * 53.3} className="chart-label">
              {taka(max * (1 - i / 3), true)}
            </text>
          </g>
        ))}
        <polygon
          points={`${revenue.map((p) => p.join(',')).join(' ')} 660,190 50,190`}
          fill="url(#chartFill)"
        />
        <polyline
          points={revenue.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="#408361"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <polyline
          points={spend.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="#d5a059"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeDasharray="5 4"
        />
        {series.map((r, i) => (
          <g key={r.date}>
            <circle cx={revenue[i][0]} cy={revenue[i][1]} r="3" fill="#408361" />
            <text x={revenue[i][0]} y="220" textAnchor="middle" className="chart-label">
              {new Date(`${r.date}T00:00:00+06:00`).toLocaleDateString('en-GB', {
                timeZone: 'Asia/Dhaka',
                day: 'numeric',
                month: 'short',
              })}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Products({ data, showProduct, generate, addEvidence, busy }) {
  return (
    <>
      <PageHeading
        title="Products & economics"
        text="Start with the facts. Build a campaign that respects your margins."
        action={
          <button className="button primary" onClick={() => showProduct(null)}>
            <Plus size={16} />
            Add product
          </button>
        }
      />
      <div className="products-grid">
        {data.products.map((product, index) => (
          <article className="panel product-card" key={product.id}>
            <div className={`product-art art-${index % 3}`}>
              <Package size={52} strokeWidth={1.2} />
              <span>{product.category}</span>
              <Badge>Product profile</Badge>
            </div>
            <div className="product-card-body">
              <div>
                <h2>{product.name}</h2>
                <button
                  className="icon-button"
                  aria-label={`Edit ${product.name}`}
                  onClick={() => showProduct(product)}
                >
                  <Settings2 size={17} />
                </button>
              </div>
              <p>{product.description}</p>
              <dl>
                <div>
                  <dt>Selling price</dt>
                  <dd>{taka(product.sellingPrice)}</dd>
                </div>
                <div>
                  <dt>Inventory</dt>
                  <dd>{num(product.inventory)}</dd>
                </div>
                <div>
                  <dt>Daily ceiling</dt>
                  <dd>{taka(product.dailyBudgetCeiling)}</dd>
                </div>
                <div>
                  <dt>Test ceiling</dt>
                  <dd>{taka(product.testBudgetCeiling)}</dd>
                </div>
              </dl>
              <button
                className="button secondary full"
                disabled={busy}
                onClick={() => generate(product.id)}
              >
                <Sparkles size={16} />
                Generate campaign plan
              </button>
              <button className="text-button" onClick={() => addEvidence(product)}>
                <Plus size={14} />
                Add research or competitor evidence
              </button>
            </div>
          </article>
        ))}
      </div>
      {!data.products.length && (
        <Empty
          icon={Package}
          title="Add your first product"
          text="Enter costs, fulfillment losses, inventory, and profit goals."
        />
      )}
    </>
  );
}
function PageHeading({ title, text, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="breadcrumb">
          Workspace <ChevronRight size={13} />
          {title}
        </div>
        <h1>
          {title}
          <span>.</span>
        </h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function Plans({ data, showPlan, setPage }) {
  const plans = data.plans.filter((p) => p.status !== 'superseded');
  return (
    <>
      <PageHeading
        title="Campaign plans"
        text="A complete decision, with the economics and evidence behind it."
        action={
          <button className="button primary" onClick={() => setPage('Products')}>
            <Plus size={16} />
            Create a plan
          </button>
        }
      />
      <div className="plan-list">
        {plans.map((plan) => (
          <article className="panel plan-card" key={plan.id}>
            <div className="plan-card-top">
              <span className="mini-icon">
                <Megaphone size={22} />
              </span>
              <Status value={plan.status} />
            </div>
            <h2>{plan.name}</h2>
            <p>{plan.budgetRecommendation.reason}</p>
            <div className="plan-values">
              <span>
                Price<strong>{taka(plan.pricingRecommendation.sellingPrice)}</strong>
              </span>
              <span>
                Target CPA<strong>{taka(plan.pricingRecommendation.targetCPA)}</strong>
              </span>
              <span>
                Test budget<strong>{taka(plan.budgetRecommendation.totalBudget)}</strong>
              </span>
            </div>
            <div className="plan-card-bottom">
              <span className="muted">
                Version {plan.version} · {plan.confidence} confidence
              </span>
              <button className="text-button" onClick={() => showPlan(plan)}>
                Review plan
                <ArrowRight size={15} />
              </button>
            </div>
            {!plan.validation.valid && (
              <div className="notice danger">
                Economics or guardrails need attention before approval.
              </div>
            )}
          </article>
        ))}
      </div>
      {!plans.length && (
        <Empty title="No plans yet" text="Generate a plan from an existing product." />
      )}
    </>
  );
}
function Approvals({ data, showPlan, busy, execute }) {
  const approvals = [...data.approvals].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <PageHeading
        title="Your approval queue"
        text="Review the reasoning. Make the call. Every decision leaves a trail."
      />
      <div className="notice">
        <ShieldCheck size={18} />
        Every sensitive action requires approval of its exact snapshot. Approvals expire after 24
        hours.
      </div>
      <div className="approval-list">
        {approvals.map((a) => (
          <article className="panel approval-row" key={a.id}>
            <span className="mini-icon">
              <ClipboardCheck size={22} />
            </span>
            <div className="grow">
              <div className="inline">
                <h3>{a.action.replaceAll('_', ' ')}</h3>
                <Status value={a.status} />
              </div>
              <p>{a.snapshot.name}</p>
              <small>
                {date(a.createdAt)} · {a.confidence} confidence
                {a.action === 'update_budget'
                  ? ` · Proposed ${taka(a.payload.dailyBudget)}/day`
                  : ''}
              </small>
            </div>
            <button className="button secondary" onClick={() => showPlan(a.snapshot, a)}>
              Review
              <ArrowRight size={15} />
            </button>
            {a.status === 'approved' && (
              <button className="button primary" disabled={busy} onClick={() => execute(a)}>
                Execute approved
              </button>
            )}
          </article>
        ))}
      </div>
      {!approvals.length && (
        <Empty
          icon={ClipboardCheck}
          title="No approval requests"
          text="Submit a validated campaign plan to request review."
        />
      )}
    </>
  );
}

function PlanReview({ plan, approval, data, busy, submit, decide, revise, execute, onResearch }) {
  const [tab, setTab] = useState('Plan');
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState('');
  const [changes, setChanges] = useState({
    name: plan.name,
    sellingPrice: plan.pricingRecommendation.sellingPrice,
    dailyBudget: plan.budgetRecommendation.dailyBudget,
    durationDays: plan.budgetRecommendation.durationDays,
    locations: plan.audienceRecommendation.locations,
    ageMin: plan.audienceRecommendation.ageMin,
    ageMax: plan.audienceRecommendation.ageMax,
    ads: plan.ads.map(({ hypothesis, ...ad }) => ad),
  });
  const p = plan.pricingRecommendation;
  const b = plan.budgetRecommendation;
  const a = plan.audienceRecommendation;
  const permitted = ['admin', 'approver'].includes(data.user.role);
  const canEdit =
    ['draft', 'pending_approval', 'rejected'].includes(plan.status) &&
    (!approval || approval.status === 'pending');
  return (
    <>
      <div className="review-summary">
        <Status value={approval?.status || plan.status} />
        <Badge>
          {plan.market} · Meta · {plan.conversionEvent === 'LEAD' ? 'Website leads' : 'Sales'}
        </Badge>
        <Badge tone="amber">{plan.confidence} confidence</Badge>
        <span className="muted">Version {plan.version}</span>
      </div>
      {plan.researchProjectId && <div className="notice"><span>This campaign is linked to an approved research decision. Further research requires a fresh decision and campaign approval.</span><button className="button secondary" onClick={() => onResearch(plan.researchProjectId)}>Open source research</button></div>}
      {approval && approval.action !== 'launch_campaign' && (
        <div className="notice">
          <ClipboardCheck size={16} />
          <div>
            <strong>Proposed action: {approval.action.replaceAll('_', ' ')}</strong>
            {approval.payload.dailyBudget && (
              <p>
                New configured daily budget: {taka(approval.payload.dailyBudget)}. Total spend cap
                is unchanged.
              </p>
            )}
            <p>{approval.reasoning}</p>
          </div>
        </div>
      )}
      <ActionSummary approval={approval} />
      <div className="tabs">
        {['Plan', 'Research', 'Creatives', 'Risks'].map((label) => (
          <button
            key={label}
            className={tab === label ? 'selected' : ''}
            onClick={() => setTab(label)}
          >
            {label}
          </button>
        ))}
      </div>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            revise(plan.id, changes);
          }}
        >
          <div className="notice">
            Saving creates a new version and supersedes the current pending approval. Review and
            submit the new version.
          </div>
          <div className="form-grid">
            {[
              { key: 'name', label: 'Campaign name', type: 'text' },
              { key: 'sellingPrice', label: 'Selling price', type: 'number' },
              { key: 'dailyBudget', label: 'Daily budget', type: 'number' },
              { key: 'durationDays', label: 'Test duration (days)', type: 'number' },
              { key: 'ageMin', label: 'Minimum age', type: 'number' },
              { key: 'ageMax', label: 'Maximum age', type: 'number' },
            ].map((f) => (
              <Field key={f.key} label={f.label}>
                <input
                  type={f.type}
                  required={!(plan.kind === 'service' && f.key === 'sellingPrice')}
                  value={changes[f.key] ?? ''}
                  min={f.type === 'number' ? 1 : undefined}
                  onChange={(e) =>
                    setChanges({
                      ...changes,
                      [f.key]:
                        f.type === 'number'
                          ? e.target.value === '' && f.key === 'sellingPrice'
                            ? null
                            : Number(e.target.value)
                          : e.target.value,
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <Field label="Locations (within your delivery footprint)">
            <div className="checkboxes">
              {(plan.kind === 'service' ? [plan.market] : data.business.deliveryRegions).map(
                (region) => (
                  <label key={region}>
                    <input
                      type="checkbox"
                      checked={changes.locations.includes(region)}
                      onChange={(e) =>
                        setChanges({
                          ...changes,
                          locations: e.target.checked
                            ? [...changes.locations, region]
                            : changes.locations.filter((r) => r !== region),
                        })
                      }
                    />
                    {region}
                  </label>
                ),
              )}
            </div>
          </Field>
          {changes.ads.map((ad, i) => (
            <div className="creative-edit" key={ad.id}>
              <h3>Creative {i + 1}</h3>
              {['hook', 'headline', 'primaryText', 'concept', 'imageUrl'].map((key) => (
                <Field label={key.replace(/([A-Z])/g, ' $1')} key={key}>
                  {['primaryText', 'concept'].includes(key) ? (
                    <textarea
                      value={ad[key]}
                      required
                      onChange={(e) =>
                        setChanges({
                          ...changes,
                          ads: changes.ads.map((item, ix) =>
                            ix === i ? { ...item, [key]: e.target.value } : item,
                          ),
                        })
                      }
                    />
                  ) : (
                    <input
                      value={ad[key] || ''}
                      type={key === 'imageUrl' ? 'url' : 'text'}
                      required={key !== 'imageUrl'}
                      onChange={(e) =>
                        setChanges({
                          ...changes,
                          ads: changes.ads.map((item, ix) =>
                            ix === i ? { ...item, [key]: e.target.value } : item,
                          ),
                        })
                      }
                    />
                  )}
                </Field>
              ))}
              <MediaPicker
                api={api}
                value={ad.mediaAssetId}
                thumbnail={ad.thumbnailAssetId}
                onChange={(mediaAssetId, thumbnailAssetId) =>
                  setChanges({
                    ...changes,
                    ads: changes.ads.map((item, ix) =>
                      ix === i ? { ...item, mediaAssetId, thumbnailAssetId } : item,
                    ),
                  })
                }
              />
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={() => setEditing(false)}>
              Cancel edits
            </button>
            <button className="button primary" disabled={busy}>
              Save new version
            </button>
          </div>
        </form>
      ) : (
        <>
          {tab === 'Plan' && (
            <>
              <div className="review-metrics">
                {[
                  {
                    label: plan.kind === 'service' ? 'Offer / project price' : 'Product price',
                    value: taka(p.sellingPrice),
                  },
                  {
                    label:
                      plan.conversionEvent === 'LEAD'
                        ? 'Target cost per website lead'
                        : 'Target CPA / CAC',
                    value: taka(p.targetCPA),
                  },
                  { label: 'Profit at target CPA', value: taka(p.contributionAtTargetCPA) },
                  { label: 'Total test budget', value: taka(b.totalBudget) },
                ].map((item) => (
                  <div key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
              <div className="review-columns">
                <div>
                  <h3>Product economics</h3>
                  <dl className="detail-list">
                    <div>
                      <dt>Variable cost + expected failed orders</dt>
                      <dd>{taka(p.baseVariableCost)}</dd>
                    </div>
                    <div>
                      <dt>Expected return / cancellation loss</dt>
                      <dd>{taka(p.expectedReturnCost)}</dd>
                    </div>
                    <div>
                      <dt>Break-even acquisition cost</dt>
                      <dd>{taka(p.breakEvenCPA)}</dd>
                    </div>
                    <div>
                      <dt>Target ROAS</dt>
                      <dd>
                        {p.targetROAS
                          ? `${p.targetROAS}×`
                          : p.viable
                            ? 'Not available for this goal'
                            : 'Not viable'}
                      </dd>
                    </div>
                    <div>
                      <dt>Recommended selling price</dt>
                      <dd>{taka(p.priceRange.recommended)}</dd>
                    </div>
                    <div>
                      <dt>Sourced competitive price</dt>
                      <dd>{taka(p.priceRange.competitive)}</dd>
                    </div>
                    <div>
                      <dt>Minimum viable / premium price</dt>
                      <dd>
                        {taka(p.priceRange.minimumViable)} / {taka(p.priceRange.premium)}
                      </dd>
                    </div>
                    <div>
                      <dt>Promotional / test price</dt>
                      <dd>{taka(p.priceRange.promotional)}</dd>
                    </div>
                  </dl>
                  <p className="small muted">{p.formula}</p>
                  {p.failureScenarios?.length > 0 && <div className="notice"><div>
                    <strong>COD return-rate sensitivity</strong>
                    {p.failureScenarios.map(scenario => <p key={scenario.failureRate}>
                      {Math.round(scenario.failureRate * 100)}% failed orders: allowable ad cost {taka(scenario.allowableCPA)}
                    </p>)}
                    <small>These are cost scenarios, not forecasts of campaign performance.</small>
                  </div></div>}
                </div>
                <div>
                  <h3>Campaign structure</h3>
                  <dl className="detail-list">
                    <div>
                      <dt>Configured daily budget</dt>
                      <dd>{taka(b.dailyBudget)}</dd>
                    </div>
                    <div>
                      <dt>Test duration</dt>
                      <dd>{b.durationDays} days</dd>
                    </div>
                    <div>
                      <dt>Ad sets / creative variations</dt>
                      <dd>1 / {plan.ads.length}</dd>
                    </div>
                    <div>
                      <dt>Region / age</dt>
                      <dd>
                        {a.locations.join(', ')} / {a.ageMin}–{a.ageMax}
                      </dd>
                    </div>
                    <div>
                      <dt>Placements</dt>
                      <dd>Facebook & Instagram</dd>
                    </div>
                    <div>
                      <dt>Conversion event</dt>
                      <dd>{plan.conversionEvent || 'PURCHASE'}</dd>
                    </div>
                    <div>
                      <dt>Allocation / CTA</dt>
                      <dd>{plan.ads[0]?.cta?.replaceAll('_', ' ') || 'SHOP NOW'}</dd>
                    </div>
                    <div>
                      <dt>{plan.conversionEvent === 'LEAD' ? 'Planning lead count' : 'Planning purchase count'}</dt>
                      <dd>
                        {b.plannedAcquisitions == null
                          ? 'Not estimated'
                          : `${b.plannedAcquisitions} (assumption)`}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
              <div className="reason-box">
                <Sparkles size={18} />
                <div>
                  <h3>Why this plan</h3>
                  <p>{b.reason}</p>
                  <p>{a.reason}</p>
                  <p>{b.decisionPoint}</p>
                </div>
              </div>
              <h3 className="form-section">Audience segments</h3>
              <div className="segment-grid">
                {a.segments.map((s) => (
                  <div key={s.name}>
                    <strong>{s.name}</strong>
                    <Badge tone={s.active ? 'green' : 'neutral'}>
                      {s.active ? 'In this test' : 'Future test'}
                    </Badge>
                    <p>{s.profile}</p>
                  </div>
                ))}
              </div>
              <div className={`notice ${plan.validation.valid ? '' : 'danger'}`}>
                <ShieldCheck size={18} />
                <div>
                  <strong>
                    {plan.validation.valid
                      ? 'Plan passed guardrail validation'
                      : 'Plan cannot be approved'}
                  </strong>
                  {plan.validation.errors.map((e) => (
                    <p key={e}>{e}</p>
                  ))}
                  <p>No purchase count, CPA, or return is guaranteed.</p>
                </div>
              </div>
            </>
          )}
          {tab === 'Research' && (
            <>
              <div className="reason-box">
                <Globe2 size={20} />
                <div>
                  <h3>
                    {plan.kind === 'service'
                      ? 'Approved market comparison'
                      : 'Bangladesh market research'}
                  </h3>
                  <p>{plan.research.summary}</p>
                </div>
              </div>
              <h3 className="form-section">Evidence and assumptions</h3>
              {plan.research.findings.map((finding, i) => (
                <article className="evidence-card" key={i}>
                  <div>
                    <strong>{finding.subject}</strong>
                    <Badge tone={finding.quality === 'Verified data' ? 'green' : 'amber'}>
                      {finding.quality}
                    </Badge>
                  </div>
                  <p>{finding.finding}</p>
                  <small>
                    Source:{' '}
                    {finding.source.startsWith('https://') ? (
                      <a href={finding.source} target="_blank" rel="noreferrer">
                        View source
                        <ExternalLink size={11} />
                      </a>
                    ) : (
                      finding.source
                    )}{' '}
                    · {date(finding.observedAt)} · {finding.confidence} confidence ·{' '}
                    {finding.classification}
                  </small>
                </article>
              ))}
              <h3 className="form-section">Competitor intelligence</h3>
              <p>{plan.research.competitorAnalysis}</p>
              {plan.research.competitors.map((c) => (
                <article className="evidence-card" key={c.id}>
                  <strong>
                    {c.name} · {taka(c.price)}
                  </strong>
                  <p>
                    {c.offer} · {c.positioning}
                  </p>
                  <a href={c.source} rel="noreferrer" target="_blank">
                    Source · {date(c.observedAt)}
                  </a>
                </article>
              ))}
              <h3 className="form-section">Regional opportunity</h3>
              <div className="segment-grid">
                {plan.research.regionalScores.map((r) => (
                  <div key={r.region}>
                    <strong>{r.region}</strong>
                    <p>Score: {r.score ?? 'Not enough evidence'}</p>
                    <Badge>{r.quality}</Badge>
                  </div>
                ))}
              </div>
              <p className="small muted">
                Regional scores stay unset until all weighted components have evidence. Default
                scoring weights are stored in the plan.
              </p>
            </>
          )}
          {tab === 'Creatives' && (
            <div className="creative-grid">
              {plan.ads.map((ad) => (
                <article className="creative-card" key={ad.id}>
                  <div className="creative-image">
                    {ad.mediaAssetId ? (
                      ad.mediaType === 'video' ? (
                        <video
                          src={`/api/media/${ad.mediaAssetId}/content`}
                          controls
                          preload="metadata"
                        />
                      ) : (
                        <img src={`/api/media/${ad.mediaAssetId}/content`} alt={ad.headline} />
                      )
                    ) : ad.imageUrl ? (
                      <img src={ad.imageUrl} alt={`Product creative for ${ad.headline}`} />
                    ) : (
                      <>
                        <Package size={42} strokeWidth={1.2} />
                        <span>Creative concept · image needed for live</span>
                      </>
                    )}
                    <Badge>{ad.language}</Badge>
                  </div>
                  <div className="creative-body">
                    <strong>{ad.hook}</strong>
                    <p>{ad.primaryText}</p>
                    <h3>{ad.headline}</h3>
                    <Badge>SHOP NOW</Badge>
                    <p className="small muted">{ad.concept}</p>
                    <small>Test hypothesis · conversion performance unverified</small>
                  </div>
                </article>
              ))}
            </div>
          )}
          {tab === 'Risks' && (
            <>
              <h3 className="form-section">Risks before spending</h3>
              {[...new Set([...plan.risks, ...plan.validation.warnings])].map((risk, i) => (
                <div className="risk-row" key={risk}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <p>{risk}</p>
                </div>
              ))}
              <h3 className="form-section">Assumptions</h3>
              {plan.assumptions.map((s) => (
                <p className="assumption" key={s}>
                  {s}
                </p>
              ))}
              <div className="notice">
                <ShieldCheck size={18} />
                <p>
                  The plan is immutable after approval. Product, account, policy, or payload changes
                  invalidate execution. An uncertain Meta result requires reconciliation before
                  another mutation.
                </p>
              </div>
            </>
          )}
          <div className="review-footer">
            {approval?.status === 'pending' && permitted && (
              <Field label="Decision note (optional)">
                <textarea
                  rows={2}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="What informed your decision?"
                />
              </Field>
            )}
            <div className="modal-actions">
              {canEdit && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setEditing(true)}
                >
                  Edit & revalidate
                </button>
              )}
              {!approval && ['draft', 'rejected'].includes(plan.status) && (
                <button
                  className="button primary"
                  disabled={busy || !plan.validation.valid}
                  onClick={() => submit(plan)}
                >
                  Request approval
                  <ArrowRight size={16} />
                </button>
              )}
              {approval?.status === 'pending' && permitted && (
                <>
                  <button
                    className="button danger-button"
                    disabled={busy}
                    onClick={() => decide(approval, 'reject', comment)}
                  >
                    Reject
                  </button>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => decide(approval, 'approve', comment, true)}
                  >
                    <CheckCheck size={17} />
                    {approval.action === 'launch_campaign'
                      ? 'Approve & launch'
                      : 'Approve & execute'}
                  </button>
                </>
              )}
              {approval?.status === 'approved' && permitted && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => execute(approval)}
                >
                  Execute approved action
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
            {approval && (
              <small className="muted">
                Snapshot {approval.snapshotHash.slice(0, 12)} · Expires {date(approval.expiresAt)} ·
                All times Asia/Dhaka
              </small>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Performance({ data, busy, sync, analyze, action, propose }) {
  const [level, setLevel] = useState('campaign');
  const rows = [...data.performance]
    .filter((r) => r.level === level)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeading
        title="Campaign performance"
        text="Purchase economics first. Platform attribution needs real order validation."
      />
      <article className="panel">
        <div className="panel-heading">
          <h2>Campaign operations</h2>
          <Badge tone={data.mode === 'demo' ? 'amber' : 'green'}>
            {data.mode === 'demo' ? 'Simulated performance' : 'Meta attribution'}
          </Badge>
        </div>
        {data.campaigns.map((c) => (
          <div className="campaign-operation" key={c.id}>
            <div className="grow">
              <h3>{c.name}</h3>
              <span>
                <Status value={c.status} />{' '}
                <small className="muted">
                  {taka(c.dailyBudget)}/day · Total cap {taka(c.totalBudget)}
                </small>
              </span>
            </div>
            <button
              className="button secondary"
              disabled={busy || !c.metaCampaignId}
              onClick={() => sync(c.id)}
            >
              <RefreshCw size={14} />
              Sync insights
            </button>
            <button className="button secondary" disabled={busy} onClick={() => analyze(c.id)}>
              <Sparkles size={14} />
              Analyze
            </button>
            {['active', 'paused'].includes(c.status) && (
              <button className="button secondary" disabled={busy} onClick={() => propose(c)}>
                Propose change
              </button>
            )}
            {['active', 'paused'].includes(c.status) && (
              <button className="text-button" disabled={busy} onClick={() => action(c)}>
                {c.status === 'active' ? 'Request pause' : 'Request resume'}
              </button>
            )}
          </div>
        ))}
        {!data.campaigns.length && (
          <Empty
            icon={Megaphone}
            title="No launched campaigns"
            text="Approve a campaign plan to begin your first test."
          />
        )}
      </article>
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Historical metrics</h2>
            <p>Daily snapshots · Asia/Dhaka · Purchase values are attributed revenue</p>
          </div>
          <select
            aria-label="Performance level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="campaign">Campaign</option>
            <option value="adset">Ad set</option>
            <option value="ad">Ad</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  'Date',
                  'Entity',
                  'Spend',
                  'Impressions',
                  'Clicks',
                  'CTR',
                  'Purchases',
                  'CPA',
                  'ROAS',
                  'Frequency',
                ].map((t) => (
                  <th key={t}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    {data.campaigns.find((c) => c.id === row.campaignId)?.name.split(' · ')[0]}
                    {level !== 'campaign' && <small>{row.entityId.slice(-10)}</small>}
                  </td>
                  <td>{taka(row.spend)}</td>
                  <td>{num(row.impressions)}</td>
                  <td>{num(row.clicks)}</td>
                  <td>{row.ctr == null ? '—' : `${row.ctr}%`}</td>
                  <td>{num(row.conversions)}</td>
                  <td>{taka(row.cpa)}</td>
                  <td>{row.roas == null ? '—' : `${row.roas}×`}</td>
                  <td>{num(row.frequency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <Empty
            title="No data at this level yet"
            text="Synchronize a launched campaign to retrieve its insights."
          />
        )}
      </article>
    </>
  );
}
function Optimization({ data, request, busy, setPage }) {
  return (
    <>
      <PageHeading
        title="Thoughtful next moves"
        text="Recommendations grounded in purchase data. Every change is your decision."
        action={
          <button className="button secondary" onClick={() => setPage('Performance')}>
            <BarChart3 size={15} />
            Analyze campaigns
          </button>
        }
      />
      <div className="notice">
        <Target size={18} />
        Scaling needs at least 20 purchases. A high click-through rate alone is never a reason to
        scale.
      </div>
      {data.optimizations.map((o) => (
        <article className="panel optimization-card" key={o.id}>
          <div className="inline">
            <span className="mini-icon">
              <Sparkles size={20} />
            </span>
            <h2>{o.action.replaceAll('_', ' ')}</h2>
            <Status value={o.status} />
          </div>
          <p>{o.reason}</p>
          <div className="plan-values">
            <span>
              Observed CPA<strong>{taka(o.evidence.cpa)}</strong>
            </span>
            <span>
              Target CPA<strong>{taka(o.evidence.targetCPA)}</strong>
            </span>
            <span>
              Purchases<strong>{o.evidence.purchases}</strong>
            </span>
            {o.payload.dailyBudget && (
              <span>
                Proposed daily budget<strong>{taka(o.payload.dailyBudget)}</strong>
              </span>
            )}
          </div>
          <p className="small muted">
            {o.expectedImpact} · {o.confidence} confidence · {o.riskLevel} risk
          </p>
          {o.status === 'proposed' && (
            <button className="button primary" disabled={busy} onClick={() => request(o)}>
              Request human approval
              <ArrowRight size={16} />
            </button>
          )}
        </article>
      ))}
      {!data.optimizations.length && (
        <article className="panel">
          <Empty
            icon={Sparkles}
            title="Collect evidence for the next move"
            text="Synchronize performance, then analyze a campaign. Recommendations appear only when the rules have enough data."
            action={
              <button className="button secondary" onClick={() => setPage('Performance')}>
                Open performance
              </button>
            }
          />
        </article>
      )}
    </>
  );
}
function Audit({ data }) {
  return (
    <>
      <PageHeading
        title="A record of every decision"
        text="Append-only application history for approvals, execution, and sensitive changes."
      />
      <article className="panel">
        <div className="panel-heading">
          <h2>Audit trail</h2>
          <Badge>{data.audit.length} recent events</Badge>
        </div>
        <div className="audit-list">
          {data.audit.map((row) => (
            <div className="audit-row" key={row.id}>
              <span className="audit-dot">
                <Check size={12} />
              </span>
              <div className="grow">
                <strong>{row.action.replaceAll('.', ' / ').replaceAll('_', ' ')}</strong>
                <p>
                  {row.detail?.message ||
                    row.detail?.comment ||
                    row.detail?.note ||
                    `Entity ${row.entityId.slice(0, 8)} · Actor ${row.actorId.slice(0, 8)}`}
                </p>
              </div>
              <time>{date(row.createdAt)}</time>
            </div>
          ))}
        </div>
      </article>
    </>
  );
}

function Settings({ data, run, refresh, busy, setPage }) {
  const [business, setBusiness] = useState({
    name: data.business.name,
    location: data.business.location,
    dailyBudgetCeiling: data.business.dailyBudgetCeiling,
    totalBudgetCeiling: data.business.totalBudgetCeiling,
    deliveryRegions: data.business.deliveryRegions,
  });
  const [locations, setLocations] = useState([]);
  const [locationQuery, setLocationQuery] = useState({ name: 'Dhaka', type: 'city' });
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (data.user.role === 'admin')
      api('/users')
        .then(setUsers)
        .catch(() => {});
  }, [data.user.role]);
  const admin = data.user.role === 'admin';
  return (
    <>
      <PageHeading
        title="Workspace settings"
        text="Your business facts, budget limits, and integration readiness."
      />
      <div className="settings-grid">
        <article className="panel settings-card">
          <h2>Business & guardrails</h2>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                await api('/business', 'PUT', business);
                await refresh();
              }, 'Business policy updated. Regenerate plans affected by the change.');
            }}
          >
            {['name', 'location', 'dailyBudgetCeiling', 'totalBudgetCeiling'].map((key) => (
              <Field
                key={key}
                label={
                  {
                    name: 'Business name',
                    location: 'Business location',
                    dailyBudgetCeiling: 'Combined configured daily budget ceiling (৳)',
                    totalBudgetCeiling: 'Total campaign spend-cap ceiling (৳)',
                  }[key]
                }
              >
                <input
                  value={business[key]}
                  type={key.includes('Ceiling') ? 'number' : 'text'}
                  min={1}
                  required
                  disabled={!admin}
                  onChange={(e) =>
                    setBusiness({
                      ...business,
                      [key]: key.includes('Ceiling') ? Number(e.target.value) : e.target.value,
                    })
                  }
                />
              </Field>
            ))}
            <Field label="Supported delivery regions">
              <div className="checkboxes">
                {[
                  'Dhaka',
                  'Chattogram',
                  'Sylhet',
                  'Rajshahi',
                  'Khulna',
                  'Barishal',
                  'Rangpur',
                  'Mymensingh',
                  'Nationwide',
                ].map((region) => (
                  <label key={region}>
                    <input
                      type="checkbox"
                      checked={business.deliveryRegions.includes(region)}
                      disabled={!admin}
                      onChange={(e) =>
                        setBusiness({
                          ...business,
                          deliveryRegions: e.target.checked
                            ? [...business.deliveryRegions, region]
                            : business.deliveryRegions.filter((r) => r !== region),
                        })
                      }
                    />
                    {region}
                  </label>
                ))}
              </div>
            </Field>
            <button className="button primary" disabled={busy || !admin}>
              Save business policy
            </button>
          </form>
        </article>
        <article className="panel settings-card">
          <div className="inline">
            <span className="meta-logo">∞</span>
            <h2>Meta integration</h2>
            <Badge tone={data.integration.configured ? 'green' : 'amber'}>
              {data.mode === 'demo'
                ? 'Demo adapter'
                : data.integration.configured
                  ? 'Verified'
                  : 'Not connected'}
            </Badge>
          </div>
          {data.mode === 'demo' ? (
            <>
              <p className="settings-description">
                This workspace uses simulated Meta actions. Tokens are never needed or used in demo
                mode.
              </p>
              <div className="notice">
                <FlaskConical size={18} />
                Campaigns and performance in this workspace are simulated. No money is spent.
              </div>
              <h3 className="form-section">Live setup requirements</h3>
              <ol className="setup-list">
                <li>Meta Developer App with approved Marketing API access.</li>
                <li>BDT ad account, Facebook Page, and purchase pixel.</li>
                <li>MongoDB replica set, Redis, and a separate worker.</li>
                <li>Server-side encryption and MCP service keys.</li>
                <li>Verified Bangladesh location keys and actual creative images.</li>
                <li>Controlled account validation before enabling live execution.</li>
              </ol>
              <p className="small muted">
                See docs/live-setup.md in the project for the full runbook.
              </p>
            </>
          ) : (
            <>
              <p className="settings-description">
                Credentials are encrypted at rest and kept server-side.
              </p>
              <button className="button secondary" onClick={() => setPage("Accounts")}>Open account connections</button>
              <h3 className="form-section">Resolve targeting locations</h3>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  run(async () => {
                    setLocationQuery({ name: form.get('name'), type: form.get('type') });
                    setLocations(
                      await api(
                        `/integrations/meta/targeting?q=${encodeURIComponent(form.get('name'))}&type=${form.get('type')}`,
                      ),
                    );
                  });
                }}
              >
                <div className="inline">
                  <select name="name">
                    {business.deliveryRegions
                      .filter((r) => r !== 'Nationwide')
                      .map((region) => (
                        <option key={region}>{region}</option>
                      ))}
                  </select>
                  <select name="type">
                    <option value="city">City</option>
                    <option value="region">Region</option>
                  </select>
                  <button className="button secondary" disabled={busy || !admin}>
                    Search Meta
                  </button>
                </div>
              </form>
              {locations.map((location) => (
                <div className="location-result" key={location.key}>
                  <span>
                    {location.name} · {location.key}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      run(async () => {
                        await api('/integrations/meta/locations', 'POST', {
                          ...locationQuery,
                          key: String(location.key),
                        });
                        await refresh();
                      }, 'Location verified.')
                    }
                  >
                    Use this key
                  </button>
                </div>
              ))}
              <p className="small muted">
                Live execution:{' '}
                {data.liveExecutionEnabled
                  ? 'enabled — human approval still required'
                  : 'disabled by server configuration'}
              </p>
            </>
          )}
        </article>
      </div>
      {admin && (
        <article className="panel settings-card">
          <h2>Team & permissions</h2>
          <p className="settings-description">
            Analysts prepare plans. Approvers can approve and execute. Administrators manage policy
            and integrations.
          </p>
          <div className="team-list">
            {users.map((u) => (
              <span key={u.id}>
                {u.name} <Badge>{u.role}</Badge>
              </span>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              run(async () => {
                await api('/users', 'POST', Object.fromEntries(new FormData(form)));
                setUsers(await api('/users'));
                form.reset();
              }, 'Team member created.');
            }}
          >
            <div className="form-grid three">
              <Field label="Name">
                <input name="name" required minLength={2} />
              </Field>
              <Field label="Email">
                <input name="email" type="email" required />
              </Field>
              <Field label="Initial password (12+ characters)">
                <input name="password" type="password" minLength={12} required />
              </Field>
              <Field label="Role">
                <select name="role">
                  <option value="analyst">Analyst</option>
                  <option value="approver">Approver</option>
                </select>
              </Field>
            </div>
            <button className="button secondary" disabled={busy}>
              <Plus size={16} />
              Add team member
            </button>
          </form>
        </article>
      )}
    </>
  );
}

function EvidenceForm({ product, busy, save }) {
  const [kind, setKind] = useState('evidence');
  return (
    <>
      <div className="tabs">
        <button
          className={kind === 'evidence' ? 'selected' : ''}
          onClick={() => setKind('evidence')}
        >
          Research observation
        </button>
        <button
          className={kind === 'competitor' ? 'selected' : ''}
          onClick={() => setKind('competitor')}
        >
          Competitor intelligence
        </button>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const input = Object.fromEntries(new FormData(event.currentTarget));
          input.observedAt = new Date(input.observedAt).toISOString();
          if (kind === 'competitor') input.price = Number(input.price);
          save(product.id, kind === 'evidence' ? 'evidence' : 'competitors', input);
        }}
      >
        <div className="form-grid">
          {(kind === 'evidence'
            ? ['subject', 'finding']
            : ['name', 'product', 'price', 'offer', 'positioning', 'strengths', 'weaknesses']
          ).map((key) => (
            <Field label={key} key={key}>
              <input
                name={key}
                type={key === 'price' ? 'number' : 'text'}
                required
                min={key === 'price' ? 0 : undefined}
              />
            </Field>
          ))}
          <Field label="Source URL">
            <input name="source" type="url" required placeholder="https://..." />
          </Field>
          <Field label="Observed at (your local time)">
            <input
              name="observedAt"
              type="datetime-local"
              required
              defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
                .toISOString()
                .slice(0, 16)}
            />
          </Field>
          {kind === 'evidence' && (
            <>
              <Field label="Confidence">
                <select name="confidence">
                  <option>Medium</option>
                  <option>Low</option>
                  <option>High</option>
                </select>
              </Field>
              <Field label="Data quality">
                <select name="quality">
                  <option>Verified data</option>
                  <option>Estimated data</option>
                  <option>Historical benchmarks</option>
                  <option>Insufficient data</option>
                </select>
              </Field>
              <Field label="Classification">
                <select name="classification">
                  <option value="observed">Observed</option>
                  <option value="inferred">Inferred</option>
                  <option value="ai-generated">AI-generated</option>
                </select>
              </Field>
            </>
          )}
        </div>
        <div className="notice">
          <FileText size={16} />
          Only mark data verified if you actually checked the source. New evidence appears when a
          fresh campaign plan is generated.
        </div>
        <div className="modal-actions">
          <button className="button primary" disabled={busy}>
            Save sourced observation
          </button>
        </div>
      </form>
    </>
  );
}

function App() {
  useLanguage();
  const [data, setData] = useState(null);
  const [mode, setMode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useDraft('adpilot-ui-page', 'Overview');
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [query, setQuery] = useState('');
  async function refresh() {
    const value = await api('/overview');
    displayCurrency = value.integration.currency || 'BDT';
    selectApiWorkspace(value.user.businessId);
    setData(value);
    return value;
  }
  async function switchWorkspace(businessId, alreadyBusy = false) {
    const task = async () => {
      await api('/workspaces/switch', 'POST', { businessId });
      setModal(null);
      setQuery('');
      await refresh();
      setPage('Accounts');
    };
    if (alreadyBusy) return task();
    return run(task, 'Workspace switched. Its accounts, media and research are now active.');
  }
  useEffect(() => {
    api('/health')
      .then((h) => setMode(h.mode))
      .catch(() => {});
    refresh()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.error ? 12000 : 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function run(task, message) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await task();
      if (message) setToast({ text: message });
      return result;
    } catch (error) {
      const detail =
        error.details?.errors?.join(' ') ||
        (error.details?.fieldErrors
          ? Object.entries(error.details.fieldErrors)
              .map(([key, values]) => `${translateText(key)}: ${values.map(translateText).join(', ')}`)
              .join('; ')
          : '');
      setToast({ text: `${translateText(error.message)}${detail ? ` — ${detail}` : ''}`, error: true });
    } finally {
      setBusy(false);
    }
  }
  function showPlan(plan, approval = null) {
    const request =
      approval ||
      data.approvals.find(
        (a) =>
          a.planId === plan.id &&
          ['pending', 'approved'].includes(a.status) &&
          a.action === 'launch_campaign',
      );
    setModal({ kind: 'plan', plan, approval: request || null });
  }
  const showProduct = (product) => setModal({ kind: 'product', product });
  async function execute(approval) {
    return run(
      async () => {
        await api(`/approvals/${approval.id}/execute`, 'POST', {});
        await refresh();
        setModal(null);
      },
      mode === 'demo'
        ? 'Approved action executed through MCP in demo mode. No real ad spend.'
        : 'Approved action executed through MCP.',
    );
  }
  async function decide(approval, decision, comment, executeNow = false) {
    return run(
      async () => {
        const updated = await api(`/approvals/${approval.id}/decision`, 'POST', {
          decision,
          comment,
        });
        await refresh();
        if (decision === 'approve' && executeNow) {
          setModal({ kind: 'plan', plan: updated.snapshot, approval: updated });
          await api(`/approvals/${updated.id}/execute`, 'POST', {});
          await refresh();
        }
        setModal(null);
      },
      decision === 'approve'
        ? `Approved${executeNow ? ' and executed through MCP' : ''}.${mode === 'demo' ? ' Demo actions only.' : ''}`
        : 'Rejected. The plan can be revised and submitted again.',
    );
  }
  const pending = data?.approvals.filter((a) => a.status === 'pending').length || 0;
  const common = { data, busy, setPage, showPlan, showProduct };
  if (loading)
    return (
      <div className="loading-screen">
        <span className="brand-mark">
          <Zap size={22} />
        </span>
        <p>Opening your workspace…</p>
      </div>
    );
  return (
    <>
      {data ? (
        <div className="app-shell">
          <aside className="sidebar">
            <a
              className="brand"
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setPage('Overview');
              }}
            >
              <span className="brand-mark">
                <Zap size={20} fill="currentColor" />
              </span>
              adpilot<span className="brand-dot">.</span>
            </a>
            <button className="workspace-switch" onClick={() => setPage('Accounts')}>
              <span className="workspace-avatar">
                {data.business.name.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{data.business.name}</strong>
                <small>Business workspace</small>
              </span>
              <ChevronDown size={13} />
            </button>
            <span className="nav-caption">WORKSPACE</span>
            <nav>
              {navItems.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  className={page === label ? 'nav-item active' : 'nav-item'}
                  onClick={() => {
                    setPage(label);
                    setQuery('');
                  }}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {label === 'Approvals' && pending > 0 && (
                    <span className="nav-count">{pending}</span>
                  )}
                  {label === 'Optimization' && <span className="ai-label">AI</span>}
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <div className="control-card">
                <ShieldCheck size={21} />
                <strong>Human in the loop</strong>
                <p>
                  Smart recommendations.
                  <br />
                  Your final say.
                </p>
                <Badge tone="green">
                  <i />
                  Guardrails active
                </Badge>
              </div>
              <button
                className={page === 'Settings' ? 'nav-item active' : 'nav-item'}
                onClick={() => setPage('Settings')}
              >
                <Settings2 size={18} />
                Settings
              </button>
              <button className="nav-item" onClick={() => setModal({ kind: 'help' })}>
                <CircleHelp size={18} />
                Workspace guide
              </button>
              <div className="sidebar-user">
                <span className="user-avatar">
                  {data.user.name
                    .split(' ')
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span>
                  <strong>{data.user.name}</strong>
                  <small>{data.user.role}</small>
                </span>
                <button
                  aria-label="Sign out"
                  className="icon-button"
                  onClick={() =>
                    run(async () => {
                      await api('/auth/logout', 'POST', {});
                      setData(null);
                    })
                  }
                >
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </aside>
          <main className="main">
            <header className="topbar">
              <div className="search-box">
                <Search size={16} />
                <input
                  aria-label="Search products and campaign plans"
                  placeholder="Search products and plans…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <kbd>⌕</kbd>
              </div>
              <div className="topbar-right">
                <LanguageSwitch />
                <span className="mode-label">
                  <span className="live-dot" />
                  {data.mode === 'demo' ? 'Demo workspace' : 'Live workspace'}
                </span>
                <span className="topbar-divider" />
                <button
                  className="notification-button"
                  aria-label={`View ${pending} pending approvals`}
                  onClick={() => setPage('Approvals')}
                >
                  <Bell size={19} />
                  {pending > 0 && <i />}
                </button>
                <span className="user-avatar small">{data.user.name[0]}</span>
              </div>
            </header>
            <div className="mobile-nav">
              <select
                aria-label="Workspace section"
                value={page}
                onChange={(e) => setPage(e.target.value)}
              >
                {[...navItems.map((n) => n.label), 'Settings'].map((label) => (
                  <option key={label} value={label}>{label}</option>
                ))}
              </select>
              <button
                className="icon-button"
                aria-label="Sign out"
                onClick={() =>
                  run(async () => {
                    await api('/auth/logout', 'POST', {});
                    setData(null);
                  })
                }
              >
                <LogOut size={18} />
              </button>
            </div>
            {data.mode === 'demo' && (
              <div className="demo-banner">
                <FlaskConical size={13} />
                <span>DEMO MODE</span> Research hypotheses, approvals, campaigns, and performance
                are simulated. No real ad spend.
              </div>
            )}
            {data.mode === 'live' && !data.liveExecutionEnabled && (
              <div className="demo-banner">
                <ShieldCheck size={13} />
                <span>PLANNING WORKSPACE</span> Connected accounts are available for planning.
                Campaign execution is disabled.
                {!data.backgroundJobsEnabled &&
                  ' Scheduled research and monitoring await the background worker setup.'}
              </div>
            )}
            <div className="page-content">
              {page === 'Overview' && <WorkflowGuide data={data} onNavigate={setPage} />}
              {query ? (
                <>
                  <PageHeading title="Search workspace" text={`Results for “${query}”`} />
                  <div className="panel search-results">
                    {data.products
                      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
                      .map((p) => (
                        <button key={p.id} onClick={() => showProduct(p)}>
                          <Package size={18} />
                          <strong>{p.name}</strong>
                          <Badge>Product</Badge>
                          <ArrowRight size={16} />
                        </button>
                      ))}
                    {data.plans
                      .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
                      .map((p) => (
                        <button key={p.id} onClick={() => showPlan(p)}>
                          <FileText size={18} />
                          <strong>{p.name}</strong>
                          <Status value={p.status} />
                          <ArrowRight size={16} />
                        </button>
                      ))}
                  </div>
                </>
              ) : (
                <>
                  {page === 'Overview' && <Overview {...common} />}
                  {page === 'Products' && (
                    <Products
                      {...common}
                      addEvidence={(product) => setModal({ kind: 'evidence', product })}
                      generate={(id) =>
                        run(async () => {
                          const plan = await api(`/products/${id}/plans`, 'POST', {});
                          await refresh();
                          showPlan(plan);
                        }, 'Campaign plan generated. Review its economics and assumptions.')
                      }
                    />
                  )}
                  {page === 'Campaign plans' && <Plans {...common} />}
                  {page === 'Approvals' && <Approvals {...common} execute={execute} />}
                  {page === 'Performance' && (
                    <Performance
                      {...common}
                      propose={(campaign) => setModal({ kind: 'action', campaign })}
                      sync={(id) =>
                        run(async () => {
                          const result = await api(`/campaigns/${id}/sync`, 'POST', {});
                          await refresh();
                          setToast({
                            text:
                              result.status === 'queued'
                                ? 'Insights synchronization queued. Refresh after the worker finishes.'
                                : 'Insights synchronized. Demo data remains simulated.',
                          });
                        })
                      }
                      analyze={(id) =>
                        run(async () => {
                          const result = await api(`/campaigns/${id}/analyze`, 'POST', {});
                          await refresh();
                          setToast({ text: result.message });
                          if (result.recommendations.length) setPage('Optimization');
                        })
                      }
                      action={(c) =>
                        run(async () => {
                          const approval = await api(`/campaigns/${c.id}/actions`, 'POST', {
                            action: c.status === 'active' ? 'pause_campaign' : 'resume_campaign',
                            payload: {},
                            reason: `User requested ${c.status === 'active' ? 'pause' : 'resume'} from the campaign performance dashboard.`,
                          });
                          await refresh();
                          showPlan(approval.snapshot, approval);
                        })
                      }
                    />
                  )}
                  {page === 'Optimization' && (
                    <Optimization
                      {...common}
                      request={(o) =>
                        run(async () => {
                          const approval = await api(
                            `/optimizations/${o.id}/request-approval`,
                            'POST',
                            {},
                          );
                          await refresh();
                          showPlan(approval.snapshot, approval);
                        })
                      }
                    />
                  )}
                  {page === 'Audit log' && <Audit data={data} />}
                  {page === 'Accounts' && (
                    <Accounts
                      key={data.business.id}
                      {...common}
                      api={api}
                      run={run}
                      refresh={refresh}
                      onSwitch={switchWorkspace}
                    />
                  )}
                  {page === 'Media library' && (
                    <MediaLibrary key={data.business.id} {...common} api={api} run={run} />
                  )}
                  {page === 'Research studio' && (
                    <ResearchDesk
                      key={data.business.id}
                      {...common}
                      api={api}
                      run={run}
                      refresh={refresh}
                      onPlan={showPlan}
                    />
                  )}
                  {page === 'Settings' && <Settings {...common} run={run} refresh={refresh} />}
                </>
              )}
            </div>
            <footer className="app-footer">
              <span>AdPilot · Ads research & planning</span>
              <span>All times Asia/Dhaka · Approval-first by design</span>
            </footer>
          </main>
        </div>
      ) : (
        <><div className="login-language"><LanguageSwitch /></div><Login
          mode={mode}
          busy={busy}
          run={run}
          onLogin={async () => {
            await refresh();
            setPage('Overview');
          }}
        /></>
      )}
      {modal && data && (
        <Modal
          title={
            modal.kind === 'action'
              ? 'Propose a campaign change'
              : modal.kind === 'plan'
                ? modal.plan.name
                : modal.kind === 'product'
                  ? modal.product
                    ? 'Edit product profile'
                    : 'Add a product'
                  : modal.kind === 'evidence'
                    ? `Evidence · ${modal.product.name}`
                    : 'Your workspace guide'
          }
          subtitle={
            modal.kind === 'plan'
              ? 'Review the evidence, economics, creative hypotheses, and risks.'
              : modal.kind === 'product'
                ? 'Give the system business facts. Recommendations come next.'
                : null
          }
          onClose={() => setModal(null)}
          wide={modal.kind === 'plan' || modal.kind === 'product'}
        >
          {modal.kind === 'action' && (
            <ActionForm
              campaign={modal.campaign}
              data={data}
              busy={busy}
              api={api}
              onSave={(input) =>
                run(async () => {
                  const approval = await api(
                    `/campaigns/${modal.campaign.id}/actions`,
                    'POST',
                    input,
                  );
                  await refresh();
                  showPlan(approval.snapshot, approval);
                }, 'Change prepared for human approval.')
              }
            />
          )}
          {modal.kind === 'product' && (
            <GuidedProduct
              key={modal.product?.id || 'new'}
              data={data}
              api={api}
              product={modal.product}
              busy={busy}
              onSave={(input) =>
                run(async () => {
                  const saved = await api(
                    modal.product ? `/products/${modal.product.id}` : '/products',
                    modal.product ? 'PUT' : 'POST',
                    input,
                  );
                  await refresh();
                  setModal(null);
                  return saved;
                }, 'Product saved with actual costs and budget guardrails.')
              }
            />
          )}
          {modal.kind === 'plan' && (
            <PlanReview
              key={modal.plan.id}
              plan={modal.plan}
              approval={modal.approval}
              data={data}
              busy={busy}
              decide={decide}
              execute={execute}
              onResearch={projectId => { sessionStorage.setItem(`adpilot-research-selection:${data.business.id}`, projectId); setModal(null); setPage('Research studio'); }}
              submit={(plan) =>
                run(async () => {
                  const approval = await api(`/plans/${plan.id}/submit`, 'POST', {});
                  await refresh();
                  setModal({ kind: 'plan', plan: approval.snapshot, approval });
                }, 'Plan submitted for human approval.')
              }
              revise={(id, input) =>
                run(async () => {
                  const revised = await api(`/plans/${id}/revisions`, 'POST', input);
                  await refresh();
                  setModal({ kind: 'plan', plan: revised, approval: null });
                }, 'New plan version saved and revalidated.')
              }
            />
          )}
          {modal.kind === 'evidence' && (
            <EvidenceForm
              product={modal.product}
              busy={busy}
              save={(id, type, input) =>
                run(async () => {
                  await api(`/products/${id}/${type}`, 'POST', input);
                  setModal(null);
                }, 'Sourced observation recorded. Generate a fresh plan to include it.')
              }
            />
          )}
          {modal.kind === 'help' && (
            <div className="help-content">
              <ol>
                <li>
                  Open Accounts to select a client workspace and connect its own Meta account, Page,
                  Pixel and AI provider.
                </li>
                <li>
                  Upload images and videos in Media library. Select an uploaded image cover for each
                  video you use in a campaign.
                </li>
                <li>
                  In Research studio, describe your product, service or software, compare candidate
                  countries, add dated evidence and ask follow-up questions. Edits and new research
                  preserve previous versions.
                </li>
                <li>
                  Review the country comparison and approve the current decision. Create a
                  service/software campaign draft from that approved decision. For Bangladesh
                  physical-product campaigns, use Products and supply actual costs and profit
                  requirements.
                </li>
                <li>
                  Review and edit campaign copy, selected media, acquisition economics, targeting
                  and budget. Submit the current draft for a separate launch approval.
                </li>
                <li>
                  An authorized approver executes the exact approved campaign. Research approval
                  alone does not launch an ad.
                </li>
                <li>
                  Review insights and approve proposed changes. Missing lead revenue or acquisition
                  economics remain unknown.
                </li>
              </ol>
              <div className="notice">
                <ShieldCheck size={18} />
                Demo mode simulates the whole workflow. Live deployment requires the documented
                account and infrastructure setup.
              </div>
            </div>
          )}
        </Modal>
      )}
      {busy && (
        <div className="working-toast">
          <RefreshCw size={15} className="spin" />
          Working on your request…
        </div>
      )}
      {toast && (
        <div
          className={`toast ${toast.error ? 'error' : ''}`}
          role={toast.error ? 'alert' : 'status'}
        >
          {toast.error ? <CircleHelp size={18} /> : <Check size={18} />}
          <span>{toast.text}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById('root')).render(<App />);
