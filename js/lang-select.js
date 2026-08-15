(function () {
    function closeAll() {
        document.querySelectorAll('.lang-select').forEach(function (wrap) {
            wrap.querySelector('.lang-options').hidden = true;
            wrap.querySelector('.lang-trigger').setAttribute('aria-expanded', 'false');
        });
    }

    function syncTrigger(wrap, value) {
        const opt = wrap.querySelector('li[data-value="' + value + '"]');
        if (!opt) return;
        wrap.querySelector('[data-lang-flag]').src = opt.dataset.flag;
        wrap.querySelector('[data-lang-label]').textContent = opt.querySelector('span').textContent;
        wrap.querySelectorAll('li').forEach(function (li) {
            li.setAttribute('aria-selected', li === opt ? 'true' : 'false');
        });
    }

    document.querySelectorAll('.lang-select').forEach(function (wrap) {
        const trigger = wrap.querySelector('.lang-trigger');
        const options = wrap.querySelector('.lang-options');
        const select = wrap.querySelector('select[data-language-select]');

        syncTrigger(wrap, select.value);

        trigger.addEventListener('click', function (e) {
            e.stopPropagation();
            const isOpen = !options.hidden;
            closeAll();
            options.hidden = isOpen;
            trigger.setAttribute('aria-expanded', String(!isOpen));
        });

        options.querySelectorAll('li').forEach(function (li) {
            li.addEventListener('click', function () {
                select.value = li.dataset.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                syncTrigger(wrap, li.dataset.value);
                closeAll();
            });
        });
    });

    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAll();
    });
})();