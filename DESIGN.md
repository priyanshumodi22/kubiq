# kubiq design context

## Scope and evidence
This records the local login redesign. It does not redefine other screens.
User direction: retain kubiq branding and redesign the overall login form and screen.
Existing evidence: frontend/src/components/Header.tsx, Footer.tsx, pages/Profile.tsx,
pages/Login.tsx and contexts/AuthContext.tsx.

## Visual direction
Dark operational workspace, restrained blue accents, rounded bordered surfaces.
Desktop login uses one framed, two-column composition: product identity and capabilities
on the left, authentication on the right. Mobile collapses to a compact brand header
and form; descriptive desktop content is omitted rather than squeezed.
No fabricated health statistics, external fonts, or decorative motion.

## Runtime token ownership
frontend/src/index.css @theme remains the owner. No generated adapter or second palette.
Background #0a0a0a, surface #1a1a1a, elevated #2a2a2a, primary #3b82f6,
text #f5f5f5, secondary text #a3a3a3. Use Tailwind v4 token utilities.
Use the existing system sans font for headings/body and existing monospace for utility captions.

## Login behavior owners
AuthContext owns native/SSO/session transitions. The existing apiClient and
@simplewebauthn/browser own passkey requests. Login.tsx owns field presentation,
pending state and inline error display. Footer owns legal links and its app dialog.
Do not change server validation, credential handling, auth availability or redirects for styling.
Password visibility is local UI state; it must not change the password value.
Form fields retain labels, autofill and paste. Buttons retain busy/disabled states.

## Verification
Login.test.tsx verifies existing auth compatibility and password visibility.
Inspect desktop, 390px and 320px widths; footer follows the form and never overlaps it.
Do not deploy or push this local review without user authorization.
