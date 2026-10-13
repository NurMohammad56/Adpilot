import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage, translateText } from './i18n.js';
import './pagination.css';

export function usePagination(items, { pageSize = 10, resetKey = '' } = {}) {
  const [size, setSize] = useState(pageSize);
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = selection.key === resetKey ? Math.min(pages, selection.page) : 1;
  useEffect(() => {
    if (selection.key !== resetKey || selection.page !== page)
      setSelection({ key: resetKey, page });
  }, [resetKey, page, selection.key, selection.page]);
  const setPage = (value) =>
    setSelection({ key: resetKey, page: Math.max(1, Math.min(pages, value)) });
  return {
    items: items.slice((page - 1) * size, page * size),
    total: items.length,
    page,
    pages,
    size,
    from: items.length ? (page - 1) * size + 1 : 0,
    to: Math.min(page * size, items.length),
    setPage,
    setSize: (value) => {
      setSize(Number(value));
      setSelection({ key: resetKey, page: 1 });
    },
  };
}
export function Pagination({ pagination, label, sizes = [10, 25, 50] }) {
  const bn = useLanguage() === 'bn';
  const p = pagination;
  if (!p.total) return null;
  const options = [...new Set([p.size, ...sizes])].sort((a, b) => a - b);
  const name = translateText(label);
  return (
    <nav className="pagination-controls" aria-label={`${name} pagination`}>
      <span className="pagination-summary" aria-live="polite">
        {bn ? `${p.total}টির মধ্যে ${p.from}–${p.to}` : `${p.from}–${p.to} of ${p.total}`}
      </span>
      {p.total > Math.min(...options) && (
        <>
          <label className="pagination-size">
            <span>{bn ? 'প্রতি পৃষ্ঠায়' : 'Per page'}</span>
            <select
              aria-label={`${name} per page`}
              value={p.size}
              onChange={(event) => p.setSize(event.target.value)}
            >
              {options.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
          <div className="pagination-buttons">
            <button
              type="button"
              className="button secondary"
              aria-label={`Previous page of ${name}`}
              disabled={p.page === 1}
              onClick={() => p.setPage(p.page - 1)}
            >
              <ChevronLeft size={16} />
              <span>{bn ? 'আগের' : 'Previous'}</span>
            </button>
            <span className="pagination-position">
              {bn ? `পৃষ্ঠা ${p.page} / ${p.pages}` : `Page ${p.page} / ${p.pages}`}
            </span>
            <button
              type="button"
              className="button secondary"
              aria-label={`Next page of ${name}`}
              disabled={p.page === p.pages}
              onClick={() => p.setPage(p.page + 1)}
            >
              <span>{bn ? 'পরের' : 'Next'}</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </nav>
  );
}
