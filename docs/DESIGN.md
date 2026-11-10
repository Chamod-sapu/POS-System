# Wewala POS Design System (Stripe x Square Standard)

## Brand Philosophy
- **Shop Name**: Wewala Supermarket / Wewala Stores (Wewala, Sri Lanka)
- **Primary Aesthetic**: Stripe Dashboard precision meets Square POS touch-first speed.
- **Tone**: Calm, trustworthy, ultra-fast, robust under continuous retail load.
- **Typography**: Inter Variable, bundled locally for offline execution. High-legibility tabular figures (`tabular-nums`) for currency, stock counts, and bill series.

---

## 1. Color Palette

### 1.1 Brand Scale (Refined Deep Teal)
| Token | Hex | Usage |
| :--- | :--- | :--- |
| `brand-50` | `#F0FDFA` | Light tint backgrounds, hover highlights |
| `brand-100` | `#CCFBF1` | Soft badge backgrounds, selected row highlights |
| `brand-200` | `#99F6E4` | Subtle borders, active secondary accents |
| `brand-300` | `#5EEAD4` | Dark mode subtle borders and accents |
| `brand-400` | `#2DD4BF` | Dark mode prominent badges and icons |
| `brand-500` | `#14B8A6` | Interactive hover states, active accents |
| `brand-600` | `#0D9488` | Primary button fill, active tab highlights |
| `brand-700` | `#0F766E` | Deep refined brand primary, main header accent |
| `brand-800` | `#115E59` | Hover state for primary buttons, deep contrast borders |
| `brand-900` | `#134E4A` | Dark hero headers, rich brand containers |
| `brand-950` | `#042F2E` | Deepest brand surface in dark mode |

### 1.2 Neutral Slate Scale
- `slate-50` (`#F8FAFC`): Canvas background in light mode
- `slate-100` (`#F1F5F9`): Inset wells, table headers, disabled fields
- `slate-200` (`#E2E8F0`): Card borders, divider rules
- `slate-300` (`#CBD5E1`): Input borders, inactive icons
- `slate-400` (`#94A3B8`): Placeholder text, muted hints, cents fraction
- `slate-500` (`#64748B`): Secondary text, column headers, meta labels
- `slate-600` (`#475569`): Body text, subdued icons
- `slate-700` (`#334155`): Strong headings, active menu labels
- `slate-800` (`#1E293B`): Dark mode card surface, light mode dark accents
- `slate-900` (`#0F172A`): Sidebar background, dark mode secondary canvas
- `slate-950` (`#020617`): Dark mode root background, deep contrast shell

### 1.3 Semantic Colors
| State | Light Soft Bg | Light Text | Dark Soft Bg | Dark Text | Border |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Success** | `emerald-50` (`#ECFDF5`) | `emerald-700` (`#047857`) | `emerald-950/40` | `emerald-300` | `emerald-200` / `emerald-800` |
| **Warning** | `amber-50` (`#FFFBEB`) | `amber-800` (`#92400E`) | `amber-950/40` | `amber-300` | `amber-200` / `amber-800` |
| **Danger** | `rose-50` (`#FFF1F2`) | `rose-700` (`#BE123C`) | `rose-950/40` | `rose-300` | `rose-200` / `rose-800` |
| **Info** | `sky-50` (`#F0F9FF`) | `sky-700` (`#0369A1`) | `sky-950/40` | `sky-300` | `sky-200` / `sky-800` |

### 1.4 Stock-State Indicators
- **In Stock** ($\ge \text{reorder\_level}$): `bg-emerald-50 text-emerald-700 border-emerald-200` with emerald dot (`bg-emerald-500`).
- **Low Stock** ($0 < \text{stock} \le \text{reorder\_level}$): `bg-amber-50 text-amber-800 border-amber-200` with pulsing amber dot (`bg-amber-500`).
- **Out of Stock** ($\text{stock} \le 0$): `bg-rose-50 text-rose-700 border-rose-200` with solid rose dot (`bg-rose-500`).

---

## 2. Typography & Numbers
- **Font Family**: Inter Variable (`@fontsource-variable/inter`). Fallbacks: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`.
- **Tabular Figures**: `tabular-nums` applied systematically to all financial cells, barcode inputs, bill numbers, and stock metrics to prevent visual jitter during live updates.
- **`<Money />` Component**:
  - `Rs.` currency symbol: muted, smaller (`text-xs` / `text-sm`, `opacity-70`).
  - Integer rupees: prominent, semi-bold or bold (`font-bold`, tabular).
  - Cents fraction: lighter font weight and slightly muted (`font-medium text-slate-500 dark:text-slate-400`).
  - Three distinct scale presets:
    - `sm`: Inline table data and badge metrics (13px/14px)
    - `md`: Standard card summaries and row subtotals (16px/18px)
    - `hero`: Cart grand total, payment modal change due, and Z-Report totals (28px - 36px)

---

## 3. Elevation & Radius

### 3.1 Radius Scale
- `rounded-lg` (8px): Inputs, buttons, segmented controls, badge chips.
- `rounded-xl` (12px): Cards, dropdowns, table containers, popovers.
- `rounded-2xl` (16px): Dialogs, payment drawers, hero summary panels.

### 3.2 Shadow Scale
- `shadow-subtle`: `0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.04)` — Table rows, cards.
- `shadow-raised`: `0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -2px rgba(0,0,0,0.06)` — Product tiles, hovered elements, floating action bars.
- `shadow-overlay`: `0 20px 25px -5px rgba(0,0,0,0.15), 0 8px 10px -6px rgba(0,0,0,0.1)` — Modals, command palette, slide-over drawers.

---

## 4. Spacing & Density
- **8px Grid Rhythm**: All margins, paddings, and heights align to multiples of 4px/8px (e.g. `p-2` = 8px, `p-4` = 16px, `p-6` = 24px).
- **Density Toggle**:
  - `Comfortable` (Default, Touch): Touch target $\ge 44\text{px}$, spacious table rows, large keypad buttons.
  - `Compact` (Mouse/Desktop): Denser table row height ($\sim 36\text{px}$), streamlined padding for high-density administrative workflows.
- Stored per workstation in `localStorage('wewala-density')`.

---

## 5. Accessibility & Contrast (WCAG AA)
- Focus rings are mandatory: `focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2`.
- Contrast ratios verified $\ge 4.5:1$ for normal text and $\ge 3:1$ for large headings in both light and dark modes.
- Receipt preview and thermal print stylesheets are strictly locked to high-contrast white paper (`#FFFFFF`) with pure black text (`#000000`).
- Screen reader live announcements (`role="status" aria-live="polite"`) for live stock changes and cart modifications.

