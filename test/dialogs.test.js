import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmAction } from '../public/dialogs.js';
function setup(t) {
  const previous = globalThis.document;
  const dialog = {
    open: false,
    returnValue: '',
    innerHTML: '',
    showModal() {
      this.open = true;
    },
    close(value = '') {
      this.returnValue = value;
      this.open = false;
      this.onclose?.();
    },
  };
  globalThis.document = { querySelector: () => dialog };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  return dialog;
}
test('cancelar o cerrar una confirmación no autoriza el guardado', async (t) => {
  const dialog = setup(t);
  const canceled = confirmAction({ title: 'Guardar carga' });
  dialog.close('cancel');
  assert.equal(await canceled, false);
  const escaped = confirmAction();
  dialog.close();
  assert.equal(await escaped, false);
});
test('confirmar devuelve autorización una sola vez y escapa los datos visibles', async (t) => {
  const dialog = setup(t);
  const result = confirmAction({
    title: 'Guardar <persona>',
    details: ['<script>alert(1)</script>'],
    danger: true,
  });
  assert.ok(!dialog.innerHTML.includes('<script>'));
  assert.match(dialog.innerHTML, /&lt;persona&gt;/);
  assert.match(dialog.innerHTML, /destructive/);
  assert.equal(await confirmAction(), false);
  dialog.close('confirm');
  assert.equal(await result, true);
  assert.equal(dialog.onclose, null);
});
