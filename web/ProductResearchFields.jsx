import React from 'react';
import { CampaignField } from './FieldHelp.jsx';
import { useLanguage } from './i18n.js';
import { calculateEconomics } from '../src/modules/pricing/engine.js';
import { mediaUrl } from './api.js';
import './product-research-fields.css';

export const productResearchGoals = [
  [
    'business-decision',
    'Is this product worth testing?',
    'এই প্রোডাক্ট নিয়ে ছোট test করা উচিত কি?',
  ],
  ['competitor-positioning', 'How can my product stand out?', 'প্রতিযোগীর থেকে আলাদা কীভাবে হব?'],
  ['pricing-profit', 'Check selling price and profit room', 'বিক্রয়মূল্য ও লাভের জায়গা যাচাই'],
  ['small-budget-test', 'Prepare a small-budget sales test', 'কম বাজেটে বিক্রির test পরিকল্পনা'],
];
const categories = [
  'Fashion & clothing',
  'Beauty & personal care',
  'Electronics & gadgets',
  'Home & kitchen',
  'Food & groceries',
  'Health & fitness',
  'Baby & kids',
  'Accessories',
  'Other',
];

export function ProductFacts({ product, onEdit }) {
  const bn = useLanguage() === 'bn';
  if (!product) return null;
  const economics = product.sellingPrice > 0 ? calculateEconomics(product) : null;
  const money = (value) =>
    Number.isFinite(value)
      ? `BDT ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : bn
        ? 'তথ্য নেই'
        : 'Not available';
  return (
    <section className="product-research-facts" aria-label="Saved product facts">
      <div className="product-research-facts-header">
        {product.mediaAssetId && <img src={mediaUrl(product.mediaAssetId)} alt={product.name} />}
        <div>
          <strong>{product.name}</strong>
          <small>
            {bn
              ? 'Products থেকে দাম, খরচ, stock ও ছবি ব্যবহার হবে; আবার দিতে হবে না।'
              : 'Prices, costs, inventory and images come from Products. No need to enter them again.'}
          </small>
        </div>
        {onEdit && (
          <button type="button" className="button secondary" onClick={() => onEdit(product)}>
            {bn ? 'প্রোডাক্টের তথ্য এডিট করুন' : 'Edit saved product'}
          </button>
        )}
      </div>
      <dl>
        <div>
          <dt>{bn ? 'আপনার বিক্রয়মূল্য' : 'Your selling price'}</dt>
          <dd>{money(product.sellingPrice)}</dd>
        </div>
        <div>
          <dt>{bn ? 'প্রতি বিক্রির হিসাব করা খরচ' : 'Calculated cost per sale'}</dt>
          <dd>
            {money(
              economics
                ? economics.baseVariableCost +
                    (economics.sellingPrice * product.costs.paymentPercent) / 100
                : null,
            )}
          </dd>
        </div>
        <div>
          <dt>
            {bn ? 'লাভ রেখে বিজ্ঞাপনের সর্বোচ্চ জায়গা' : 'Maximum ad cost after required profit'}
          </dt>
          <dd>{money(economics?.targetCPA)}</dd>
        </div>
        <div>
          <dt>{bn ? 'বর্তমান stock' : 'Current inventory'}</dt>
          <dd>{product.inventory}</dd>
        </div>
      </dl>
      <p className="small muted">
        {bn
          ? 'এটি আপনার দেওয়া খরচ ও return assumptions-এর হিসাব। বাস্তবে ad-এর খরচ, বিক্রির সংখ্যা বা লাভের পূর্বাভাস নয়।'
          : 'Calculated from your costs and return assumptions. This is not a forecast of ad cost, sales or profit.'}
      </p>
    </section>
  );
}

export function ProductResearchFields({
  brief,
  setBrief,
  products,
  projects,
  project,
  onOpenExisting,
  onEditProduct,
}) {
  const bn = useLanguage() === 'bn';
  const linked = products.find((p) => p.id === brief.productId);
  const existing = !project && linked ? projects.find((p) => p.productId === linked.id) : null;
  return (
    <div className="product-research-fields">
      <p className="notice">
        {bn
          ? 'এখানে physical product-এর ব্যবসার সম্ভাবনা যাচাই হবে: buyer need, বাস্তব competitor offer, দাম, delivery/COD risk এবং ছোট sales test। Digital service-এর জন্য Service research ব্যবহার করুন।'
          : 'Validate a physical product: buyer needs, actual competitor offers, pricing, delivery/COD risks and a small sales test. Use Service research for digital services.'}
      </p>
      <CampaignField
        label="Choose a saved product"
        help="Select a product to reuse its description, prices, costs, images and selected competitor ads. Choose a new idea if you have not added it to Products yet."
      >
        <select
          value={brief.productId || ''}
          onChange={(event) => {
            const product = products.find((p) => p.id === event.target.value);
            setBrief({
              ...brief,
              productId: product?.id || null,
              ...(product
                ? {
                    name: product.name,
                    description: product.description,
                    productCategory: product.category,
                    adLibraryIds: [
                      ...new Set([...(brief.adLibraryIds || []), ...(product.adLibraryIds || [])]),
                    ].slice(0, 12),
                  }
                : {}),
            });
          }}
        >
          <option value="">
            {bn
              ? 'নতুন প্রোডাক্টের আইডিয়া / এখনো Products-এ যোগ করিনি'
              : 'New product idea / not added to Products yet'}
          </option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
      </CampaignField>
      <ProductFacts product={linked} onEdit={onEditProduct} />
      {existing && (
        <div className="notice">
          <div>
            <strong>
              {bn ? 'এই প্রোডাক্টের রিসার্চ আগে থেকেই আছে' : 'This product already has research'}
            </strong>
            <p>
              {bn
                ? 'আগের brief, competitor evidence ও report history একই জায়গায় রাখুন। নতুন duplicate brief তৈরি করতে হবে না।'
                : 'Keep the existing brief, competitor evidence and report history together. Open it instead of creating a duplicate brief.'}
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => onOpenExisting(existing)}
            >
              {bn ? 'আগের product research খুলুন' : 'Open existing product research'}
            </button>
          </div>
        </div>
      )}
      <CampaignField
        label="Product name"
        help="The physical item you want to sell or investigate. Selecting a saved product fills this from your product profile."
      >
        <input
          required
          maxLength={200}
          value={brief.name}
          onChange={(e) => setBrief({ ...brief, name: e.target.value })}
          placeholder={
            bn
              ? 'যেমন: Bluetooth earbuds বা embroidered three-piece'
              : 'e.g. Bluetooth earbuds or embroidered three-piece'
          }
        />
      </CampaignField>
      <CampaignField
        label="Product category"
        help="Choose the category that best matches the physical item. You can also enter a custom category."
      >
        <input
          list="physical-product-categories"
          maxLength={150}
          value={brief.productCategory || linked?.category || ''}
          onChange={(e) => setBrief({ ...brief, productCategory: e.target.value })}
          placeholder="Choose or type a category"
        />
      </CampaignField>
      <datalist id="physical-product-categories">
        {[...new Set([...categories, ...products.map((p) => p.category)])].map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
      <CampaignField
        label="Product research goal"
        help="Choose the question this research should answer. This changes the research focus; it does not launch an ad."
      >
        <select
          value={brief.researchGoal || 'business-decision'}
          onChange={(e) => setBrief({ ...brief, researchGoal: e.target.value })}
        >
          {productResearchGoals.map(([value, en, bangla]) => (
            <option key={value} value={value}>
              {bn ? bangla : en}
            </option>
          ))}
        </select>
      </CampaignField>
      <CampaignField
        label="Product details and buyer benefit"
        help="Describe actual materials, sizes, features, use and benefits. Do not claim specifications that the supplier or your images cannot support."
      >
        <textarea
          required
          maxLength={4000}
          value={brief.description}
          onChange={(e) => setBrief({ ...brief, description: e.target.value })}
          placeholder={
            bn
              ? 'প্রোডাক্টের material, size, ব্যবহার, সুবিধা ও যা যাচাই করা বাকি তা লিখুন।'
              : 'Materials, size, real features, everyday use, benefits and specifications still needing verification.'
          }
        />
      </CampaignField>
      <CampaignField
        label="Likely product buyers"
        help="Describe a buyer group if you have evidence. You can leave this blank; research will investigate possible buyers and mark them as hypotheses."
        hint={
          bn
            ? 'জানা থাকলে লিখুন। না জানলে খালি রাখুন—রিসার্চে সম্ভাব্য ক্রেতা যাচাই হবে।'
            : 'Optional. Leave blank if unknown; research will investigate potential buyers.'
        }
      >
        <textarea
          maxLength={4000}
          value={brief.buyerProfile}
          onChange={(e) => setBrief({ ...brief, buyerProfile: e.target.value })}
          placeholder={
            linked
              ? bn
                ? `${linked.name} কারা কিনতে পারেন এবং কী প্রয়োজন যাচাই করা দরকার?`
                : `Who might buy ${linked.name}, and what buyer needs should we investigate?`
              : bn
                ? 'যেমন: বাংলাদেশে দৈনন্দিন ব্যবহারের জন্য সাশ্রয়ী earbuds খুঁজছেন এমন ক্রেতা।'
                : 'e.g. Bangladesh buyers looking for affordable earbuds for commuting and everyday calls.'
          }
        />
      </CampaignField>
    </div>
  );
}
