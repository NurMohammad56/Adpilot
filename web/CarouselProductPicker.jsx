import React, { useEffect, useState } from 'react';
import { Pagination, usePagination } from './Pagination.jsx';
import { translateText } from './i18n.js';
import './carousel-sources.css';

export function CarouselProductPicker({
  data,
  api,
  selected,
  onSelect,
  onAdd,
  onEdit,
  onCatalog,
  busy,
}) {
  const [catalog, setCatalog] = useState({ products: data.products, sources: [] });
  const [source, setSource] = useState('saved');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const revision = data.products.map((product) => `${product.id}:${product.revision}`).join(',');
  useEffect(() => {
    let active = true;
    setLoading(true);
    onCatalog(null);
    api('/product-sources')
      .then((value) => {
        if (!active) return;
        setCatalog(value);
        onCatalog(value);
        setError('');
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [data.business.id, revision, reload, api, onCatalog]);
  const rows = (
    source === 'saved'
      ? catalog.products
      : catalog.sources.filter((row) => row.reference.kind === source)
  ).filter((row) =>
    `${row.name} ${row.category || ''} ${row.status || ''} ${(row.countries || []).join(' ')}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const pagination = usePagination(rows, {
    pageSize: 6,
    resetKey: `${data.business.id}:${source}:${query}`,
  });
  const full = selected.length >= 10;
  const edit = (product) => {
    const { carouselMissing, ...actual } = product;
    onEdit(actual);
  };
  return (
    <section className="carousel-source-picker" aria-label="Choose products for carousel">
      <div className="carousel-source-heading">
        <div>
          <h3>Add products from your workspace</h3>
          <p>
            Choose saved products, or turn research and competitor evidence into your own product
            before adding a card.
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          disabled={busy || full}
          onClick={() => onAdd(null)}
        >
          Add a new product
        </button>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Product source</span>
          <select
            aria-label="Product source"
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setQuery('');
            }}
          >
            <option value="saved">Saved products</option>
            <option value="research">Product research</option>
            <option value="discovery">Discovery ideas</option>
            <option value="ad-library">Saved competitor ads</option>
          </select>
        </label>
        <label className="field">
          <span>Find a product or source</span>
          <input
            aria-label="Find a product or source"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {source !== 'saved' && (
        <p className="notice">
          Earlier research is context for a new group decision. Confirm your own selling price,
          costs, stock, product page and image. Competitor screenshots and prices stay evidence;
          they are not copied as your product facts.
        </p>
      )}
      <div className="carousel-selection-summary" aria-live="polite">
        <strong>{`${selected.length} / 10 products selected`}</strong>
        <span>Selections stay when you change source or page.</span>
      </div>
      {selected.length > 0 && (
        <div className="carousel-selected-products">
          {selected.map((id) => (
            <button
              key={id}
              type="button"
              className="button secondary"
              disabled={busy}
              aria-label={`Remove ${catalog.products.find((product) => product.id === id)?.name || 'unavailable product'} from carousel`}
              onClick={() => onSelect(selected.filter((value) => value !== id))}
            >
              {catalog.products.find((product) => product.id === id)?.name || 'Unavailable product'}{' '}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      {loading && <p role="status">Loading workspace products and sources…</p>}
      {error && <p role="alert">{error}</p>}
      <div className="product-selection">
        {!loading &&
          pagination.items.map((row) => {
            const product =
              source === 'saved'
                ? row
                : catalog.products.find((product) => product.id === row.existingProductId);
            const checked = Boolean(product && selected.includes(product.id));
            return (
              <article className="carousel-source-row" key={row.key || row.id}>
                {source === 'saved' ? (
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy || (!checked && full)}
                      onChange={(event) =>
                        onSelect(
                          event.target.checked
                            ? [...selected, product.id]
                            : selected.filter((id) => id !== product.id),
                        )
                      }
                    />
                    <span>
                      <strong>{row.name}</strong>
                      <small>
                        {`${row.sellingPrice ?? 'Price needed'} BDT · ${row.inventory} in stock`}
                      </small>
                    </span>
                  </label>
                ) : (
                  <div>
                    <strong>{row.name}</strong>
                    <small>
                      {translateText(row.status?.replaceAll('_', ' '))}
                      {row.countries?.length ? ` · ${row.countries.join(', ')}` : ''}
                    </small>
                  </div>
                )}
                {product?.carouselMissing?.length > 0 && (
                  <p className="carousel-source-missing">
                    Complete before research:{' '}
                    {product.carouselMissing.map(translateText).join(', ')}
                  </p>
                )}
                {source === 'saved' && product.carouselMissing?.length > 0 ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy}
                    onClick={() => edit(product)}
                  >
                    Complete product
                  </button>
                ) : (
                  source !== 'saved' && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy || checked || full}
                      onClick={() =>
                        product
                          ? product.carouselMissing?.length
                            ? edit(product)
                            : onSelect([...selected, product.id])
                          : onAdd(row.draft)
                      }
                    >
                      {checked
                        ? 'Already selected'
                        : product
                          ? product.carouselMissing?.length
                            ? 'Complete product & add'
                            : 'Add saved product to carousel'
                          : 'Set up my product & add'}
                    </button>
                  )
                )}
                {source !== 'saved' && product && (
                  <div>
                    <small>Existing product: {product.name}</small>
                    <small>Uses your existing product; no duplicate is created.</small>
                  </div>
                )}
              </article>
            );
          })}
      </div>
      {!loading && !rows.length && (
        <p className="notice">
          No matching saved items. Add a product above, or save physical product research, a
          discovery idea or a competitor ad first.
        </p>
      )}
      <Pagination pagination={pagination} label="Carousel product sources" sizes={[6, 12, 24]} />
      <button
        type="button"
        className="button secondary"
        disabled={loading || busy}
        onClick={() => setReload((value) => value + 1)}
      >
        Refresh products and sources
      </button>
    </section>
  );
}
