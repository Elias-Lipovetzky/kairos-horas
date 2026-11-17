let render = () => {};
export function setNavigationHandler(handler) {
  render = handler;
}
export function refreshShell() {
  render();
}
