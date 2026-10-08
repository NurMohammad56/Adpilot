import React, { useId, useState } from 'react';
export function FieldHelp({ label, text }) {
  const id = useId();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = pinned || hovered || focused;
  return (
    <span
      className="field-help"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        className="field-help-button"
        aria-label={`Help: ${label}`}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((value) => !value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setPinned(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setPinned(false);
            setHovered(false);
            setFocused(false);
          }
        }}
      >
        ?
      </button>
      {open && (
        <span role="tooltip" id={id} className="field-help-tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
export function CampaignField({ label, help, children, hint }) {
  const id = useId();
  return (
    <div className="field campaign-field">
      <div className="campaign-field-header">
        <label htmlFor={id}>{label}</label>
        <FieldHelp label={label} text={help} />
      </div>
      {React.cloneElement(children, { id, 'aria-label': label })}
      {hint && <small>{hint}</small>}
    </div>
  );
}
