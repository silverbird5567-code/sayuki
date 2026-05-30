const avatarBtn = document.getElementById("avatar-btn");
const dropdown = document.getElementById("avatar-dropdown");
avatarBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("open");
});
document.addEventListener("click", () => dropdown.classList.remove("open"));
document.getElementById("signout-btn").addEventListener("click", () => auth.logOut());

function initSelectDropdown(selectEl) {
    if (!selectEl || selectEl.dataset.dropdownInit) return;
    selectEl.dataset.dropdownInit = '1';

    const wrap = document.createElement('div');
    wrap.className = 'dropdown';
    if (selectEl.style.display === 'none') wrap.style.display = 'none';
    selectEl.style.display = 'none';

    const trigger = document.createElement('div');
    trigger.className = 'dropdown-trigger';
    trigger.innerHTML = '<span class="dropdown-label"></span><span class="material-symbols-outlined dropdown-chevron">expand_more</span>';

    const panel = document.createElement('div');
    panel.className = 'dropdown-panel';

    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    selectEl.parentNode.insertBefore(wrap, selectEl);

    const labelSpan = trigger.querySelector('.dropdown-label');

    function rebuildOptions() {
        panel.innerHTML = '';
        const sel = selectEl.options[selectEl.selectedIndex];
        labelSpan.textContent = sel ? sel.text : '';
        Array.from(selectEl.options).forEach(opt => {
            const div = document.createElement('div');
            div.className = 'dropdown-option' + (opt.selected ? ' selected' : '');
            div.textContent = opt.text;
            div.dataset.value = opt.value;
            div.addEventListener('click', () => {
                selectEl.value = opt.value;
                panel.querySelectorAll('.dropdown-option').forEach(d => d.classList.remove('selected'));
                div.classList.add('selected');
                labelSpan.textContent = opt.text;
                panel.classList.remove('open');
                trigger.classList.remove('open');
            });
            panel.appendChild(div);
        });
    }

    rebuildOptions();

    const childObserver = new MutationObserver(rebuildOptions);
    childObserver.observe(selectEl, { childList: true, subtree: true });

    let _blockStyle = false;
    const styleObserver = new MutationObserver(() => {
        if (_blockStyle) return;
        const hidden = selectEl.style.display === 'none';
        if (!hidden) {
            _blockStyle = true;
            selectEl.style.display = 'none';
            _blockStyle = false;
            wrap.style.display = '';
        } else {
            wrap.style.display = 'none';
        }
    });
    styleObserver.observe(selectEl, { attributes: true, attributeFilter: ['style'] });

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        rebuildOptions();
        const isOpen = panel.classList.contains('open');
        document.querySelectorAll('.dropdown-panel.open').forEach(p => {
            if (p !== panel) {
                p.classList.remove('open');
                p.parentElement?.querySelector('.dropdown-trigger')?.classList.remove('open');
            }
        });
        panel.classList.toggle('open', !isOpen);
        trigger.classList.toggle('open', !isOpen);
    });

    document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target)) {
            panel.classList.remove('open');
            trigger.classList.remove('open');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('select[data-dropdown]').forEach(initSelectDropdown);
});