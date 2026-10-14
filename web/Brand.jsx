import mark from './assets/adpilot-mark.svg';

// The same scalable mark is used for navigation, authentication and browser branding.
export function BrandMark({ className = '', ...props }) {
  return (
    <img
      src={mark}
      alt=""
      width="40"
      height="40"
      className={`brand-symbol ${className}`}
      {...props}
    />
  );
}

export function BrandName() {
  return (
    <span className="brand-wordmark">
      adpilot<span className="brand-dot">.</span>
    </span>
  );
}
