/**
 * 核心模块：常量、工具函数、全局状态、本地存储、布局分栏
 * 命名空间：window.App
 */
(function () {
    'use strict';

    const App = window.App = window.App || {};

    // ===== 常量 =====
    App.STORAGE_KEY = 'pdf_annotator_data_v1';
    App.LAYOUT_KEY = 'pdf_annotator_layout_v1';
    App.MIN_RIGHT = 280;
    App.MIN_LEFT = 320;
    App.DEFAULT_RIGHT = 420;

    // ===== 全局状态 =====
    App.state = {
        pdfDoc: null,
        currentPage: 1,
        currentScale: 1.2,
        totalPages: 0,
        isRendering: false,
        renderTask: null,

        snipMode: false,
        isDragging: false,
        dragStart: null,

        snippets: [],
        images: [],
        formulas: [],

        isCollapsed: true,
        isResizing: false,
        lastRightWidth: App.DEFAULT_RIGHT
    };

    // ===== DOM 引用（懒查，避免各模块重复） =====
    App.$ = (id) => document.getElementById(id);
    App.$req = (id) => {
        const el = document.getElementById(id);
        if (!el) throw new Error(`Element #${id} not found`);
        return el;
    };

    // ===== 工具函数 =====
    App.escapeHtml = function (str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    App.formatTime = function (date) {
        const d = date instanceof Date ? date : new Date(date);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    };

    App.formatSize = function (bytes) {
        if (!bytes) return '';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    };

    App.debounce = function (fn, delay) {
        let timer = null;
        return function (...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    };

    // ===== 本地存储 =====
    App.loadFromStorage = function () {
        try {
            const raw = localStorage.getItem(App.STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (Array.isArray(data.snippets)) App.state.snippets = data.snippets;
            if (Array.isArray(data.images)) App.state.images = data.images;
            if (Array.isArray(data.formulas)) App.state.formulas = data.formulas;
            App.state.snippets.forEach(s => { if (s.timestamp) s.timestamp = new Date(s.timestamp); });
            App.state.images.forEach(i => { if (i.timestamp) i.timestamp = new Date(i.timestamp); });
            App.state.formulas.forEach(f => { if (f.timestamp) f.timestamp = new Date(f.timestamp); });
        } catch (e) {}
    };

    App.saveToStorage = function () {
        try {
            localStorage.setItem(App.STORAGE_KEY, JSON.stringify({
                version: 1,
                savedAt: new Date().toISOString(),
                snippets: App.state.snippets,
                images: App.state.images,
                formulas: App.state.formulas
            }));
        } catch (e) {
            if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
                alert('本地存储空间已满，部分内容未能保存。建议导出为文件后清理部分记录。');
            }
        }
    };

    App.saveToStorageDebounced = App.debounce(App.saveToStorage, 300);

    // ===== 布局（分栏 / 折叠 / 分隔条） =====
    App.initLayout = function () {
        const st = App.state;
        const splitLayout = App.$('splitLayout');
        const paneRight = App.$('paneRight');
        const splitter = App.$('splitter');
        const collapsePanelBtn = App.$('collapsePanelBtn');
        const expandFloatBtn = App.$('expandFloatBtn');
        const openPanelBtn = App.$('openPanelBtn');

        function getLayoutWidth() { return splitLayout.clientWidth; }

        function applyRightWidth(width) {
            if (st.isCollapsed) return;
            const total = getLayoutWidth();
            const splitterW = splitter.offsetWidth || 14;
            const maxRight = total - App.MIN_LEFT - splitterW;
            const clamped = Math.max(App.MIN_RIGHT, Math.min(width, maxRight));
            paneRight.style.flexBasis = clamped + 'px';
            return clamped;
        }

        function saveLayout() {
            try {
                localStorage.setItem(App.LAYOUT_KEY, JSON.stringify({
                    rightWidth: st.isCollapsed ? st.lastRightWidth : (parseInt(paneRight.style.flexBasis, 10) || st.lastRightWidth),
                    collapsed: st.isCollapsed
                }));
            } catch (e) {}
        }

        function applyCollapsedUI(collapsed) {
            st.isCollapsed = collapsed;
            if (collapsed) {
                paneRight.classList.add('collapsed');
                splitter.classList.add('hidden');
                expandFloatBtn.classList.add('show');
                if (openPanelBtn) openPanelBtn.style.display = 'inline-flex';
                if (collapsePanelBtn) {
                    collapsePanelBtn.innerHTML = '<i class="fas fa-angles-left"></i>';
                    collapsePanelBtn.title = '展开批注面板';
                }
            } else {
                paneRight.classList.remove('collapsed');
                splitter.classList.remove('hidden');
                expandFloatBtn.classList.remove('show');
                if (openPanelBtn) openPanelBtn.style.display = 'none';
                if (collapsePanelBtn) {
                    collapsePanelBtn.innerHTML = '<i class="fas fa-angles-right"></i>';
                    collapsePanelBtn.title = '折叠批注面板';
                }
            }
        }

        function setCollapsed(collapsed, silent) {
            if (collapsed) {
                const cur = parseInt(paneRight.style.flexBasis, 10);
                if (!isNaN(cur) && cur > 0) st.lastRightWidth = cur;
            }
            applyCollapsedUI(collapsed);
            if (!collapsed) {
                requestAnimationFrame(() => applyRightWidth(st.lastRightWidth));
            }
            if (!silent) saveLayout();
        }

        // 对外暴露
        App.setCollapsed = setCollapsed;
        App.applyRightWidth = applyRightWidth;
        App.saveLayout = saveLayout;

        function loadLayout() {
            try {
                const raw = localStorage.getItem(App.LAYOUT_KEY);
                if (!raw) { applyCollapsedUI(true); return; }
                const data = JSON.parse(raw);
                if (typeof data.rightWidth === 'number') st.lastRightWidth = data.rightWidth;
                if (data.collapsed === false) {
                    st.isCollapsed = false;
                    applyCollapsedUI(false);
                    requestAnimationFrame(() => {
                        st.lastRightWidth = applyRightWidth(st.lastRightWidth);
                    });
                } else {
                    applyCollapsedUI(true);
                }
            } catch (e) { applyCollapsedUI(true); }
        }

        if (collapsePanelBtn) collapsePanelBtn.addEventListener('click', () => setCollapsed(!st.isCollapsed));
        if (expandFloatBtn) expandFloatBtn.addEventListener('click', () => setCollapsed(false));
        if (openPanelBtn) openPanelBtn.addEventListener('click', () => setCollapsed(false));

        if (splitter) {
            splitter.addEventListener('dblclick', () => setCollapsed(!st.isCollapsed));
            splitter.addEventListener('pointerdown', (e) => {
                if (st.isCollapsed) return;
                e.preventDefault();
                st.isResizing = true;
                splitter.classList.add('dragging');
                document.body.classList.add('resizing');
                try { splitter.setPointerCapture(e.pointerId); } catch (err) {}
            });
            splitter.addEventListener('pointermove', (e) => {
                if (!st.isResizing) return;
                const total = getLayoutWidth();
                const rect = splitLayout.getBoundingClientRect();
                const pointerX = e.clientX - rect.left;
                const splitterW = splitter.offsetWidth || 14;
                applyRightWidth(total - pointerX - splitterW / 2);
            });
            const stopResize = (e) => {
                if (!st.isResizing) return;
                st.isResizing = false;
                splitter.classList.remove('dragging');
                document.body.classList.remove('resizing');
                try { splitter.releasePointerCapture(e.pointerId); } catch (err) {}
                const cur = parseInt(paneRight.style.flexBasis, 10);
                if (!isNaN(cur) && cur > 0) st.lastRightWidth = cur;
                saveLayout();
            };
            splitter.addEventListener('pointerup', stopResize);
            splitter.addEventListener('pointercancel', stopResize);
            window.addEventListener('mouseup', () => {
                if (st.isResizing) {
                    st.isResizing = false;
                    splitter.classList.remove('dragging');
                    document.body.classList.remove('resizing');
                    const cur = parseInt(paneRight.style.flexBasis, 10);
                    if (!isNaN(cur) && cur > 0) st.lastRightWidth = cur;
                    saveLayout();
                }
            });
        }

        window.addEventListener('resize', () => {
            if (!st.isCollapsed) {
                const cur = parseInt(paneRight.style.flexBasis, 10) || st.lastRightWidth;
                applyRightWidth(cur);
            }
        });

        loadLayout();
    };

    // ===== 右侧标签切换 =====
    // ★ 已合并为三个标签：mediaPanel / formulaPanel / annotListPanel
    App.switchRightTab = function (tabId) {
        const rightTabBtns = document.querySelectorAll('.right-tab-btn');
        const panels = {
            mediaPanel:     App.$('mediaPanel'),
            formulaPanel:   App.$('formulaPanel'),
            annotListPanel: App.$('annotListPanel')
        };
        if (App.state.isCollapsed) App.setCollapsed(false);
        rightTabBtns.forEach(b => {
            if (b.dataset.rtab === tabId) b.classList.add('active');
            else b.classList.remove('active');
        });
        Object.entries(panels).forEach(([k, p]) => {
            if (!p) return;
            if (k === tabId) p.classList.add('active');
            else p.classList.remove('active');
        });
    };

    App.initRightTabs = function () {
        const rightTabBtns = document.querySelectorAll('.right-tab-btn');
        const panels = {
            mediaPanel:     App.$('mediaPanel'),
            formulaPanel:   App.$('formulaPanel'),
            annotListPanel: App.$('annotListPanel')
        };
        rightTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.rtab;
                rightTabBtns.forEach(b => b.classList.remove('active'));
                Object.values(panels).forEach(p => p && p.classList.remove('active'));
                btn.classList.add('active');
                if (panels[tabId]) panels[tabId].classList.add('active');
            });
        });
    };

})();