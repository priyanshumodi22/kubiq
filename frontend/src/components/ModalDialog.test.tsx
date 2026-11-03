// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { ModalDialog } from './ModalDialog';
import { popoverRoot } from '../utils/popoverRoot';

afterEach(cleanup);
const cancelDialog = (dialog: HTMLElement) => fireEvent(dialog, new Event('cancel', { bubbles: true, cancelable: true }));

function Fixture() {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>Open form</button>{open &&
    <ModalDialog label="Fixture form" onClose={() => setOpen(false)}>
      <button onClick={() => setOpen(false)}>Close form</button>
      <input aria-label="Name" data-dialog-initial-focus />
      <button>Save</button>
    </ModalDialog>}</>;
}

function TransitionFixture() {
  const [step, setStep] = useState(0);
  return <><button onClick={() => setStep(1)}>Configure</button>
    {step === 1 && <ModalDialog key="chooser" label="Choose source" onClose={() => setStep(0)}><button onClick={() => setStep(2)}>Kubernetes</button></ModalDialog>}
    {step === 2 && <ModalDialog key="form" label="Source form" onClose={() => setStep(0)}><button>Save source</button></ModalDialog>}
  </>;
}

describe('shared dialog lifecycle', () => {
  it('restores the stable page trigger after replacing a chooser with a form', () => {
    const view = render(<TransitionFixture />);
    const trigger = view.getByRole('button', { name: 'Configure' });
    trigger.focus(); fireEvent.click(trigger);
    const choice = view.getByRole('button', { name: 'Kubernetes' });
    choice.focus(); fireEvent.click(choice);
    cancelDialog(view.getByRole('dialog', { name: 'Source form' }));
    expect(document.activeElement).toBe(trigger);
  });
  it('focuses the form, contains forward/backward Tab and restores its opener', () => {
    const view = render(<Fixture />);
    const opener = view.getByRole('button', { name: 'Open form' });
    opener.focus(); fireEvent.click(opener);
    expect(document.activeElement).toBe(view.getByRole('textbox', { name: 'Name' }));
    const close = view.getByRole('button', { name: 'Close form' });
    const save = view.getByRole('button', { name: 'Save' });
    save.focus(); fireEvent.keyDown(save, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(save);
    cancelDialog(view.getByRole('dialog', { name: 'Fixture form' }));
    expect(view.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('blocks dismissal while saving and allows it after saving finishes', () => {
    const onClose = vi.fn();
    const view = render(<ModalDialog label="Saving" onClose={onClose} busy><button>Save</button></ModalDialog>);
    cancelDialog(view.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    view.rerender(<ModalDialog label="Saving" onClose={onClose}><button>Save</button></ModalDialog>);
    cancelDialog(view.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('anchors menus in the modal and does not dismiss a parent with a nested modal', () => {
    const parentClose = vi.fn(); const childClose = vi.fn();
    const view = render(<ModalDialog label="Parent" onClose={parentClose}><button>Parent action</button>
      <ModalDialog label="Confirmation" onClose={childClose}><button>Child action</button></ModalDialog>
    </ModalDialog>);
    const child = view.getByRole('dialog', { name: 'Confirmation' });
    expect(popoverRoot(view.getByRole('button', { name: 'Child action' }))).toBe(child);
    cancelDialog(child);
    expect(childClose).toHaveBeenCalledOnce(); expect(parentClose).not.toHaveBeenCalled();
  });
});
