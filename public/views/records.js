import { sortControl } from '../components/sort-control.js';
import { downloadFilename } from '../../shared/export-names.js';
import {
  $,
  $$,
  escape,
  formData,
  handleForm,
  hours,
  modal,
  modalHead,
  openModal,
  showError,
  toast,
} from '../core/dom.js';
import { filterHtml, filterPanel, bindFilterPanel, pager, query } from '../components/filters.js';
import { state } from '../core/state.js';
import { bindSearchFields, searchField } from '../search.js';
import { api } from '../core/api.js';
import { historyModal } from './history.js';
import { confirmAction } from '../dialogs.js';
import { rowHtml, rowPayload, updateTotals, warningHtml } from '../components/hours.js';
import { exportMenu, bindExportMenu } from '../components/export-menu.js';
import { recordCard, bindRecordMenus } from '../components/record-card.js';

export async function renderRecords() {
  $('#page').innerHTML = /* HTML */ `<header class="section">
      <div>
        <div class="eyebrow">Consulta y reportes</div>
        <h1>Registros</h1>
        <span class="muted">Buscá, corregí y compartí las horas registradas.</span>
      </div>
    </header>
    <section class="card">
      <form id="filters">${filterPanel(state.recordFilters, filterHtml(state.recordFilters))}</form>
    </section>
    <section class="card" id="results"><p class="muted">Cargando registros…</p></section>`;
  bindSearchFields($('#filters'), state.catalog);
  bindFilterPanel($('#filters'), () => {
    state.recordFilters = {};
    state.recordPage = 0;
    renderRecords();
  });
  handleForm($('#filters'), async () => {
    state.recordFilters = formData($('#filters'));
    state.recordPage = 0;
    await renderRecords();
  });
  try {
    const data = await api(
      '/records?' +
        query({ ...state.recordFilters, sort: state.recordSort, page: state.recordPage }),
    );
    if (state.view !== 'records') return;
    $('#results').innerHTML = /* HTML */ `<header class="section">
        <h2>${data.count} registros</h2>
        <div class="results-tools">
          <div>
            <small>TOTAL FILTRADO</small>
            <div class="total">${hours(data.minutes)} <small>h</small></div>
          </div>
          ${sortControl(state.recordSort)}${exportMenu()}
        </div>
      </header>
      ${data.records.length
        ? data.records.map(recordCard).join('')
        : '<div class="empty">No hay registros para estos filtros.</div>'}${pager(
        state.recordPage,
        data.count,
      )}`;
    $('[data-sort-control]').onchange = (event) => {
      state.recordSort = event.target.value;
      state.recordPage = 0;
      renderRecords();
    };
    bindExportMenu($('#results'), download);
    bindRecordMenus($('#results'));
    $('#previous').onclick = () => {
      state.recordPage--;
      renderRecords();
    };
    $('#next').onclick = () => {
      state.recordPage++;
      renderRecords();
    };
    $$('[data-edit]').forEach(
      (b) => (b.onclick = () => editRecord(data.records.find((r) => r.id === b.dataset.edit))),
    );
    $$('[data-history]').forEach((b) => (b.onclick = () => historyModal(b.dataset.history)));
    $$('[data-delete]').forEach(
      (b) =>
        (b.onclick = async () => {
          const r = data.records.find((r) => r.id === b.dataset.delete);
          if (
            !(await confirmAction({
              title: 'Eliminar registro',
              message: `${r.employee_name} · ${r.place_name}. Se conservará el historial.`,
              confirmLabel: 'Eliminar',
              danger: true,
            }))
          )
            return;
          b.disabled = true;
          try {
            const result = await api('/records/' + r.id, {
              method: 'DELETE',
              body: JSON.stringify({ version: r.version }),
            });
            toast(result.message);
            renderRecords();
          } catch (e) {
            showError(e);
            b.disabled = false;
          }
        }),
    );
  } catch (e) {
    showError(e);
    if ($('#results'))
      $('#results').innerHTML = '<div class="empty">No pudimos cargar los registros.</div>';
  }
}

export async function download(format) {
  try {
    // Export the applied results, not an unfinished edit in the filter form.
    const response = await fetch(
      '/api/export/' + format + '?' + query({ ...state.recordFilters, sort: state.recordSort }),
    );
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }
    const url = URL.createObjectURL(await response.blob()),
      a = document.createElement('a');
    a.href = url;
    a.download = downloadFilename(response.headers.get('Content-Disposition'), format);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (e) {
    showError(e);
  }
}

export function editRecord(record) {
  const r = {
    ...record,
    mode: record.start_time ? 'times' : 'duration',
    hours: Math.floor(record.minutes / 60),
    remainder: record.minutes % 60,
  };
  function renderEdit() {
    openModal(
      /* HTML */ `${modalHead('Editar registro')}
        <form id="edit-form">
          ${searchField(
            'Empleado',
            'employee_id',
            state.catalog.employees,
            r.employee_id,
            true,
            r.employee_id_query,
          )}${rowHtml(r, 0)}
          <div class="error form-error" role="alert"></div>
          <div id="edit-warnings"></div>
          <div class="actions">
            <button type="button" data-close>Cancelar</button
            ><button type="submit" class="primary">Guardar cambios</button>
          </div>
        </form>`,
    );
    $('[data-remove]', modal).remove();
    const form = $('#edit-form');
    bindSearchFields(form, state.catalog);
    $('[name=mode]', form).onchange = () => {
      Object.assign(r, Object.fromEntries($$('input,select', form).map((i) => [i.name, i.value])));
      r.start_time = '';
      r.end_time = '';
      renderEdit();
    };
    form.oninput = () => {
      $('#edit-warnings').innerHTML = '';
      updateTotals();
    };
    updateTotals();
    const save = async (warning_token) => {
      const payload = {
        ...rowPayload($('.entry', form), $('[name=employee_id]', form).value),
        version: record.version,
        warning_token,
      };
      try {
        await api('/records/' + record.id, { method: 'PUT', body: JSON.stringify(payload) });
        modal.close();
        toast('Registro actualizado.');
        renderRecords();
      } catch (e) {
        if (e.warnings) {
          $('#edit-warnings').innerHTML = warningHtml(e.warnings);
          $('#confirm-warnings').onclick = async () => {
            if (form.dataset.busy) return;
            form.dataset.busy = '1';
            try {
              if (
                await confirmAction({
                  title: 'Guardar con advertencias',
                  message: 'Confirmá la corrección luego de revisar estas advertencias.',
                  details: e.warnings.map((w) => w.message),
                  confirmLabel: 'Guardar cambios',
                })
              )
                await save(e.warning_token);
            } finally {
              delete form.dataset.busy;
            }
          };
        } else showError(e, $('.form-error', form));
      }
    };
    handleForm(form, () => save(), {
      title: 'Guardar cambios del registro',
      message: 'La corrección quedará en el historial con tu usuario, fecha y hora.',
      confirmLabel: 'Guardar cambios',
    });
  }
  renderEdit();
}
