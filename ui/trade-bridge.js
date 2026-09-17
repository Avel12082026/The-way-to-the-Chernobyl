/* Bridge private Leonov hub delegation to the shared trade workspace. */
(() => {
  'use strict';
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#leonovHubScreen [data-leonov-action="trade"]');
    if (!button || !window.SharedTrade) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const hub = document.getElementById('leonovHubScreen');
    if (hub) hub.classList.remove('active');
    document.body.classList.remove('leonov-hub-visible');
    window.SharedTrade.open('leonov');
  }, true);
})();
