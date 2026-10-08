import React, { useEffect, useState } from 'react';

const defaults = {
  openai: { model: 'gpt-6-luna', researchModel: 'gpt-6-luna' },
  gemini: { model: 'gemini-3.1-flash-lite', researchModel: 'gemini-3-flash-preview' },
};
const Field = ({ label, hint, children }) => (
  <label className="field">
    <span>{label}</span>
    {React.cloneElement(children, { 'aria-label': label })}
    {hint && <small>{hint}</small>}
  </label>
);

export function AIConnection({ data, api, run, refresh, busy }) {
  const saved = data.aiIntegration || {};
  const [provider, setProvider] = useState(saved.provider === 'gemini' ? 'gemini' : 'openai');
  const [model, setModel] = useState(saved.model || defaults.openai.model);
  const [researchModel, setResearchModel] = useState(
    saved.researchModel || defaults.openai.researchModel,
  );
  const [thinking, setThinking] = useState(saved.researchThinking || 'high');
  const [grounding, setGrounding] = useState(saved.grounding ?? true);
  const [apiKey, setApiKey] = useState('');
  const admin = data.user.role === 'admin';
  useEffect(() => {
    const next = saved.provider === 'gemini' ? 'gemini' : 'openai';
    setProvider(next);
    setModel(saved.model || defaults[next].model);
    setResearchModel(saved.researchModel || defaults[next].researchModel);
    setThinking(saved.researchThinking || 'high');
    setGrounding(saved.grounding ?? true);
    setApiKey('');
  }, [
    data.business.id,
    saved.provider,
    saved.model,
    saved.researchModel,
    saved.researchThinking,
    saved.grounding,
  ]);
  return (
    <article className="panel tools-panel">
      <h2>Your AI provider</h2>
      <p>
        Research and ad copy use this workspace’s encrypted key. Each workspace has its own provider
        settings.
      </p>
      <div className="notice">
        High thinking improves analysis. Live search adds current source citations; market
        conclusions still need review and real customer evidence.
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          run(async () => {
            await api('/integrations/ai', 'POST', {
              provider,
              apiKey,
              model,
              researchModel,
              researchThinking: thinking,
              grounding,
            });
            setApiKey('');
            await refresh();
          }, 'AI key and model verified for this workspace.');
        }}
      >
        <Field label="Provider">
          <select
            value={provider}
            disabled={!admin || busy}
            onChange={(event) => {
              const next = event.target.value;
              setProvider(next);
              setModel(saved.provider === next ? saved.model : defaults[next].model);
              setResearchModel(
                saved.provider === next
                  ? saved.researchModel || defaults[next].researchModel
                  : defaults[next].researchModel,
              );
              setGrounding(saved.provider === next ? saved.grounding : true);
              setApiKey('');
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
          </select>
        </Field>
        <Field label="Copy model">
          <input
            name="model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            required
            disabled={!admin}
            list={`${provider}-models`}
          />
        </Field>
        <Field
          label="Research model"
          hint="Choose a model available to your API project. Model verification checks access; generation also requires quota and billing."
        >
          <input
            name="researchModel"
            value={researchModel}
            onChange={(event) => setResearchModel(event.target.value)}
            required
            disabled={!admin}
            list={`${provider}-models`}
          />
        </Field>
        <datalist id="openai-models">
          <option value="gpt-6-luna" />
          <option value="gpt-6.1-sol" />
          <option value="gpt-5.4-mini" />
          <option value="gpt-4.1-mini" />
        </datalist>
        <datalist id="gemini-models">
          <option value="gemini-3-flash-preview" />
          <option value="gemini-3.1-pro-preview" />
          <option value="gemini-3.8-flash" />
          <option value="gemini-3.1-flash-lite" />
        </datalist>
        <Field
          label="Research thinking effort"
          hint="High thinking applies to reasoning models. Models such as GPT-4.1 do not have a thinking-effort setting."
        >
          <select
            name="researchThinking"
            value={thinking}
            onChange={(event) => setThinking(event.target.value)}
            disabled={!admin}
          >
            <option value="high">High / thorough analysis</option>
            <option value="low">Low / faster analysis</option>
          </select>
        </Field>
        <Field
          label={provider === 'openai' ? 'OpenAI API key' : 'Gemini API key'}
          hint="Leave empty to keep the saved key. Changing provider requires its own key."
        >
          <input
            name="apiKey"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            required={!saved.configured || saved.provider !== provider}
            autoComplete="new-password"
            disabled={!admin}
          />
        </Field>
        <label className="tools-check">
          <input
            name="grounding"
            type="checkbox"
            checked={grounding}
            onChange={(event) => setGrounding(event.target.checked)}
            disabled={!admin}
          />
          {provider === 'openai'
            ? 'Retrieve live sources with OpenAI web search'
            : 'Retrieve live sources with Google Search'}
        </label>
        <p className="small muted">
          Search and reasoning use your provider’s API quota and billing. Each new research report
          shows whether live search succeeded.
        </p>
        <button className="button primary" disabled={busy || !admin}>
          Verify & save AI provider
        </button>
      </form>
    </article>
  );
}

export function ResearchRetrieval({ retrieval }) {
  if (!retrieval) return null;
  return (
    <div className="notice" role="status">
      <div>
        <strong>
          {retrieval.status === 'completed'
            ? 'Live web search complete'
            : retrieval.status === 'unavailable'
              ? 'Live web search unavailable'
              : 'Live web search disabled'}
        </strong>
        <p>
          {retrieval.model} · {retrieval.thinking} · {retrieval.sourceCount} sources ·{' '}
          {new Date(retrieval.checkedAt).toLocaleString()}
        </p>
        <small>
          {retrieval.status === 'completed'
            ? 'Open the cited sources below. Retrieved evidence does not guarantee demand or ad performance.'
            : 'This report uses supplied evidence and AI hypotheses. Add dated sources before approval.'}
        </small>
      </div>
    </div>
  );
}
