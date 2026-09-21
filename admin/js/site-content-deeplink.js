const params = new URLSearchParams(location.search);
const requestedPage = params.get('page');
const requestedTab = params.get('tab');
const select = document.getElementById('page-select');
const tabs = document.getElementById('content-editor-tabs');

function activateRequestedTab() {
  if (!requestedTab || !tabs) return false;
  const button = tabs.querySelector(`[data-editor-tab="${CSS.escape(requestedTab)}"]`);
  if (!button) return false;
  if (!button.classList.contains('is-active')) button.click();
  return true;
}

if (requestedPage && select && [...select.options].some(option => option.value === requestedPage)) {
  if (select.value !== requestedPage) {
    select.value = requestedPage;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

if (!activateRequestedTab() && requestedTab && tabs) {
  const observer = new MutationObserver(() => {
    if (!activateRequestedTab()) return;
    observer.disconnect();
  });
  observer.observe(tabs, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 5000);
}
