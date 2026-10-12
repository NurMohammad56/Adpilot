import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { useLanguage } from './i18n.js';
const cache = new Map();
const pending = new Map();
export function useReportTranslation(kind, id, original, businessId, enabled = true) {
  const language = useLanguage();
  const [state, setState] = useState({}),
    [attempt, setAttempt] = useState(0),
    [showOriginal, setShowOriginal] = useState(false);
  const source = JSON.stringify(original || null);
  const key = `${businessId}:${kind}:${id}:${source}`;
  useEffect(() => {
    if (!enabled || language !== 'bn' || !id || !original || showOriginal) return;
    let cancelled = false;
    if (cache.has(key)) {
      setState({ key, value: cache.get(key) });
      return;
    }
    setState({ key, loading: true });
    if (!pending.has(key))
      pending.set(
        key,
        api('/report-translations', 'POST', { kind, id, language: 'bn' })
          .then((value) => {
            cache.set(key, value);
            if (cache.size > 30) cache.delete(cache.keys().next().value);
            return value;
          })
          .finally(() => pending.delete(key)),
      );
    pending
      .get(key)
      .then((value) => {
        if (!cancelled) setState({ key, value });
      })
      .catch((error) => {
        if (!cancelled) setState({ key, error: error.message });
      });
    return () => {
      cancelled = true;
    };
  }, [key, language, enabled, showOriginal, attempt]);
  const active = state.key === key ? state : {};
  const report =
    language === 'bn' && !showOriginal && active.value ? active.value.report : original;
  return {
    report,
    language,
    loading: active.loading,
    error: active.error,
    translated: report !== original,
    demo: active.value?.demo,
    showOriginal,
    toggleOriginal: () => setShowOriginal((value) => !value),
    retry: () => setAttempt((value) => value + 1),
  };
}
export function ReportTranslationNotice({ translation }) {
  if (translation.language !== 'bn') return null;
  return (
    <div className="notice report-translation-notice">
      <div className="report-translation-text">
        {translation.loading ? (
          <p>বাংলা অনুবাদ হচ্ছে… মূল report এখন দেখা যাচ্ছে।</p>
        ) : translation.error ? (
          <p role="alert">অনুবাদ সম্পন্ন হয়নি: {translation.error}</p>
        ) : (
          <p>
            {translation.translated
              ? 'বাংলা অনুবাদ দেখছেন। মূল সিদ্ধান্ত, budget, targeting ও approval অপরিবর্তিত আছে।'
              : 'মূল report দেখছেন।'}
          </p>
        )}
        {translation.demo && translation.translated && <p>ডেমো: এখানে live AI অনুবাদ করা হয়নি।</p>}
      </div>
      <div className="report-translation-actions">
        {translation.error && (
          <button type="button" className="button secondary" onClick={translation.retry}>
            অনুবাদ আবার চেষ্টা করুন
          </button>
        )}
        <button type="button" className="button secondary" onClick={translation.toggleOriginal}>
          {translation.showOriginal ? 'বাংলা অনুবাদ দেখুন' : 'মূল report দেখুন'}
        </button>
      </div>
    </div>
  );
}
