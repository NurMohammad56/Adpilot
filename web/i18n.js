import React, { useSyncExternalStore } from 'react';
import translations from './locales/bn.json';

const listeners = new Set();
let language = typeof localStorage === 'undefined' ? 'en' : localStorage.getItem('adpilot-language') || 'en';
if (typeof document !== 'undefined') document.documentElement.lang = language;
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.entries(translations).filter(([source]) => /\{\d+\}/.test(source)).map(([source, translated]) => ({
  expression: new RegExp(`^${source.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? '(.*?)' : escapeRegex(part)).join('')}$`),
  translated, tokens: source.match(/\{\d+\}/g),
}));
export const getLanguage = () => language;
export function setLanguage(value) {
  language = value === 'bn' ? 'bn' : 'en';
  localStorage.setItem('adpilot-language', language);
  document.documentElement.lang = language;
  for (const listener of listeners) listener();
}
export const useLanguage = () => useSyncExternalStore(listener => {
  listeners.add(listener); return () => listeners.delete(listener);
}, getLanguage, () => 'en');
export function translateText(value) {
  if (language !== 'bn' || typeof value !== 'string') return value;
  const trimmed = value.trim();
  const match = translations[trimmed] || translations[trimmed.toLowerCase()];
  if (match) return value.replace(trimmed, match);
  for (const pattern of patterns) {
    const captures = pattern.expression.exec(trimmed);
    if (captures) return value.replace(trimmed, pattern.tokens.reduce((text, token, index) => text.replaceAll(token, captures[index + 1]), pattern.translated));
  }
  return value;
}
export function translateNode(value) {
  if (typeof value === 'string') return translateText(value);
  if (Array.isArray(value)) return value.map(translateNode);
  return value;
}
export function LanguageSwitch() {
  const current = useLanguage();
  return React.createElement('button', {
    type: 'button', className: 'button secondary language-switch',
    onClick: () => setLanguage(current === 'bn' ? 'en' : 'bn'),
    'aria-label': current === 'bn' ? 'Switch to English' : 'বাংলায় দেখুন',
  }, current === 'bn' ? 'English' : 'বাংলা');
}
