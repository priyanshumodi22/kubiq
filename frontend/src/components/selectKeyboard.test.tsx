// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomSelect } from './CustomSelect';
import Combobox from './Combobox';
import { listboxIndex } from './listboxNavigation';

afterEach(cleanup);
const options = [{ value: 'http', label: 'HTTP' }, { value: 'icmp', label: 'ICMP' }, { value: 'tcp', label: 'TCP' }];

describe('custom select keyboard and focus', () => {
  it('navigates, selects once, closes and preserves trigger focus', () => {
    const change = vi.fn();
    const view = render(<CustomSelect value="http" onChange={change} options={options} label="Monitor type" />);
    const trigger = view.getByRole('combobox', { name: 'Monitor type' });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const activeId = trigger.getAttribute('aria-activedescendant');
    expect(view.getByRole('option', { name: 'ICMP' }).id).toBe(activeId);
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(change).toHaveBeenCalledExactlyOnceWith('icmp');
    expect(view.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('supports Home/End, Escape without selection, blur and disabled state', () => {
    const change = vi.fn();
    const view = render(<><CustomSelect value="http" onChange={change} options={options} label="Type" /><button type="button">Outside</button></>);
    const trigger = view.getByRole('combobox');
    fireEvent.keyDown(trigger, { key: 'End' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(view.getByRole('option', { name: 'TCP' }).id);
    fireEvent.keyDown(trigger, { key: 'Home' });
    expect(trigger.getAttribute('aria-activedescendant')).toBe(view.getByRole('option', { name: 'HTTP' }).id);
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(view.queryByRole('listbox')).toBeNull();
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.blur(trigger, { relatedTarget: view.getByRole('button', { name: 'Outside' }) });
    expect(view.queryByRole('listbox')).toBeNull();
    view.rerender(<CustomSelect value="http" onChange={change} options={options} label="Type" disabled />);
    expect((view.getByRole('combobox') as HTMLButtonElement).disabled).toBe(true);
  });

  it('mouse selection restores focus and does not submit a containing form', () => {
    const change = vi.fn();
    const submit = vi.fn(event => event.preventDefault());
    const view = render(<form onSubmit={submit}><CustomSelect value="http" onChange={change} options={options} label="Type" /></form>);
    fireEvent.click(view.getByRole('combobox'));
    fireEvent.click(view.getByRole('option', { name: 'TCP' }));
    expect(change).toHaveBeenCalledExactlyOnceWith('tcp');
    expect(document.activeElement).toBe(view.getByRole('combobox'));
    expect(submit).not.toHaveBeenCalled();
  });

  it('removes the active descendant when a currently open select is disabled', () => {
    const view = render(<CustomSelect value="http" onChange={vi.fn()} options={options} label="Type" />);
    const trigger = view.getByRole('combobox');
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(trigger.getAttribute('aria-activedescendant')).toBeTruthy();
    view.rerender(<CustomSelect value="http" onChange={vi.fn()} options={options} label="Type" disabled />);
    expect(view.queryByRole('listbox')).toBeNull();
    expect(trigger.hasAttribute('aria-activedescendant')).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('editable combobox', () => {
  it('retains free text and supports filtered keyboard selection', () => {
    const change = vi.fn();
    const view = render(<Combobox value="" onChange={change} options={['Accept', 'Authorization']} label="Header" />);
    const input = view.getByRole('combobox', { name: 'Header' });
    input.focus();
    fireEvent.change(input, { target: { value: 'Auth' } });
    expect(change).toHaveBeenLastCalledWith('Auth');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(change).toHaveBeenLastCalledWith('Authorization');
    expect(view.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'X-Custom' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect((input as HTMLInputElement).value).toBe('X-Custom');
  });

  it('mouse selection closes even when focus returns from an option', () => {
    const change = vi.fn();
    const view = render(<Combobox value="" onChange={change} options={['Accept']} label="Header" />);
    const input = view.getByRole('combobox');
    fireEvent.focus(input);
    const option = view.getByRole('option');
    option.focus();
    fireEvent.click(option);
    expect(view.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(change).toHaveBeenCalledExactlyOnceWith('Accept');
  });
});

it('handles empty lists and wraps keyboard navigation', () => {
  expect(listboxIndex('ArrowDown', -1, 0)).toBeUndefined();
  expect(listboxIndex('ArrowUp', 0, 3)).toBe(2);
  expect(listboxIndex('ArrowDown', 2, 3)).toBe(0);
  expect(listboxIndex('Tab', 0, 3)).toBeUndefined();
});

it('scrolls the active option into view while retaining combobox focus', () => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
  const scroll = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
  try {
    const view = render(<><CustomSelect value="http" onChange={vi.fn()} options={options} label="Type" /><Combobox value="" onChange={vi.fn()} options={['Accept', 'Authorization']} label="Header" /></>);
    const select = view.getByRole('combobox', { name: 'Type' });
    select.focus();
    fireEvent.keyDown(select, { key: 'End' });
    expect(scroll).toHaveBeenLastCalledWith({ block: 'nearest' });
    expect(document.activeElement).toBe(select);
    scroll.mockClear();
    const input = view.getByRole('combobox', { name: 'Header' });
    input.focus();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
    expect(document.activeElement).toBe(input);
  } finally {
    if (original) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', original);
    else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});
