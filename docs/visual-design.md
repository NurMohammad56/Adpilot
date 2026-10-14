# AdPilot visual design

The brand mark combines an A, a forward flight shape and a mint direction point. Its SVG source is `web/assets/adpilot-mark.svg`. `Brand.jsx` renders the same mark and wordmark in the sidebar, authentication screens, loading screen and mobile navigation. Browser branding uses the SVG, a 32px PNG fallback and a 180px Apple touch icon. Vite generates deployment-base-aware URLs for the assets, including `/adpilot/` hosting.

`web/experience.css` defines the shared emerald/mint palette, surfaces, shadows, form treatment, typography colours, and interaction states. Semantic warnings, errors and campaign statuses retain their meaning. Motion uses short transitions and a one-time modal/toast entrance; reduced-motion preferences disable transitions and animations. Components remain readable without hover. Bangla uses locally bundled Noto Sans Bengali fonts in four weights; logos retain the brand typeface in either language.

Keyboard users can skip directly to workspace content. Selected sidebar sections expose `aria-current`. Navigation expands on hover or keyboard focus and can remain pinned. At widths up to 900px, a visible section selector and brand/home shortcut replace the desktop sidebar, including the tablet range.

Validation includes logo/favicon loading, keyboard navigation, pinned navigation, reduced motion, mobile/tablet overflow checks, English/Bangla authentication and workspace screens, plus existing product, research, approval, pagination and campaign workflow regression checks. No business records, research prompts, provider choices or spending settings are changed by the visual design.
