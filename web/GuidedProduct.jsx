import React from 'react';
import { useDraft } from './use-draft.js';
import { MediaPicker } from './WorkspaceTools.jsx';
import { calculateEconomics } from '../src/modules/pricing/engine.js';

const categories = ['Fashion & clothing', 'Beauty & personal care', 'Home & kitchen', 'Electronics & gadgets', 'Food & beverages', 'Health & fitness', 'Baby & children', 'Accessories', 'Books & stationery', 'Other'];
const empty = { name: '', category: '', description: '', inventory: 100, sellingPrice: null, minProfit: 200, desiredMargin: 0.2,
  dailyBudgetCeiling: 1000, testBudgetCeiling: 7000, landingUrl: '', imageUrl: '', paymentMethod: 'cod',
  costs: { product: 0, packaging: 0, delivery: 0, paymentFixed: 0, paymentPercent: 0, other: 0, returnRate: 0.1, returnCost: 0 } };
const Field = ({ label, hint, children }) => <label className="field"><span>{label}</span>{React.cloneElement(children, { 'aria-label': label })}{hint && <small>{hint}</small>}</label>;
export function GuidedProduct({ product, data, api, busy, onSave }) {
  const [value, setValue, clearDraft] = useDraft(`adpilot-draft:${data.business.id}:${data.user.id}:product:${product?.id || 'new'}`, () => product ? structuredClone(product) : structuredClone(empty));
  const category = categories.includes(value.category) ? value.category : value.category ? 'Other' : '';
  const update = (key, next) => setValue({ ...value, [key]: next });
  const numeric = (key, label, hint, percent = false, optional = false) => <Field label={label} hint={hint}><input type="number" min="0" step={key === 'inventory' ? '1' : 'any'} max={percent ? 80 : undefined} required={!optional}
    value={value[key] == null ? '' : percent ? Math.round(value[key] * 10000) / 100 : value[key]}
    onChange={event => update(key, event.target.value === '' ? null : Number(event.target.value) / (percent ? 100 : 1))} /></Field>;
  const valid = Object.values(value.costs).every(number => Number.isFinite(number) && number >= 0) && value.costs.returnRate <= 0.8 && value.costs.paymentPercent <= 20 && value.desiredMargin >= 0 && value.desiredMargin <= 0.8;
  const economics = valid ? calculateEconomics(value) : null;
  return <form onSubmit={async event => {
    event.preventDefault();
    const { id, businessId, createdBy, revision, createdAt, updatedAt, ...payload } = value;
    const saved = await onSave(payload); if (saved) clearDraft();
  }}>
    <p className="draft-note">Your unfinished form is saved in this browser tab for this workspace. Actual costs must come from your business; examples are not market prices.</p>
    <h3 className="form-section">1. Product and delivery</h3>
    <div className="form-grid">
      <Field label="Product name"><input required value={value.name} onChange={event => update('name', event.target.value)} placeholder="What do you sell?" /></Field>
      <Field label="Category / niche"><select required value={category} onChange={event => update('category', event.target.value)}><option value="">Choose a product category</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select></Field>
      {category === 'Other' && <Field label="Your custom category"><input required value={value.category === 'Other' ? '' : value.category} onChange={event => update('category', event.target.value || 'Other')} placeholder="Enter your own category" /></Field>}
      <Field label="Description" hint="Describe actual materials, features and use cases. Avoid claims you cannot verify."><textarea required minLength={10} value={value.description} onChange={event => update('description', event.target.value)} /></Field>
      {numeric('inventory', 'Available inventory', 'How many units are actually ready to sell?')}
      <Field label="Payment method"><select value={value.paymentMethod || 'mixed'} onChange={event => update('paymentMethod', event.target.value)}><option value="cod">Cash on delivery (COD)</option><option value="prepaid">Online / prepaid</option><option value="mixed">COD and online payment</option></select></Field>
      <Field label="Delivery coverage" hint="Targeting must stay inside both your product coverage and workspace delivery policy."><select value={value.deliveryRegions?.[0] || ''} onChange={event => update('deliveryRegions', event.target.value ? [event.target.value] : undefined)}><option value="">Use workspace delivery coverage</option>{data.business.deliveryRegions.map(region => <option value={region} key={region}>{region}</option>)}</select></Field>
    </div>
    <h3 className="form-section">2. Real costs per delivered order · BDT</h3>
    <div className="form-grid">
      {[
        ['product', 'Product cost', 'Your purchase or manufacturing cost per unit.'],
        ['packaging', 'Packaging', 'Actual box, wrapping and packing cost.'],
        ['delivery', 'Delivery / shipping', 'The shipping cost your business pays, after any customer delivery charge.'],
        ['paymentFixed', 'Fixed COD / payment fee', 'Fixed courier collection or payment-processing charge.'],
        ['paymentPercent', 'Payment fee (%)', 'Percentage processing charge. Enter 1 for 1%.'],
        ['other', 'Other variable costs', 'Other real per-order costs; use 0 when none apply.'],
        ['returnRate', 'Expected failed / returned orders (%)', 'Enter 10 for 10%. Use your measured cancellation and failed-delivery rate.'],
        ['returnCost', 'Loss per failed / returned order', 'Net loss on a failed order, including return shipping; do not enter the sale price.'],
      ].map(([key, label, hint]) => <Field key={key} label={label} hint={hint}><input type="number" step="any" min="0" max={key === 'returnRate' ? 80 : key === 'paymentPercent' ? 20 : undefined} required
        value={value.costs[key] == null ? '' : key === 'returnRate' ? Math.round(value.costs[key] * 10000) / 100 : value.costs[key]}
        onChange={event => setValue({ ...value, costs: { ...value.costs, [key]: event.target.value === '' ? null : Number(event.target.value) / (key === 'returnRate' ? 100 : 1) } })} /></Field>)}
    </div>
    <h3 className="form-section">3. Price, profit and spending limits</h3>
    <div className="form-grid">
      {numeric('sellingPrice', 'Current selling price (optional)', 'Leave empty for an economics-based recommendation.', false, true)}
      {numeric('minProfit', 'Minimum profit per delivered order', 'Your required profit after costs and advertising.')}
      {numeric('desiredMargin', 'Desired profit margin (%)', 'Enter 20 for 20%. The engine also respects your minimum profit.', true)}
      {numeric('dailyBudgetCeiling', 'Maximum configured daily budget', 'This is a planning ceiling, not a guaranteed exact daily charge.')}
      {numeric('testBudgetCeiling', 'Maximum total test budget', 'Maximum budget allocated to this product test.')}
      <Field label="Product / landing page URL" hint="Use an HTTPS page showing the same product and price."><input type="url" value={value.landingUrl} onChange={event => update('landingUrl', event.target.value)} placeholder="https://your-store.com/product" /></Field>
    </div>
    {economics && <div className="cost-preview"><h3>Live economics preview</h3><dl>
      <dt>Expected failed-delivery loss per delivered order</dt><dd>{economics.expectedReturnCost.toFixed(2)} BDT</dd>
      <dt>Total variable cost</dt><dd>{economics.baseVariableCost.toFixed(2)} BDT</dd>
      <dt>Allowable advertising cost per purchase</dt><dd>{economics.targetCPA.toFixed(2)} BDT</dd>
    </dl><p>{economics.viable ? 'Economics leave room for an advertising test. Actual market CPA still needs measurement.' : 'The current price, costs or inventory cannot support a profitable advertising test.'}</p></div>}
    <h3 className="form-section">4. Creative media</h3>
    <MediaPicker api={api} value={value.mediaAssetId} thumbnail={value.thumbnailAssetId} onChange={(mediaAssetId, thumbnailAssetId) => setValue({ ...value, mediaAssetId, thumbnailAssetId })} />
    <Field label="Creative image URL (HTTPS)" hint="Optional alternative when you are not using an uploaded file."><input type="url" value={value.imageUrl} onChange={event => update('imageUrl', event.target.value)} /></Field>
    <div className="notice">Saving a product does not launch an ad. Generate a plan, review it and request a separate launch approval.</div>
    <div className="modal-actions"><button className="button primary" disabled={busy}>{product ? 'Save product changes' : 'Add product'}</button></div>
  </form>;
}
