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

    // Intercepta qualquer atribuição a select.value (feita por nós ou pelo i18n.js)
    // e mantém a bandeira sempre sincronizada, não importa quem mudou o valor.
    function hijackValue(select, onChange) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(select, 'value', {
            get: function () { return descriptor.get.call(select); },
            set: function (v) {
                descriptor.set.call(select, v);
                onChange(v);
            },
            configurable: true
        });
    }

    document.querySelectorAll('.lang-select').forEach(function (wrap) {
        const trigger = wrap.querySelector('.lang-trigger');
        const options = wrap.querySelector('.lang-options');
        const select = wrap.querySelector('select[data-language-select]');

        hijackValue(select, function (v) { syncTrigger(wrap, v); });
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
                select.value = li.dataset.value; // já dispara a sincronização da bandeira
                select.dispatchEvent(new Event('change', { bubbles: true }));
                closeAll();
            });
        });
    });

    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeAll();
    });
})();