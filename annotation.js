/**
 * 标注模块：在 PDF 上画线、箭头、矩形、高亮、文字、贴图，并导出修改后的 PDF。
 * 依赖：pdf.js（读取 PDF）、pdf-lib（写入 PDF）
 *
 * 坐标策略：所有标注坐标以「归一化坐标」（0-1）存储。
 * 图片支持：选中后拖拽 8 个控制点缩放。
 * 文字：单击位置内联输入；选择工具下双击文字进入编辑；支持换行。
 * 隐藏：每条标注可 hidden=true，隐藏则不绘制、不导出。
 * 对外暴露 window.__annotatorList 供右侧列表操作。
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    const pdfCanvas = $('pdfCanvas');
    const annotationLayer = $('annotationLayer');
    const annotationCanvas = $('annotationCanvas');
    const pdfPreviewWrapper = $('pdfPreviewWrapper');

    const toolPen = $('toolPen');
    const toolLine = $('toolLine');
    const toolArrow = $('toolArrow');
    const toolHighlight = $('toolHighlight');
    const toolRect = $('toolRect');
    const toolText = $('toolText');
    const toolSelect = $('toolSelect');
    const toolDelete = $('toolDelete');
    const toolUndo = $('toolUndo');
    const toolClear = $('toolClear');
    const annotColor = $('annotColor');
    const exportPdfBtn = $('exportPdfBtn');
    const annotHint = $('annotHint');

    const annotFontSizeWrap = $('annotFontSizeWrap');
    const annotFontSize = $('annotFontSize');
    const annotFontSizeLabel = $('annotFontSizeLabel');

    if (!pdfCanvas || !annotationLayer || !annotationCanvas) {
        console.warn('[annotation.js] 关键元素缺失，标注模块未启动');
        return;
    }

    const annotToolBtns = [toolPen, toolLine, toolArrow, toolHighlight, toolRect, toolText, toolSelect]
        .filter(Boolean);

    // ============================================================
    // 状态
    // ============================================================
    const STORAGE_KEY = 'pdf_annotator_annotations_v1';
    const DEFAULT_COLOR = '#000000';

    let activeTool = null;
    let placeMode = false;
    let pendingImage = null;
    let annotations = {};

    let currentPageNum = 1;

    let isDrawing = false;
    let drawStart = null;
    let currentStroke = null;

    let toolsEnabled = false;

    let selectedIndex = -1;

    let isMoving = false;
    let moveStart = null;

    let isResizingHandle = false;
    let resizeHandleName = null;
    let resizeStart = null;

    let textInputEl = null;
    let textInputCtx = null;

    const imageCache = new Map();

    function refreshLayerActiveState() {
        const shouldActive = placeMode || (activeTool !== null);
        if (shouldActive) {
            annotationLayer.classList.add('active');
        } else {
            annotationLayer.classList.remove('active');
        }
    }

    function updateHint() {
        if (!annotHint) return;
        if (!toolsEnabled) {
            annotHint.classList.remove('active', 'ready');
            annotHint.innerHTML = '<i class="fas fa-info-circle"></i> 请先加载 PDF，再点上方工具';
            return;
        }
        if (placeMode) {
            annotHint.classList.add('active');
            annotHint.classList.remove('ready');
            annotHint.innerHTML = '<i class="fas fa-hand-pointer"></i> 🖼️ 贴图模式：在 PDF 上点击放置' +
                (pendingImage && pendingImage.name ? `「${escapeHtml(pendingImage.name)}」` : '') +
                '，按 Esc 取消';
            return;
        }
        if (!activeTool) {
            annotHint.classList.remove('active');
            annotHint.classList.add('ready');
            annotHint.innerHTML = '<i class="fas fa-check-circle"></i> PDF 已加载，点上方工具即可在页面上标注';
            return;
        }
        const map = {
            pen: '🖊️ 自由画笔：按住鼠标拖拽绘制',
            line: '📏 直线：拖拽起点到终点',
            arrow: '➡️ 箭头：拖拽起点到终点',
            highlight: '🖍️ 高亮：拖拽框选要高亮的区域',
            rect: '⬜ 矩形框：拖拽框选区域',
            text: '🔤 文字批注：单击位置直接输入，Enter 提交，Shift+Enter 换行，Esc 取消',
            select: '👆 选择：单击选中 / 双击文字编辑 / 拖动移动 / 拖控制点缩放 / Delete 删除'
        };
        annotHint.classList.add('active');
        annotHint.classList.remove('ready');
        annotHint.innerHTML = '<i class="fas fa-hand-pointer"></i>' + (map[activeTool] || '');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function notifyListChanged() {
        try {
            window.dispatchEvent(new CustomEvent('annotations-changed'));
        } catch (e) {}
    }

    function setActiveTool(tool) {
        if (!toolsEnabled) return;

        if (textInputEl) commitTextInput();

        placeMode = false;
        pendingImage = null;

        if (activeTool === tool) {
            activeTool = null;
        } else {
            activeTool = tool;
        }
        if (activeTool !== 'select') {
            selectedIndex = -1;
            redraw();
        }
        annotToolBtns.forEach(btn => btn.classList.remove('active'));
        if (activeTool) {
            const map = {
                pen: toolPen, line: toolLine, arrow: toolArrow,
                highlight: toolHighlight, rect: toolRect, text: toolText,
                select: toolSelect
            };
            const btn = map[activeTool];
            if (btn) btn.classList.add('active');
        }
        refreshLayerActiveState();
        updateHint();
        updateFontSizeUI();
        notifyListChanged();
    }

    if (toolPen) toolPen.addEventListener('click', () => setActiveTool('pen'));
    if (toolLine) toolLine.addEventListener('click', () => setActiveTool('line'));
    if (toolArrow) toolArrow.addEventListener('click', () => setActiveTool('arrow'));
    if (toolHighlight) toolHighlight.addEventListener('click', () => setActiveTool('highlight'));
    if (toolRect) toolRect.addEventListener('click', () => setActiveTool('rect'));
    if (toolText) toolText.addEventListener('click', () => setActiveTool('text'));
    if (toolSelect) toolSelect.addEventListener('click', () => setActiveTool('select'));

    if (toolUndo) {
        toolUndo.addEventListener('click', () => {
            if (!toolsEnabled) return;
            const arr = annotations[currentPageNum];
            if (!arr || arr.length === 0) return;
            if (selectedIndex === arr.length - 1) selectedIndex = -1;
            arr.pop();
            redraw();
            saveAnnotations();
            updateFontSizeUI();
        });
    }

    if (toolClear) {
        toolClear.addEventListener('click', () => {
            if (!toolsEnabled) return;
            if (!annotations[currentPageNum] || annotations[currentPageNum].length === 0) return;
            if (!confirm(`确定清空第 ${currentPageNum} 页的所有标注吗？`)) return;
            annotations[currentPageNum] = [];
            selectedIndex = -1;
            redraw();
            saveAnnotations();
            updateFontSizeUI();
        });
    }

    if (toolDelete) {
        toolDelete.addEventListener('click', () => {
            deleteSelected();
        });
    }

    function deleteSelected() {
        if (!toolsEnabled) return;
        if (selectedIndex < 0) {
            alert('请先用「选择」工具点选一个标注');
            return;
        }
        const arr = annotations[currentPageNum];
        if (!arr || !arr[selectedIndex]) return;
        arr.splice(selectedIndex, 1);
        selectedIndex = -1;
        redraw();
        saveAnnotations();
        updateFontSizeUI();
    }

    window.__annotatorPlaceImage = function (dataUrl, name) {
        if (!toolsEnabled) {
            alert('请先加载 PDF');
            return;
        }
        if (textInputEl) commitTextInput();
        const img = new Image();
        img.onload = () => {
            pendingImage = {
                dataUrl,
                width: img.naturalWidth || 100,
                height: img.naturalHeight || 100,
                name: name || '图片'
            };
            imageCache.set(dataUrl, img);
            activeTool = null;
            annotToolBtns.forEach(btn => btn.classList.remove('active'));
            placeMode = true;
            refreshLayerActiveState();
            updateHint();
            updateFontSizeUI();
        };
        img.onerror = () => {
            alert('图片加载失败');
        };
        img.src = dataUrl;
    };

    function getCanvasSize() {
        return {
            w: annotationCanvas.width || 1,
            h: annotationCanvas.height || 1
        };
    }

    function syncCanvasSize() {
        if (!pdfCanvas || !annotationCanvas) return false;
        const w = pdfCanvas.width;
        const h = pdfCanvas.height;
        if (!w || !h) return false;

        const sw = parseInt(pdfCanvas.style.width, 10) || (w / (window.devicePixelRatio || 1));
        const sh = parseInt(pdfCanvas.style.height, 10) || (h / (window.devicePixelRatio || 1));

        if (annotationCanvas.width !== w || annotationCanvas.height !== h) {
            annotationCanvas.width = w;
            annotationCanvas.height = h;
        }
        annotationCanvas.style.width = sw + 'px';
        annotationCanvas.style.height = sh + 'px';
        annotationLayer.style.width = sw + 'px';
        annotationLayer.style.height = sh + 'px';
        return true;
    }

    function getNormalizedPoint(e) {
        const rect = annotationCanvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    }

    function hitResizeHandle(a, nx, ny, w, h) {
        if (a.type !== 'image' && a.type !== 'rect' && a.type !== 'highlight' && a.type !== 'text') return null;

        let x1, y1, x2, y2;
        if (a.type === 'image' || a.type === 'rect' || a.type === 'highlight') {
            x1 = Math.min(a.x, a.x + a.w);
            x2 = Math.max(a.x, a.x + a.w);
            y1 = Math.min(a.y, a.y + a.h);
            y2 = Math.max(a.y, a.y + a.h);
        } else if (a.type === 'text') {
            const fontSize = a.fontSize || 0.018;
            const lines = String(a.text || '').split('\n');
            const lineH = fontSize * 1.3;
            const maxLineW = Math.max.apply(null, lines.map(l => l.length)) || 0;
            const approxW = maxLineW * fontSize * 0.6;
            x1 = a.x;
            y1 = a.y;
            x2 = a.x + approxW;
            y2 = a.y + lines.length * lineH;
        }

        const threshold = 10 / w;

        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const handles = {
            nw: { x: x1, y: y1 },
            n:  { x: cx, y: y1 },
            ne: { x: x2, y: y1 },
            e:  { x: x2, y: cy },
            se: { x: x2, y: y2 },
            s:  { x: cx, y: y2 },
            sw: { x: x1, y: y2 },
            w:  { x: x1, y: cy }
        };

        for (const name in handles) {
            const hnd = handles[name];
            if (Math.hypot(hnd.x - nx, hnd.y - ny) <= threshold) {
                return name;
            }
        }
        return null;
    }

    function hitTest(a, p, thresholdPx) {
        if (a.hidden) return false;
        const { w } = getCanvasSize();
        const t = (thresholdPx || 10) / w;

        if (a.type === 'pen') {
            if (!a.points || a.points.length === 0) return false;
            for (let i = 0; i < a.points.length; i++) {
                const pt = a.points[i];
                if (Math.hypot(pt.x - p.x, pt.y - p.y) <= t) return true;
            }
            for (let i = 1; i < a.points.length; i++) {
                if (pointToSegmentDist(p, a.points[i - 1], a.points[i]) <= t) return true;
            }
            return false;
        }

        if (a.type === 'line' || a.type === 'arrow') {
            return pointToSegmentDist(p, { x: a.x1, y: a.y1 }, { x: a.x2, y: a.y2 }) <= t;
        }

        if (a.type === 'highlight' || a.type === 'rect') {
            const x1 = Math.min(a.x, a.x + a.w);
            const x2 = Math.max(a.x, a.x + a.w);
            const y1 = Math.min(a.y, a.y + a.h);
            const y2 = Math.max(a.y, a.y + a.h);
            return p.x >= x1 - t && p.x <= x2 + t && p.y >= y1 - t && p.y <= y2 + t;
        }

        if (a.type === 'text') {
            const fontSize = a.fontSize || 0.018;
            const lines = String(a.text || '').split('\n');
            const lineH = fontSize * 1.3;
            const maxLineW = Math.max.apply(null, lines.map(l => l.length)) || 0;
            const approxW = maxLineW * fontSize * 0.6;
            const approxH = lines.length * lineH;
            return p.x >= a.x - t && p.x <= a.x + approxW + t &&
                   p.y >= a.y - t && p.y <= a.y + approxH + t;
        }

        if (a.type === 'image') {
            return p.x >= a.x - t && p.x <= a.x + a.w + t &&
                   p.y >= a.y - t && p.y <= a.y + a.h + t;
        }

        return false;
    }

    function pointToSegmentDist(p, a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
        let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const projX = a.x + t * dx;
        const projY = a.y + t * dy;
        return Math.hypot(p.x - projX, p.y - projY);
    }

    function findAnnotationAt(p) {
        const arr = annotations[currentPageNum] || [];
        for (let i = arr.length - 1; i >= 0; i--) {
            if (hitTest(arr[i], p)) return i;
        }
        return -1;
    }

    function arr_get(idx) {
        const arr = annotations[currentPageNum] || [];
        return arr[idx];
    }

    // ============================================================
    // 内联文字输入（新建 / 编辑）
    // ============================================================
    function openTextInput(normX, normY, editingIndex) {
        const rect = annotationCanvas.getBoundingClientRect();

        const screenX = rect.left + normX * rect.width;
        const screenY = rect.top + normY * rect.height;

        let initialText = '';
        let initialColor = (annotColor && annotColor.value) || DEFAULT_COLOR;
        let initialFontSize = 0.018;
        if (typeof editingIndex === 'number' && editingIndex >= 0) {
            const a = arr_get(editingIndex);
            if (a && a.type === 'text') {
                initialText = a.text || '';
                initialColor = a.color || initialColor;
                initialFontSize = a.fontSize || initialFontSize;
            }
        }

        const fontSizePx = Math.max(12, Math.round(initialFontSize * rect.width));

        const input = document.createElement('textarea');
        input.rows = 1;
        input.spellcheck = false;
        input.value = initialText;
        input.style.cssText = `
            position: fixed;
            left: ${screenX}px;
            top: ${screenY}px;
            min-width: 80px;
            min-height: ${fontSizePx + 8}px;
            padding: 2px 6px;
            font-size: ${fontSizePx}px;
            line-height: 1.3;
            font-family: "Inter", "PingFang SC", "Microsoft YaHei", sans-serif;
            color: ${initialColor};
            background: rgba(255,255,255,0.96);
            border: 1px dashed #3b82f6;
            border-radius: 4px;
            outline: none;
            resize: none;
            z-index: 99999;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            white-space: pre;
        `;

        document.body.appendChild(input);
        textInputEl = input;
        textInputCtx = {
            pageNum: currentPageNum,
            normX,
            normY,
            editingIndex: (typeof editingIndex === 'number') ? editingIndex : -1
        };

        const autoSize = () => {
            input.style.height = 'auto';
            input.style.height = Math.max(fontSizePx + 8, input.scrollHeight) + 'px';
            input.style.width = 'auto';
            input.style.width = Math.max(80, input.scrollWidth + 14) + 'px';
        };
        input.addEventListener('input', autoSize);

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                commitTextInput();
            } else if (ev.key === 'Escape') {
                ev.preventDefault();
                cancelTextInput();
            }
            ev.stopPropagation();
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (textInputEl === input) commitTextInput();
            }, 80);
        });

        input.focus();
        if (initialText) {
            input.setSelectionRange(initialText.length, initialText.length);
        }
        autoSize();
    }

    function commitTextInput() {
        if (!textInputEl) return;
        const input = textInputEl;
        const ctx = textInputCtx;
        const text = (input.value || '').replace(/\s+$/g, '');
        textInputEl = null;
        textInputCtx = null;
        if (input.parentNode) input.parentNode.removeChild(input);

        if (!ctx) return;

        if (ctx.editingIndex >= 0) {
            const arr = annotations[ctx.pageNum] || [];
            const a = arr[ctx.editingIndex];
            if (a && a.type === 'text') {
                if (!text) {
                    arr.splice(ctx.editingIndex, 1);
                    if (selectedIndex === ctx.editingIndex) selectedIndex = -1;
                    else if (selectedIndex > ctx.editingIndex) selectedIndex -= 1;
                } else {
                    a.text = text;
                }
                if (ctx.pageNum === currentPageNum) redraw();
                saveAnnotations();
                updateFontSizeUI();
            }
            return;
        }

        if (!text) return;
        const arr = annotations[ctx.pageNum] || (annotations[ctx.pageNum] = []);
        arr.push({
            type: 'text',
            color: (annotColor && annotColor.value) || DEFAULT_COLOR,
            x: ctx.normX,
            y: ctx.normY,
            text,
            fontSize: 0.018,
            lineWidth: 0.002
        });
        if (ctx.pageNum === currentPageNum) redraw();
        saveAnnotations();
    }

    function cancelTextInput() {
        if (!textInputEl) return;
        const input = textInputEl;
        textInputEl = null;
        textInputCtx = null;
        if (input.parentNode) input.parentNode.removeChild(input);
    }

    function updateFontSizeUI() {
        if (!annotFontSizeWrap || !annotFontSize) return;
        const a = selectedIndex >= 0 ? arr_get(selectedIndex) : null;
        if (a && a.type === 'text') {
            annotFontSizeWrap.style.display = 'inline-flex';
            const rect = annotationCanvas.getBoundingClientRect();
            const px = Math.round((a.fontSize || 0.018) * rect.width);
            annotFontSize.value = String(Math.max(8, Math.min(72, px)));
            if (annotFontSizeLabel) annotFontSizeLabel.textContent = String(annotFontSize.value);
        } else {
            annotFontSizeWrap.style.display = 'none';
        }
    }

    if (annotFontSize) {
        annotFontSize.addEventListener('input', () => {
            const a = selectedIndex >= 0 ? arr_get(selectedIndex) : null;
            if (!a || a.type !== 'text') return;
            const rect = annotationCanvas.getBoundingClientRect();
            a.fontSize = Math.max(0.006, (parseInt(annotFontSize.value, 10) || 16) / rect.width);
            if (annotFontSizeLabel) annotFontSizeLabel.textContent = annotFontSize.value;
            redraw();
            saveAnnotations();
        });
    }

    // ============================================================
    // 绘制事件
    // ============================================================
    annotationLayer.addEventListener('mousedown', (e) => {
        if (!toolsEnabled || e.button !== 0) return;

        if (textInputEl) {
            commitTextInput();
        }

        if (placeMode && pendingImage) {
            e.preventDefault();
            e.stopPropagation();
            const p = getNormalizedPoint(e);
            const rect = annotationCanvas.getBoundingClientRect();
            const displayPxW = Math.min(pendingImage.width, rect.width * 0.5);
            const displayPxH = displayPxW * (pendingImage.height / pendingImage.width);
            const nw = displayPxW / rect.width;
            const nh = displayPxH / rect.height;

            const arr = annotations[currentPageNum] || (annotations[currentPageNum] = []);
            arr.push({
                type: 'image',
                dataUrl: pendingImage.dataUrl,
                name: pendingImage.name,
                x: p.x - nw / 2,
                y: p.y - nh / 2,
                w: nw,
                h: nh
            });
            if (!imageCache.has(pendingImage.dataUrl)) {
                const img = new Image();
                img.src = pendingImage.dataUrl;
                imageCache.set(pendingImage.dataUrl, img);
            }
            placeMode = false;
            pendingImage = null;
            refreshLayerActiveState();
            redraw();
            saveAnnotations();
            updateHint();
            return;
        }

        if (!activeTool) return;
        e.preventDefault();
        const p = getNormalizedPoint(e);
        const { w, h } = getCanvasSize();

        if (activeTool === 'select') {
            if (selectedIndex >= 0) {
                const a = arr_get(selectedIndex);
                if (a) {
                    const hnd = hitResizeHandle(a, p.x, p.y, w, h);
                    if (hnd) {
                        isResizingHandle = true;
                        resizeHandleName = hnd;
                        let effH = a.h;
                        if (a.type === 'text') {
                            effH = a.fontSize || 0.018;
                        }
                        resizeStart = {
                            mouseX: p.x,
                            mouseY: p.y,
                            orig: {
                                x: a.x, y: a.y, w: a.w, h: effH,
                                fontSize: a.fontSize
                            },
                            type: a.type
                        };
                        return;
                    }
                }
            }

            const idx = findAnnotationAt(p);
            selectedIndex = idx;
            redraw();
            updateFontSizeUI();
            notifyListChanged();
            if (idx >= 0) {
                isMoving = true;
                moveStart = {
                    mouseX: p.x,
                    mouseY: p.y,
                    origX: arr_get(idx).x !== undefined ? arr_get(idx).x : null,
                    origY: arr_get(idx).y !== undefined ? arr_get(idx).y : null,
                    index: idx,
                    origPoints: arr_get(idx).type === 'pen' ? JSON.parse(JSON.stringify(arr_get(idx).points)) : null
                };
                if (annotHint) {
                    annotHint.classList.add('active');
                    annotHint.classList.remove('ready');
                    annotHint.innerHTML = '<i class="fas fa-hand-pointer"></i> 已选中标注，双击文字可编辑，拖拽可移动/缩放，按 Delete 删除';
                }
            }
            return;
        }

        if (activeTool === 'text') {
            e.preventDefault();
            e.stopPropagation();
            if (textInputEl) commitTextInput();
            openTextInput(p.x, p.y);
            return;
        }

        isDrawing = true;
        drawStart = p;
        const color = (annotColor && annotColor.value) || DEFAULT_COLOR;
        const lwNorm = 0.002;

        if (activeTool === 'pen') {
            currentStroke = { type: 'pen', color, points: [p], lineWidth: lwNorm };
        } else if (activeTool === 'line' || activeTool === 'arrow') {
            currentStroke = { type: activeTool, color, x1: p.x, y1: p.y, x2: p.x, y2: p.y, lineWidth: lwNorm };
        } else if (activeTool === 'highlight' || activeTool === 'rect') {
            currentStroke = { type: activeTool, color, x: p.x, y: p.y, w: 0, h: 0, lineWidth: lwNorm };
        }
    });

    // 双击文字 → 编辑
    annotationLayer.addEventListener('dblclick', (e) => {
        if (!toolsEnabled) return;
        if (activeTool !== 'select') return;
        e.preventDefault();
        e.stopPropagation();

        isMoving = false;
        moveStart = null;
        isResizingHandle = false;
        resizeStart = null;

        if (textInputEl) commitTextInput();

        const p = getNormalizedPoint(e);
        const arr = annotations[currentPageNum] || [];
        for (let i = arr.length - 1; i >= 0; i--) {
            const a = arr[i];
            if (a.hidden) continue;
            if (a.type !== 'text') continue;
            if (hitTest(a, p)) {
                selectedIndex = i;
                redraw();
                updateFontSizeUI();
                openTextInput(a.x, a.y, i);
                notifyListChanged();
                return;
            }
        }
    });

    annotationLayer.addEventListener('mousemove', (e) => {
        if (isResizingHandle && resizeStart) {
            e.preventDefault();
            const p = getNormalizedPoint(e);
            const a = arr_get(selectedIndex);
            if (!a) return;

            const dx = p.x - resizeStart.mouseX;
            const dy = p.y - resizeStart.mouseY;
            const o = resizeStart.orig;
            const hnd = resizeHandleName;

            let left = Math.min(o.x, o.x + o.w);
            let right = Math.max(o.x, o.x + o.w);
            let top = Math.min(o.y, o.y + o.h);
            let bottom = Math.max(o.y, o.y + o.h);

            if (hnd.includes('w')) left += dx;
            if (hnd.includes('e')) right += dx;
            if (hnd.includes('n')) top += dy;
            if (hnd.includes('s')) bottom += dy;

            const minSize = 0.01;
            if (right - left < minSize) {
                if (hnd.includes('w')) left = right - minSize;
                else right = left + minSize;
            }
            if (bottom - top < minSize) {
                if (hnd.includes('n')) top = bottom - minSize;
                else bottom = top + minSize;
            }

            const newX = left;
            const newY = top;
            const newW = right - left;
            const newH = bottom - top;

            if (a.type === 'image' || a.type === 'rect' || a.type === 'highlight') {
                a.x = newX;
                a.y = newY;
                a.w = newW;
                a.h = newH;
            } else if (a.type === 'text') {
                const origH = o.h || 0.018;
                const ratio = newH / origH;
                a.x = newX;
                a.y = newY;
                a.fontSize = Math.max(0.006, (o.fontSize || 0.018) * Math.max(0.2, ratio));
                updateFontSizeUI();
            }

            redraw();
            return;
        }

        if (isMoving && moveStart) {
            e.preventDefault();
            const p = getNormalizedPoint(e);
            const dx = p.x - moveStart.mouseX;
            const dy = p.y - moveStart.mouseY;
            const a = arr_get(moveStart.index);
            if (!a) return;

            if (a.type === 'pen') {
                if (!moveStart.origPoints) {
                    moveStart.origPoints = JSON.parse(JSON.stringify(a.points));
                }
                a.points = moveStart.origPoints.map(pt => ({ x: pt.x + dx, y: pt.y + dy }));
            } else if (a.type === 'line' || a.type === 'arrow') {
                if (moveStart.origX === null) {
                    moveStart.origX = a.x1;
                    moveStart.origY = a.y1;
                    moveStart.origX2 = a.x2;
                    moveStart.origY2 = a.y2;
                }
                a.x1 = moveStart.origX + dx;
                a.y1 = moveStart.origY + dy;
                a.x2 = moveStart.origX2 + dx;
                a.y2 = moveStart.origY2 + dy;
            } else if (a.type === 'highlight' || a.type === 'rect' || a.type === 'image' || a.type === 'text') {
                if (moveStart.origX === null) {
                    moveStart.origX = a.x;
                    moveStart.origY = a.y;
                }
                a.x = moveStart.origX + dx;
                a.y = moveStart.origY + dy;
            }
            redraw();
            return;
        }

        if (!isDrawing || !currentStroke) return;
        e.preventDefault();
        const p = getNormalizedPoint(e);

        if (currentStroke.type === 'pen') {
            currentStroke.points.push(p);
        } else if (currentStroke.type === 'line' || currentStroke.type === 'arrow') {
            currentStroke.x2 = p.x;
            currentStroke.y2 = p.y;
        } else if (currentStroke.type === 'highlight' || currentStroke.type === 'rect') {
            currentStroke.w = p.x - currentStroke.x;
            currentStroke.h = p.y - currentStroke.y;
        }
        redraw(true);
    });

    function finishDraw() {
        if (isResizingHandle) {
            isResizingHandle = false;
            resizeHandleName = null;
            resizeStart = null;
            saveAnnotations();
            return;
        }

        if (isMoving) {
            isMoving = false;
            moveStart = null;
            saveAnnotations();
            return;
        }

        if (!isDrawing || !currentStroke) return;
        isDrawing = false;

        const arr = annotations[currentPageNum] || (annotations[currentPageNum] = []);
        let valid = true;
        if (currentStroke.type === 'pen') {
            valid = currentStroke.points.length > 1;
        } else if (currentStroke.type === 'line' || currentStroke.type === 'arrow') {
            valid = Math.abs(currentStroke.x2 - currentStroke.x1) > 0.002 ||
                    Math.abs(currentStroke.y2 - currentStroke.y1) > 0.002;
        } else if (currentStroke.type === 'highlight' || currentStroke.type === 'rect') {
            valid = Math.abs(currentStroke.w) > 0.005 && Math.abs(currentStroke.h) > 0.005;
        }
        if (valid) {
            arr.push(currentStroke);
            saveAnnotations();
        }
        currentStroke = null;
        redraw();
    }

    annotationLayer.addEventListener('mouseup', finishDraw);
    annotationLayer.addEventListener('mouseleave', () => {
        if (isDrawing) finishDraw();
        if (isMoving) finishDraw();
        if (isResizingHandle) finishDraw();
    });

    window.addEventListener('keydown', (e) => {
        if (!toolsEnabled) return;
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        if (e.key === 'Escape') {
            if (placeMode) {
                placeMode = false;
                pendingImage = null;
                refreshLayerActiveState();
                updateHint();
                return;
            }
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIndex >= 0) {
            e.preventDefault();
            deleteSelected();
        }
    });

    function redraw(previewOnly) {
        if (!annotationCanvas) return;
        const ctx = annotationCanvas.getContext('2d');
        ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

        const { w, h } = getCanvasSize();

        const list = annotations[currentPageNum] || [];
        list.forEach((a, i) => {
            if (a.hidden) return;
            drawOne(ctx, a, w, h);
            if (i === selectedIndex) {
                drawSelectionBox(ctx, a, w, h);
            }
        });

        if (previewOnly && currentStroke) {
            drawOne(ctx, currentStroke, w, h);
        }
    }

    function drawSelectionBox(ctx, a, w, h) {
        const dpr = window.devicePixelRatio || 1;
        const pad = 6 * dpr;
        let x1, y1, x2, y2;

        if (a.type === 'pen') {
            if (!a.points || a.points.length === 0) return;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            a.points.forEach(p => {
                const px = p.x * w, py = p.y * h;
                if (px < minX) minX = px;
                if (py < minY) minY = py;
                if (px > maxX) maxX = px;
                if (py > maxY) maxY = py;
            });
            x1 = minX; y1 = minY; x2 = maxX; y2 = maxY;
        } else if (a.type === 'line' || a.type === 'arrow') {
            x1 = Math.min(a.x1, a.x2) * w;
            x2 = Math.max(a.x1, a.x2) * w;
            y1 = Math.min(a.y1, a.y2) * h;
            y2 = Math.max(a.y1, a.y2) * h;
        } else if (a.type === 'highlight' || a.type === 'rect') {
            x1 = Math.min(a.x, a.x + a.w) * w;
            x2 = Math.max(a.x, a.x + a.w) * w;
            y1 = Math.min(a.y, a.y + a.h) * h;
            y2 = Math.max(a.y, a.y + a.h) * h;
        } else if (a.type === 'image') {
            x1 = a.x * w;
            y1 = a.y * h;
            x2 = (a.x + a.w) * w;
            y2 = (a.y + a.h) * h;
        } else if (a.type === 'text') {
            const fontSize = (a.fontSize || 0.018) * w;
            const lines = String(a.text || '').split('\n');
            const lineH = fontSize * 1.3;
            const maxLineW = Math.max.apply(null, lines.map(l => l.length)) || 0;
            const approxW = maxLineW * fontSize * 0.6;
            x1 = a.x * w;
            y1 = a.y * h;
            x2 = x1 + approxW;
            y2 = y1 + lines.length * lineH;
        } else {
            return;
        }

        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.strokeRect(x1 - pad, y1 - pad, (x2 - x1) + pad * 2, (y2 - y1) + pad * 2);
        ctx.setLineDash([]);

        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const handles = [
            { x: x1, y: y1 }, { x: cx, y: y1 }, { x: x2, y: y1 },
            { x: x2, y: cy }, { x: x2, y: y2 }, { x: cx, y: y2 },
            { x: x1, y: y2 }, { x: x1, y: cy }
        ];
        const hs = 5 * dpr;
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2 * dpr;
        handles.forEach(hh => {
            ctx.beginPath();
            ctx.rect(hh.x - hs, hh.y - hs, hs * 2, hs * 2);
            ctx.fill();
            ctx.stroke();
        });

        ctx.restore();
    }

    function drawOne(ctx, a, w, h) {
        ctx.save();
        ctx.strokeStyle = a.color;
        ctx.fillStyle = a.color;
        const lw = (a.lineWidth || 0.002) * Math.max(w, h);
        ctx.lineWidth = Math.max(1, lw);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (a.type === 'pen') {
            if (!a.points || a.points.length < 2) { ctx.restore(); return; }
            ctx.beginPath();
            ctx.moveTo(a.points[0].x * w, a.points[0].y * h);
            for (let i = 1; i < a.points.length; i++) {
                ctx.lineTo(a.points[i].x * w, a.points[i].y * h);
            }
            ctx.stroke();
        } else if (a.type === 'line') {
            ctx.beginPath();
            ctx.moveTo(a.x1 * w, a.y1 * h);
            ctx.lineTo(a.x2 * w, a.y2 * h);
            ctx.stroke();
        } else if (a.type === 'arrow') {
            drawArrow(ctx, a.x1 * w, a.y1 * h, a.x2 * w, a.y2 * h, lw);
        } else if (a.type === 'highlight') {
            ctx.globalAlpha = 0.3;
            ctx.fillRect(a.x * w, a.y * h, a.w * w, a.h * h);
            ctx.globalAlpha = 1;
        } else if (a.type === 'rect') {
            ctx.strokeRect(a.x * w, a.y * h, a.w * w, a.h * h);
        } else if (a.type === 'text') {
            const fontSize = (a.fontSize || 0.018) * w;
            ctx.font = fontSize + 'px "Inter", "PingFang SC", "Microsoft YaHei", sans-serif';
            ctx.textBaseline = 'top';
            ctx.lineWidth = Math.max(2, lw * 1.5);
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.fillStyle = a.color;
            const lines = String(a.text || '').split('\n');
            const lineHeight = fontSize * 1.3;
            lines.forEach((ln, k) => {
                const yy = a.y * h + k * lineHeight;
                ctx.strokeText(ln, a.x * w, yy);
                ctx.fillText(ln, a.x * w, yy);
            });
        } else if (a.type === 'image') {
            const img = imageCache.get(a.dataUrl);
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, a.x * w, a.y * h, a.w * w, a.h * h);
            } else if (!img) {
                const newImg = new Image();
                newImg.onload = () => { redraw(); };
                newImg.src = a.dataUrl;
                imageCache.set(a.dataUrl, newImg);
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = '#94a3b8';
                ctx.strokeRect(a.x * w, a.y * h, a.w * w, a.h * h);
                ctx.setLineDash([]);
            }
        }
        ctx.restore();
    }

    function drawArrow(ctx, x1, y1, x2, y2, lineWidth) {
        const headLen = Math.max(10, (lineWidth || 2) * 4);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
    }

    function saveAnnotations() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
        } catch (e) {}
        notifyListChanged();
    }

    function loadAnnotations() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) annotations = JSON.parse(raw) || {};
        } catch (e) { annotations = {}; }
    }

    // ============================================================
    // 导出修改后的 PDF
    // ============================================================
    if (exportPdfBtn) {
        exportPdfBtn.addEventListener('click', async () => {
            if (!window.PDFLib) {
                alert('PDF 生成库未加载，无法导出');
                return;
            }
            const originalBytes = window.__pdfAnnotatorOriginalBytes;
            if (!originalBytes || originalBytes.length === 0) {
                alert('未找到原始 PDF 数据，请重新加载 PDF 后再试');
                return;
            }

            const hasAny = Object.keys(annotations).some(k => (annotations[k] || []).some(a => !a.hidden));
            if (!hasAny) {
                if (!confirm('当前没有任何可见标注，是否仍导出原 PDF？')) return;
            }

            exportPdfBtn.disabled = true;
            const originalHTML = exportPdfBtn.innerHTML;
            exportPdfBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

            try {
                const { PDFDocument, rgb, StandardFonts, LineCapStyle } = PDFLib;
                const pdfDocLib = await PDFDocument.load(originalBytes);
                const pages = pdfDocLib.getPages();
                const helv = await pdfDocLib.embedFont(StandardFonts.Helvetica);

                for (let i = 0; i < pages.length; i++) {
                    const pageNum = i + 1;
                    const list = annotations[pageNum] || [];
                    if (list.length === 0) continue;

                    const page = pages[i];
                    const { width: pw, height: ph } = page.getSize();

                    for (const a of list) {
                        if (a.hidden) continue;
                        const color = hexToRgb01(a.color);
                        const lw = Math.max(1, (a.lineWidth || 0.002) * Math.max(pw, ph));

                        if (a.type === 'pen') {
                            if (!a.points || a.points.length < 2) continue;
                            for (let k = 1; k < a.points.length; k++) {
                                const p1 = a.points[k - 1];
                                const p2 = a.points[k];
                                page.drawLine({
                                    start: { x: p1.x * pw, y: ph - p1.y * ph },
                                    end: { x: p2.x * pw, y: ph - p2.y * ph },
                                    thickness: lw,
                                    color: rgb(color.r, color.g, color.b),
                                    lineCap: LineCapStyle.Round
                                });
                            }
                        } else if (a.type === 'line') {
                            page.drawLine({
                                start: { x: a.x1 * pw, y: ph - a.y1 * ph },
                                end: { x: a.x2 * pw, y: ph - a.y2 * ph },
                                thickness: lw,
                                color: rgb(color.r, color.g, color.b)
                            });
                        } else if (a.type === 'arrow') {
                            page.drawLine({
                                start: { x: a.x1 * pw, y: ph - a.y1 * ph },
                                end: { x: a.x2 * pw, y: ph - a.y2 * ph },
                                thickness: lw,
                                color: rgb(color.r, color.g, color.b)
                            });
                            const headLen = Math.max(8, lw * 4);
                            const angle = Math.atan2((a.y2 - a.y1), (a.x2 - a.x1));
                            const x2 = a.x2 * pw;
                            const y2 = ph - a.y2 * ph;
                            const ax1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
                            const ay1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
                            const ax2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
                            const ay2 = y2 - headLen * Math.sin(angle + Math.PI / 6);
                            page.drawLine({ start: { x: x2, y: y2 }, end: { x: ax1, y: ay1 }, thickness: lw, color: rgb(color.r, color.g, color.b) });
                            page.drawLine({ start: { x: x2, y: y2 }, end: { x: ax2, y: ay2 }, thickness: lw, color: rgb(color.r, color.g, color.b) });
                        } else if (a.type === 'highlight') {
                            const x = Math.min(a.x, a.x + a.w) * pw;
                            const y = Math.min(a.y, a.y + a.h) * ph;
                            const w = Math.abs(a.w) * pw;
                            const h = Math.abs(a.h) * ph;
                            try {
                                page.drawRectangle({
                                    x, y: ph - y - h, width: w, height: h,
                                    color: rgb(color.r, color.g, color.b),
                                    opacity: 0.35,
                                    borderWidth: 0
                                });
                            } catch (err) {
                                page.drawRectangle({
                                    x, y: ph - y - h, width: w, height: h,
                                    color: rgb(color.r, color.g, color.b),
                                    borderWidth: 0
                                });
                            }
                        } else if (a.type === 'rect') {
                            const x = Math.min(a.x, a.x + a.w) * pw;
                            const y = Math.min(a.y, a.y + a.h) * ph;
                            const w = Math.abs(a.w) * pw;
                            const h = Math.abs(a.h) * ph;
                            page.drawRectangle({
                                x, y: ph - y - h, width: w, height: h,
                                borderColor: rgb(color.r, color.g, color.b),
                                borderWidth: lw
                            });
                        } else if (a.type === 'text') {
                            const fontSize = (a.fontSize || 0.018) * pw;
                            const lines = String(a.text || '').split('\n');
                            const lineH = fontSize * 1.3;
                            lines.forEach((ln, k) => {
                                page.drawText(ln, {
                                    x: a.x * pw,
                                    y: ph - a.y * ph - fontSize - k * lineH,
                                    size: fontSize,
                                    font: helv,
                                    color: rgb(color.r, color.g, color.b)
                                });
                            });
                        } else if (a.type === 'image') {
                            try {
                                const bytes = dataUrlToBytes(a.dataUrl);
                                if (!bytes) continue;
                                let img;
                                if (a.dataUrl.startsWith('data:image/png')) {
                                    img = await pdfDocLib.embedPng(bytes);
                                } else if (a.dataUrl.startsWith('data:image/jpeg') || a.dataUrl.startsWith('data:image/jpg')) {
                                    img = await pdfDocLib.embedJpg(bytes);
                                } else {
                                    const pngBytes = await convertToPngBytes(a.dataUrl);
                                    if (!pngBytes) continue;
                                    img = await pdfDocLib.embedPng(pngBytes);
                                }
                                const x = a.x * pw;
                                const y = ph - a.y * ph - a.h * ph;
                                const w = a.w * pw;
                                const h = a.h * ph;
                                page.drawImage(img, { x, y, width: w, height: h });
                            } catch (err) {
                                console.warn('贴图导出失败：', err);
                            }
                        }
                    }
                }

                const outBytes = await pdfDocLib.save();
                const blob = new Blob([outBytes], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const ts = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                a.href = url;
                a.download = `annotated-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.pdf`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                exportPdfBtn.innerHTML = '<i class="fas fa-check"></i>';
                setTimeout(() => { exportPdfBtn.innerHTML = originalHTML; }, 1200);
            } catch (err) {
                console.error('导出 PDF 失败：', err);
                alert('导出 PDF 失败：' + (err && err.message ? err.message : '未知错误'));
                exportPdfBtn.innerHTML = originalHTML;
            } finally {
                exportPdfBtn.disabled = false;
            }
        });
    }

    function dataUrlToBytes(dataUrl) {
        try {
            const base64 = dataUrl.split(',')[1];
            if (!base64) return null;
            const bin = atob(base64);
            const len = bin.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
            return bytes;
        } catch (e) {
            return null;
        }
    }

    function convertToPngBytes(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const c = document.createElement('canvas');
                c.width = img.naturalWidth;
                c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                const pngUrl = c.toDataURL('image/png');
                resolve(dataUrlToBytes(pngUrl));
            };
            img.onerror = () => resolve(null);
            img.src = dataUrl;
        });
    }

    function hexToRgb01(hex) {
        const h = (hex || '#000000').replace('#', '');
        const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
        const num = parseInt(n, 16);
        return {
            r: ((num >> 16) & 255) / 255,
            g: ((num >> 8) & 255) / 255,
            b: (num & 255) / 255
        };
    }

    // ============================================================
    // 对外暴露：标注列表操作
    // ============================================================
    function describeAnnotation(a) {
        switch (a.type) {
            case 'pen':    return `自由画笔（${(a.points || []).length} 点）`;
            case 'line':   return '直线';
            case 'arrow':  return '箭头';
            case 'highlight': return '高亮';
            case 'rect':   return '矩形框';
            case 'text': {
                const t = String(a.text || '').replace(/\n/g, '⏎');
                return `文字：「${t.slice(0, 16)}${t.length > 16 ? '…' : ''}」`;
            }
            case 'image':  return `贴图：${a.name || '图片'}`;
            default:       return a.type;
        }
    }

    window.__annotatorList = {
        getCurrentPageItems: () => {
            const arr = annotations[currentPageNum] || [];
            return arr.map((a, i) => ({
                index: i,
                type: a.type,
                hidden: !!a.hidden,
                label: describeAnnotation(a)
            }));
        },
        getCurrentPageNum: () => currentPageNum,
        removeAt: (idx) => {
            const arr = annotations[currentPageNum];
            if (!arr || !arr[idx]) return false;
            arr.splice(idx, 1);
            if (selectedIndex >= arr.length) selectedIndex = -1;
            redraw();
            saveAnnotations();
            updateFontSizeUI();
            return true;
        },
        toggleHidden: (idx) => {
            const arr = annotations[currentPageNum];
            if (!arr || !arr[idx]) return false;
            arr[idx].hidden = !arr[idx].hidden;
            redraw();
            saveAnnotations();
            return true;
        },
        setAllHidden: (hidden) => {
            const arr = annotations[currentPageNum];
            if (!arr) return;
            arr.forEach(a => { a.hidden = !!hidden; });
            redraw();
            saveAnnotations();
        },
        isAllHidden: () => {
            const arr = annotations[currentPageNum] || [];
            if (arr.length === 0) return false;
            return arr.every(a => a.hidden);
        },
        clearCurrentPage: () => {
            if (!annotations[currentPageNum] || annotations[currentPageNum].length === 0) return;
            if (!confirm(`确定清空第 ${currentPageNum} 页的所有标注吗？`)) return;
            annotations[currentPageNum] = [];
            selectedIndex = -1;
            redraw();
            saveAnnotations();
            updateFontSizeUI();
        },
        selectAt: (idx) => {
            const arr = annotations[currentPageNum];
            if (!arr || !arr[idx]) return;
            if (activeTool !== 'select') {
                setActiveTool('select');
            }
            selectedIndex = idx;
            redraw();
            updateFontSizeUI();
            notifyListChanged();
            if (annotHint) {
                annotHint.classList.add('active');
                annotHint.classList.remove('ready');
                annotHint.innerHTML = '<i class="fas fa-hand-pointer"></i> 已选中标注，双击文字可编辑，拖拽可移动/缩放，按 Delete 删除';
            }
        },
        refresh: () => {
            redraw();
            notifyListChanged();
        }
    };

    window.addEventListener('pdf-tools-enabled', (e) => {
        toolsEnabled = !!(e.detail && e.detail.enabled);
        if (!toolsEnabled) {
            activeTool = null;
            selectedIndex = -1;
            placeMode = false;
            pendingImage = null;
            annotToolBtns.forEach(btn => btn.classList.remove('active'));
            if (textInputEl) cancelTextInput();
        }
        refreshLayerActiveState();
        updateHint();
        updateFontSizeUI();
        notifyListChanged();
    });

    window.addEventListener('load', () => {
        setTimeout(() => {
            if (syncCanvasSize()) redraw();
            notifyListChanged();
        }, 800);
    });

    let lastCanvasKey = '';
    setInterval(() => {
        const pageInfoEl = document.getElementById('pageInfo');
        if (pageInfoEl) {
            const m = (pageInfoEl.textContent || '').match(/^\s*(\d+)/);
            if (m) {
                const n = parseInt(m[1], 10);
                if (n && n !== currentPageNum) {
                    if (textInputEl) commitTextInput();
                    currentPageNum = n;
                    selectedIndex = -1;
                    if (syncCanvasSize()) redraw();
                    updateFontSizeUI();
                    notifyListChanged();
                }
            }
        }
        const key = pdfCanvas ? (pdfCanvas.width + 'x' + pdfCanvas.height) : '';
        if (key && key !== lastCanvasKey) {
            lastCanvasKey = key;
            if (syncCanvasSize()) redraw();
            updateFontSizeUI();
            notifyListChanged();
        }
    }, 300);

    loadAnnotations();
    refreshLayerActiveState();
    updateHint();
    updateFontSizeUI();

    setTimeout(() => {
        notifyListChanged();
    }, 0);

})();