/**
 * PDF 模块：加载 / 渲染 / 翻页 / 缩放 / 链接层 / 链接悬浮预览
 */
(function () {
    'use strict';

    const App = window.App;

    // ===== DOM 引用 =====
    const pdfUpload = App.$('pdfUpload');
    const pdfCanvas = App.$('pdfCanvas');
    const pdfPageContainer = App.$('pdfPageContainer');
    const textLayerDiv = App.$('textLayer');
    const linkLayerDiv = App.$('linkLayer');
    const pdfPlaceholder = App.$('pdfPlaceholder');
    const pdfPreviewWrapper = App.$('pdfPreviewWrapper');
    const prevPageBtn = App.$('prevPageBtn');
    const nextPageBtn = App.$('nextPageBtn');
    const pageInfo = App.$('pageInfo');
    const zoomInBtn = App.$('zoomInBtn');
    const zoomOutBtn = App.$('zoomOutBtn');
    const pageJumpInput = App.$('pageJumpInput');
    const pageJumpBtn = App.$('pageJumpBtn');
    const snipToggleBtn = App.$('snipToggleBtn');

    // ★ 链接悬浮预览
    const linkHoverPreview = App.$('linkHoverPreview');
    const linkHoverHeader = App.$('linkHoverHeader');
    const linkHoverCanvas = App.$('linkHoverCanvas');

    const st = App.state;

    // ============================================================
    // PDF 渲染
    // ============================================================
    function renderPdfPage(pageNumber) {
        if (!st.pdfDoc || st.isRendering) return;
        if (pageNumber < 1 || pageNumber > st.totalPages) return;

        st.isRendering = true;
        st.currentPage = pageNumber;
        syncPageJumpInput();

        if (st.renderTask) {
            try { st.renderTask.cancel(); } catch (e) {}
            st.renderTask = null;
        }

        st.pdfDoc.getPage(pageNumber).then((page) => {
            const viewport = page.getViewport({ scale: st.currentScale });
            const pixelRatio = window.devicePixelRatio || 1;
            const ctx = pdfCanvas.getContext('2d');

            pdfCanvas.width = Math.floor(viewport.width * pixelRatio);
            pdfCanvas.height = Math.floor(viewport.height * pixelRatio);
            pdfCanvas.style.width = Math.floor(viewport.width) + 'px';
            pdfCanvas.style.height = Math.floor(viewport.height) + 'px';

            const renderViewport = page.getViewport({ scale: st.currentScale * pixelRatio });
            const renderContext = { canvasContext: ctx, viewport: renderViewport };

            ctx.clearRect(0, 0, pdfCanvas.width, pdfCanvas.height);

            st.renderTask = page.render(renderContext);
            st.renderTask.promise
                .then(() => renderTextLayer(page, viewport))
                .then(() => renderLinkLayer(page, viewport))
                .then(() => {
                    pdfPlaceholder.style.display = 'none';
                    pdfPageContainer.style.display = 'inline-block';
                    pdfCanvas.style.display = 'block';
                    pageInfo.textContent = `${st.currentPage} / ${st.totalPages}`;
                    prevPageBtn.disabled = st.currentPage <= 1;
                    nextPageBtn.disabled = st.currentPage >= st.totalPages;
                    st.isRendering = false;
                })
                .catch(err => {
                    if (err && err.name === 'RenderingCancelledException') {
                        st.isRendering = false;
                        return;
                    }
                    console.error('渲染 PDF 出错:', err);
                    st.isRendering = false;
                });
        }).catch(err => {
            console.error('获取页面出错:', err);
            st.isRendering = false;
        });
    }

    function renderTextLayer(page, viewport) {
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = Math.floor(viewport.width) + 'px';
        textLayerDiv.style.height = Math.floor(viewport.height) + 'px';

        return page.getTextContent().then((textContent) => {
            const baseViewport = page.getViewport({ scale: st.currentScale });
            const tx = pdfjsLib.Util.transform(baseViewport.transform, [1, 0, 0, 1, 0, 0]);
            textContent.items.forEach((item) => {
                if (!item.str || item.str.trim() === '') return;
                const itemTransform = pdfjsLib.Util.transform(tx, item.transform);
                const fontHeight = Math.hypot(itemTransform[2], itemTransform[3]);
                const angle = Math.atan2(itemTransform[1], itemTransform[0]);
                const span = document.createElement('span');
                span.textContent = item.str;
                span.style.left = itemTransform[4] + 'px';
                span.style.top = (itemTransform[5] - fontHeight) + 'px';
                span.style.fontSize = fontHeight + 'px';
                span.style.fontFamily = 'sans-serif';
                span.style.transformOrigin = '0% 0%';
                if (angle !== 0) span.style.transform = `rotate(${angle}rad)`;
                if (item.width) span.style.width = (item.width * st.currentScale) + 'px';
                textLayerDiv.appendChild(span);
            });
            return Promise.resolve();
        });
    }

    function renderLinkLayer(page, viewport) {
        if (!linkLayerDiv) return Promise.resolve();
        linkLayerDiv.innerHTML = '';
        linkLayerDiv.style.width = Math.floor(viewport.width) + 'px';
        linkLayerDiv.style.height = Math.floor(viewport.height) + 'px';
        return page.getAnnotations({ intent: 'display' }).then((annotations) => {
            annotations.forEach((annot) => {
                if (annot.subtype !== 'Link') return;
                const rect = pdfjsLib.Util.normalizeRect([annot.rect[0], annot.rect[1], annot.rect[2], annot.rect[3]]);
                const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect);
                const left = Math.min(x1, x2);
                const top = Math.min(y1, y2);
                const width = Math.abs(x2 - x1);
                const height = Math.abs(y2 - y1);
                const url = annot.url || null;
                const dest = annot.dest || null;
                const unsafeUrl = annot.unsafeUrl || null;
                if (!url && !dest && !unsafeUrl) return;
                const a = document.createElement('a');
                a.style.left = left + 'px';
                a.style.top = top + 'px';
                a.style.width = width + 'px';
                a.style.height = height + 'px';
                const finalUrl = url || unsafeUrl;
                if (finalUrl) {
                    a.href = finalUrl;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.title = finalUrl;
                } else if (dest) {
                    a.href = 'javascript:void(0)';
                    a.dataset.internal = 'true';
                    a.title = '跳转到 PDF 内部位置';
                    a.addEventListener('click', (e) => {
                        e.preventDefault();
                        resolveDestAndNavigate(dest);
                    });
                    bindLinkHover(a, dest);
                }
                linkLayerDiv.appendChild(a);
            });
            return Promise.resolve();
        }).catch(() => Promise.resolve());
    }

    // ============================================================
    // 内部链接悬浮预览（固定 3 行显示）
    // ============================================================
    const linkPreviewCache = new Map();   // key -> { canvas, width, height }
    let linkHoverTimer = null;
    let currentHoverLink = null;

    // 渲染目标页里 [yTop, yBottom]（从顶部量）的一条横带
    async function renderLinkPreviewRegion(pageIndex, yTopFromTop, yBottomFromTop) {
        const height = Math.max(8, yBottomFromTop - yTopFromTop);
        const key = `${pageIndex}:${Math.round(yTopFromTop)},${Math.round(height)}`;
        if (linkPreviewCache.has(key)) {
            return linkPreviewCache.get(key);
        }
        if (!st.pdfDoc) return null;
        try {
            const page = await st.pdfDoc.getPage(pageIndex + 1);
            const pageView = page.getViewport({ scale: 1 });
            const pageH = pageView.height;
            const pageW = pageView.width;

            const padTop = 4;
            const padBottom = 4;
            const cropTopFromPageTop = Math.max(0, yTopFromTop - padTop);
            const cropBottomFromPageTop = Math.min(pageH, yBottomFromTop + padBottom);
            const cropH = cropBottomFromPageTop - cropTopFromPageTop;
            const cropW = pageW;

            const targetPxW = 560;
            const scale = targetPxW / cropW;
            const dpr = window.devicePixelRatio || 1;
            const outW = Math.floor(cropW * scale * dpr);
            const outH = Math.floor(cropH * scale * dpr);

            const fullScale = scale * dpr;
            const fullCanvas = document.createElement('canvas');
            fullCanvas.width = Math.floor(pageView.width * fullScale);
            fullCanvas.height = Math.floor(pageView.height * fullScale);
            const fullCtx = fullCanvas.getContext('2d');
            await page.render({
                canvasContext: fullCtx,
                viewport: page.getViewport({ scale: fullScale })
            }).promise;

            const out = document.createElement('canvas');
            out.width = outW;
            out.height = outH;
            const ctx = out.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, outW, outH);
            ctx.drawImage(
                fullCanvas, 0,
                cropTopFromPageTop * fullScale,
                cropW * fullScale, cropH * fullScale,
                0, 0, outW, outH
            );
            const result = { canvas: out, width: cropW, height: cropH };
            linkPreviewCache.set(key, result);
            return result;
        } catch (e) {
            console.warn('链接预览渲染失败：', e);
            return null;
        }
    }

    // 解析 dest，得到目标页 + 固定 3 行的小区域
    async function resolveDestForPreview(dest) {
        if (!st.pdfDoc) return null;
        let resolved = dest;
        if (typeof dest === 'string') {
            try { resolved = await st.pdfDoc.getDestination(dest); } catch (e) { return null; }
        }
        if (!Array.isArray(resolved) || resolved.length === 0) return null;

        let pageIndex;
        try { pageIndex = await st.pdfDoc.getPageIndex(resolved[0]); }
        catch (e) {
            if (typeof resolved[0] === 'number') pageIndex = resolved[0];
            else return null;
        }

        let page;
        try { page = await st.pdfDoc.getPage(pageIndex + 1); } catch (e) { return null; }
        const pageView = page.getViewport({ scale: 1 });
        const pageH = pageView.height;

        const kind = (resolved[1] || {}).name || '';
        let targetYFromBottom = pageH - 40;
        let centerYFromBottom;

        if (kind === 'XYZ' || kind === 'FitBH' || kind === 'FitH') {
            const top = resolved[3] !== undefined ? resolved[3] : resolved[2];
            if (typeof top === 'number' && !isNaN(top)) targetYFromBottom = top;
        } else if (kind === 'FitR') {
            const bottom = resolved[3];
            const top = resolved[5];
            if (typeof top === 'number') targetYFromBottom = top;
            if (typeof bottom === 'number' && typeof top === 'number') {
                centerYFromBottom = (top + bottom) / 2;
            }
        }

        const targetYFromTop = pageH - (centerYFromBottom !== undefined ? centerYFromBottom : targetYFromBottom);

        // ★ 固定显示 3 行
        const LINE_H = 14;                    // 每行约 14pt
        const LINES = 3;                      // 显示行数（改成 2 就显示 2 行）
        const regionH = LINE_H * LINES + 8;   // 上下各留一点余量

        // 让目标 y 处于区域偏上位置
        let yTop = targetYFromTop - 6;
        yTop = Math.max(0, Math.min(pageH - regionH, yTop));

        return {
            pageIndex,
            yTopFromTop: yTop,
            yBottomFromTop: yTop + regionH
        };
    }

    function bindLinkHover(a, dest) {
        a.addEventListener('mouseenter', () => {
            if (!linkHoverPreview) return;
            currentHoverLink = a;
            clearTimeout(linkHoverTimer);
            linkHoverTimer = setTimeout(async () => {
                const info = await resolveDestForPreview(dest);
                if (!info) return;
                const res = await renderLinkPreviewRegion(info.pageIndex, info.yTopFromTop, info.yBottomFromTop);
                if (!res || currentHoverLink !== a) return;

                const rect = a.getBoundingClientRect();
                const previewW = 460;
                const previewH = Math.min(260, (res.canvas.height / (window.devicePixelRatio || 1)) + 40);
                let left = rect.left + rect.width / 2 - previewW / 2;
                let top = rect.bottom + 8;
                if (top + previewH > window.innerHeight - 12) top = rect.top - previewH - 8;
                if (top < 8) top = 8;
                if (left < 8) left = 8;
                if (left + previewW > window.innerWidth - 8) left = window.innerWidth - previewW - 8;

                linkHoverPreview.style.left = left + 'px';
                linkHoverPreview.style.top = top + 'px';
                linkHoverPreview.style.width = previewW + 'px';
                if (linkHoverHeader) {
                    linkHoverHeader.textContent = `跳转到第 ${info.pageIndex + 1} 页`;
                }
                if (linkHoverCanvas) {
                    linkHoverCanvas.width = res.canvas.width;
                    linkHoverCanvas.height = res.canvas.height;
                    linkHoverCanvas.style.width = '100%';
                    linkHoverCanvas.style.height = 'auto';
                    const ctx = linkHoverCanvas.getContext('2d');
                    ctx.clearRect(0, 0, linkHoverCanvas.width, linkHoverCanvas.height);
                    ctx.drawImage(res.canvas, 0, 0);
                }
                linkHoverPreview.classList.add('show');
            }, 250);
        });
        a.addEventListener('mouseleave', () => {
            if (currentHoverLink === a) currentHoverLink = null;
            clearTimeout(linkHoverTimer);
            if (linkHoverPreview) linkHoverPreview.classList.remove('show');
        });
        a.addEventListener('click', () => {
            if (linkHoverPreview) linkHoverPreview.classList.remove('show');
        });
    }

    function hideLinkHoverPreview() {
        currentHoverLink = null;
        clearTimeout(linkHoverTimer);
        if (linkHoverPreview) linkHoverPreview.classList.remove('show');
    }

    function resolveDestAndNavigate(dest) {
        if (!st.pdfDoc) return;
        if (typeof dest === 'string') {
            st.pdfDoc.getDestination(dest).then((r) => { if (r) navigateToDest(r); }).catch(() => {});
            return;
        }
        if (Array.isArray(dest)) navigateToDest(dest);
    }

    function navigateToDest(dest) {
        if (!st.pdfDoc || !dest || !dest.length) return;
        const pageRef = dest[0];
        st.pdfDoc.getPageIndex(pageRef).then((i) => {
            const t = i + 1;
            if (t >= 1 && t <= st.totalPages && t !== st.currentPage) renderPdfPage(t);
        }).catch(() => {
            if (typeof pageRef === 'number') {
                const t = pageRef + 1;
                if (t >= 1 && t <= st.totalPages && t !== st.currentPage) renderPdfPage(t);
            }
        });
    }

    // ============================================================
    // 加载 / 重置
    // ============================================================
    function loadPdf(file) {
        if (!file || file.type !== 'application/pdf') {
            alert('请选择有效的 PDF 文件');
            return;
        }
        const reader = new FileReader();
        reader.onload = function (e) {
            const originalBytes = new Uint8Array(e.target.result);
            window.__pdfAnnotatorOriginalBytes = originalBytes.slice(0);

            console.log('[PDF] 原始字节长度:', window.__pdfAnnotatorOriginalBytes.length);

            if (typeof pdfjsLib === 'undefined') {
                alert('PDF.js 未加载');
                return;
            }
            if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }

            const pdfJsBytes = originalBytes.slice(0);
            pdfjsLib.getDocument({ data: pdfJsBytes }).promise.then((pdf) => {
                st.pdfDoc = pdf;
                st.totalPages = pdf.numPages;
                st.currentPage = 1;

                linkPreviewCache.clear();
                hideLinkHoverPreview();

                zoomInBtn.disabled = false;
                zoomOutBtn.disabled = false;
                prevPageBtn.disabled = true;
                nextPageBtn.disabled = st.totalPages <= 1;
                snipToggleBtn.disabled = false;

                pageJumpInput.disabled = false;
                pageJumpBtn.disabled = false;
                pageJumpInput.max = st.totalPages;
                pageJumpInput.value = 1;

                pdfPageContainer.style.display = 'none';
                pdfPlaceholder.style.display = 'flex';
                renderPdfPage(1);
            }).catch(err => {
                console.error('加载 PDF 失败:', err);
                alert('加载 PDF 失败');
                resetPdfView();
            });
        };
        reader.readAsArrayBuffer(file);
    }

    function resetPdfView() {
        st.pdfDoc = null;
        st.currentPage = 1;
        st.totalPages = 0;
        pdfPlaceholder.style.display = 'flex';
        pdfPageContainer.style.display = 'none';
        textLayerDiv.innerHTML = '';
        if (linkLayerDiv) linkLayerDiv.innerHTML = '';
        pageInfo.textContent = '0 / 0';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        zoomInBtn.disabled = true;
        zoomOutBtn.disabled = true;
        snipToggleBtn.disabled = true;
        pageJumpInput.disabled = true;
        pageJumpBtn.disabled = true;
        pageJumpInput.value = 1;
        pageJumpInput.max = 1;
        window.__pdfAnnotatorOriginalBytes = null;
        linkPreviewCache.clear();
        hideLinkHoverPreview();
        if (App.exitSnipMode) App.exitSnipMode();
    }

    function syncPageJumpInput() {
        if (pageJumpInput && st.totalPages > 0) {
            pageJumpInput.value = st.currentPage;
            pageJumpInput.max = st.totalPages;
        }
    }

    function handlePageJump() {
        if (!st.pdfDoc || st.totalPages === 0) return;
        const val = parseInt(pageJumpInput.value, 10);
        if (isNaN(val) || val < 1 || val > st.totalPages) {
            alert(`请输入 1 到 ${st.totalPages} 之间的页码`);
            syncPageJumpInput();
            return;
        }
        if (val === st.currentPage) return;
        renderPdfPage(val);
    }

    // ============================================================
    // 初始化
    // ============================================================
    App.initPdf = function () {
        pdfUpload.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) loadPdf(file);
            else resetPdfView();
        });

        // 拖拽上传
        pdfPreviewWrapper.addEventListener('dragover', (e) => {
            e.preventDefault();
            pdfPreviewWrapper.style.borderColor = '#3b82f6';
            pdfPreviewWrapper.style.background = '#eef2ff';
        });
        pdfPreviewWrapper.addEventListener('dragleave', () => {
            pdfPreviewWrapper.style.borderColor = '';
            pdfPreviewWrapper.style.background = '';
        });
        pdfPreviewWrapper.addEventListener('drop', (e) => {
            e.preventDefault();
            pdfPreviewWrapper.style.borderColor = '';
            pdfPreviewWrapper.style.background = '';
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                pdfUpload.files = e.dataTransfer.files;
                loadPdf(file);
            } else {
                alert('请拖拽 PDF 文件');
            }
        });

        // 单击预览区（未加载 PDF 时）
        pdfPreviewWrapper.addEventListener('click', (e) => {
            if (st.pdfDoc) return;
            if (e.target && e.target.closest && e.target.closest('.textLayer')) return;
            if (pdfPreviewWrapper.classList.contains('snip-mode')) return;
            if (window.App.webSnip && window.App.webSnip.active) return;
            if (document.querySelector('textarea[style*="position: fixed"]')) return;
            pdfUpload.click();
        });

        // 悬停变暗
        pdfPreviewWrapper.addEventListener('mouseenter', () => {
            if (st.pdfDoc) return;
            pdfPreviewWrapper.classList.add('hover-dim');
        });
        pdfPreviewWrapper.addEventListener('mouseleave', () => {
            pdfPreviewWrapper.classList.remove('hover-dim');
        });

        prevPageBtn.addEventListener('click', () => {
            if (st.currentPage > 1) renderPdfPage(st.currentPage - 1);
        });
        nextPageBtn.addEventListener('click', () => {
            if (st.currentPage < st.totalPages) renderPdfPage(st.currentPage + 1);
        });

        zoomInBtn.addEventListener('click', () => {
            if (st.currentScale < 3.0) {
                st.currentScale = Math.min(3.0, st.currentScale + 0.2);
                hideLinkHoverPreview();
                renderPdfPage(st.currentPage);
            }
        });
        zoomOutBtn.addEventListener('click', () => {
            if (st.currentScale > 0.5) {
                st.currentScale = Math.max(0.5, st.currentScale - 0.2);
                hideLinkHoverPreview();
                renderPdfPage(st.currentPage);
            }
        });

        if (pageJumpBtn) pageJumpBtn.addEventListener('click', handlePageJump);
        if (pageJumpInput) {
            pageJumpInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); handlePageJump(); }
            });
            pageJumpInput.addEventListener('blur', () => { if (st.pdfDoc) syncPageJumpInput(); });
        }

        window.addEventListener('keydown', (e) => {
            const tag = e.target && e.target.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'MATH-FIELD') return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (st.currentPage > 1) renderPdfPage(st.currentPage - 1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (st.currentPage < st.totalPages) renderPdfPage(st.currentPage + 1);
            } else if (e.key === 'Escape') {
                hideLinkHoverPreview();
            }
        });

        zoomInBtn.disabled = true;
        zoomOutBtn.disabled = true;
    };

    // 暴露给其它模块
    App.renderPdfPage = renderPdfPage;
    App.loadPdf = loadPdf;
    App.hideLinkHoverPreview = hideLinkHoverPreview;

})();