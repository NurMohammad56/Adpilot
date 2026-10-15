import React, { useState } from 'react';
import { useDraft } from './use-draft.js';
import { MediaPicker } from './MediaPicker.jsx';
import { calculateEconomics } from '../src/modules/pricing/engine.js';
import {
  autoProductCosts,
  productCostAssumptions,
} from '../src/modules/pricing/product-calculator.js';
import { CampaignField } from './FieldHelp.jsx';
import { useLanguage } from './i18n.js';
import { AdLibraryPicker } from './AdLibraryPicker.jsx';
import { ProductMediaGallery } from './ProductMediaGallery.jsx';

const categories = [
  'Fashion & clothing',
  'Beauty & personal care',
  'Home & kitchen',
  'Electronics & gadgets',
  'Food & beverages',
  'Health & fitness',
  'Baby & children',
  'Accessories',
  'Books & stationery',
  'Other',
];
const empty = {
  name: '',
  category: '',
  description: '',
  inventory: 0,
  sellingPrice: null,
  minProfit: 200,
  desiredMargin: 0.2,
  dailyBudgetCeiling: 300,
  testBudgetCeiling: 2100,
  landingUrl: '',
  imageUrl: '',
  paymentMethod: 'cod',
  condition: 'new',
  brand: '',
  gtin: '',
  mediaAssetIds: [],
  videoCreatives: [],
  costPlanning: {
    mode: 'automatic',
    returnRateSource: 'assumed',
    returnShippingCost: 0,
    courierCharge: 0,
    customerDeliveryCharge: 0,
    profitReserveRatio: 0.3,
    acknowledged: false,
  },
  costs: {
    product: 0,
    packaging: 0,
    delivery: 0,
    paymentFixed: 0,
    paymentPercent: 0,
    other: 0,
    returnRate: 0.1,
    returnCost: 0,
  },
};
const Field = ({ label, hint, children }) => (
  <CampaignField label={label} help={hint || label} hint={hint}>
    {children}
  </CampaignField>
);
export function GuidedProduct({ product, initialValues, data, api, busy, onSave }) {
  const [raw, setValue, clearDraft] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:product:${product?.id || initialValues?.draftId || 'new'}`,
    () =>
      product
        ? { ...structuredClone(product), condition: product.condition || 'new' }
        : {
            ...structuredClone(empty),
            ...Object.fromEntries(
              Object.entries(initialValues || {}).filter(([key]) =>
                ['name', 'category', 'description', 'adLibraryIds', 'sourceContext'].includes(key),
              ),
            ),
          },
  );
  const bn = useLanguage() === 'bn';
  const [customDelivery, setCustomDelivery] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [analysis, setAnalysis] = useState(null),
    [imageBusy, setImageBusy] = useState(false),
    [imageError, setImageError] = useState('');
  const analysisKey = JSON.stringify({
    name: raw.name,
    description: raw.description,
    category: raw.category,
    primary: raw.mediaAssetId,
    photos: raw.mediaAssetIds,
    bn,
  });
  const analysisContext = React.useRef(analysisKey);
  analysisContext.current = analysisKey;
  React.useEffect(() => {
    setAnalysis(null);
    setImageError('');
  }, [analysisKey]);
  const value = autoProductCosts({
    ...raw,
    ...(raw.sourceContext === undefined && initialValues?.sourceContext
      ? { sourceContext: initialValues.sourceContext }
      : {}),
  });
  const automatic = value.costPlanning?.mode === 'automatic';
  const planning = (changes) =>
    setValue({
      ...raw,
      costPlanning: {
        mode: 'manual',
        returnRateSource: 'measured',
        returnShippingCost: 0,
        profitReserveRatio: 0.3,
        acknowledged: false,
        ...raw.costPlanning,
        ...changes,
      },
    });
  const category = categories.includes(value.category)
    ? value.category
    : value.category
      ? 'Other'
      : '';
  const update = (key, next) => setValue({ ...value, [key]: next });
  const numeric = (key, label, hint, percent = false, optional = false) => (
    <Field label={label} hint={hint}>
      <input
        type="number"
        min="0"
        step={key === 'inventory' ? '1' : 'any'}
        max={percent ? 80 : undefined}
        required={!optional}
        value={
          value[key] == null ? '' : percent ? Math.round(value[key] * 10000) / 100 : value[key]
        }
        onChange={(event) =>
          update(
            key,
            event.target.value === '' ? null : Number(event.target.value) / (percent ? 100 : 1),
          )
        }
      />
    </Field>
  );
  const valid =
    Object.values(value.costs).every((number) => Number.isFinite(number) && number >= 0) &&
    value.costs.returnRate <= 0.8 &&
    value.costs.paymentPercent <= 20 &&
    value.desiredMargin >= 0 &&
    value.desiredMargin <= 0.8;
  const economics =
    valid && (value.sellingPrice !== null || !automatic) ? calculateEconomics(value) : null;
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        if (mediaUploading) return;
        const { id, businessId, createdBy, revision, createdAt, updatedAt, ...payload } = value;
        const saved = await onSave(payload);
        if (saved) clearDraft();
      }}
    >
      {value.sourceContext && (
        <section className="product-source-context">
          <strong>Connected product source</strong>
          <p>
            {initialValues?.sourceLabel ||
              {
                research: 'Product research',
                discovery: 'Discovery ideas',
                'ad-library': 'Saved competitor ads',
              }[value.sourceContext.kind]}
          </p>
          <p>
            Keep the source as research context. Confirm your own product details below. Research
            approval does not approve this product or its new campaign.
          </p>
          <button
            type="button"
            className="button secondary"
            onClick={() => update('sourceContext', null)}
          >
            Detach source reference
          </button>
        </section>
      )}
      <p className="draft-note">
        Your unfinished form is saved in this browser tab for this workspace. Actual costs must come
        from your business; examples are not market prices.
      </p>
      <h3 className="form-section">1. Product and delivery</h3>
      <div className="form-grid">
        <Field label="Product name">
          <input
            required
            value={value.name}
            onChange={(event) => update('name', event.target.value)}
            placeholder="What do you sell?"
          />
        </Field>
        <Field label="Category / niche">
          <select
            required
            value={category}
            onChange={(event) => update('category', event.target.value)}
          >
            <option value="">Choose a product category</option>
            {categories.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </Field>
        {category === 'Other' && (
          <Field label="Your custom category">
            <input
              required
              value={value.category === 'Other' ? '' : value.category}
              onChange={(event) => update('category', event.target.value || 'Other')}
              placeholder="Enter your own category"
            />
          </Field>
        )}
        <Field
          label="Description"
          hint="Describe actual materials, features and use cases. Avoid claims you cannot verify."
        >
          <textarea
            required
            minLength={10}
            value={value.description}
            onChange={(event) => update('description', event.target.value)}
          />
        </Field>
        {numeric('inventory', 'Available inventory', 'How many units are actually ready to sell?')}
        <Field
          label="Product condition"
          hint="Choose the actual item condition. Catalogue imports use this value."
        >
          <select
            value={value.condition || 'new'}
            onChange={(e) => update('condition', e.target.value)}
          >
            <option value="new">New</option>
            <option value="used">Used</option>
            <option value="refurbished">Refurbished</option>
          </select>
        </Field>
        <Field label="Payment method">
          <select
            value={value.paymentMethod || 'mixed'}
            onChange={(event) => update('paymentMethod', event.target.value)}
          >
            <option value="cod">Cash on delivery (COD)</option>
            <option value="prepaid">Online / prepaid</option>
            <option value="mixed">COD and online payment</option>
          </select>
        </Field>
        <Field
          label="Delivery coverage"
          hint="Targeting must stay inside both your product coverage and workspace delivery policy."
        >
          <select
            value={value.deliveryRegions?.[0] || ''}
            onChange={(event) =>
              update('deliveryRegions', event.target.value ? [event.target.value] : undefined)
            }
          >
            <option value="">Use workspace delivery coverage</option>
            {data.business.deliveryRegions.map((region) => (
              <option value={region} key={region}>
                {region}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <details className="guide-step">
        <summary>Optional supplier identifiers</summary>
        <div className="form-grid">
          <Field
            label="Brand (if confirmed)"
            hint="Use the genuine manufacturer brand only when confirmed by your supplier."
          >
            <input
              value={value.brand || ''}
              maxLength={100}
              onChange={(e) => update('brand', e.target.value)}
            />
          </Field>
          <Field
            label="GTIN / barcode (if available)"
            hint="Enter the manufacturer's real 8, 12, 13 or 14 digit barcode. Do not invent one."
          >
            <input
              value={value.gtin || ''}
              inputMode="numeric"
              pattern="([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})?"
              onChange={(e) => update('gtin', e.target.value)}
            />
          </Field>
        </div>
      </details>
      <h3 className="form-section">2. Real costs per delivered order · BDT</h3>
      <Field
        label="Calculation mode"
        hint="Automatic mode calculates failed-order loss and a profit reserve from your real costs. Manual mode keeps your own figures."
      >
        <select
          value={automatic ? 'automatic' : 'manual'}
          onChange={(e) =>
            planning({
              mode: e.target.value,
              returnRateSource: e.target.value === 'manual' ? 'measured' : 'assumed',
              acknowledged: false,
            })
          }
        >
          <option value="automatic">Automatic - fewer fields</option>
          <option value="manual">Manual - my own calculations</option>
        </select>
      </Field>
      {automatic && (
        <div className="notice">
          <p>
            {bn
              ? 'আপনি শুধু প্রকৃত বিক্রির দাম ও খরচ দিন। লাভের লক্ষ্য ও return loss হিসাব হবে। Return rate একটি পরিবর্তনযোগ্য অনুমান-ছবি বা দাম থেকে এটি জানা যায় না।'
              : 'Enter actual selling price and costs. Profit goals and return loss are calculated. Return rate is an editable assumption; it cannot be known from a picture or a price.'}
          </p>
        </div>
      )}
      {automatic && (
        <div className="form-grid">
          {numeric(
            'sellingPrice',
            'Actual selling price',
            'Enter the product price without the customer delivery charge. Required for automatic calculations.',
            false,
            false,
          )}
          <Field
            label="Profit reserve"
            hint="Keep this share of the amount left after product, delivery, packaging, fees and failed-order costs. The rest is the maximum ad cost per purchase, not guaranteed results."
          >
            <select
              value={value.costPlanning.profitReserveRatio}
              onChange={(e) =>
                planning({ profitReserveRatio: Number(e.target.value), acknowledged: false })
              }
            >
              <option value="0.2">20% of contribution - more room for testing</option>
              <option value="0.3">30% of contribution - balanced starting assumption</option>
              <option value="0.5">50% of contribution - keep more profit</option>
            </select>
          </Field>
        </div>
      )}
      {automatic && (
        <Field
          label="Delivery fee preset"
          hint="Your delivery presets: inside Dhaka 80 BDT, outside Dhaka 120 BDT. This fills the courier cost, not the customer fee or ad targeting. Choose custom to enter another amount."
        >
          <select
            value={
              customDelivery
                ? 'custom'
                : value.costPlanning.courierCharge === 80
                  ? 'dhaka'
                  : value.costPlanning.courierCharge === 120
                    ? 'outside'
                    : 'custom'
            }
            onChange={(e) => {
              if (e.target.value !== 'custom') {
                setCustomDelivery(false);
                const charge = e.target.value === 'dhaka' ? 80 : 120;
                planning({
                  courierCharge: charge,
                  customerDeliveryCharge: Math.min(
                    value.costPlanning.customerDeliveryCharge || 0,
                    charge,
                  ),
                  acknowledged: false,
                });
              } else setCustomDelivery(true);
            }}
          >
            <option value="custom">Custom delivery charge</option>
            <option value="dhaka">Inside Dhaka - 80 BDT</option>
            <option value="outside">Outside Dhaka - 120 BDT</option>
          </select>
        </Field>
      )}
      <div className="form-grid">
        {[
          ['product', 'Product cost', 'Your purchase or manufacturing cost per unit.'],
          ['packaging', 'Packaging', 'Actual box, wrapping and packing cost.'],
          [
            'delivery',
            automatic ? 'Courier delivery charge' : 'Delivery / shipping',
            automatic
              ? 'The full outward charge the courier takes. Enter the customer delivery charge separately; the system subtracts it on successful orders.'
              : 'The shipping cost your business pays, after any customer delivery charge.',
          ],
          [
            'paymentFixed',
            'Fixed COD / payment fee',
            'Fixed courier collection or payment-processing charge.',
          ],
          ['paymentPercent', 'Payment fee (%)', 'Percentage processing charge. Enter 1 for 1%.'],
          ['other', 'Other variable costs', 'Other real per-order costs; use 0 when none apply.'],
          [
            'returnRate',
            'Expected failed / returned orders (%)',
            'Enter 10 for 10%. Use your measured cancellation and failed-delivery rate.',
          ],
          [
            'returnCost',
            'Loss per failed / returned order',
            'Net loss on a failed order, including return shipping; do not enter the sale price.',
          ],
        ]
          .filter(([key]) => !automatic || ['product', 'packaging', 'delivery'].includes(key))
          .map(([key, label, hint]) => (
            <Field key={key} label={label} hint={hint}>
              <input
                type="number"
                step="any"
                min="0"
                max={key === 'returnRate' ? 80 : key === 'paymentPercent' ? 20 : undefined}
                required
                value={
                  automatic && key === 'delivery'
                    ? (value.costPlanning.courierCharge ?? value.costs.delivery)
                    : value.costs[key] == null
                      ? ''
                      : key === 'returnRate'
                        ? Math.round(value.costs[key] * 10000) / 100
                        : value.costs[key]
                }
                onChange={(event) =>
                  automatic && key === 'delivery'
                    ? (setCustomDelivery(true),
                      planning({ courierCharge: Number(event.target.value), acknowledged: false }))
                    : setValue({
                        ...value,
                        costs: {
                          ...value.costs,
                          [key]:
                            event.target.value === ''
                              ? null
                              : Number(event.target.value) / (key === 'returnRate' ? 100 : 1),
                        },
                      })
                }
              />
            </Field>
          ))}
      </div>
      {automatic && (
        <>
          <Field
            label="Delivery charge collected from customer"
            hint="Enter the delivery fee you collect on a completed order. Use 0 for free delivery. Automatic mode supports charges up to the actual courier charge; keep extra delivery income separate."
          >
            <input
              type="number"
              min="0"
              max={value.costPlanning.courierCharge ?? value.costs.delivery}
              required
              step="any"
              value={value.costPlanning.customerDeliveryCharge || 0}
              onChange={(e) =>
                planning({ customerDeliveryCharge: Number(e.target.value), acknowledged: false })
              }
            />
          </Field>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              planning({
                customerDeliveryCharge: value.costPlanning.courierCharge ?? value.costs.delivery,
                acknowledged: false,
              })
            }
          >
            Collect the same delivery fee from customer
          </button>
        </>
      )}
      {automatic && (
        <details className="guide-step">
          <summary>Advanced fees and return assumptions</summary>
          <div className="form-grid">
            {['paymentFixed', 'paymentPercent', 'other'].map((key) => (
              <Field
                key={key}
                label={
                  {
                    paymentFixed: 'Fixed COD / payment fee',
                    paymentPercent: 'Payment fee (%)',
                    other: 'Other variable costs',
                  }[key]
                }
                hint="Enter your provider's actual fee; 0 means none. No market fee is assumed."
              >
                <input
                  type="number"
                  min="0"
                  max={key === 'paymentPercent' ? 20 : undefined}
                  step="any"
                  required
                  value={value.costs[key] ?? ''}
                  onChange={(e) =>
                    setValue({
                      ...raw,
                      costs: {
                        ...value.costs,
                        [key]: e.target.value === '' ? null : Number(e.target.value),
                      },
                    })
                  }
                />
              </Field>
            ))}
            <Field
              label="Return rate source"
              hint="Use measured history if you have it. Otherwise the displayed rate is only a test assumption."
            >
              <select
                value={value.costPlanning.returnRateSource}
                onChange={(e) =>
                  planning({ returnRateSource: e.target.value, acknowledged: false })
                }
              >
                <option value="assumed">Planning assumption - not measured</option>
                <option value="measured">My measured failed-order rate</option>
              </select>
            </Field>
            <Field
              label="Expected failed / returned orders (%)"
              hint="This is how many orders fail out of every 100. Automatic default: COD/mixed 10%, prepaid 5%. These are examples, not verified benchmarks."
            >
              <input
                type="number"
                min="0"
                max="80"
                step="any"
                required
                readOnly={value.costPlanning.returnRateSource === 'assumed'}
                value={Math.round(value.costs.returnRate * 10000) / 100}
                onChange={(e) =>
                  setValue({
                    ...raw,
                    costs: { ...value.costs, returnRate: Number(e.target.value) / 100 },
                  })
                }
              />
            </Field>
            <Field
              label="Return shipping cost"
              hint="The extra charge your courier takes to return an unsuccessful delivery. Use its actual tariff; use 0 only if no extra charge applies."
            >
              <input
                type="number"
                min="0"
                required
                step="any"
                value={value.costPlanning.returnShippingCost}
                onChange={(e) =>
                  planning({ returnShippingCost: Number(e.target.value), acknowledged: false })
                }
              />
            </Field>
            <Field
              label="Loss per failed / returned order"
              hint="Automatically: packaging + full courier delivery charge + extra return shipping. The customer delivery fee is not collected on a failed order. Assumes the product comes back reusable. For damaged products use manual mode."
            >
              <input type="number" value={value.costs.returnCost} readOnly />
            </Field>
          </div>
        </details>
      )}
      <h3 className="form-section">3. Price, profit and spending limits</h3>
      <div className="form-grid">
        {!automatic &&
          numeric(
            'sellingPrice',
            'Current selling price (optional)',
            'Leave empty for an economics-based recommendation.',
            false,
            true,
          )}
        {!automatic &&
          numeric(
            'minProfit',
            'Minimum profit per delivered order',
            'Your required profit after costs and advertising.',
          )}
        {!automatic &&
          numeric(
            'desiredMargin',
            'Desired profit margin (%)',
            'Enter 20 for 20%. The engine also respects your minimum profit.',
            true,
          )}
        {numeric(
          'dailyBudgetCeiling',
          'Maximum configured daily budget',
          'This is a planning ceiling, not a guaranteed exact daily charge.',
        )}
        {numeric(
          'testBudgetCeiling',
          'Maximum total test budget',
          'Maximum budget allocated to this product test.',
        )}
        <Field
          label="Product / landing page URL"
          hint="Use an HTTPS page showing the same product and price."
        >
          <input
            type="url"
            value={value.landingUrl}
            onChange={(event) => update('landingUrl', event.target.value)}
            placeholder="https://your-store.com/product"
          />
        </Field>
      </div>
      {economics && (
        <div className="cost-preview">
          <h3>Live economics preview</h3>
          <dl>
            <dt>Expected failed-delivery loss per delivered order</dt>
            <dd>{economics.expectedReturnCost.toFixed(2)} BDT</dd>
            <dt>Total variable cost</dt>
            <dd>{economics.baseVariableCost.toFixed(2)} BDT</dd>
            <dt>Allowable advertising cost per purchase</dt>
            <dd>{economics.targetCPA.toFixed(2)} BDT</dd>
            <dt>Profit reserved per delivered order</dt>
            <dd>{economics.minimumProfit.toFixed(2)} BDT</dd>
            <dt>Profit margin at the allowable ad cost</dt>
            <dd>
              {economics.sellingPrice > 0
                ? ((100 * economics.contributionAtTargetCPA) / economics.sellingPrice).toFixed(2)
                : '0'}
              %
            </dd>
          </dl>
          <p>
            {bn
              ? 'মার্জিন = লাভ ÷ বিক্রির দাম × ১০০। যেমন ১,০০০ টাকায় বিক্রি করে ২০০ টাকা থাকলে মার্জিন ২০%। এখানে দেখানো লাভ হিসাবের লক্ষ্য; বাস্তব ad cost ও return rate বদলালে লাভও বদলাবে।'
              : 'Margin = profit ÷ selling price × 100. Selling for 1,000 with 200 left means a 20% margin. This is a planning goal; actual ad costs and failed deliveries change your profit.'}
          </p>
          <p>
            {economics.viable
              ? 'Economics leave room for an advertising test. Actual market CPA still needs measurement.'
              : 'The current price, costs or inventory cannot support a profitable advertising test.'}
          </p>
        </div>
      )}
      <h3 className="form-section">4. Creative media</h3>
      <MediaPicker
        api={api}
        value={value.mediaAssetId}
        thumbnail={value.thumbnailAssetId}
        onChange={(mediaAssetId, thumbnailAssetId) =>
          setValue({ ...value, mediaAssetId, thumbnailAssetId })
        }
      />
      <ProductMediaGallery
        value={value}
        setValue={setValue}
        api={api}
        busy={busy}
        onUploading={setMediaUploading}
      />
      <button
        type="button"
        className="button secondary"
        disabled={busy || imageBusy || (!value.mediaAssetId && !value.mediaAssetIds?.length)}
        onClick={async () => {
          setImageBusy(true);
          setImageError('');
          try {
            const assets = await api('/media');
            const imageIds = [
              ...new Set([value.mediaAssetId, ...(value.mediaAssetIds || [])].filter(Boolean)),
            ].filter((id) => assets.some((asset) => asset.id === id && asset.type === 'image'));
            if (!imageIds.length)
              throw new Error(
                'Choose at least one product photo. Videos are not analyzed as images.',
              );
            const result = await api('/products/image-analysis', 'POST', {
              mediaAssetIds: imageIds,
              name: value.name,
              description: value.description,
              category: value.category,
            });
            if (analysisContext.current === analysisKey) setAnalysis(result);
            else
              setImageError(
                bn
                  ? 'Product-এর তথ্য বদলেছে। নতুন তথ্য দিয়ে ছবি বিশ্লেষণ করুন।'
                  : 'Product details changed. Analyze the images again with the new facts.',
              );
          } catch (e) {
            setImageError(e.message);
          } finally {
            setImageBusy(false);
          }
        }}
      >
        {imageBusy
          ? bn
            ? 'ছবি বিশ্লেষণ হচ্ছে…'
            : 'Analyzing images…'
          : bn
            ? 'AI দিয়ে product-এর ছবি দেখুন'
            : 'Analyze product images with AI'}
      </button>
      <p>
        {bn
          ? 'Uploaded ছবির actual content AI দেখবে। Brand, material, quality বা দাম ছবির ভিত্তিতে নিশ্চিত করা যায় না। Draft description ব্যবহার করার আগে মিলিয়ে নিন।'
          : 'AI reads the actual uploaded images. A picture does not prove brand authenticity, material, quality or price. Check the draft description before using it.'}
      </p>
      {imageError && (
        <p className="notice danger" role="alert">
          {imageError}
        </p>
      )}
      {analysis && (
        <article className="cost-preview">
          <h3>{bn ? 'ছবি থেকে যা দেখা গেছে' : 'Visual analysis'}</h3>
          <ul>
            {analysis.report.observations.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p>{analysis.report.suggestedDescription}</p>
          <h4>{bn ? 'যা নিশ্চিত করতে হবে' : 'Needs confirmation'}</h4>
          <ul>
            {[...analysis.report.uncertainClaims, ...analysis.report.discrepancies].map(
              (item, i) => (
                <li key={i}>{item}</li>
              ),
            )}
          </ul>
          <button
            type="button"
            className="button secondary"
            onClick={() =>
              setValue({
                ...value,
                name: value.name || analysis.report.suggestedName,
                description: analysis.report.suggestedDescription,
              })
            }
          >
            {bn ? 'Description draft ব্যবহার করুন' : 'Use description draft'}
          </button>
        </article>
      )}
      <Field
        label="Creative image URL (HTTPS)"
        hint="Optional alternative when you are not using an uploaded file."
      >
        <input
          type="url"
          value={value.imageUrl}
          onChange={(event) => update('imageUrl', event.target.value)}
        />
      </Field>
      <div className="notice">
        Saving a product does not launch an ad. Generate a plan, review it and request a separate
        launch approval.
      </div>
      <AdLibraryPicker
        businessId={data.business.id}
        productId={product?.id}
        selected={value.adLibraryIds || []}
        onChange={(adLibraryIds) => update('adLibraryIds', adLibraryIds)}
        busy={busy}
      />
      {value.costPlanning && (
        <label className="checkbox-row">
          <input
            type="checkbox"
            required
            checked={value.costPlanning.acknowledged}
            onChange={(e) => planning({ acknowledged: e.target.checked })}
          />
          {bn
            ? 'আমি খরচ ও অনুমানগুলো যাচাই করেছি। Actual fee/return shipping এবং damaged product-এর ক্ষতি সঠিকভাবে যোগ করব।'
            : 'I reviewed the costs and assumptions. I will include actual fees, return shipping and losses from damaged products.'}
        </label>
      )}
      <div className="modal-actions">
        <button className="button primary" disabled={busy || mediaUploading}>
          {product ? 'Save product changes' : 'Add product'}
        </button>
      </div>
    </form>
  );
}
