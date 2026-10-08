import React, { useState } from 'react';
import { useDraft } from './use-draft.js';
import { translateText } from './i18n.js';

const fields = [
  {
    key: 'adAccountId',
    label: 'Ad account ID',
    hint: 'Ads Manager → Account settings. Digits only, or act_ followed by digits. This is not your login email.',
    placeholder: 'Example: 123456789012345',
    pattern: '(act_)?[0-9]+',
  },
  {
    key: 'pageId',
    label: 'Facebook Page ID',
    hint: 'Your Facebook Page → About → Page transparency. Use the Page ID, not your Developer App ID.',
    placeholder: 'Facebook Page numeric ID',
    pattern: '[0-9]+',
  },
  {
    key: 'pixelId',
    label: 'Pixel / dataset ID',
    hint: 'Events Manager → Data sources → Settings. The pixel must belong to the selected ad account.',
    placeholder: 'Pixel or dataset numeric ID',
    pattern: '[0-9]+',
  },
];
export function MetaConnection({ data, api, run, refresh, busy }) {
  const [values, setValues] = useDraft(
    `adpilot-draft:${data.business.id}:${data.user.id}:meta-identifiers`,
    {
      adAccountId: data.integration.adAccountId || '',
      pageId: data.integration.pageId || '',
      pixelId: data.integration.pixelId || '',
    },
  );
  const [errors, setErrors] = useState({});
  const [remoteError, setRemoteError] = useState('');
  const admin = data.user.role === 'admin';
  return (
    <article className="panel tools-panel">
      <h2>Meta connection</h2>
      <p>
        Connect the ad account, Facebook Page and Pixel used by this workspace. App ID, Page ID and
        ad account ID are different identifiers.
      </p>
      <div className="notice">
        Browser login passwords do not belong here. Paste a Meta API access token. Saved tokens
        remain private; leave the token empty to recheck the saved connection.
      </div>
      <form
        autoComplete="off"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const input = {
            ...values,
            accessToken: form.elements.accessToken.value.trim(),
            appSecret: form.elements.appSecret.value.trim(),
          };
          const invalid = {};
          for (const field of fields)
            if (!new RegExp(`^${field.pattern}$`).test(input[field.key].trim()))
              invalid[field.key] = field.hint;
          if (!input.accessToken && !data.integration.configured)
            invalid.accessToken = 'Paste a Meta API access token to connect this workspace.';
          if (input.accessToken && input.accessToken.length < 20)
            invalid.accessToken =
              'This looks too short for a Meta access token. Do not enter your account password.';
          setErrors(invalid);
          setRemoteError('');
          if (Object.keys(invalid).length) return;
          Object.keys(values).forEach((key) => {
            input[key] = input[key].trim();
          });
          run(async () => {
            try {
              await api('/integrations/meta', 'POST', input);
              await refresh();
              form.elements.accessToken.value = '';
              form.elements.appSecret.value = '';
            } catch (error) {
              setErrors(
                Object.fromEntries(
                  Object.entries(error.details?.fieldErrors || {}).map(([key, messages]) => [
                    key,
                    messages.join(' '),
                  ]),
                ),
              );
              setRemoteError(error.message);
              throw error;
            }
          }, 'Meta account verified and saved for this workspace.');
        }}
      >
        {fields.map((field) => (
          <label className="field" key={field.key}>
            <span>{field.label}</span>
            <input
              name={`meta-${field.key}`}
              aria-label={field.label}
              value={values[field.key]}
              inputMode="numeric"
              spellCheck={false}
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              disabled={!admin}
              placeholder={field.placeholder}
              aria-invalid={Boolean(errors[field.key])}
              aria-describedby={`meta-hint-${field.key}`}
              onChange={(event) => {
                setValues({ ...values, [field.key]: event.target.value });
                setErrors({ ...errors, [field.key]: '' });
              }}
            />
            <small id={`meta-hint-${field.key}`}>{field.hint}</small>
            {errors[field.key] && (
              <span className="field-error" role="alert">
                {translateText(errors[field.key])}
              </span>
            )}
          </label>
        ))}
        <label className="field">
          <span>Meta access token</span>
          <input
            name="accessToken"
            aria-label="Meta access token"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            disabled={!admin}
          />
          <small>
            A Meta API token is different from your password. Token and app secret are never saved
            in browser drafts.
          </small>
          {errors.accessToken && (
            <span className="field-error" role="alert">
              {translateText(errors.accessToken)}
            </span>
          )}
        </label>
        <label className="field">
          <span>Meta app secret (optional)</span>
          <input
            name="appSecret"
            aria-label="Meta app secret (optional)"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            disabled={!admin}
          />
        </label>
        {remoteError && (
          <p className="field-error" role="alert">
            {translateText(remoteError)}
          </p>
        )}
        <button className="button primary" disabled={busy || !admin}>
          Verify & save Meta account
        </button>
      </form>
    </article>
  );
}
