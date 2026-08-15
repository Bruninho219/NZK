document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-nzk-version]').forEach(function (el) {
        el.textContent = window.NZK_VERSION || el.textContent;
    });
});