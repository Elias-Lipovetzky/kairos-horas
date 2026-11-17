import { icon } from './icons.js';

export function exportMenu() {
  return /* HTML */ `<div class="export-menu">
    <button
      type="button"
      class="primary"
      id="export-toggle"
      aria-expanded="false"
      aria-controls="export-options"
    >
      ${icon('download')} Exportar ${icon('chevron')}
    </button>
    <div id="export-options" class="export-options" hidden>
      <span class="export-caption">Descargar los resultados actuales</span>
      <button type="button" id="export-xlsx">Planilla Excel (.xlsx)</button>
      <button type="button" id="export-pdf">Documento PDF (.pdf)</button>
    </div>
  </div>`;
}

export function bindExportMenu(root, download) {
  const menu = root.querySelector('.export-menu');
  const toggle = menu.querySelector('#export-toggle');
  const options = menu.querySelector('#export-options');
  const setOpen = (open) => {
    options.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  };
  toggle.onclick = () => setOpen(true);
  menu.onpointerenter = (event) => {
    if (event.pointerType === 'mouse') setOpen(true);
  };
  menu.onpointerleave = () => {
    if (!menu.contains(document.activeElement)) setOpen(false);
  };
  menu.onfocusin = () => setOpen(true);
  menu.onfocusout = (event) => {
    if (!menu.contains(event.relatedTarget)) setOpen(false);
  };
  menu.onkeydown = (event) => {
    if (event.key === 'Escape') {
      toggle.focus();
      setOpen(false);
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.key === 'ArrowDown' && event.target === toggle) {
      event.preventDefault();
      setOpen(true);
      menu.querySelector('#export-xlsx').focus();
    }
  };
  for (const format of ['xlsx', 'pdf']) {
    menu.querySelector('#export-' + format).onclick = () => {
      setOpen(false);
      download(format);
    };
  }
}
