import { $, $$, day, handleForm, showError, toast } from '../core/dom.js';
import { newId } from '../core/ids.js';
import { state } from '../core/state.js';
import { bindSearchFields, searchField } from '../search.js';
import { rowHtml, updateTotals, warningHtml } from '../components/hours.js';
import { flattenGroups, hasDraft, recordsFromGroups, rowLocation } from '../batch.js';
import { confirmAction } from '../dialogs.js';
import { api } from '../core/api.js';

export function captureDraft() {
  const form = $('#batch-form');
  if (!form) return;
  state.draftGroups = $$('.person-batch', form).map((group) => ({
    employee_id: $('[name=employee_id]', group).value,
    employee_id_query: $('[name=employee_id_query]', group).value,
    rows: $$('.entry', group).map((el) =>
      Object.fromEntries($$('input,select', el).map((i) => [i.name, i.value])),
    ),
  }));
}

export function renderLoad() {
  let flatIndex = 0;
  const blocks = state.draftGroups
    .map(
      (group, index) =>
        /* HTML */ `<section
          class="person-batch card"
          data-group="${index}"
          aria-labelledby="person-title-${index}"
        >
          <div class="person-heading">
            <div>
              <div class="eyebrow">LOTE POR PERSONA · ${index + 1}</div>
              <h2 id="person-title-${index}">Elegí una persona</h2>
            </div>
            <button type="button" class="quiet danger" data-remove-group="${index}">
              Quitar persona
            </button>
          </div>
          <div class="person-selector">
            ${searchField(
              'Empleado · nombre o DNI',
              'employee_id',
              state.catalog.employees.filter((e) => e.active),
              group.employee_id,
              true,
              group.employee_id_query,
            )}
          </div>
          <div class="place-records">
            <div class="records-heading">
              <h3>Lugares y horas</h3>
              <span class="badge"
                >${group.rows.length} registro${group.rows.length === 1 ? '' : 's'}</span
              >
            </div>
            ${group.rows.map((row, i) => rowHtml(row, flatIndex++, i + 1)).join('')}<button
              type="button"
              class="add-place"
              data-add-place="${index}"
            >
              ＋ Agregar lugar a esta persona
            </button>
          </div>
          <div class="person-subtotal">
            <span>Total de esta persona</span><strong data-person-total>0:00 h</strong>
          </div>
        </section>`,
    )
    .join('');
  $('#page').innerHTML = /* HTML */ `<header class="section">
      <div>
        <div class="eyebrow">Registro diario</div>
        <h1>Cargar horas</h1>
        <div class="muted">Cada persona con sus lugares. Todo en una misma carga.</div>
      </div>
    </header>
    <form id="batch-form">
      ${state.catalog.employees.some((e) => e.active) && state.catalog.places.some((p) => p.active)
        ? ''
        : '<div class="notice">Un administrador debe crear empleados y lugares activos antes de cargar horas.</div>'}
      <div id="person-batches">${blocks}</div>
      <button type="button" id="add-person" class="add-person">＋ Agregar otra persona</button>
      <section class="card batch-checkout">
        <div class="error form-error" role="alert"></div>
        <div id="batch-warnings"></div>
        <div class="summary">
          <div>
            <small
              >TOTAL DE LA CARGA · ${state.draftGroups.length}
              PERSONA${state.draftGroups.length === 1 ? '' : 'S'}</small
            >
            <div id="batch-total" class="total">0:00 <small>h</small></div>
            <small>Máximo 100 registros entre todas las personas.</small>
          </div>
          <div class="actions">
            <button type="submit" class="primary" id="save-batch">Guardar toda la carga</button>
          </div>
        </div>
      </section>
    </form>`;
  const form = $('#batch-form');
  bindSearchFields(form, state.catalog);
  $('#add-person').onclick = () => {
    captureDraft();
    if (flattenGroups(state.draftGroups).length >= 100)
      return toast('El máximo es 100 registros entre todas las personas.');
    state.draftGroups.push({ employee_id: '', rows: [{}] });
    renderLoad();
    $$('.person-batch').at(-1).querySelector('[role=combobox]').focus();
  };
  $$('[data-add-place]', form).forEach(
    (button) =>
      (button.onclick = () => {
        captureDraft();
        if (flattenGroups(state.draftGroups).length >= 100)
          return toast('El máximo es 100 registros entre todas las personas.');
        const group = state.draftGroups[Number(button.dataset.addPlace)];
        group.rows.push({ date: group.rows.at(-1)?.date || day() });
        renderLoad();
        const block = $(`.person-batch[data-group="${button.dataset.addPlace}"]`);
        $$('.entry', block).at(-1).querySelector('[role=combobox]').focus();
      }),
  );
  $$('[data-remove-group]', form).forEach(
    (button) =>
      (button.onclick = async () => {
        captureDraft();
        const index = Number(button.dataset.removeGroup);
        if (
          hasDraft([state.draftGroups[index]]) &&
          !(await confirmAction({
            title: 'Quitar persona',
            message: 'Se quitarán sus registros pendientes de esta carga.',
            confirmLabel: 'Quitar persona',
            danger: true,
          }))
        )
          return;
        state.draftGroups.splice(index, 1);
        if (!state.draftGroups.length) state.draftGroups = [{ employee_id: '', rows: [{}] }];
        renderLoad();
      }),
  );
  $$('[data-remove]', form).forEach(
    (button) =>
      (button.onclick = async () => {
        captureDraft();
        const location = flattenGroups(state.draftGroups)[Number(button.dataset.remove)];
        const rows = state.draftGroups[location.groupIndex].rows;
        const row = rows[location.rowIndex];
        if (
          hasDraft([{ rows: [row] }]) &&
          !(await confirmAction({
            title: 'Quitar registro',
            message: 'Se quitará esta fila pendiente. No afecta horas ya guardadas.',
            confirmLabel: 'Quitar registro',
            danger: true,
          }))
        )
          return;
        rows.splice(location.rowIndex, 1);
        if (!rows.length) rows.push({});
        renderLoad();
      }),
  );
  $$('[name=mode]', form).forEach(
    (el) =>
      (el.onchange = () => {
        captureDraft();
        const location = flattenGroups(state.draftGroups)[Number(el.closest('.entry').dataset.row)];
        const row = state.draftGroups[location.groupIndex].rows[location.rowIndex];
        row.start_time = '';
        row.end_time = '';
        renderLoad();
      }),
  );
  const changed = () => {
    captureDraft();
    updateTotals();
    $('#batch-warnings').innerHTML = '';
  };
  form.oninput = changed;
  form.onchange = changed;
  updateTotals();
  handleForm(
    form,
    async () => {
      captureDraft();
      await saveBatch();
    },
    loadConfirmation,
  );
}

