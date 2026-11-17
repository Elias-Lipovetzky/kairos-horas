import { escape } from '../core/dom.js';
import { icon } from './icons.js';

const entityTypes = {
  employees: { label: 'Empleado', icon: 'user' },
  places: { label: 'Lugar', icon: 'place' },
  owners: { label: 'Dueño', icon: 'user' },
  users: { label: 'Usuario', icon: 'catalog' },
};

function metadata(entity, item) {
  if (entity === 'employees') {
    return [
      ['DNI', item.dni],
      ['Teléfono', item.phone || 'Sin cargar'],
    ];
  }
  if (entity === 'owners') return [['Teléfono', item.phone || 'Sin cargar']];
  if (entity === 'users') {
    return [
      ['Correo', item.email],
      ['Rol', item.role === 'admin' ? 'Administrador' : 'Recursos Humanos'],
    ];
  }
  const owners = item.owners || [];
  const principal = owners.find((owner) => owner.is_primary);
  const details = [
    ['Dirección', item.address || 'Sin cargar'],
    ['Dueño principal', principal?.name || 'Sin asignar'],
  ];
  if (owners.length > 1) details.push(['Otros dueños', String(owners.length - 1)]);
  return details;
}

// One structure for all four administration categories; clicking opens their existing editor.
export function catalogEntry(entity, item) {
  const type = entityTypes[entity];
  const status = item.registration_pending
    ? 'Pendiente de aprobación'
    : item.active
      ? 'Activo'
      : 'Inactivo';
  const tone = item.registration_pending ? 'pending' : item.active ? 'active' : 'inactive';

  return /* HTML */ `<article class="catalog-entry">
    <button
      type="button"
      class="catalog-entry-trigger"
      data-entry-id="${escape(item.id)}"
      aria-label="Editar ${type.label.toLowerCase()}: ${escape(item.name)}"
      aria-haspopup="dialog"
    >
      <span class="catalog-entry-icon">${icon(type.icon)}</span>
      <span class="catalog-entry-content">
        <span class="catalog-entry-topline">
          <span class="catalog-entry-kind">${type.label}</span>
          <span class="entry-status is-${tone}"><span aria-hidden="true"></span>${status}</span>
        </span>
        <span class="catalog-entry-title">${escape(item.name)}</span>
        <span class="catalog-entry-metadata">
          ${metadata(entity, item)
            .map(
              ([label, value]) =>
                `<span class="catalog-entry-detail"><span>${escape(label)}</span><strong>${escape(value)}</strong></span>`,
            )
            .join('')}
        </span>
      </span>
      <span class="catalog-entry-arrow">${icon('chevron')}</span>
    </button>
  </article>`;
}
