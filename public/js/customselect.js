/**
 * NoCAP — Custom Select
 * Enhances native <select.config-select> into a fully theme-styled combobox.
 * The native <select> stays in the DOM as the source of truth (value, change
 * events, programmatic updates), so existing code keeps working unchanged.
 */
(function () {
    let openPanel = null;

    function closeOpen() {
        if (openPanel) {
            openPanel.classList.remove('open');
            openPanel._trigger.setAttribute('aria-expanded', 'false');
            openPanel = null;
        }
    }
    document.addEventListener('click', closeOpen);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOpen(); });

    function enhance(select) {
        if (select.dataset.csEnhanced) return;
        select.dataset.csEnhanced = '1';

        const wrap = document.createElement('div');
        wrap.className = 'cs';
        select.parentNode.insertBefore(wrap, select);
        wrap.appendChild(select);
        select.classList.add('cs-native');

        const trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.className = 'cs-trigger';
        trigger.setAttribute('aria-haspopup', 'listbox');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = `<span class="cs-label"></span>
            <svg class="cs-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
        wrap.appendChild(trigger);

        const panel = document.createElement('div');
        panel.className = 'cs-panel';
        panel.setAttribute('role', 'listbox');
        panel._trigger = trigger;
        wrap.appendChild(panel);

        const label = trigger.querySelector('.cs-label');

        function syncLabel() {
            const opt = select.options[select.selectedIndex];
            const isPlaceholder = !opt || opt.value === '';
            label.textContent = opt ? opt.textContent : '';
            label.classList.toggle('cs-placeholder', isPlaceholder);
        }

        function choose(value) {
            select.value = value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncLabel();
            markSelected();
            closeOpen();
        }

        function addOption(opt) {
            const o = document.createElement('div');
            o.className = 'cs-option';
            o.setAttribute('role', 'option');
            o.textContent = opt.textContent;
            o.dataset.value = opt.value;
            if (opt.disabled || opt.value === '') o.classList.add('cs-muted');
            o.addEventListener('click', (e) => { e.stopPropagation(); choose(opt.value); });
            panel.appendChild(o);
        }

        function rebuild() {
            panel.innerHTML = '';
            Array.from(select.children).forEach((node) => {
                if (node.tagName === 'OPTGROUP') {
                    const g = document.createElement('div');
                    g.className = 'cs-group';
                    g.textContent = node.label;
                    panel.appendChild(g);
                    Array.from(node.children).forEach(addOption);
                } else if (node.tagName === 'OPTION') {
                    addOption(node);
                }
            });
            markSelected();
        }

        function markSelected() {
            panel.querySelectorAll('.cs-option').forEach((o) => {
                o.classList.toggle('cs-selected', o.dataset.value === select.value);
            });
        }

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = panel.classList.contains('open');
            closeOpen();
            if (!isOpen) {
                panel.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                openPanel = panel;
                const sel = panel.querySelector('.cs-selected');
                if (sel) sel.scrollIntoView({ block: 'nearest' });
            }
        });

        // Rebuild when options change programmatically (updateDictSelects etc.)
        new MutationObserver(() => { rebuild(); syncLabel(); }).observe(select, { childList: true, subtree: true });
        // Re-sync when value changes programmatically + a change is dispatched
        select.addEventListener('change', () => { syncLabel(); markSelected(); });

        rebuild();
        syncLabel();
    }

    window.initCustomSelects = function () {
        document.querySelectorAll('select.config-select').forEach(enhance);
    };
})();
