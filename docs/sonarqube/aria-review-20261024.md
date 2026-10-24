# Individual custom-combobox reviews

Reviewed source: `d7c95c9acf652313b61a3197116d10ca45f07a65`.
These five S6819 findings were individually marked **False Positive** in the
authenticated Sonar UI with a separate rationale for each. They are not counted
as verified dispositions only after the exact-commit export confirms RESOLVED.
Analysis `e707c02a-85d1-42db-8cd9-eb672b193254` now confirms all five RESOLVED
in source `d7c95c9`; the archived report and finding ledger record that evidence.
No rule was disabled and no file was excluded.

| Issue | Component | Element reviewed |
| --- | --- | --- |
| `2172045e-d1e2-422e-a632-c14dec887ef4` | CustomSelect | Select-only combobox trigger |
| `f335c5da-301a-4d83-bdf1-a450f7fa8cd3` | CustomSelect | Controlled listbox popup |
| `e7b2a343-535e-4e7b-be83-e4a0586dc6fd` | CustomSelect | Single-select popup options |
| `807087f8-d812-4aa9-9dc0-5a08c19094cf` | Combobox | Editable autocomplete listbox |
| `f11474e2-ce31-4bd7-b564-67a3ed40d8a7` | Combobox | Editable autocomplete options |

The implementation follows the [W3C APG combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):
named comboboxes control named listboxes; stable option IDs support
aria-activedescendant, aria-selected exposes selection and popup options stay
outside the Tab sequence. The editable control preserves arbitrary header text.
Native select/option substitutions would change that behavior or the approved
custom popup presentation; removing the ARIA roles would remove the semantics.

Eight `selectKeyboard.test.tsx` tests cover selection, Home/End/arrow navigation,
Escape, blur, pointer selection, disabled state, no accidental form submission,
free text and active-option visibility. The audit fixed two actual defects:
the disabled trigger no longer references a hidden option, and active options
scroll into view.

Chrome verification on 2026-10-24 used the actual components with Tailwind v4:
ArrowDown/Enter selected ICMP, the editable field selected Authorization from
typed `Auth`, Escape preserved the committed selection, and keyboard focus
returned to/remained on the owning combobox. No screen-reader or mobile-device
certification is claimed. The temporary local fixture and server were removed.

The user explicitly approved granting the existing Administrator account
Administer Issues on kubiq only. The project remains private; the verifier keeps
Browse only, default groups gain no rights, and routine scan/read tokens are
unchanged. No new administrator token was created.
