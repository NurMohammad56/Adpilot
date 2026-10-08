import { useEffect, useState } from 'react';
export function useDraft(key, initial) {
  const read = () => {
    try { return JSON.parse(sessionStorage.getItem(key)) ?? (typeof initial === 'function' ? initial() : initial); }
    catch { return typeof initial === 'function' ? initial() : initial; }
  };
  const [record, setRecord] = useState(() => ({ key, value: read() }));
  useEffect(() => { if (record.key !== key) setRecord({ key, value: read() }); }, [key]);
  useEffect(() => {
    if (record.key !== key) return;
    try { sessionStorage.setItem(key, JSON.stringify(record.value)); } catch { /* Storage-full/private browser: form remains usable. */ }
  }, [key, record]);
  const value = record.key === key ? record.value : read();
  const setValue = update => setRecord(current => ({ key, value: typeof update === 'function' ? update(current.key === key ? current.value : read()) : update }));
  return [value, setValue, () => sessionStorage.removeItem(key)];
}
