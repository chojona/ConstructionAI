# ConstructionAI tokens

Figma file 0oY0fiaFtVSlnol9Xk2FRC, local variable collection **"ConstructionAI tokens"** (one mode: Light). Visual reference: Untitled UI FREE kit v2.0 (CC BY 4.0), values rebuilt locally; no kit code.

CSS name = variable name with `/` → `-`, e.g. `color/brand/600` → `var(--color-brand-600)` (set as WEB code syntax on every variable).

## Color primitives

| Name | Value | Usage |
|---|---|---|
| `color/brand/25` | `#FFFCF5` | Selected table row background |
| `color/brand/50` | `#FEF7E9` | Brand tint: Pilot/warning badge bg, annotation bg |
| `color/brand/100` | `#FCEDCC` | Brand tint (light) |
| `color/brand/200` | `#F7D99A` | Brand border tint |
| `color/brand/500` | `#D79A32` | Primary button fill, active tab underline |
| `color/brand/600` | `#B9802A` | Primary button hover (one step darker) |
| `color/brand/700` | `#94601A` | Focus ring, selected-row bar, links, warning text |
| `color/brand/800` | `#7A4F0E` | Amber slot text ([account name] etc.) |
| `color/gray/0` | `#FFFFFF` | White |
| `color/gray/50` | `#F9FAFB` | Canvas bg, row/nav hover |
| `color/gray/100` | `#F2F4F7` | Subtle bg, gray badge, disabled button |
| `color/gray/200` | `#EAECF0` | Default border/divider |
| `color/gray/300` | `#D0D5DD` | Secondary button border |
| `color/gray/400` | `#858E9E` | Input border (3.3:1 on white) |
| `color/gray/500` | `#667085` | Tertiary text, icons, placeholder |
| `color/gray/600` | `#475467` | Secondary text |
| `color/gray/700` | `#344054` | Labels, secondary button text |
| `color/gray/900` | `#101828` | Primary text, text on brand |
| `color/success/50` | `#ECFDF3` | Success badge bg |
| `color/success/500` | `#12B76A` | Status dot |
| `color/success/700` | `#027A48` | Success text |
| `color/error/50` | `#FEF3F2` | Error summary bg |
| `color/error/200` | `#FECDCA` | Error summary border |
| `color/error/600` | `#A3363C` | Error text/border, danger fill |
| `color/error/700` | `#8A2D33` | Danger button hover (one step darker) |

## Color semantic (aliases)

