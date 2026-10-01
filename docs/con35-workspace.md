# Construction AI workspace — CON-35

## Design direction

A neutral dark work application with three distinct regions: navigation, decision workspace, and source context. Indigo identifies navigation and general actions; green identifies acceptance. Severity uses red for critical, orange for high, amber for medium, and neutral gray for low. Labels accompany color indicators.

The shared tokens and responsive primitives live in `app/globals.css`. The existing Button, Badge, Input, EvidenceQuotes, and SourceDocument components remain the foundation. Root navigation persists across routes; project tabs expose Overview, Changes, and Documents. The command palette searches projects and existing workspace destinations.

## Change review

The review queue separates open and settled findings. A selected finding shows a concise title, its full reading, previous/current values, the assessed reason, and exact source excerpts. Accepted and dismissed findings move to the settled queue; flagged findings remain open. Review identity and reason requirements continue to use the existing review API and append-only ledger.

Selection is preserved by finding anchors. A decision refresh completes before the next finding's anchor is written, avoiding a stale router-cache restoration. Evidence continues to use stored page IDs, offsets, and excerpts; the revision viewer highlights only an exact match and provides a return to the decision.

Equipment substitutions follow the existing engine's removal/addition behavior. This redesign does not infer an equipment substitution or change comparison rules.

## Responsive behavior and accessibility

At wider desktop sizes the queue, finding, and source context sit side by side. At intermediate widths evidence moves below the finding while the queue remains to its left. At small widths navigation becomes a compact header and the review regions stack. Source inspection retains a page index and integrated project navigation.

Review also retains CON-25’s remembered reviewer name, A/D/F decision shortcuts, arrow navigation, Enter confirmation for reasons, and focus movement to the selected finding. Keyboard support includes native links and buttons, visible focus rings, a skip link, and a modal command palette with arrow navigation, Enter, and Escape. The mobile search button retains an accessible name when its visible label is hidden. Reduced motion preferences disable transitions.

## Validation

- Typecheck and lint pass.
- All 133 unit/integration tests pass with local PostgreSQL access.
- Both Playwright workflows pass, including source upload and the workspace decision flow.
- Production build passes.
- Browser screenshots inspected for Projects, Project/Change Review, Documents, Revision source, and Needs attention at 1440, 1024, and 390 pixels. No horizontal overflow detected.
- Text contrast checks: primary 13.93:1; metadata 6.12:1; success/high/warning/error labels at least 6.76:1; primary button 4.97:1; acceptance button 6.52:1.

Screenshots are generated under ignored `test-results/con35-*.png` by `tests/e2e/workspace.spec.ts`. Its isolated review fixture is removed after the test. Figma was available to install but was not connected; design and visual review were completed in the application.
