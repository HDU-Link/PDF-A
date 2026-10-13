/**
 * 面板模块：截图 / 图片 / 公式 / 标注列表 / 网页框选截图 / 导入导出
 */
(function () {
    'use strict';

    const App = window.App;
    const st = App.state;

    // ===== 通用 =====
    const snippetModal = App.$('snippetModal');
    const snippetModalImg = App.$('snippetModalImg');
    const snippetModalClose = App.$('snippetModalClose');

    function openModal(src) {
        snippetModalImg.src = src;
        snippetModal.classList.add('show');
    }
    function closeModal() {
        snippetModal.classList.remove('show');
        snippetModalImg.src = '';
    }
    if (snippetModal) {
        snippetModal.addEventListener('click', (e) => {
            if (e.target === snippetModal) closeModal();
        });
        snippetModalClose.addEventListener('click', closeModal);
    }

    // ============================================================
    // 截图面板
    // ============================================================
    function renderSnippetBoard() {
        const board = App.$('snippetBoard');
        const empty = App.$('snippetEmpty');
        const count = App.$('snippetCount');
        const clearAllBtn = App.$('clearAllSnippetsBtn');
        if (!board) return;

        board.innerHTML = '';
        if (st.snippets.length === 0) {
            board.appendChild(empty);
            empty.style.display = 'flex';
            count.textContent = '0';
            clearAllBtn.disabled = true;
            return;
        }
        count.textContent = String(st.snippets.length);
        clearAllBtn.disabled = false;

        st.snippets.forEach((s) => {
            const card = document.createElement('div');
            card.className = 'snippet-card';

            const header = document.createElement('div');
            header.className = 'snippet-card-header';

            const meta = document.createElement('div');
            meta.className = 'meta';
            meta.innerHTML = `
                <span class="page-tag">第 ${s.page} 页</span>
                <span>${App.formatTime(s.timestamp)}</span>
            `;

            const actions = document.createElement('div');
            actions.className = 'snippet-card-actions';

            const placeBtn = document.createElement('button');
            placeBtn.title = '贴到 PDF 上';
            placeBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
            placeBtn.addEventListener('click', () => {
                if (typeof window.__annotatorPlaceImage === 'function') {
                    window.__annotatorPlaceImage(s.dataUrl, '截图');
                } else {
                    alert('贴图功能未就绪');
                }
            });

            const zoomBtn = document.createElement('button');
            zoomBtn.title = '放大查看';
            zoomBtn.innerHTML = '<i class="fas fa-search-plus"></i>';
            zoomBtn.addEventListener('click', () => openModal(s.dataUrl));

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.title = '删除';
            delBtn.innerHTML = '<i class="fas fa-times"></i>';
            delBtn.addEventListener('click', () => {
                st.snippets = st.snippets.filter(x => x.id !== s.id);
                renderSnippetBoard();
                App.saveToStorageDebounced();
            });

            actions.appendChild(placeBtn);
            actions.appendChild(zoomBtn);
            actions.appendChild(delBtn);
            header.appendChild(meta);
            header.appendChild(actions);

            const img = document.createElement('img');
            img.className = 'snippet-card-image';
            img.src = s.dataUrl;
            img.alt = `第 ${s.page} 页截图`;
            img.addEventListener('click', () => openModal(s.dataUrl));

            card.appendChild(header);
            card.appendChild(img);
            board.appendChild(card);
        });
    }

    function addSnippet(dataUrl, page) {
        st.snippets.push({
            id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            dataUrl,
            page,
            timestamp: new Date()
        });
        renderSnippetBoard();
        App.saveToStorageDebounced();
        App.switchRightTab('snippetPanel');
    }

    // ============================================================
    // PDF 区域截图（拖拽框选）
    // ============================================================
    function initPdfSnip() {
        const snipToggleBtn = App.$('snipToggleBtn');
        const selectionLayer = App.$('selectionLayer');
        const selectionBox = App.$('selectionBox');
        const pdfPreviewWrapper = App.$('pdfPreviewWrapper');
        const pdfCanvas = App.$('pdfCanvas');

        function enterSnipMode() {
            st.snipMode = true;
            snipToggleBtn.classList.add('active');
            pdfPreviewWrapper.classList.add('snip-mode');
        }
        function exitSnipMode() {
            st.snipMode = false;
            st.isDragging = false;
            st.dragStart = null;
            snipToggleBtn.classList.remove('active');
            pdfPreviewWrapper.classList.remove('snip-mode');
            selectionBox.style.display = 'none';
        }
        App.exitSnipMode = exitSnipMode;

        function getLayerPoint(e) {
            const rect = selectionLayer.getBoundingClientRect();
            return { x: e.clientX - rect.left, y: e.clientY - rect.top };
        }

        selectionLayer.addEventListener('mousedown', (e) => {
            if (!st.snipMode || e.button !== 0) return;
            e.preventDefault();
            st.isDragging = true;
            st.dragStart = getLayerPoint(e);
            selectionBox.style.display = 'block';
            selectionBox.style.left = st.dragStart.x + 'px';
            selectionBox.style.top = st.dragStart.y + 'px';
            selectionBox.style.width = '0px';
            selectionBox.style.height = '0px';
        });

        selectionLayer.addEventListener('mousemove', (e) => {
            if (!st.isDragging) return;
            e.preventDefault();
            const p = getLayerPoint(e);
            const left = Math.min(st.dragStart.x, p.x);
            const top = Math.min(st.dragStart.y, p.y);
            const width = Math.abs(p.x - st.dragStart.x);
            const height = Math.abs(p.y - st.dragStart.y);
            selectionBox.style.left = left + 'px';
            selectionBox.style.top = top + 'px';
            selectionBox.style.width = width + 'px';
            selectionBox.style.height = height + 'px';
        });

        selectionLayer.addEventListener('mouseup', (e) => {
            if (!st.isDragging) return;
            e.preventDefault();
            st.isDragging = false;
            const p = getLayerPoint(e);
            const left = Math.min(st.dragStart.x, p.x);
            const top = Math.min(st.dragStart.y, p.y);
            const width = Math.abs(p.x - st.dragStart.x);
            const height = Math.abs(p.y - st.dragStart.y);
            selectionBox.style.display = 'none';
            if (width < 8 || height < 8) return;

            // 裁剪
            const layerRect = selectionLayer.getBoundingClientRect();
            const canvasRect = pdfCanvas.getBoundingClientRect();
            const offsetX = canvasRect.left - layerRect.left;
            const offsetY = canvasRect.top - layerRect.top;
            const selX = left - offsetX;
            const selY = top - offsetY;
            const clampedX = Math.max(0, Math.min(selX, canvasRect.width));
            const clampedY = Math.max(0, Math.min(selY, canvasRect.height));
            const clampedW = Math.max(0, Math.min(selX + width, canvasRect.width) - clampedX);
            const clampedH = Math.max(0, Math.min(selY + height, canvasRect.height) - clampedY);
            if (clampedW < 4 || clampedH < 4) { exitSnipMode(); return; }
            const pixelRatio = (pdfCanvas.width / canvasRect.width) || 1;
            const tmp = document.createElement('canvas');
            tmp.width = Math.round(clampedW * pixelRatio);
            tmp.height = Math.round(clampedH * pixelRatio);
            tmp.getContext('2d').drawImage(
                pdfCanvas,
                clampedX * pixelRatio, clampedY * pixelRatio,
                clampedW * pixelRatio, clampedH * pixelRatio,
                0, 0, tmp.width, tmp.height
            );
            addSnippet(tmp.toDataURL('image/png'), st.currentPage);
            exitSnipMode();
        });

        selectionLayer.addEventListener('mouseleave', () => {
            if (st.isDragging) {
                st.isDragging = false;
                selectionBox.style.display = 'none';
            }
        });

        snipToggleBtn.addEventListener('click', () => {
            if (st.snipMode) exitSnipMode();
            else enterSnipMode();
        });
    }

    // ============================================================
    // 图片面板
    // ============================================================
    function renderImageBoard() {
        const board = App.$('imageBoard');
        const empty = App.$('imageEmpty');
        const count = App.$('imageCount');
        const clearAllBtn = App.$('clearAllImagesBtn');
        if (!board) return;

        board.innerHTML = '';
        if (st.images.length === 0) {
            board.appendChild(empty);
            empty.style.display = 'flex';
            if (count) count.textContent = '0';
            if (clearAllBtn) clearAllBtn.disabled = true;
            return;
        }
        if (count) count.textContent = String(st.images.length);
        if (clearAllBtn) clearAllBtn.disabled = false;

        st.images.forEach((imgItem) => {
            const card = document.createElement('div');
            card.className = 'snippet-card';

            const header = document.createElement('div');
            header.className = 'snippet-card-header';

            const meta = document.createElement('div');
            meta.className = 'meta';
            const sizeText = App.formatSize(imgItem.size);
            meta.innerHTML = `
                <span class="name-tag" title="${App.escapeHtml(imgItem.name)}">${App.escapeHtml(imgItem.name)}</span>
                ${sizeText ? `<span>${sizeText}</span>` : ''}
                <span>${App.formatTime(imgItem.timestamp)}</span>
            `;

            const actions = document.createElement('div');
            actions.className = 'snippet-card-actions';

            const placeBtn = document.createElement('button');
            placeBtn.title = '贴到 PDF 上';
            placeBtn.innerHTML = '<i class="fas fa-thumbtack"></i>';
            placeBtn.addEventListener('click', () => {
                if (typeof window.__annotatorPlaceImage === 'function') {
                    window.__annotatorPlaceImage(imgItem.dataUrl, imgItem.name || '图片');
                } else {
                    alert('贴图功能未就绪');
                }
            });

            const zoomBtn = document.createElement('button');
            zoomBtn.title = '放大查看';
            zoomBtn.innerHTML = '<i class="fas fa-search-plus"></i>';
            zoomBtn.addEventListener('click', () => openModal(imgItem.dataUrl));

            const downloadBtn = document.createElement('button');
            downloadBtn.title = '下载图片';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.addEventListener('click', () => {
                const a = document.createElement('a');
                a.href = imgItem.dataUrl;
                a.download = imgItem.name || ('image_' + imgItem.id);
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.title = '删除';
            delBtn.innerHTML = '<i class="fas fa-times"></i>';
            delBtn.addEventListener('click', () => {
                st.images = st.images.filter(x => x.id !== imgItem.id);
                renderImageBoard();
                App.saveToStorageDebounced();
            });

            actions.appendChild(placeBtn);
            actions.appendChild(zoomBtn);
            actions.appendChild(downloadBtn);
            actions.appendChild(delBtn);
            header.appendChild(meta);
            header.appendChild(actions);

            const img = document.createElement('img');
            img.className = 'snippet-card-image';
            img.src = imgItem.dataUrl;
            img.alt = imgItem.name;
            img.addEventListener('click', () => openModal(imgItem.dataUrl));

            card.appendChild(header);
            card.appendChild(img);
            board.appendChild(card);
        });
    }

    function addImage(dataUrl, name, size) {
        st.images.push({
            id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
            dataUrl,
            name: name || '未命名图片',
            size: size || 0,
            timestamp: new Date()
        });
        renderImageBoard();
        App.saveToStorageDebounced();
        App.switchRightTab('imagePanel');
    }

    function initImagePanel() {
        const imageUpload = App.$('imageUpload');
        const clearAllImagesBtn = App.$('clearAllImagesBtn');

        if (imageUpload) {
            imageUpload.addEventListener('change', (e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                files.forEach(file => {
                    if (!file.type.startsWith('image/')) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => addImage(ev.target.result, file.name, file.size);
                    reader.readAsDataURL(file);
                });
                e.target.value = '';
                App.switchRightTab('imagePanel');
            });
        }

        if (clearAllImagesBtn) {
            clearAllImagesBtn.addEventListener('click', () => {
                if (st.images.length === 0) return;
                if (confirm('确定清空所有上传的图片吗？')) {
                    st.images = [];
                    renderImageBoard();
                    App.saveToStorageDebounced();
                }
            });
        }
    }

    // ============================================================
    // 公式面板
    // ============================================================
    function renderFormulaList() {
        const list = App.$('formulaList');
        const empty = App.$('formulaEmpty');
        const count = App.$('formulaCount');
        const mathfield = App.$('mathfield');
        if (!list) return;

        if (window.customElements && !customElements.get('math-field')) {
            if (!renderFormulaList._pending) {
                renderFormulaList._pending = true;
                customElements.whenDefined('math-field').then(() => {
                    renderFormulaList._pending = false;
                    renderFormulaList();
                });
            }
        }

        list.innerHTML = '';
        if (st.formulas.length === 0) {
            list.appendChild(empty);
            empty.style.display = 'flex';
            count.textContent = '0';
            return;
        }
        count.textContent = String(st.formulas.length);

        st.formulas.forEach((f) => {
            const item = document.createElement('div');
            item.className = 'formula-item';

            const rendered = document.createElement('div');
            rendered.className = 'rendered';

            try {
                const mf = document.createElement('math-field');
                mf.setAttribute('readonly', '');
                mf.setAttribute('tabindex', '-1');
                if ('mathVirtualKeyboardPolicy' in mf) {
                    mf.mathVirtualKeyboardPolicy = 'manual';
                }
                mf.value = f.latex;
                mf.style.cssText = `
                    display: inline-block; min-width: 40px; padding: 2px 6px;
                    font-size: 1.1rem; background: transparent; border: none;
                    outline: none; --caret-color: transparent;
                    --selection-background-color: transparent; pointer-events: none;
                `;
                rendered.appendChild(mf);
            } catch (e) {
                rendered.textContent = f.latex;
                rendered.style.fontFamily = "'Fira Code', Consolas, monospace";
                rendered.style.fontSize = '0.85rem';
                rendered.style.color = '#64748b';
            }

            const actions = document.createElement('div');
            actions.className = 'actions';

            const copyBtn = document.createElement('button');
            copyBtn.title = '复制 LaTeX';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(f.latex).catch(() => {});
            });

            const editBtn = document.createElement('button');
            editBtn.title = '载入编辑器';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.addEventListener('click', () => {
                try { mathfield.setValue(f.latex || ''); } catch (e) {}
                if (mathfield) mathfield.focus();
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.title = '删除';
            delBtn.innerHTML = '<i class="fas fa-times"></i>';
            delBtn.addEventListener('click', () => {
                st.formulas = st.formulas.filter(x => x.id !== f.id);
                renderFormulaList();
                App.saveToStorageDebounced();
            });

            actions.appendChild(copyBtn);
            actions.appendChild(editBtn);
            actions.appendChild(delBtn);
            item.appendChild(rendered);
            item.appendChild(actions);
            list.appendChild(item);
        });
    }

    function initFormulaPanel() {
        const mathfield = App.$('mathfield');
        const saveBtn = App.$('saveFormulaBtn');
        const clearBtn = App.$('clearFormulaBtn');
        const copyBtn = App.$('copyFormulaBtn');

        function getLatex() {
            if (!mathfield) return '';
            try { return (mathfield.getValue('latex') || '').trim(); }
            catch (e) { return ''; }
        }
        function setLatex(v) {
            if (!mathfield) return;
            try { mathfield.setValue(v || ''); } catch (e) {}
        }

        if (mathfield) {
            try {
                mathfield.setAttribute('placeholder', '输入公式');
                if ('mathVirtualKeyboardPolicy' in mathfield) {
                    mathfield.mathVirtualKeyboardPolicy = 'auto';
                }
            } catch (e) {}
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const latex = getLatex();
                if (!latex) { alert('公式为空，请先输入内容'); return; }
                if (st.formulas.some(f => f.latex === latex)) {
                    alert('该公式已经保存过了');
                    return;
                }
                st.formulas.push({
                    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
                    latex,
                    timestamp: new Date()
                });
                renderFormulaList();
                App.saveToStorageDebounced();
                App.switchRightTab('formulaPanel');
                setLatex('');
                if (mathfield) mathfield.focus();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                setLatex('');
                if (mathfield) mathfield.focus();
            });
        }

        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const latex = getLatex();
                if (!latex) { alert('公式为空'); return; }
                navigator.clipboard.writeText(latex).then(() => {
                    const original = copyBtn.innerHTML;
                    copyBtn.innerHTML = '<i class="fas fa-check"></i> 已复制';
                    setTimeout(() => { copyBtn.innerHTML = original; }, 1200);
                }).catch(() => alert('复制失败'));
            });
        }
    }

    // ============================================================
    // 标注列表面板
    // ============================================================
    function renderAnnotList() {
        const list = App.$('annotList');
        const empty = App.$('annotListEmpty');
        const count = App.$('annotListCount');
        const toggleAllBtn = App.$('annotToggleAllBtn');
        const clearPageBtn = App.$('annotClearPageBtn');
        if (!list) return;
        if (!window.__annotatorList) return;

        const items = window.__annotatorList.getCurrentPageItems();
        list.innerHTML = '';
        if (count) count.textContent = String(items.length);

        if (items.length === 0) {
            list.appendChild(empty);
            empty.style.display = 'flex';
            if (toggleAllBtn) toggleAllBtn.disabled = true;
            if (clearPageBtn) clearPageBtn.disabled = true;
            return;
        }

        if (toggleAllBtn) {
            toggleAllBtn.disabled = false;
            const allHidden = items.every(it => it.hidden);
            toggleAllBtn.innerHTML = allHidden
                ? '<i class="fas fa-eye"></i> 全部显示'
                : '<i class="fas fa-eye-slash"></i> 全部隐藏';
        }
        if (clearPageBtn) clearPageBtn.disabled = false;

        items.forEach((it) => {
            const row = document.createElement('div');
            row.className = 'annot-list-item' + (it.hidden ? ' hidden' : '');

            const iconMap = {
                pen: 'fa-pen', line: 'fa-slash', arrow: 'fa-arrow-right',
                highlight: 'fa-highlighter', rect: 'fa-square',
                text: 'fa-font', image: 'fa-image'
            };
            const icon = document.createElement('i');
            icon.className = 'fas ' + (iconMap[it.type] || 'fa-circle');
            icon.style.color = it.hidden ? '#cbd5e1' : '#3b82f6';
            icon.style.width = '16px';
            icon.style.textAlign = 'center';
            icon.style.flexShrink = '0';

            const label = document.createElement('span');
            label.className = 'annot-list-label';
            label.textContent = it.label;
            label.title = it.label;
            if (it.hidden) label.style.color = '#94a3b8';
            label.style.flex = '1';
            label.style.minWidth = '0';
            label.style.overflow = 'hidden';
            label.style.textOverflow = 'ellipsis';
            label.style.whiteSpace = 'nowrap';

            const actions = document.createElement('div');
            actions.className = 'annot-list-actions';
            actions.style.display = 'flex';
            actions.style.gap = '0.2rem';
            actions.style.flexShrink = '0';

            const eyeBtn = document.createElement('button');
            eyeBtn.title = it.hidden ? '点击显示' : '点击隐藏';
            eyeBtn.innerHTML = `<i class="fas ${it.hidden ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
            eyeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.__annotatorList) window.__annotatorList.toggleHidden(it.index);
            });

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.title = '删除';
            delBtn.innerHTML = '<i class="fas fa-times"></i>';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.__annotatorList) window.__annotatorList.removeAt(it.index);
            });

            actions.appendChild(eyeBtn);
            actions.appendChild(delBtn);

            row.addEventListener('click', () => {
                if (window.__annotatorList) window.__annotatorList.selectAt(it.index);
            });

            row.appendChild(icon);
            row.appendChild(label);
            row.appendChild(actions);
            list.appendChild(row);
        });
    }

    function initAnnotListPanel() {
        const toggleAllBtn = App.$('annotToggleAllBtn');
        const clearPageBtn = App.$('annotClearPageBtn');

        window.addEventListener('annotations-changed', renderAnnotList);

        if (toggleAllBtn) {
            toggleAllBtn.addEventListener('click', () => {
                if (!window.__annotatorList) return;
                const items = window.__annotatorList.getCurrentPageItems();
                const allHidden = items.every(it => it.hidden);
                window.__annotatorList.setAllHidden(!allHidden);
            });
        }
        if (clearPageBtn) {
            clearPageBtn.addEventListener('click', () => {
                if (!window.__annotatorList) return;
                window.__annotatorList.clearCurrentPage();
            });
        }

        // 翻页时刷新
        let lastPage = 1;
        setInterval(() => {
            if (!window.__annotatorList) return;
            const n = window.__annotatorList.getCurrentPageNum();
            if (n !== lastPage) {
                lastPage = n;
                renderAnnotList();
            }
        }, 400);

        renderAnnotList();
    }

    // ============================================================
    // 网页框选截图
    // ============================================================
    const webSnip = window.App.webSnip = {
        active: false,
        dragging: false,
        startX: 0, startY: 0, curX: 0, curY: 0,
        overlay: null, box: null,
        scrollX: 0, scrollY: 0
    };

    function enterWebSnipMode() {
        if (webSnip.active) { exitWebSnipMode(); return; }
        webSnip.scrollX = window.scrollX || window.pageXOffset || 0;
        webSnip.scrollY = window.scrollY || window.pageYOffset || 0;

        const overlay = document.createElement('div');
        overlay.id = '__web_snip_overlay__';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 99999; cursor: crosshair;
            background: rgba(15,23,42,0.05); user-select: none; -webkit-user-select: none;
        `;
        const box = document.createElement('div');
        box.style.cssText = `
            position: fixed; border: 2px dashed #3b82f6;
            background: rgba(59,130,246,0.15);
            box-shadow: 0 0 0 9999px rgba(15,23,42,0.35);
            display: none; pointer-events: none; z-index: 100000;
        `;
        overlay.appendChild(box);

        const tip = document.createElement('div');
        tip.style.cssText = `
            position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
            background: #1e293b; color: #fff; padding: 8px 16px;
            border-radius: 40px; font-size: 13px; z-index: 100001;
            pointer-events: none; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: system-ui, sans-serif;
        `;
        tip.textContent = '拖拽鼠标框选要截取的区域（按 Esc 取消）';
        overlay.appendChild(tip);

        document.body.appendChild(overlay);
        webSnip.active = true;
        webSnip.overlay = overlay;
        webSnip.box = box;

        overlay.addEventListener('mousedown', onDown);
        overlay.addEventListener('mousemove', onMove);
        overlay.addEventListener('mouseup', onUp);
        window.addEventListener('keydown', onKey, true);
        App.$('screenshotPageBtn').classList.add('active');
    }

    function exitWebSnipMode() {
        if (!webSnip.active) return;
        webSnip.active = false;
        webSnip.dragging = false;
        if (webSnip.overlay && webSnip.overlay.parentNode) {
            webSnip.overlay.removeEventListener('mousedown', onDown);
            webSnip.overlay.removeEventListener('mousemove', onMove);
            webSnip.overlay.removeEventListener('mouseup', onUp);
            webSnip.overlay.parentNode.removeChild(webSnip.overlay);
        }
        window.removeEventListener('keydown', onKey, true);
        webSnip.overlay = null;
        webSnip.box = null;
        App.$('screenshotPageBtn').classList.remove('active');
    }

    function onDown(e) {
        if (e.button !== 0) return;
        e.preventDefault();
        webSnip.dragging = true;
        webSnip.startX = e.clientX; webSnip.startY = e.clientY;
        webSnip.curX = e.clientX; webSnip.curY = e.clientY;
        if (webSnip.box) {
            webSnip.box.style.display = 'block';
            webSnip.box.style.left = e.clientX + 'px';
            webSnip.box.style.top = e.clientY + 'px';
            webSnip.box.style.width = '0px';
            webSnip.box.style.height = '0px';
        }
    }

    function onMove(e) {
        if (!webSnip.dragging) return;
        e.preventDefault();
        webSnip.curX = e.clientX; webSnip.curY = e.clientY;
        const left = Math.min(webSnip.startX, webSnip.curX);
        const top = Math.min(webSnip.startY, webSnip.curY);
        const width = Math.abs(webSnip.curX - webSnip.startX);
        const height = Math.abs(webSnip.curY - webSnip.startY);
        if (webSnip.box) {
            webSnip.box.style.left = left + 'px';
            webSnip.box.style.top = top + 'px';
            webSnip.box.style.width = width + 'px';
            webSnip.box.style.height = height + 'px';
        }
    }

    async function onUp(e) {
        if (!webSnip.dragging) return;
        e.preventDefault();
        webSnip.dragging = false;
        const left = Math.min(webSnip.startX, webSnip.curX);
        const top = Math.min(webSnip.startY, webSnip.curY);
        const width = Math.abs(webSnip.curX - webSnip.startX);
        const height = Math.abs(webSnip.curY - webSnip.startY);
        if (width < 8 || height < 8) { exitWebSnipMode(); return; }
        const rect = { left, top, width, height };
        const sx = webSnip.scrollX, sy = webSnip.scrollY;
        exitWebSnipMode();
        await captureWebRegion(rect, sx, sy);
    }

    function onKey(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            exitWebSnipMode();
        }
    }

    async function captureWebRegion(rect, scrollX, scrollY) {
        if (typeof html2canvas === 'undefined') {
            alert('html2canvas 未加载，无法截图');
            return;
        }
        const btn = App.$('screenshotPageBtn');
        const origHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const dpr = window.devicePixelRatio || 1;
            const canvas = await html2canvas(document.body, {
                backgroundColor: '#ffffff', scale: dpr, logging: false,
                useCORS: true, allowTaint: false,
                scrollX: -scrollX, scrollY: -scrollY,
                windowWidth: document.documentElement.clientWidth,
                windowHeight: document.documentElement.clientHeight,
                width: document.documentElement.clientWidth,
                height: document.documentElement.clientHeight,
                x: scrollX, y: scrollY
            });
            const out = document.createElement('canvas');
            out.width = Math.round(rect.width * dpr);
            out.height = Math.round(rect.height * dpr);
            const ctx = out.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, out.width, out.height);
            ctx.drawImage(
                canvas,
                rect.left * dpr, rect.top * dpr,
                rect.width * dpr, rect.height * dpr,
                0, 0, out.width, out.height
            );
            addImage(out.toDataURL('image/png'), `网页截图_${Date.now()}.png`, 0);
            App.switchRightTab('imagePanel');
        } catch (e) {
            console.error('网页截图失败：', e);
            alert('截图失败：' + (e && e.message ? e.message : '未知错误'));
        } finally {
            btn.disabled = false;
            btn.innerHTML = origHtml;
        }
    }

    function initWebSnip() {
        const btn = App.$('screenshotPageBtn');
        if (btn) btn.addEventListener('click', enterWebSnipMode);
    }

    // ============================================================
    // 导入 / 导出
    // ============================================================
    function initImportExport() {
        const exportBtn = App.$('exportDataBtn');
        const importBtn = App.$('importDataBtn');
        const importInput = App.$('importDataInput');

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const data = {
                    version: 1,
                    exportedAt: new Date().toISOString(),
                    snippets: st.snippets,
                    images: st.images,
                    formulas: st.formulas
                };
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const ts = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                a.href = url;
                a.download = `pdf-annotations-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });
        }

        if (importBtn && importInput) {
            importBtn.addEventListener('click', () => importInput.click());
            importInput.addEventListener('change', (e) => {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        const snipArr = Array.isArray(data.snippets) ? data.snippets : [];
                        const imgArr = Array.isArray(data.images) ? data.images : [];
                        const formArr = Array.isArray(data.formulas) ? data.formulas : [];
                        const mode = confirm('「确定」= 追加；「取消」= 替换');
                        if (mode) {
                            st.snippets = st.snippets.concat(snipArr);
                            st.images = st.images.concat(imgArr);
                            st.formulas = st.formulas.concat(formArr);
                        } else {
                            st.snippets = snipArr;
                            st.images = imgArr;
                            st.formulas = formArr;
                        }
                        st.snippets.forEach(s => { if (s.timestamp) s.timestamp = new Date(s.timestamp); });
                        st.images.forEach(i => { if (i.timestamp) i.timestamp = new Date(i.timestamp); });
                        st.formulas.forEach(f => { if (f.timestamp) f.timestamp = new Date(f.timestamp); });
                        renderSnippetBoard();
                        renderImageBoard();
                        renderFormulaList();
                        App.saveToStorage();
                        alert('导入完成');
                    } catch (err) {
                        alert('导入失败：' + err.message);
                    }
                    e.target.value = '';
                };
                reader.readAsText(file);
            });
        }
    }

    // ============================================================
    // 初始化入口
    // ============================================================
    App.initPanels = function () {
        initPdfSnip();
        initImagePanel();
        initFormulaPanel();
        initAnnotListPanel();
        initWebSnip();
        initImportExport();

        renderSnippetBoard();
        renderImageBoard();
        renderFormulaList();
    };

    // 暴露给其它模块
    App.renderSnippetBoard = renderSnippetBoard;
    App.renderImageBoard = renderImageBoard;
    App.renderFormulaList = renderFormulaList;
    App.renderAnnotList = renderAnnotList;
    App.addSnippet = addSnippet;
    App.addImage = addImage;
    App.openModal = openModal;

})();