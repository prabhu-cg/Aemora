/*
 * Aemora: show/hide for dialog fields.
 *
 * Reads the Granite UI markers that Aemora writes for "Show only when" fields:
 *   controller  class cq-dialog-checkbox-showhide or cq-dialog-dropdown-showhide,
 *               data-cq-dialog-<kind>-showhide-target = a CSS selector
 *   target      matched by that selector; data-showhidetargetvalue = the select value that shows it
 * A checkbox or switch shows its targets while it is checked. A select shows the targets whose value matches.
 * Plain JavaScript, no dependencies. Safe to load more than once.
 */
(function (window, document) {
  'use strict';
  if (window.aemoraShowHide) return;
  window.aemoraShowHide = true;

  var CHECKBOX = '.cq-dialog-checkbox-showhide';
  var DROPDOWN = '.cq-dialog-dropdown-showhide';

  function kindOf(el) {
    return el.matches(CHECKBOX) ? 'checkbox' : 'dropdown';
  }

  function wrapperOf(target) {
    // The label and the field live in a wrapper; hide that, not just the input.
    return (target.closest && target.closest('.coral-Form-fieldwrapper')) || target;
  }

  function apply(controller) {
    var kind = kindOf(controller);
    var selector = controller.getAttribute('data-cq-dialog-' + kind + '-showhide-target');
    if (!selector) return;
    var scope = (controller.closest && controller.closest('form')) || document;
    var targets = scope.querySelectorAll(selector);
    for (var i = 0; i < targets.length; i++) {
      var target = targets[i];
      var show;
      if (kind === 'checkbox') {
        show = !!controller.checked;
      } else {
        var wanted = target.getAttribute('data-showhidetargetvalue');
        show = wanted === null || wanted === String(controller.value);
      }
      // The markup starts the target hidden; from here on the wrapper carries the state.
      target.classList.remove('hide');
      wrapperOf(target).classList.toggle('hide', !show);
    }
  }

  function whenReady(el, fn) {
    var C = window.Coral;
    if (C && C.commons && typeof C.commons.ready === 'function') C.commons.ready(el, fn);
    else fn();
  }

  function init(root) {
    var found = (root && root.querySelectorAll ? root : document).querySelectorAll(CHECKBOX + ',' + DROPDOWN);
    for (var i = 0; i < found.length; i++) {
      (function (el) { whenReady(el, function () { apply(el); }); })(found[i]);
    }
  }

  document.addEventListener('change', function (e) {
    var c = e.target && e.target.closest && e.target.closest(CHECKBOX + ',' + DROPDOWN);
    if (c) apply(c);
  });

  // AEM announces new dialog content through jQuery events.
  var $ = window.jQuery || (window.Granite && window.Granite.$);
  if ($) $(document).on('foundation-contentloaded dialog-ready', function (e) { init(e.target); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(document); });
  else init(document);
})(window, document);
