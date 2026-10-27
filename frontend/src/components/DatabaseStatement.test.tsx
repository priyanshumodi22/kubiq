// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { DatabaseStatement } from './DatabaseStatement';
import type { ISpan } from '../hooks/useTrace';
afterEach(cleanup);
const span = { attributes: {} } as ISpan;
it('renders MongoDB commands and redaction clearly, with bounded-preview and legacy SQL support', () => {
    const view = render(<DatabaseStatement span={{ ...span, attributes: { 'db.system.name': 'mongodb', 'db.query.text': '{"find":"users","filter":{"password":"[REDACTED]"}}' } }} />);
    expect(view.getByText('Passwords or credentials redacted')).toBeTruthy();
    expect(view.getByText(/"find": "users"/)).toBeTruthy();
    view.rerender(<DatabaseStatement span={{ ...span, attributes: { 'db.system': 'mysql', 'db.statement': 'SELECT * FROM orders WHERE id = ?' } }} />);
    expect(view.getByText('SELECT * FROM orders WHERE id = ?')).toBeTruthy();
    view.rerender(<DatabaseStatement span={{ ...span, attributes: { 'db.system': 'mysql', 'db.query.text': '{"truncated":true,"preview":"SELECT ..."}' } }} />);
    expect(view.getByText(/Capture size limit reached/)).toBeTruthy();
});
it('distinguishes a repository or old span without query text from a non-database span', () => {
    const view = render(<DatabaseStatement span={{ ...span, attributes: { 'db.system': 'mongodb' } }} />);
    expect(view.getByText(/No query text was recorded/)).toBeTruthy();
    view.rerender(<DatabaseStatement span={span} />);
    expect(view.queryByRole('region')).toBeNull();
});
