# Responsive Logs and APM verification — 2026-10-29

## Change

Final application source: `5a9e5cbfb325be05484554c8b4f78c08b9e3b6bf`. Initial rollout: `main-198` (`a0d75da`), Flux commit `6e70579`. Final rollout: `main-201`, Flux commit `ae24fb30c101ee39f9a2db9d04e7b43e5213cecb`.

The Logs page previously used one desktop viewport height even when the source list and viewer stacked on mobile. The fixed site footer obscured the viewer. The page now grows naturally on narrow screens, with a bounded source list and a separately sized, scrollable viewer. On desktop the panels remain side by side. The footer stays in document flow on all widths.

Kubernetes and VM log configuration retain kubiq controls. Kubernetes form fields scroll within the available dynamic viewport while the header and actions remain visible. VM configuration, APM configuration/export, and instrumentation dialogs are height-bounded. VM inputs stack on mobile. VM/APM configuration and APM export overlays render through body portals above the fixed navigation and kubi launcher. Portaled APM pickers clamp to the visible viewport and scroll when needed. Stream summary controls have reserved space; long log lines and source labels wrap. APM service lists have a shorter mobile limit, waterfall actions wrap, the timeline retains its own horizontal scrollbar, and span details fill the dynamic viewport with a scrollable body and safe-area bottom padding.

No ingestion, retention, authentication, permissions, source persistence, or stream lifecycle logic changed. Kubernetes collection remains viewer-connected.

## Automated checks

- Frontend lint, TypeScript/Vite build and 404 tests passed locally.
- Exact-source application verification: [40832206508](https://github.com/priyanshumodi22/kubiq/actions/runs/40832206508), successful.
- Exact-source Sonar: [40832209173](https://github.com/priyanshumodi22/kubiq/actions/runs/40832209173), successful; analysis `5085c426-ab4b-48c9-a9f4-97272d0538e5`. Strict gate and Sheets/archive receipt passed; no open/confirmed issues or unreviewed hotspots.
- Follow-up portal/form source `37dd6d6`: application verification and Sonar [40834704298](https://github.com/priyanshumodi22/kubiq/actions/runs/40834704298) passed.
- Final picker source verification: [40834955273](https://github.com/priyanshumodi22/kubiq/actions/runs/40834955273), passed; 4 geometry regression tests added. Final Sonar [40834957184](https://github.com/priyanshumodi22/kubiq/actions/runs/40834957184) passed, including export receipt for analysis `dda609e4-dd20-4e5f-8d5a-9699f8f415ad`. Final publication [40836039821](https://github.com/priyanshumodi22/kubiq/actions/runs/40836039821) passed: 500 backend and 408 frontend tests, both builds/lints, packaged SDK Node 20/22, MongoDB/MySQL/MariaDB/ClickHouse fixtures and bundled-image checks.

## Browser acceptance checklist

- Mobile document has no horizontal overflow and can scroll past the complete viewer to the footer.
- Live stream has its own usable scroll area; the final row is reachable without footer/summary overlap.
- Source chooser has both bottom actions and its close control.
- Kubernetes namespace/resource/container menus work without saving or altering the existing source.
- Short-screen form body scrolls while Save/Cancel and close stay reachable.
- VM source form and APM configuration/instrumentation/export fit narrow/short screens.
- Trace waterfall horizontal scrolling stays inside its panel.
- Exact span drawer and span-to-logs navigation remain usable.
- Desktop retains side-by-side Logs panels and normal APM controls.

Chrome viewport emulation is used for browser acceptance; physical-phone keyboard/browser-toolbar behavior is not claimed as verified.

## Initial live observations (main-198)

Chrome measured CSS viewports: 360×640, 390×844, 767×1024 and 1440×900 (browser zoom accounted for). Document width stayed within each viewport. At 360×640 the Logs source panel was 320 px high, viewer 512 px, and live-scroll body 287 px. Footer began below the viewer at document y=1088. Scrolling the stream changed its own scrollTop while page scrollY stayed at 300. Resuming tailing reached scrollTop 91881 / maximum 91882 (within 1 px).

At 360×640 Kubernetes form Save/Cancel bottom was y=603 and Close top y=33; fields scrolled independently (419 px viewport / 524 px content). Namespace/resource/container custom menus worked with an unsaved draft, then Cancel preserved the saved source.

A real completion event correlated in both mobile views: trace `c95bcc7c13067d1ceef30e69da5c204f`, span `a37ac71e54530cdd`, event `3728c16e-5e05-4537-89ac-b5d391e56be4`. Exact-span log search returned one matching retained row and its reverse links. At 390×844 the span drawer filled the viewport and its body reached the bottom identifiers while Close stayed at y=16. Source configuration `6d507837-973f-443c-963b-ca0bdfb984d1` was not changed.

The short-screen instrumentation guide body scrolled with footer actions inside the viewport. Live review also discovered cramped VM inputs, APM configuration/export stacking below navigation, and a time-picker bottom below the viewport; the final follow-up commits address these findings and were rechecked after the final rollout.

## Final live verification (main-201)

- VM configuration at 360×640: log path input widened to 260 px, fields stacked, Save/Cancel visible. Unsaved form cancelled.
- APM configuration at 360×640: complete header and full-width Save/Cancel displayed above navigation and kubi. No settings submitted. At 640×360 landscape, Cancel remained reachable at y=277–319 after scrolling.
- Time picker at 360×640: portal bounds y=304–624; after internal scrolling, Set time was visible at y=575–611. No custom range submitted. P95 picker opened independently at y=344–529 without page overflow.
- APM export: title rendered above navigation, Download CSV reachable at y=561–603 after scrolling; cancelled without downloading or changing data.
- Saved Kubernetes source streamed the replacement pod `kubiq-79dc89466-ncq2f`. At 390×844 the live scroll body was 438 px high and tail reached scrollTop 31712 / maximum 31712. Page width 382 px stayed within the 390 px viewport. Footer remained in document flow below the complete viewer.
- Exact-span detail, retained correlated-log results and reverse trace/span links were verified with the real event above; source settings were preserved.
- All five Flux Kustomizations Ready; kubiq pod Ready, zero restarts, 99 MiB/43m CPU observed. kubiq and portfolio health 200; portfolio activity and SSE 200; unauthenticated ingestion/analytics 401.
- Prior image `main-198` remains available for rollback. Existing on-demand Sonar shutdown policy is unchanged.
- Temporary browser tabs closed and viewport overrides removed; final Logs tab left at normal 2133×950 desktop viewport.

### Local visual evidence

Evidence directory: `C:/Users/Priyanshu/.codex/visualizations/2026/10/01/01a0f921-c577-7621-9e5d-d6927d6e2a86/mobile-observability-20261029/`.

- `logs-live-390-final.jpg` / `logs-page-390-final.jpg`
- `vm-form-360-final.jpg`
- `apm-config-360-final.jpg`
- `apm-time-picker-360-final.jpg`
- Initial form and span drawer evidence retained in the same directory.

No new production resources or saved test sources were created. Physical-phone keyboard and browser-toolbar behavior remains unobserved; Chrome viewport emulation passed the dimensions listed above.
