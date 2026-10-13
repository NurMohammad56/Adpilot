import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useLanguage } from './i18n.js';
import { AdLibraryAnalysis } from './AdLibraryResearch.jsx';
import { Pagination, usePagination } from './Pagination.jsx';
export function AdLibraryPicker({
  businessId,
  selected = [],
  onChange,
  productId = null,
  projectId = null,
  onOpenLibrary,
  busy = false,
}) {
  const bn = useLanguage() === 'bn';
  const [rows, setRows] = useState([]),
    [error, setError] = useState(''),
    [expanded, setExpanded] = useState(null);
  const [query, setQuery] = useState('');
  const filtered = rows.filter((row) =>
    `${row.pageName} ${row.adCopy} ${row.offer} ${row.country}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const pagination = usePagination(filtered, { pageSize: 6, resetKey: `${businessId}:${query}` });
  async function load() {
    try {
      const data = await api('/ad-library');
      setRows(data.observations.filter((row) => !row.archived));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [businessId]);
  return (
    <section className="guide-step ad-library-picker">
      <h3>
        {bn
          ? 'Competitor ad ও General inspiration যুক্ত করুন'
          : 'Add competitor ads and general inspiration'}
      </h3>
      <p>
        {bn
          ? 'বাছাই করা ad ও তার বর্তমান analysis এই product/brief-এর পরবর্তী research-এ যাবে। General inspiration শুধু বেছে নিলেই এখানে ব্যবহৃত হবে।'
          : 'Selected ads and their current analyses inform the next research for this product or brief. General inspiration is included only when you select it.'}
      </p>
      <div className="guide-actions">
        <button type="button" className="button secondary" disabled={busy} onClick={load}>
          {bn ? 'Saved ad আবার লোড করুন' : 'Refresh saved ads'}
        </button>
        {onOpenLibrary && (
          <button type="button" className="button secondary" onClick={onOpenLibrary}>
            {bn ? 'Ad Library থেকে নতুন ad যোগ করুন' : 'Add or analyze ads in Ad Library'}
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {rows.length > 6 && (
        <label className="field">
          <span>{bn ? 'Saved ads খুঁজুন' : 'Search saved ad examples'}</span>
          <input
            aria-label="Search saved ad examples"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault();
            }}
          />
        </label>
      )}
      {selected.length > 0 && (
        <p className="small muted">
          {bn
            ? `নির্বাচিত ${selected.length}টি ad; পৃষ্ঠা বদলালেও selection থাকবে।`
            : `${selected.length} ads selected; selections remain when you change pages.`}
        </p>
      )}
      {pagination.items.map((row) => {
        const linked =
          (productId && row.productId === productId) || (projectId && row.projectId === projectId);
        return (
          <article className="ad-library-card" key={row.id}>
            <label className="check-label">
              <input
                type="checkbox"
                checked={linked || selected.includes(row.id)}
                disabled={
                  busy || Boolean(linked) || (!selected.includes(row.id) && selected.length >= 12)
                }
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...selected, row.id]
                      : selected.filter((id) => id !== row.id),
                  )
                }
              />
              <span>
                <strong>{row.pageName}</strong> · {row.country}
                {linked
                  ? bn
                    ? ' · নিজে থেকেই যুক্ত'
                    : ' · Automatically linked'
                  : !row.productId && !row.projectId
                    ? bn
                      ? ' · General inspiration'
                      : ' · General inspiration'
                    : ''}
              </span>
            </label>
            <p>
              {(row.analysis && !row.analysisStale
                ? row.analysis.report.summary
                : row.adCopy || row.offer || row.notes
              ).slice(0, 450)}
            </p>
            {row.analysisStale && (
              <p>
                {bn
                  ? 'আগের analysis পুরোনো হয়েছে। Ad Library-তে আবার analysis করুন।'
                  : 'Earlier analysis is stale. Analyze it again in Ad Library.'}
              </p>
            )}
            <div className="guide-actions">
              <a
                className="button secondary"
                href={row.adUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {bn ? 'Original ad' : 'Original ad'}
              </a>
              {row.analysis && (
                <button
                  type="button"
                  className="button secondary"
                  aria-expanded={expanded === row.id}
                  onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                >
                  {bn ? 'Analysis দেখুন / বন্ধ করুন' : 'Show / hide analysis'}
                </button>
              )}
            </div>
            {expanded === row.id && <AdLibraryAnalysis row={row} />}
          </article>
        );
      })}
      <Pagination pagination={pagination} label="Saved ad examples" sizes={[6, 12, 24]} />
      {!rows.length && !error && (
        <p>
          {bn
            ? 'এখনো saved ad নেই। Ad Library research-এ ad সংরক্ষণ করুন, তারপর এখানে বেছে নিন।'
            : 'No saved ads yet. Save examples in Ad Library research, then select them here.'}
        </p>
      )}
      {selected.some((id) => !rows.some((r) => r.id === id)) && (
        <button
          className="button secondary"
          type="button"
          onClick={() => onChange(selected.filter((id) => rows.some((r) => r.id === id)))}
        >
          {bn ? 'Unavailable ad-এর selection সরান' : 'Remove unavailable ad selections'}
        </button>
      )}
    </section>
  );
}
