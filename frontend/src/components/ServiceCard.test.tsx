// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ServiceCard from './ServiceCard';
import type { ServiceStatus } from '../types';

afterEach(cleanup);
const service: ServiceStatus = { name: 'payments', endpoint: 'https://example.test/health', currentStatus: 'healthy', history: [] };

describe('service card controls', () => {
  it('provides a named native details button with visible keyboard focus', () => {
    const onClick = vi.fn();
    const view = render(<ServiceCard service={service} onClick={onClick} />);
    const button = view.getByRole('button', { name: 'View payments details' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.tabIndex).toBe(0);
    expect(button.className).toContain('focus-visible:outline-2');
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps administrator actions separate from opening details', () => {
    const onClick = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const view = render(<ServiceCard service={service} onClick={onClick} onEdit={onEdit} onDelete={onDelete} isAdmin />);
    fireEvent.click(view.getByRole('button', { name: 'Edit' }));
    fireEvent.click(view.getByRole('button', { name: 'Delete' }));
    expect(onEdit).toHaveBeenCalledWith(service);
    expect(onDelete).toHaveBeenCalledWith(service);
    expect(onClick).not.toHaveBeenCalled();
    expect(view.container.querySelector('button button')).toBeNull();
  });

  it('does not expose administrator actions to a non-administrator', () => {
    const view = render(<ServiceCard service={service} onClick={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(view.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(view.queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
