import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useLanguage, translateText } from './i18n';
import { Pagination, usePagination } from './Pagination';
import './delete-record.css';

export const RecordControls = createContext(null);

export function DeleteRecord({ kind, id, name, onDeleted, compact = false }) {
  const context = useContext(RecordControls);
  const bn = useLanguage() === 'bn';
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const trigger = useRef(null);
  const dialog = useRef(null);
  useEffect(() => {
    if (!review) return;
    const previous = document.activeElement;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector('button')?.focus();
    const keyboard = (event) => {
      if (event.key === 'Escape' && !loading) setReview(null);
      if (event.key !== 'Tab') return;
      const buttons = [
        ...(dialog.current?.querySelectorAll('button:not(:disabled), a[href]') || []),
      ];
      if (!buttons.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault();
        buttons[0].focus();
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener('keydown', keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, [Boolean(review), loading]);
  if (!context || context.data.user.role !== 'admin') return null;
  const { api, busy, run, refresh } = context;
  const open = async () => {
    setError('');
    setLoading(true);
    setReview({ loading: true });
    try {
      setReview(await api(`/records/${kind}/${id}/delete-preview`));
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };
  const remove = () =>
    run(
      async () => {
        setError('');
        setLoading(true);
        try {
          const result = await api(`/records/${kind}/${id}`, 'DELETE', { token: review.token });
          await refresh();
          setReview(null);
          await onDeleted?.(result);
          if (result.cleanupPending)
            throw new Error(
              bn
                ? 'রেকর্ড মুছে গেছে। Storage connection ফিরলে ফাইল মুছে ফেলা স্বয়ংক্রিয়ভাবে আবার চেষ্টা হবে।'
                : 'Record deleted. File cleanup is pending and will retry automatically when storage recovers.',
            );
        } catch (error) {
          setError(error.message);
          throw error;
        } finally {
          setLoading(false);
        }
      },
      bn ? 'মুছে ফেলা হয়েছে।' : 'Deleted successfully.',
    );
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`record-delete ${compact ? 'compact' : ''}`}
        disabled={busy || loading}
        aria-label={`Delete ${name || kind}`}
        title={bn ? 'মুছে ফেলুন' : 'Delete'}
        onClick={open}
      >
        <Trash2 size={16} />
        {!compact && (bn ? 'মুছুন' : 'Delete')}
      </button>
      {review &&
        createPortal(
          <div
            className="record-delete-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget && !loading) setReview(null);
            }}
          >
            <section
              ref={dialog}
              className="record-delete-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={bn ? 'মুছে ফেলার আগে যাচাই করুন' : 'Review deletion'}
            >
              <header>
                <h2>
                  <Trash2 size={21} />
                  {bn ? 'মুছে ফেলার আগে যাচাই করুন' : 'Review deletion'}
                </h2>
                <button
                  type="button"
                  className="icon-button"
                  disabled={loading}
                  aria-label="Close deletion review"
                  onClick={() => setReview(null)}
                >
                  <X size={19} />
                </button>
              </header>
              <strong className="record-delete-name">{review.name || name}</strong>
              {review.loading ? (
                <p>{bn ? 'সম্পর্কিত তথ্য যাচাই হচ্ছে…' : 'Checking linked records…'}</p>
              ) : (
                <>
                  <p>
                    {bn
                      ? 'নিচের রেকর্ডগুলো স্থায়ীভাবে মুছে যাবে। এই কাজ ফিরিয়ে নেওয়া যাবে না।'
                      : 'These saved records will be permanently removed. This cannot be undone.'}
                  </p>
                  <ul>
                    {review.counts.map((item) => (
                      <li key={item.label}>
                        <span>{translateText(item.label)}</span>
                        <strong>{item.count}</strong>
                      </li>
                    ))}
                  </ul>
                  {review.unlinkedRecords > 0 && (
                    <p>
                      {bn
                        ? `${review.unlinkedRecords}টি অন্য রেকর্ডের সম্পর্ক আপডেট হবে; সেগুলো মুছে যাবে না।`
                        : `${review.unlinkedRecords} other records will be unlinked or updated and kept.`}
                    </p>
                  )}
                  {review.files > 0 && (
                    <p>
                      {bn
                        ? 'ফাইলগুলো private storage থেকেও মুছে যাবে।'
                        : 'Files will also be removed from private storage.'}
                    </p>
                  )}
                  {review.remoteUnchanged && (
                    <div className="notice">
                      <AlertTriangle size={18} />
                      <p>
                        {bn
                          ? 'এটি শুধু AdPilot-এর রেকর্ড মুছবে। Facebook-এর বিজ্ঞাপন বন্ধ বা মুছে যাবে না।'
                          : 'This removes AdPilot records only. It does not pause or delete ads on Facebook.'}
                      </p>
                    </div>
                  )}
                  {review.blockers.map((message) => (
                    <p key={message} className="field-error" role="alert">
                      {translateText(message)}
                    </p>
                  ))}
                </>
              )}
              {error && (
                <p className="field-error" role="alert">
                  {translateText(error)}
                </p>
              )}
              <footer>
                <button
                  type="button"
                  className="button secondary"
                  disabled={loading}
                  onClick={() => setReview(null)}
                >
                  {bn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="button"
                  className="button record-delete-confirm"
                  disabled={loading || busy || !review.token || review.blockers?.length > 0}
                  onClick={remove}
                >
                  <Trash2 size={16} />
                  {loading
                    ? bn
                      ? 'অপেক্ষা করুন…'
                      : 'Please wait…'
                    : bn
                      ? 'স্থায়ীভাবে মুছে ফেলুন'
                      : 'Delete permanently'}
                </button>
              </footer>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}

export function SavedDataManager() {
  const context = useContext(RecordControls);
  const bn = useLanguage() === 'bn';
  const [kinds, setKinds] = useState([]);
  const [kind, setKind] = useState('ad-library');
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const reload = async () => {
    setRows(await context.api(`/records?kind=${encodeURIComponent(kind)}`));
    setError('');
  };
  useEffect(() => {
    if (context?.data.user.role !== 'admin') return;
    context
      .api('/records')
      .then(setKinds)
      .catch((error) => setError(error.message));
  }, [context?.data.business.id]);
  useEffect(() => {
    if (context?.data.user.role !== 'admin') return;
    let alive = true;
    setRows([]);
    setError('');
    context
      .api(`/records?kind=${encodeURIComponent(kind)}`)
      .then((rows) => {
        if (alive) setRows(rows);
      })
      .catch((error) => {
        if (alive) setError(error.message);
      });
    return () => {
      alive = false;
    };
  }, [kind, context?.data.business.id]);
  const pagination = usePagination(
    rows.filter((row) => row.name.toLowerCase().includes(query.toLowerCase())),
    { resetKey: `${kind}:${query}:${context?.data.business.id}` },
  );
  if (!context || context.data.user.role !== 'admin') return null;
  return (
    <article className="panel tools-panel saved-data-manager">
      <h2>{bn ? 'সংরক্ষিত তথ্য পরিচালনা' : 'Manage saved data'}</h2>
      <p>
        {bn
          ? 'প্রতিটি রেকর্ড আলাদা করে মুছতে পারবেন। সম্পর্কিত তথ্য আগে দেখানো হবে।'
          : 'Delete individual saved items. Review linked records before confirming.'}
      </p>
      <div className="form-grid">
        <label className="field">
          <span>{bn ? 'তথ্যের ধরন' : 'Record type'}</span>
          <select
            aria-label="Saved record type"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {kinds.map((item) => (
              <option key={item.kind} value={item.kind}>
                {translateText(item.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{bn ? 'খুঁজুন' : 'Search saved records'}</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {translateText(error)}
        </p>
      )}
      <div className="saved-data-list">
        {pagination.items.map((row) => (
          <div key={row.id}>
            <div>
              <strong>{row.name}</strong>
              <small>
                {row.status} · {new Date(row.createdAt).toLocaleDateString()}
              </small>
            </div>
            <DeleteRecord kind={kind} id={row.id} name={row.name} onDeleted={reload} />
          </div>
        ))}
      </div>
      {!rows.length && !error && (
        <p>{bn ? 'এই ধরনের সংরক্ষিত রেকর্ড নেই।' : 'No saved records of this type.'}</p>
      )}
      <Pagination pagination={pagination} label="Saved records" />
      <small>
        {bn
          ? 'Audit history এবং campaign-এর বাজেটের হিসাব সিস্টেমে রাখা হয়।'
          : 'Audit history and campaign budget reservations are retained by the system.'}
      </small>
    </article>
  );
}