export function loadConfirmation() {
  captureDraft();
  const rows = flattenGroups(state.draftGroups);
  return {
    title: 'Guardar toda la carga',
    message:
      'Se guardarán ' +
      rows.length +
      ' registros de ' +
      state.draftGroups.length +
      ' bloques de personas.',
    details: state.draftGroups.map(
      (group) =>
        (state.catalog.employees.find((employee) => employee.id === group.employee_id)?.name ||
          'Empleado') +
        ' · ' +
        group.rows.length +
        ' registros',
    ),
    confirmLabel: 'Guardar carga',
  };
}

export async function saveBatch(warningToken) {
  if (state.busy) return;
  state.busy = true;
  const form = $('#batch-form'),
    button = $('#save-batch');
  button.disabled = true;
  captureDraft();
  const payload = {
    submission_id: state.submissionId,
    records: recordsFromGroups(state.draftGroups),
    warning_token: warningToken,
  };
  const controls = $$('input,select,button', form);
  controls.forEach((el) => (el.disabled = true));
  $$('.row-error', form).forEach((el) => (el.textContent = ''));
  $('.form-error', form).textContent = '';
  try {
    const r = await api('/records/batch', { method: 'POST', body: JSON.stringify(payload) });
    toast(r.message);
    state.draftGroups = [{ employee_id: '', rows: [{}] }];
    state.submissionId = newId();
    renderLoad();
  } catch (e) {
    if (e.reset_submission) state.submissionId = newId();
    if (e.warnings) {
      $('#batch-warnings').innerHTML = warningHtml(e.warnings);
      $('#confirm-warnings').onclick = async () => {
        if (
          await confirmAction({
            title: 'Guardar con advertencias',
            message: 'Confirmá que revisaste las coincidencias y duraciones indicadas.',
            details: e.warnings.map(
              (w) =>
                (w.row !== undefined ? rowLocation(state.draftGroups, w.row) + ': ' : '') +
                w.message,
            ),
            confirmLabel: 'Confirmar y guardar',
          })
        )
          await saveBatch(e.warning_token);
      };
    } else {
      showError(e, $('.form-error', form));
      e.errors?.forEach((error) => {
        const el = $(`.entry[data-row="${error.row}"] .row-error`);
        if (el) el.textContent = error.message;
      });
    }
  } finally {
    state.busy = false;
    controls.forEach((el) => (el.disabled = false));
    button.disabled = false;
  }
}
