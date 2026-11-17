import { entityNames, fieldNames, names } from '../core/labels.js';
import { state } from '../core/state.js';
import {
  $,
  $$,
  escape,
  hours,
  modal,
  modalHead,
  openModal,
  showError,
  stamp,
  dateLabel,
} from '../core/dom.js';
import { api } from '../core/api.js';
import { sortControl } from '../components/sort-control.js';

export function snapshot(data) {
  if (!data) return '<p class="muted">Sin datos</p>';
  return /* HTML */ `<dl>
    ${Object.entries(data)
      .filter(([key]) => fieldNames[key])
      .map(([k, v]) => {
        let value = v;
        if (k === 'employee_id') value = state.catalog.employees.find((e) => e.id === v)?.name || v;
        if (k === 'place_id') value = state.catalog.places.find((p) => p.id === v)?.name || v;
        if (k === 'date' && v) value = dateLabel(v);
        if (k === 'minutes') value = hours(v);
        if (k === 'owners')
          value = v
            .map(
              (o) =>
                (state.catalog.owners.find((p) => p.id === o.owner_id)?.name || o.owner_id) +
                (o.is_primary ? ' (principal)' : ''),
            )
            .join(', ');
        if (k === 'deleted_at' && v) value = stamp(v);
        return /* HTML */ `<dt>${fieldNames[k]}</dt>
          <dd>${escape(typeof value === 'boolean' ? (value ? 'Sí' : 'No') : (value ?? '—'))}</dd>`;
      })
      .join('')}
  </dl>`;
}

export function changes(before, after) {
  return /* HTML */ `<div class="changes">
    <div><strong>Antes</strong>${snapshot(before)}</div>
    <div><strong>Después</strong>${snapshot(after)}</div>
  </div>`;
}

export async function historyModal(id) {
  openModal(
    /* HTML */ `${modalHead('Historial del registro')}
      <p>Cargando…</p>`,
  );
  try {
    const rows = await api('/records/' + id + '/history');
    openModal(
      /* HTML */ `${modalHead('Historial del registro')}<small>ID: ${escape(id)}</small>${rows
          .map(
            (r) =>
              /* HTML */ `<div class="history">
                <strong>${escape(names[r.action] || r.action)}</strong>
                <p>${escape(r.user_name)} · ${escape(r.user_email)}<br />${stamp(r.created_at)}</p>
                ${changes(r.before_data, r.after_data)}
              </div>`,
          )
          .join('') || '<p>Sin historial.</p>'}`,
    );
  } catch (e) {
    showError(e);
    modal.close();
  }
}

export async function renderAudit() {
  $('#page').innerHTML = /* HTML */ `<header class="section">
      <div>
        <div class="eyebrow">Trazabilidad</div>
        <h1>Historial general</h1>
        <p class="muted">Altas, cambios y eliminaciones, atribuidos a cada usuario.</p>
      </div>
      ${sortControl(state.auditSort, 'dates')}
    </header>
    <section class="card" id="audit-list">Cargando…</section>`;
  try {
    const rows = await api('/audit?page=' + state.auditPage + '&sort=' + state.auditSort);
    if (state.view !== 'audit') return;
    $('[data-sort-control]').onchange = (event) => {
      state.auditSort = event.target.value;
      state.auditPage = 0;
      renderAudit();
    };
    $('#audit-list').innerHTML =
      rows
        .map(
          (r) =>
            /* HTML */ `<div class="history">
              <strong
                >${escape(names[r.action] || r.action)} ·
                ${escape(entityNames[r.entity] || 'Registros')}</strong
              >
              <p>${escape(r.user_name)} · ${stamp(r.created_at)}</p>
              <details>
                <summary>Ver detalle</summary>
                ${changes(r.before_data, r.after_data)}
              </details>
              ${r.entity === 'records'
                ? `<button data-history="${r.entity_id}">Historial del registro</button>`
                : ''}
            </div>`,
        )
        .join('') || '<div class="empty">Sin movimientos.</div>';
    $('#audit-list').insertAdjacentHTML(
      'beforeend',
      /* HTML */ `<div class="pager">
        <button id="previous" ${state.auditPage === 0 ? 'disabled' : ''}>Anterior</button
        ><span>Página ${state.auditPage + 1}</span
        ><button id="next" ${rows.length < 50 ? 'disabled' : ''}>Siguiente</button>
      </div>`,
    );
    $('#previous').onclick = () => {
      state.auditPage--;
      renderAudit();
    };
    $('#next').onclick = () => {
      state.auditPage++;
      renderAudit();
    };
    $$('[data-history]').forEach((b) => (b.onclick = () => historyModal(b.dataset.history)));
  } catch (e) {
    showError(e);
  }
}
