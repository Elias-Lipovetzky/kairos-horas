const escape = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const normalizeSearch = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
export function suggestions(items, query, limit = 8) {
  const q = normalizeSearch(query);
  if (!q) return [];
  const tokens = q.split(' '),
    digits = q.replace(/\D/g, '');
  return items
    .map((item, index) => {
      const name = normalizeSearch(item.name),
        dni = String(item.dni || '');
      const match =
        tokens.every((t) => name.includes(t) || dni.includes(t)) ||
        (digits.length > 0 && /^[\d\s]+$/.test(q) && dni.includes(digits));
      return {
        item,
        index,
        score: name === q || (digits && dni === digits) ? 0 : name.startsWith(q) ? 1 : 2,
        match,
      };
    })
    .filter((x) => x.match)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.item);
}
let serial = 0;
export function searchField(
  label,
  name,
  items,
  selected = '',
  required = false,
  query,
  includeInactive = false,
) {
  const id = `search-${++serial}`,
    item = items.find((i) => i.id === selected);
  const value = query ?? (item ? item.name + (item.dni ? ' · ' + item.dni : '') : '');
  return /* HTML */ `<div
    class="search-picker"
    data-search="${name}"
    ${includeInactive ? 'data-include-inactive="true"' : ''}
  >
    <label for="${id}">${escape(label)}</label
    ><input
      id="${id}"
      name="${name}_query"
      value="${escape(value)}"
      type="search"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded="false"
      aria-controls="${id}-list"
      autocomplete="off"
      placeholder="${name === 'employee_id' ? 'Escribí nombre o DNI…' : 'Escribí un lugar…'}"
      ${required ? 'required' : ''}
    /><input type="hidden" name="${name}" value="${escape(selected)}" />
    <div
      id="${id}-list"
      class="suggestions"
      role="listbox"
      aria-label="${escape(label)}"
      hidden
    ></div>
    <small class="search-hint">Escribí para buscar y elegí una sugerencia.</small
    ><span class="sr-only" role="status" aria-live="polite"></span>
  </div>`;
}
export function bindSearchFields(root, catalog) {
  for (const picker of root.querySelectorAll('.search-picker')) {
    if (picker.dataset.bound) continue;
    picker.dataset.bound = 'true';
    const name = picker.dataset.search,
      visible = picker.querySelector('[role=combobox]'),
      hidden = picker.querySelector('input[type=hidden]'),
      list = picker.querySelector('[role=listbox]'),
      status = picker.querySelector('[role=status]');
    const items = catalog[name === 'employee_id' ? 'employees' : 'places'].filter(
      (x) => picker.dataset.includeInactive || x.active || x.id === hidden.value,
    );
    let matches = [],
      active = -1,
      selecting = false;
    const validate = () =>
      visible.setCustomValidity(
        !hidden.value && (visible.required || visible.value.trim())
          ? 'Elegí una sugerencia válida.'
          : '',
      );
    const close = () => {
      list.hidden = true;
      visible.setAttribute('aria-expanded', 'false');
      visible.removeAttribute('aria-activedescendant');
      active = -1;
    };
    function choose(item) {
      hidden.value = item.id;
      visible.value = item.name + (item.dni ? ' · ' + item.dni : '');
      validate();
      close();
      visible.focus();
      selecting = true;
      visible.dispatchEvent(new Event('input', { bubbles: true }));
      selecting = false;
    }
    function draw() {
      matches = suggestions(items, visible.value);
      active = -1;
      if (!visible.value.trim()) {
        close();
        status.textContent = 'Escribí para buscar.';
        return;
      }
      list.innerHTML = matches.length
        ? matches
            .map(
              (item, i) =>
                /* HTML */ `<button
                  type="button"
                  role="option"
                  aria-selected="false"
                  tabindex="-1"
                  id="${visible.id}-option-${i}"
                >
                  <span>${escape(item.name)}</span>${item.dni
                    ? /* HTML */ `<small>DNI ${escape(item.dni)}</small>`
                    : ''}
                </button>`,
            )
            .join('')
        : '<p class="suggestion-empty">Sin coincidencias. Probá con otra parte del nombre.</p>';
      list.hidden = false;
      visible.setAttribute('aria-expanded', 'true');
      status.textContent = matches.length
        ? `${matches.length} sugerencias. Usá las flechas y Enter, o tocá un resultado.`
        : 'Sin coincidencias.';
      list.querySelectorAll('button').forEach((button, i) => {
        button.onmousedown = (e) => e.preventDefault();
        button.onclick = () => choose(matches[i]);
      });
    }
    // Programmatic selection dispatches input for the form; only genuine typing clears the ID.
    visible.addEventListener('input', () => {
      if (selecting) return;
      hidden.value = '';
      validate();
      draw();
    });
    visible.addEventListener('search', () => {
      if (!visible.value) {
        hidden.value = '';
        validate();
        close();
        visible.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    visible.onfocus = () => {
      if (!hidden.value) draw();
    };
    visible.addEventListener('invalid', () => {
      const panel = visible.closest('details');
      if (panel) panel.open = true;
    });
    visible.onkeydown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        if (list.hidden) draw();
        if (!matches.length) return;
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
        list
          .querySelectorAll('[role=option]')
          .forEach((option, i) => option.setAttribute('aria-selected', String(i === active)));
        visible.setAttribute('aria-activedescendant', `${visible.id}-option-${active}`);
        list.children[active].scrollIntoView({ block: 'nearest' });
      }
      if (e.key === 'Enter' && !list.hidden) {
        e.preventDefault();
        if (matches.length) choose(matches[Math.max(0, active)]);
      }
    };
    picker.onfocusout = (e) => {
      if (!picker.contains(e.relatedTarget)) close();
    };
    validate();
  }
}
