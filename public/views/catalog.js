import { sortControl } from '../components/sort-control.js';
import { loadCatalog } from '../core/catalog.js';
import { state } from '../core/state.js';
import { api } from '../core/api.js';
import {
  $,
  $$,
  escape,
  field,
  formData,
  handleForm,
  input,
  modal,
  modalHead,
  openModal,
  showError,
  toast,
} from '../core/dom.js';
import { entityNames } from '../core/labels.js';
import { catalogEntry } from '../components/catalog-entry.js';
import { normalizeSearch } from '../search.js';

export async function renderCatalog() {
  try {
    await loadCatalog();
    state.users = await api('/users');
    if (state.view !== 'catalog') return;
    const entity = state.activeEntity;
    const itemLabel = { employees: 'empleado', places: 'lugar', owners: 'dueño', users: 'usuario' }[
      entity
    ];
    const items = state.activeEntity === 'users' ? state.users : state.catalog[state.activeEntity];
    const searchPlaceholder = {
      employees: 'Nombre o DNI',
      places: 'Nombre, dirección o dueño',
      owners: 'Nombre o teléfono',
      users: 'Nombre o correo',
    }[entity];
    $('#page').innerHTML = /* HTML */ `<header class="section">
        <div>
          <div class="eyebrow">Datos del equipo</div>
          <h1>Administración</h1>
        </div>
        <button id="new-entity" class="primary">＋ Agregar ${itemLabel}</button>
      </header>
      <div class="row tabs">
        ${Object.entries(entityNames)
          .map(
            ([k, v]) =>
              `<button data-entity="${k}" class="${state.activeEntity === k ? 'primary' : ''}">${v}</button>`,
          )
          .join('')}
      </div>
      <section class="catalog-toolbar">
        <label
          >Buscar ${entityNames[entity].toLowerCase()}<input
            type="search"
            id="catalog-search"
            placeholder="${searchPlaceholder}"
        /></label>
        ${sortControl(state.catalogSort, true)}
      </section>
      <div class="catalog-list-header">
        <span id="catalog-count" role="status" aria-live="polite"></span
        ><span>Tocá una ficha para editar</span>
      </div>
      <section
        id="catalog-list"
        class="catalog-entry-list"
        aria-label="${entityNames[entity]}"
      ></section>`;
    const list = (query) => {
      const term = normalizeSearch(query);
      const filtered = items.filter((item) => {
        const text = [
          item.name,
          item.dni,
          item.email,
          item.address,
          item.phone,
          ...(item.owners || []).map((owner) => owner.name),
        ]
          .filter(Boolean)
          .join(' ');
        return normalizeSearch(text).includes(term);
      });
      const collator = new Intl.Collator('es-AR', { sensitivity: 'base', numeric: true });
      const direction = state.catalogSort === 'name_desc' ? -1 : 1;
      filtered.sort(
        (a, b) =>
          direction * collator.compare(a.name, b.name) || String(a.id).localeCompare(String(b.id)),
      );
      $('#catalog-count').textContent =
        filtered.length +
        ' ' +
        (filtered.length === 1 ? itemLabel : entityNames[entity].toLowerCase());
      $('#catalog-list').innerHTML =
        filtered.map((item) => catalogEntry(entity, item)).join('') ||
        '<div class="empty">Sin resultados.</div>';
      $$('[data-entry-id]').forEach((button) => {
        button.onclick = () =>
          editEntity(items.find((item) => String(item.id) === button.dataset.entryId));
      });
    };
    $('[data-sort-control]').onchange = (event) => {
      state.catalogSort = event.target.value;
      list($('#catalog-search').value);
    };
    list('');
    $('#catalog-search').oninput = (event) => list(event.target.value);
    $$('[data-entity]').forEach(
      (b) =>
        (b.onclick = () => {
          state.activeEntity = b.dataset.entity;
          renderCatalog();
        }),
    );
    $('#new-entity').onclick = () => editEntity();
  } catch (e) {
    showError(e);
  }
}

