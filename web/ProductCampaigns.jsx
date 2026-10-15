import React, { useState, useEffect } from 'react';
import { CampaignField } from './FieldHelp.jsx';
import { useLanguage } from './i18n.js';
import { mediaUrl } from './api.js';
import { useDraft } from './use-draft.js';
import { CarouselProductPicker } from './CarouselProductPicker.jsx';
const suggestCollectionName = (products) => {
  if (!products.length) return '';
  const names = [...new Set(products.map((product) => product.name.trim()).filter(Boolean))];
  const categories = [
    ...new Set(products.map((product) => product.category?.trim()).filter(Boolean)),
  ];
  const context = names
    .slice(0, 2)
    .map((name) => (name.length > 60 ? name.slice(0, 57) + '…' : name))
    .join(' + ');
  const remaining = products.length > 2 ? ` + ${products.length - 2} more` : '';
  const category =
    products.length > 2 && categories.length === 1 ? `${categories[0].slice(0, 35)} · ` : '';
  return `${category}${context}${remaining} · BD carousel`.slice(0, 200);
};
export function CarouselCards({ cards, copy }) {
  const bn = useLanguage() === 'bn';
  return (
    <div className="product-carousel" aria-label="Product carousel cards">
      {cards.map((card, i) => (
        <article key={card.productId} className="carousel-product">
          {card.mediaAssetId ? (
            <img src={mediaUrl(card.mediaAssetId)} alt={card.name} loading="lazy" />
          ) : card.imageUrl ? (
            <img src={card.imageUrl} alt={card.name} loading="lazy" />
          ) : null}
          <h4>
            {i + 1}. {card.headline}
          </h4>
          <p>{card.description}</p>
          <a href={card.link} target="_blank" rel="noreferrer">
            {bn ? 'Product page খুলুন' : 'Open product page'}
          </a>
          {copy &&
            [
              ['Card headline', card.headline],
              ['Card description', card.description],
              ['Card product URL', card.link],
            ].map(([label, value]) => (
              <button
                key={label}
                type="button"
                className="button secondary"
                onClick={() => copy(value)}
              >
                {label} · {bn ? 'কপি' : 'Copy'}
              </button>
            ))}
          {copy && card.mediaAssetId && (
            <a
              className="button secondary"
              href={mediaUrl(card.mediaAssetId)}
              download
              target="_blank"
              rel="noreferrer"
            >
              {bn ? 'Card-এর ছবি download' : 'Download card image'}
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
export function ProductCampaigns({ data, api, busy, onCreated, run, showProduct }) {
  const bn = useLanguage() === 'bn',
    l = (en, bangla) => (bn ? bangla : en);
  const [draft, setDraft] = useDraft(`adpilot-carousel:${data.business.id}:${data.user.id}`, {
    mode: 'single',
    ids: [],
    name: '',
    url: '',
    daily: 300,
    days: 7,
    cardImages: {},
    nameMode: 'auto',
  });
  const { mode, ids, name, url, daily, days, cardImages = {} } = draft;
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const setMode = (value) => update('mode', value),
    setIds = (value) => update('ids', value),
    setName = (value) => setDraft((current) => ({ ...current, name: value, nameMode: 'custom' })),
    setUrl = (value) => update('url', value),
    setDaily = (value) => update('daily', value),
    setDays = (value) => update('days', value);
  const [catalog, setCatalog] = useState(null);
  const selectedProducts = ids.map((id) =>
    (catalog?.products || data.products).find((product) => product.id === id),
  );
  const suggestedName = selectedProducts.every(Boolean)
    ? suggestCollectionName(selectedProducts)
    : '';
  useEffect(() => {
    if (mode !== 'carousel' || !suggestedName) return;
    setDraft((current) => {
      // Older saved drafts with an entered name are also treated as intentional names.
      if (current.nameMode === 'custom' || (!current.nameMode && current.name?.trim()))
        return current;
      return current.name === suggestedName && current.nameMode === 'auto'
        ? current
        : { ...current, name: suggestedName, nameMode: 'auto' };
    });
  }, [mode, suggestedName, draft.nameMode]);
  const [selectionMessage, setSelectionMessage] = useState('');
  const saved = (product) => {
    setDraft((current) => ({
      ...current,
      ids: [...new Set([...current.ids, product.id])].slice(0, 10),
    }));
    setSelectionMessage(
      'Product saved and selected for your carousel. Your collection details and earlier selections are kept.',
    );
  };
  const incomplete =
    mode === 'carousel'
      ? ids.filter(
          (id) =>
            !catalog?.products.some(
              (product) =>
                product.id === id &&
                !product.carouselMissing.length &&
                (cardImages[id] === undefined ||
                  product.carouselImages?.some(
                    (image) => (image.mediaAssetId || 'url') === cardImages[id],
                  )),
            ),
        )
      : [];
  const [jobs, setJobs] = useState([]),
    [jobError, setJobError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api('/jobs/product-groups')
        .then((rows) => {
          if (active) {
            setJobs(rows);
            setJobError('');
          }
        })
        .catch((error) => {
          if (active) setJobError(error.message);
        });
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api, data.business.id]);
  return (
    <article className="panel tools-panel product-campaign-builder">
      <h2>{l('Choose how to advertise products', 'Product-এর বিজ্ঞাপন কীভাবে দেখাবেন?')}</h2>
      <div className="launch-mode-options">
        {[
          ['single', 'One product', 'একটি product'],
          ['carousel', 'Several products - swipe cards', 'একাধিক product-swipe করা cards'],
          ['catalog', 'Catalogue / dynamic ads guide', 'Catalogue / dynamic ads guide'],
        ].map(([key, en, bangla]) => (
          <label key={key} className={`launch-mode-option ${mode === key ? 'selected' : ''}`}>
            <input
              type="radio"
              name="product-ad-format"
              value={key}
              checked={mode === key}
              onChange={() => setMode(key)}
            />
            <strong>{l(en, bangla)}</strong>
          </label>
        ))}
      </div>
      {mode === 'single' && (
        <p>
          {l(
            'Use Generate campaign plan on a product below. Its uploaded images are analyzed before research.',
            'নিচে একটি product-এর Generate campaign plan চাপুন। Research-এর আগে uploaded ছবির actual analysis হবে।',
          )}
        </p>
      )}
      {mode !== 'single' && (
        <>
          <p>
            {mode === 'carousel'
              ? l(
                  'Select two to ten related products. One ad contains their image cards; every card opens its own product page. One shared budget, not a budget for every card.',
                  'সম্পর্কিত ২–১০টি product বাছুন। একটি ad-এ প্রতিটির image card থাকবে এবং নিজস্ব product page খুলবে। সব cards একই budget ব্যবহার করবে।',
                )
              : l(
                  'Dynamic ads use a Meta catalogue and matched website events. They are different from a manually arranged carousel. Prepare a product feed below; Meta catalogue, policy and tracking setup remain required.',
                  'Dynamic ad-এর জন্য Meta catalogue ও website-এর matched event প্রয়োজন। এটি manual carousel থেকে আলাদা। নিচে product feed তৈরি করুন; Meta catalogue, policy ও tracking setup লাগবে।',
                )}
          </p>
          {mode === 'carousel' ? (
            <>
              {selectionMessage && (
                <p role="status" className="notice">
                  {selectionMessage}
                </p>
              )}
              <CarouselProductPicker
                data={data}
                api={api}
                selected={ids}
                onSelect={setIds}
                cardImages={cardImages}
                onImageSelect={(productId, imageId) =>
                  update('cardImages', { ...cardImages, [productId]: imageId })
                }
                onCatalog={setCatalog}
                busy={busy}
                onAdd={(initial) =>
                  showProduct(
                    null,
                    { ...initial, draftId: initial?.draftId || `carousel-new-${data.business.id}` },
                    saved,
                  )
                }
                onEdit={(product) => showProduct(product, null, saved)}
              />
              {catalog && incomplete.length > 0 && (
                <p role="alert">
                  Complete or remove the selected products with missing information before preparing
                  the carousel plan.
                </p>
              )}
            </>
          ) : (
            <div className="product-selection">
              {data.products.map((p) => (
                <label key={p.id} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={ids.includes(p.id)}
                    disabled={!ids.includes(p.id) && ids.length >= 10}
                    onChange={(e) =>
                      setIds(e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))
                    }
                  />
                  <span>
                    <strong>{p.name}</strong> · {p.sellingPrice ?? 'Price needed'} BDT ·{' '}
                    {p.inventory} {l('in stock', 'stock-এ')}
                  </span>
                </label>
              ))}
            </div>
          )}
          {mode === 'carousel' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (busy || !catalog || ids.length < 2 || incomplete.length > 0) return;
                run(async () => {
                  const result = await api('/product-groups/plans', 'POST', {
                    productIds: ids,
                    cardImages: ids
                      .filter((id) => cardImages[id] !== undefined)
                      .map((productId) => ({
                        productId,
                        mediaAssetId:
                          cardImages[productId] === 'url' ? null : cardImages[productId],
                      })),
                    name,
                    landingUrl: url,
                    dailyBudget: Number(daily),
                    durationDays: Number(days),
                  });
                  if (result.type === 'product-group-plan')
                    setJobs((current) => [
                      result,
                      ...current.filter((job) => job.id !== result.id),
                    ]);
                  else await onCreated(result);
                }, 'Your request is saved. Live research runs in the background; completed plans appear below.');
              }}
            >
              <div className="form-grid">
                <div className="collection-name-field">
                  <CampaignField
                    label={l('Collection campaign name', 'Collection campaign-এর নাম')}
                    help={l(
                      'A name to recognize this group. Products are sold separately; a group does not create a discounted bundle.',
                      'Group চিনতে একটি নাম দিন। Product আলাদা বিক্রি হবে; group বানালেই discount বা bundle হয় না।',
                    )}
                  >
                    <input
                      required
                      minLength={2}
                      maxLength={200}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </CampaignField>
                  {suggestedName && (
                    <div className="notice collection-name-suggestion">
                      <strong>{l('Suggested campaign name', 'প্রস্তাবিত campaign name')}</strong>
                      <p>{suggestedName}</p>
                      <p>
                        {l(
                          'Based on your selected products and category. Uses no AI tokens. Your edited name stays unchanged.',
                          'নির্বাচিত product ও category থেকে সাজেস্ট করা হয়েছে। AI token লাগে না। নিজের দেওয়া নাম অপরিবর্তিত থাকবে।',
                        )}
                      </p>
                      {name !== suggestedName || draft.nameMode === 'custom' ? (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={busy}
                          onClick={() =>
                            setDraft((current) => ({
                              ...current,
                              name: suggestedName,
                              nameMode: 'auto',
                            }))
                          }
                        >
                          {l('Use suggested name', 'প্রস্তাবিত নাম ব্যবহার করুন')}
                        </button>
                      ) : (
                        <small>
                          {l(
                            'Updates with your product selection until you edit it.',
                            'নিজে edit করার আগ পর্যন্ত product selection অনুযায়ী নাম বদলাবে।',
                          )}
                        </small>
                      )}
                    </div>
                  )}
                </div>
                <CampaignField
                  label={l('Collection / shop page URL', 'Collection / shop page URL')}
                  help={l(
                    'The public HTTPS page showing these products. Each card uses the individual saved product page.',
                    'এসব product দেখা যায় এমন public HTTPS page। প্রতিটি card-এ saved individual product page থাকবে।',
                  )}
                >
                  <input
                    type="url"
                    required
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-store.com/collection"
                  />
                </CampaignField>
                <CampaignField
                  label={l(
                    'Shared daily planning budget (BDT)',
                    'Shared দৈনিক পরিকল্পিত budget (BDT)',
                  )}
                  help={l(
                    'One total budget for all cards. It must respect every selected product and workspace limit. The actual Meta minimum can vary.',
                    'সব cards-এর জন্য একটি budget। Product ও workspace limit মানতে হবে। Meta-এর minimum ভিন্ন হতে পারে।',
                  )}
                >
                  <input
                    type="number"
                    required
                    min="1"
                    step="0.01"
                    value={daily}
                    onChange={(e) => setDaily(e.target.value)}
                  />
                </CampaignField>
                <CampaignField
                  label={l('Test days', 'Test কত দিন?')}
                  help={l(
                    'Use a future start and end in the guide. Total budget is daily planning amount × days.',
                    'Guide-এ future start ও end দিন। মোট budget = দৈনিক পরিকল্পিত amount × দিন।',
                  )}
                >
                  <input
                    type="number"
                    required
                    min="1"
                    max="30"
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  />
                </CampaignField>
              </div>
              <p className="notice">
                {l('Total shared lifetime budget', 'মোট shared lifetime budget')}:{' '}
                {(Number(daily) * Number(days)).toFixed(2)} BDT ·{' '}
                {l(
                  'Tax/fees extra. Preparing a plan does not spend on Meta ads; AI provider usage may be billed.',
                  'Tax/fee অতিরিক্ত। Plan তৈরি করলে Meta ad spend হবে না; AI provider-এর usage charge হতে পারে।',
                )}
              </p>
              <button
                className="button primary"
                disabled={busy || ids.length < 2 || !catalog || incomplete.length > 0}
              >
                {l('Research & prepare carousel plan', 'Research করে carousel plan তৈরি করুন')}
              </button>
            </form>
          )}
          {mode === 'catalog' && (
            <CatalogueSetup ids={ids} api={api} busy={busy} run={run} bn={bn} />
          )}
        </>
      )}
      {jobError && <p role="alert">{jobError}</p>}
      {jobs.length > 0 && (
        <div className="group-jobs">
          <h3>{l('Product group research requests', 'Product group-এর research request')}</h3>
          <p>
            {l(
              'You can leave this page. Research continues in the background. Open the completed result to review and approve.',
              'এই page থেকে বের হতে পারেন। Research background-এ চলবে। শেষ হলে ফল খুলে review ও approve করুন।',
            )}
          </p>
          {jobs.map((job) => (
            <div key={job.id} className="notice">
              <span>
                {l('Research request', 'Research request')} ·{' '}
                {job.createdAt.slice(0, 16).replace('T', ' ')} ·{' '}
                {job.status === 'completed'
                  ? l('Ready to review', 'Review করার জন্য প্রস্তুত')
                  : job.status === 'failed'
                    ? l('Failed', 'ব্যর্থ')
                    : l('In progress', 'কাজ চলছে')}
                {job.errorMessage && <p role="alert">{job.errorMessage}</p>}
              </span>
              {job.status === 'completed' && job.planId && (
                <button
                  type="button"
                  disabled={busy}
                  className="button secondary"
                  onClick={() => run(async () => onCreated(await api(`/plans/${job.planId}`)), '')}
                >
                  {l('Open carousel plan', 'Carousel plan খুলুন')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
function CatalogueSetup({ ids, api, busy, run, bn }) {
  const [feeds, setFeeds] = useState([]),
    [share, setShare] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api('/catalog-feeds')
      .then((rows) => {
        if (active) setFeeds(rows.filter((row) => row.status === 'active'));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [api]);
  return (
    <div className="catalog-setup">
      <ol>
        <li>
          {bn
            ? 'সঠিক দাম, stock, product page এবং আসল ছবি দিয়ে product save করুন।'
            : 'Save real prices, stock, product pages and images.'}
        </li>
        <li>
          {bn
            ? 'Feed link তৈরি করে Commerce Manager → Catalogue → Data sources-এ scheduled feed হিসেবে দিন।'
            : 'Create the feed link and add it as a scheduled feed in Commerce Manager → Catalogue → Data sources.'}
        </li>
        <li>
          {bn
            ? 'Pixel Purchase/ViewContent/AddToCart-এর content_ids যেন product-এর feed ID-এর সঙ্গে মিলে। Currency BDT ও প্রকৃত value দিন।'
            : 'Match Pixel Purchase/ViewContent/AddToCart content_ids to the feed product IDs, with actual BDT value.'}
        </li>
        <li>
          {bn
            ? 'Catalogue diagnostics, stock, website checkout ও policy যাচাই করুন। Meta Ads Manager-এ Sales → catalogue → product set দিয়ে campaign review করুন।'
            : 'Check catalogue diagnostics, stock, checkout and policies. In Ads Manager review a Sales campaign using your catalogue and product set.'}
        </li>
        <li>
          {bn
            ? 'কম budget-এ একটি product set ও একটি ad set দিয়ে শুরু করুন। Collection format-এর জন্য Meta Instant Experience আলাদাভাবে তৈরি ও preview করতে হবে।'
            : 'Start with one product set and one ad set. Collection format additionally requires a Meta Instant Experience and preview.'}
        </li>
      </ol>
      <div className="catalog-actions">
        <label className="checkbox-row catalog-consent">
          <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
          <span>
            {bn
              ? 'Selected product-এর তথ্য ও ছবি secret feed link দিয়ে Meta-র জন্য accessible হবে-আমি বুঝেছি।'
              : 'I understand that selected product details and images become accessible through a secret feed link for Meta.'}
          </span>
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={busy || !share || !ids.length}
          onClick={() =>
            run(async () => {
              const created = await api('/catalog-feeds', 'POST', {
                productIds: ids,
                acknowledgeSharing: share,
              });
              setFeeds((rows) => [created, ...rows]);
            }, 'Catalogue feed prepared. No ad has been launched.')
          }
        >
          {bn ? 'Catalogue feed link তৈরি করুন' : 'Create catalogue feed link'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {feeds.map((feed) => (
        <div className="cost-preview" key={feed.id}>
          <p>
            {bn
              ? 'এটি Meta-তে import করার product feed; catalogue বা campaign এখনো তৈরি হয়নি।'
              : 'This is an importable product feed. A Meta catalogue or ad campaign has not been created.'}
          </p>
          <input aria-label="Catalogue feed URL" readOnly value={feed.url} />
          <button
            type="button"
            className="button secondary"
            onClick={() => run(() => navigator.clipboard.writeText(feed.url), 'Feed URL copied.')}
          >
            {bn ? 'Feed URL কপি' : 'Copy feed URL'}
          </button>
          <a href={feed.url} target="_blank" rel="noreferrer">
            {bn ? 'Feed দেখুন' : 'Open feed'}
          </a>
          <ul>
            {feed.productIds.map((id) => (
              <li key={id}>content_id: {id}</li>
            ))}
          </ul>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api(`/catalog-feeds/${feed.id}`, 'DELETE');
                setFeeds((rows) => rows.filter((row) => row.id !== feed.id));
              }, 'Feed link revoked.')
            }
          >
            {bn ? 'Feed link বন্ধ করুন' : 'Revoke feed link'}
          </button>
        </div>
      ))}
    </div>
  );
}