| Name | Value | Alias of | Usage |
|---|---|---|---|
| `color/text/primary` | `#101828` | `color/gray/900` | Primary text |
| `color/text/secondary` | `#475467` | `color/gray/600` | Secondary/supporting text |
| `color/text/tertiary` | `#667085` | `color/gray/500` | Placeholder, meta, icons |
| `color/text/label` | `#344054` | `color/gray/700` | Field labels, secondary button label |
| `color/text/on-brand` | `#101828` | `color/gray/900` | Text on primary (amber) button |
| `color/text/on-danger` | `#FFFFFF` | `color/gray/0` | Text on danger button |
| `color/text/disabled` | `#475467` | `color/gray/600` | Disabled text, 4.5:1 or better on gray/100 |
| `color/text/link` | `#94601A` | `color/brand/700` | Links |
| `color/text/error` | `#A3363C` | `color/error/600` | Inline error text |
| `color/text/success` | `#027A48` | `color/success/700` | Success badge text |
| `color/text/warning` | `#94601A` | `color/brand/700` | Warning badge text |
| `color/text/accent` | `#7A4F0E` | `color/brand/800` | Amber slots |
| `color/border/default` | `#EAECF0` | `color/gray/200` | Card/table borders, dividers |
| `color/border/strong` | `#D0D5DD` | `color/gray/300` | Secondary button border |
| `color/border/input` | `#858E9E` | `color/gray/400` | Input border |
| `color/border/error` | `#A3363C` | `color/error/600` | Input error border |
| `color/bg/surface` | `#FFFFFF` | `color/gray/0` | Cards, inputs, modals |
| `color/bg/canvas` | `#F9FAFB` | `color/gray/50` | Page background |
| `color/bg/subtle` | `#F2F4F7` | `color/gray/100` | Subtle fills, gray badge |
| `color/bg/hover` | `#F9FAFB` | `color/gray/50` | Row / nav item hover |
| `color/bg/selected` | `#FFFCF5` | `color/brand/25` | Selected table row |
| `color/bg/brand` | `#D79A32` | `color/brand/500` | Primary button fill |
| `color/bg/brand-hover` | `#B9802A` | `color/brand/600` | Primary button hover |
| `color/bg/disabled` | `#F2F4F7` | `color/gray/100` | Disabled button/input fill |
| `color/bg/success` | `#ECFDF3` | `color/success/50` | Success badge bg |
| `color/bg/warning` | `#FEF7E9` | `color/brand/50` | Warning badge bg |
| `color/bg/error` | `#FEF3F2` | `color/error/50` | Error summary bg |
| `color/danger` | `#A3363C` | `color/error/600` | Danger button fill (#a3363c) |
| `color/danger-hover` | `#8A2D33` | `color/error/700` | Danger button hover |
| `color/focus` | `#94601A` | `color/brand/700` | Focus ring (2px) and selected-row bar |
| `color/border/input-hover` | `#667085` | `color/gray/500` | Input border on hover |

## Spacing, radius, type, size

| Name | Value | Usage |
|---|---|---|
| `space/0-5` | `2px` | Spacing 2px (padding, gap) |
| `space/1` | `4px` | Spacing 4px (padding, gap) |
| `space/1-5` | `6px` | Spacing 6px (padding, gap) |
| `space/2` | `8px` | Spacing 8px (padding, gap) |
| `space/2-5` | `10px` | Spacing 10px (padding, gap) |
| `space/3` | `12px` | Spacing 12px (padding, gap) |
| `space/3-5` | `14px` | Spacing 14px (padding, gap) |
| `space/4` | `16px` | Spacing 16px (padding, gap) |
| `space/5` | `20px` | Spacing 20px (padding, gap) |
| `space/6` | `24px` | Spacing 24px (padding, gap) |
| `space/7` | `28px` | Spacing 28px (padding, gap) |
| `space/8` | `32px` | Spacing 32px (padding, gap) |
| `space/10` | `40px` | Spacing 40px (padding, gap) |
| `space/12` | `48px` | Spacing 48px (padding, gap) |
| `radius/xs` | `4px` | Corner radius 4px |
| `radius/sm` | `6px` | Corner radius 6px |
| `radius/md` | `8px` | Corner radius 8px |
| `radius/lg` | `10px` | Corner radius 10px |
| `radius/xl` | `12px` | Corner radius 12px |
| `radius/2xl` | `16px` | Corner radius 16px |
| `radius/full` | `999px` | Corner radius 999px |
| `font/size/xs` | `12px` | Font size 12px |
| `font/size/sm` | `14px` | Font size 14px |
| `font/size/md` | `16px` | Font size 16px |
| `font/size/lg` | `18px` | Font size 18px |
| `font/size/xl` | `20px` | Font size 20px |
| `font/size/display-xs` | `24px` | Font size 24px |
| `font/size/display-sm` | `30px` | Font size 30px |
| `font/size/display-md` | `36px` | Font size 36px |
| `font/size/display-xl` | `48px` | Font size 48px |
| `font/line-height/xs` | `18px` | Line height 18px |
| `font/line-height/sm` | `20px` | Line height 20px |
| `font/line-height/md` | `24px` | Line height 24px |
| `font/line-height/lg` | `28px` | Line height 28px |
| `font/line-height/xl` | `30px` | Line height 30px |
| `font/line-height/display-xs` | `32px` | Line height 32px |
| `font/line-height/display-sm` | `38px` | Line height 38px |
| `font/line-height/display-md` | `44px` | Line height 44px |
| `font/line-height/display-xl` | `60px` | Line height 60px |
| `size/target-min` | `44px` | Minimum tap target / control height |
| `size/border-focus` | `2px` | Focus ring width |

## State contrast (WCAG 2.x)

| Pair | Ratio | Needs |
|---|---|---|
| #101828 on #D79A32 (primary text) | 7.23:1 | 4.5:1 |
| #101828 on #B9802A (primary hover) | 5.23:1 | 4.5:1 |
| #FFFFFF on #A3363C (danger) | 6.67:1 | 4.5:1 |
| #FFFFFF on #8A2D33 (danger hover) | 8.39:1 | 4.5:1 |
| #344054 on #FFFFFF (secondary) | 10.46:1 | 4.5:1 |
| #344054 on #F9FAFB (secondary/nav hover) | 10.01:1 | 4.5:1 |
| #475467 on #F2F4F7 (disabled button/input) | 6.98:1 | 4.5:1 |
| #475467 on #FFFFFF (secondary disabled) | 7.69:1 | 4.5:1 |
| #667085 on #FFFFFF (placeholder, nav disabled) | 4.97:1 | 4.5:1 |
| #94601A on #FEF7E9 (warning badge) | 4.99:1 | 4.5:1 |
| #7A4F0E on #FEF7E9 (brand badge) | 6.67:1 | 4.5:1 |
| #027A48 on #ECFDF3 (success badge) | 5.13:1 | 4.5:1 |
| #A3363C on #FFFFFF (error text/border) | 6.67:1 | 4.5:1 |
| #94601A on #FFFFFF (focus ring vs page) | 5.32:1 | 3:1 |
| #94601A on #FFFCF5 (selected-row bar) | 5.19:1 | 3:1 |
| #858E9E on #FFFFFF (input border) | 3.30:1 | 3:1 |
| #667085 on #FFFFFF (input hover border) | 4.97:1 | 3:1 |
| #101828 on #F9FAFB (row hover) | 16.98:1 | 4.5:1 |
| #101828 on #FFFCF5 (row selected) | 17.32:1 | 4.5:1 |

Focus on filled buttons is drawn as a 2px offset ring outside the button (`#94601A` vs `#D79A32` is only 2.17:1 and vs `#A3363C` 1.25:1, so the ring must not sit on the fill).