export function editEntity(item = {}) {
  const entity = state.activeEntity;
  openModal(
    /* HTML */ `${modalHead((item.id ? 'Editar · ' : 'Agregar · ') + entityNames[entity])}
      ${item.registration_pending
        ? '<p class="notice">Solicitud de cuenta pendiente. Revisá los datos y marcá Activo para aprobar el acceso.</p>'
        : ''}
      <form id="entity-form">
        <div class="grid">
          ${field(
            'Nombre *',
            input('name', item.name || '', 'text', 'required maxlength="200"'),
          )}${entity === 'employees'
            ? field(
                'DNI *',
                input('dni', item.dni || '', 'text', 'required inputmode="numeric" maxlength="20"'),
              )
            : ''}${['employees', 'owners'].includes(entity)
            ? field('Teléfono', input('phone', item.phone || '', 'tel', 'maxlength="200"'))
            : ''}${entity === 'places'
            ? field('Dirección', input('address', item.address || '', 'text', 'maxlength="200"'))
            : ''}${entity === 'users'
            ? field('Correo *', input('email', item.email || '', 'email', 'required')) +
              field(
                'Rol',
                /* HTML */ `<select name="role">
                  <option value="rrhh" ${item.role !== 'admin' ? 'selected' : ''}>
                    Recursos Humanos
                  </option>
                  <option value="admin" ${item.role === 'admin' ? 'selected' : ''}>
                    Administrador
                  </option>
                </select>`,
              ) +
              field(
                item.id ? 'Nueva contraseña (opcional)' : 'Contraseña inicial *',
                input(
                  'password',
                  '',
                  'password',
                  `${item.id ? '' : 'required'} minlength="12" maxlength="200" autocomplete="new-password"`,
                ),
              )
            : ''}
        </div>
        ${entity === 'places'
          ? /* HTML */ `<h3>Dueños *</h3>
              <p class="muted">Seleccioná los dueños y uno principal.</p>
              ${state.catalog.owners
                .filter((o) => o.active || item.owners?.some((v) => v.owner_id === o.id))
                .map(
                  (o) =>
                    /* HTML */ `<div class="owner-choice">
                      <input
                        aria-label="Asociar a ${escape(o.name)}"
                        type="checkbox"
                        name="owner"
                        value="${o.id}"
                        ${item.owners?.some((v) => v.owner_id === o.id) ? 'checked' : ''}
                      /><span>${escape(o.name)}</span
                      ><label
                        ><input
                          type="radio"
                          name="primary"
                          value="${o.id}"
                          ${item.owners?.some((v) => v.owner_id === o.id && v.is_primary)
                            ? 'checked'
                            : ''}
                        />
                        Principal</label
                      >
                    </div>`,
                )
                .join('') || '<p class="warning">Creá un dueño antes de agregar lugares.</p>'}`
          : ''}
        <p>
          <label class="checkline"
            ><input type="checkbox" name="active" ${item.active !== false ? 'checked' : ''} />
            Activo</label
          >
        </p>
        <div class="error" role="alert"></div>
        <div class="actions">
          <button type="button" data-close>Cancelar</button
          ><button type="submit" class="primary">Guardar</button>
        </div>
      </form>`,
  );
  handleForm(
    $('#entity-form'),
    async () => {
      const form = $('#entity-form'),
        data = formData(form);
      data.active = $('[name=active]', form).checked;
      if (entity === 'places') {
        data.owners = $$('[name=owner]:checked', form).map((i) => ({
          owner_id: i.value,
          is_primary: i.value === data.primary,
        }));
        delete data.primary;
        delete data.owner;
      }
      if (!data.password) delete data.password;
      await api(
        (entity === 'users' ? '/users' : '/catalog/' + entity) + (item.id ? '/' + item.id : ''),
        { method: item.id ? 'PUT' : 'POST', body: JSON.stringify(data) },
      );
      modal.close();
      toast('Datos guardados.');
      await renderCatalog();
    },
    () => ({
      title: 'Guardar datos',
      message: 'Se guardarán los datos de ' + $('[name=name]', $('#entity-form')).value + '.',
      confirmLabel: 'Guardar',
    }),
  );
}
