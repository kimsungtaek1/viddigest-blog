(function() {
    var readerStorageKey = 'viddigest-reader-font-size';
    var readerSizes = [
        { key: 'small', label: '소' },
        { key: 'medium', label: '중' },
        { key: 'large', label: '대' }
    ];
    var validReaderSizes = { small: true, medium: true, large: true };

    function safeNumber(value) {
        var parsed = parseInt(String(value || '0'), 10);
        return isNaN(parsed) ? 0 : parsed;
    }

    function readReaderSize() {
        try {
            var saved = localStorage.getItem(readerStorageKey);
            return validReaderSizes[saved] ? saved : 'medium';
        } catch (error) {
            return 'medium';
        }
    }

    function writeReaderSize(size) {
        try {
            localStorage.setItem(readerStorageKey, size);
        } catch (error) {}
    }

    function setReaderSize(size, shouldStore) {
        if (!validReaderSizes[size]) size = 'medium';
        document.documentElement.setAttribute('data-reader-font-size', size);
        document.querySelectorAll('.reader-font-button').forEach(function(button) {
            button.setAttribute('aria-pressed', button.getAttribute('data-font-size') === size ? 'true' : 'false');
        });
        if (shouldStore) writeReaderSize(size);
    }

    function ensureReaderTypographyOverrides() {
        if (document.getElementById('reader-font-override')) return;

        var style = document.createElement('style');
        style.id = 'reader-font-override';
        style.textContent = [
            'body[data-post-slug] .container>h2{font-size:var(--reader-h2-font-size)!important}',
            'body[data-post-slug] .container>h3{font-size:var(--reader-h3-font-size)!important}',
            'body[data-post-slug] .container>h4{font-size:var(--reader-h4-font-size)!important}',
            'body[data-post-slug] .container>p,body[data-post-slug] .container>ul li,body[data-post-slug] .container>ol li{font-size:var(--reader-body-font-size)!important}',
            'body[data-post-slug] .container>blockquote,body[data-post-slug] .container>blockquote p{font-size:var(--reader-quote-font-size)!important}',
            'body[data-post-slug] .container>pre,body[data-post-slug] .container>pre code{font-size:var(--reader-code-block-font-size)!important}',
            'body[data-post-slug] .container>p code,body[data-post-slug] .container>ul code,body[data-post-slug] .container>ol code{font-size:var(--reader-code-font-size)!important}'
        ].join('');
        document.head.appendChild(style);
    }

    function initReaderControls(body) {
        var container = document.querySelector('.container');
        var isPostPage = body && body.getAttribute('data-post-slug');
        if (!isPostPage || !container || document.querySelector('.reader-font-control')) return;

        ensureReaderTypographyOverrides();
        document.body.classList.add('reader-page');

        var control = document.createElement('div');
        control.className = 'reader-font-control';
        control.setAttribute('aria-label', '본문 글자 크기');

        var inner = document.createElement('div');
        inner.className = 'reader-font-control-inner';
        inner.setAttribute('role', 'group');
        inner.setAttribute('aria-label', '본문 글자 크기');

        readerSizes.forEach(function(size) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'reader-font-button';
            button.setAttribute('data-font-size', size.key);
            button.setAttribute('title', '본문 글자 크기 ' + size.label);
            button.textContent = size.label;
            button.addEventListener('click', function() {
                setReaderSize(size.key, true);
            });
            inner.appendChild(button);
        });

        control.appendChild(inner);
        container.insertBefore(control, container.firstElementChild);
        setReaderSize(readReaderSize(), false);
    }

    setReaderSize(readReaderSize(), false);

    function getStoredNumber(key) {
        try {
            return safeNumber(localStorage.getItem(key));
        } catch (error) {
            return 0;
        }
    }

    function setStoredNumber(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch (error) {}
    }

    // Lightbox
    document.querySelectorAll('.screenshot-container img').forEach(function(img) {
        img.addEventListener('click', function() {
            var lb = document.getElementById('lightbox');
            var lightboxImage = document.getElementById('lightbox-img');
            if (lb && lightboxImage) {
                lightboxImage.src = this.src;
                lb.classList.add('active');
            }
        });
    });
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            var lb = document.getElementById('lightbox');
            if (lb) lb.classList.remove('active');
        }
    });

    // Post view counter
    var body = document.body;
    var currentSlug = body ? body.getAttribute('data-post-slug') : null;
    initReaderControls(body);
    if (currentSlug) {
        var viewKey = 'vd:views:' + currentSlug;
        setStoredNumber(viewKey, getStoredNumber(viewKey) + 1);
    }

    // Share buttons
    var shareUrl = (body && body.getAttribute('data-post-url')) || window.location.href;
    var shareTitle = (body && body.getAttribute('data-post-title')) || document.title;
    var shareCopyButton = document.getElementById('share-copy-link');
    if (shareCopyButton) {
        shareCopyButton.addEventListener('click', function() {
            if (!navigator.clipboard || !navigator.clipboard.writeText) return;
            navigator.clipboard.writeText(shareUrl).then(function() {
                shareCopyButton.textContent = '복사됨';
                setTimeout(function() { shareCopyButton.textContent = '링크 복사'; }, 1200);
            });
        });
    }
    var nativeShareButton = document.getElementById('share-native');
    if (nativeShareButton) {
        if (!navigator.share) {
            nativeShareButton.style.display = 'none';
        } else {
            nativeShareButton.addEventListener('click', function() {
                navigator.share({ title: shareTitle, url: shareUrl }).catch(function() {});
            });
        }
    }

    // Back button
    var backButton = document.getElementById('back-button');
    if (backButton) {
        backButton.addEventListener('click', function() {
            var hasSameOriginReferrer = document.referrer && document.referrer.indexOf(window.location.origin) === 0;
            if (hasSameOriginReferrer && window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = '../../';
            }
        });
    }

    function cardText(anchor, selector) {
        var el = anchor && anchor.querySelector ? anchor.querySelector(selector) : null;
        return el ? (el.textContent || '').trim() : '';
    }

    function cardMeta(anchor) {
        var spans = Array.prototype.slice.call(anchor.querySelectorAll('.post-meta span')).map(function(span) {
            return (span.textContent || '').trim();
        }).filter(Boolean);
        var category = cardText(anchor, '.post-category-badge') || anchor.getAttribute('data-category') || '기타';
        var reading = spans.find(function(text) { return /분 읽기/.test(text); }) || '';
        var date = anchor.getAttribute('data-date') || spans.slice().reverse().find(Boolean) || '';
        return {
            category: category,
            reading: reading,
            date: date
        };
    }

    function markdownSourceHref(href) {
        if (!href) return '#';
        var normalized = href.replace(/\/+$/, '');
        var match = normalized.match(/\/md\/([^/]+)$/);
        if (!match) return href;
        return normalized.replace(/\/md\/([^/]+)$/, '/md/posts/$1.md');
    }

    function createResourceCard(anchor) {
        var meta = cardMeta(anchor);
        var title = anchor.getAttribute('data-title') || cardText(anchor, '.post-title');
        var excerpt = anchor.getAttribute('data-excerpt') || cardText(anchor, '.post-excerpt');
        var href = anchor.getAttribute('href') || anchor.href || '#';

        var article = document.createElement('article');
        article.className = 'resource-card';

        var body = document.createElement('div');
        body.className = 'resource-body';

        var eyebrow = document.createElement('div');
        eyebrow.className = 'resource-eyebrow';
        eyebrow.textContent = 'MD';

        var heading = document.createElement('h3');
        heading.className = 'resource-title';

        var titleLink = document.createElement('a');
        titleLink.href = href;
        titleLink.textContent = title;
        heading.appendChild(titleLink);

        var excerptEl = document.createElement('p');
        excerptEl.className = 'resource-excerpt';
        excerptEl.textContent = excerpt || 'Claude와 Codex를 이용해 앱에서 대화형으로 다듬은 실행 문서입니다.';

        var metaEl = document.createElement('div');
        metaEl.className = 'resource-meta';
        [meta.category, meta.reading, meta.date].filter(Boolean).forEach(function(item) {
            var span = document.createElement('span');
            span.textContent = item;
            metaEl.appendChild(span);
        });

        body.appendChild(eyebrow);
        body.appendChild(heading);
        body.appendChild(excerptEl);
        body.appendChild(metaEl);

        var actions = document.createElement('div');
        actions.className = 'resource-actions';

        var openLink = document.createElement('a');
        openLink.className = 'resource-link';
        openLink.href = href;
        openLink.textContent = '문서 보기';

        var sourceLink = document.createElement('a');
        sourceLink.className = 'resource-link resource-link-secondary';
        sourceLink.href = markdownSourceHref(href);
        sourceLink.textContent = '.md 파일';

        actions.appendChild(openLink);
        actions.appendChild(sourceLink);

        article.appendChild(body);
        article.appendChild(actions);
        return article;
    }

    function syncHomeCounts() {
        var blogCountEl = document.getElementById('home-blog-count');
        var mdCountEl = document.getElementById('home-md-count');
        var blogCount = document.querySelectorAll('#post-list .post-card').length;
        var mdCount = document.querySelectorAll('#home-md-list .resource-card, #md-resource-list .resource-card').length;
        if (blogCountEl) blogCountEl.textContent = String(blogCount);
        if (mdCountEl) mdCountEl.textContent = String(mdCount);
    }

    function organizeLegacyHomeSections() {
        var homeMdList = document.getElementById('home-md-list');
        var postList = document.getElementById('post-list');
        if (!homeMdList || !postList) return;
        if (homeMdList.querySelector('.resource-card')) {
            syncHomeCounts();
            return;
        }

        var legacyMdCards = Array.prototype.slice.call(postList.querySelectorAll('.post-card')).filter(function(card) {
            var href = card.getAttribute('href') || card.href || '';
            return /\/md\//.test(href);
        });

        if (legacyMdCards.length === 0) {
            syncHomeCounts();
            return;
        }

        homeMdList.innerHTML = '';
        legacyMdCards.slice(0, 4).forEach(function(card) {
            homeMdList.appendChild(createResourceCard(card));
        });

        legacyMdCards.forEach(function(card) {
            if (card.parentNode) card.parentNode.removeChild(card);
        });

        syncHomeCounts();
    }

    function organizeLegacyMdList() {
        var resourceList = document.getElementById('md-resource-list');
        if (!resourceList || resourceList.querySelector('.resource-card')) return;

        var legacyCards = Array.prototype.slice.call(resourceList.querySelectorAll('.post-card'));
        if (legacyCards.length === 0) return;

        var fragment = document.createDocumentFragment();
        legacyCards.forEach(function(card) {
            fragment.appendChild(createResourceCard(card));
        });
        resourceList.innerHTML = '';
        resourceList.appendChild(fragment);
        syncHomeCounts();
    }

    organizeLegacyHomeSections();
    organizeLegacyMdList();

    // Index page setup
    (function setupIndexPage() {
        var cards = Array.prototype.slice.call(document.querySelectorAll('#post-list .post-card'));
        if (cards.length === 0) return;

        var categoryTabs = Array.prototype.slice.call(document.querySelectorAll('.cat-tab'));
        var tagChips = Array.prototype.slice.call(document.querySelectorAll('.tag-chip'));
        var archiveLinks = Array.prototype.slice.call(document.querySelectorAll('.archive-link'));
        var prevBtn = document.getElementById('page-prev');
        var nextBtn = document.getElementById('page-next');
        var pageNumbers = document.getElementById('page-numbers');
        var pageSummary = document.getElementById('page-summary');
        var pagination = document.getElementById('pagination');
        var filterEmpty = document.getElementById('filter-empty');
        var searchInput = document.getElementById('post-search');
        var searchClear = document.getElementById('search-clear');
        var popularPosts = document.getElementById('popular-posts');

        var state = {
            category: '전체',
            tag: '전체',
            query: '',
            month: '',
            page: 1,
            pageSize: 7
        };

        function parseTagList(raw) {
            if (!raw) return [];
            return raw.split('|').map(function(tag) { return tag.trim(); }).filter(Boolean);
        }

        function matchesFilter(card) {
            var category = card.getAttribute('data-category') || '';
            var tags = parseTagList(card.getAttribute('data-tags') || '');
            var date = card.getAttribute('data-date') || '';
            var fullText = [
                card.getAttribute('data-title') || '',
                card.getAttribute('data-channel') || '',
                card.getAttribute('data-excerpt') || '',
                tags.join(' ')
            ].join(' ').toLowerCase();

            if (state.category !== '전체' && category !== state.category) return false;
            if (state.tag !== '전체' && tags.indexOf(state.tag) === -1) return false;
            if (state.month && date.slice(0, 7) !== state.month) return false;
            if (state.query && fullText.indexOf(state.query) === -1) return false;
            return true;
        }

        function getFilteredCards() {
            return cards.filter(matchesFilter);
        }

        function renderPageNumbers(totalPages) {
            if (!pageNumbers) return;
            pageNumbers.innerHTML = '';
            for (var page = 1; page <= totalPages; page++) {
                var pageBtn = document.createElement('button');
                pageBtn.type = 'button';
                pageBtn.className = 'page-number' + (page === state.page ? ' active' : '');
                pageBtn.textContent = String(page);
                pageBtn.addEventListener('click', (function(targetPage) {
                    return function() {
                        state.page = targetPage;
                        render();
                    };
                })(page));
                pageNumbers.appendChild(pageBtn);
            }
        }

        function refreshPopularPosts() {
            if (!popularPosts) return;
            var items = cards.map(function(card) {
                var slug = card.getAttribute('data-slug') || '';
                var baseViews = safeNumber(card.getAttribute('data-views') || '0');
                var localViews = slug ? getStoredNumber('vd:views:' + slug) : 0;
                return {
                    slug: slug,
                    title: card.getAttribute('data-title') || '',
                    date: card.getAttribute('data-date') || '',
                    href: card.getAttribute('href') || '#',
                    views: Math.max(baseViews, localViews)
                };
            });

            items.sort(function(a, b) {
                if (b.views !== a.views) return b.views - a.views;
                return (b.date || '').localeCompare(a.date || '');
            });

            popularPosts.innerHTML = '';
            items.slice(0, 5).forEach(function(item) {
                var link = document.createElement('a');
                link.className = 'mini-post';
                link.href = item.href;

                var title = document.createElement('div');
                title.className = 'mini-post-title';
                title.textContent = item.title;

                var meta = document.createElement('div');
                meta.className = 'mini-post-meta';
                meta.textContent = '조회 ' + item.views + ' · ' + item.date;

                link.appendChild(title);
                link.appendChild(meta);
                popularPosts.appendChild(link);
            });
        }

        function render() {
            var filteredCards = getFilteredCards();
            var totalPages = Math.max(1, Math.ceil(filteredCards.length / state.pageSize));
            if (state.page > totalPages) state.page = totalPages;

            cards.forEach(function(card) { card.style.display = 'none'; });

            var start = (state.page - 1) * state.pageSize;
            var end = start + state.pageSize;
            filteredCards.slice(start, end).forEach(function(card) {
                card.style.display = '';
            });

            if (prevBtn) prevBtn.disabled = state.page <= 1;
            if (nextBtn) nextBtn.disabled = state.page >= totalPages;
            if (pagination) pagination.style.display = filteredCards.length > 0 ? 'flex' : 'none';
            if (filterEmpty) filterEmpty.style.display = filteredCards.length > 0 ? 'none' : 'block';

            renderPageNumbers(totalPages);

            if (pageSummary) {
                var summary = '총 ' + filteredCards.length + '개 글 · ' + state.page + ' / ' + totalPages + ' 페이지';
                if (state.month) summary += ' · ' + state.month;
                pageSummary.textContent = summary;
            }
        }

        categoryTabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                categoryTabs.forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');
                state.category = this.getAttribute('data-category') || '전체';
                state.page = 1;
                render();
            });
        });

        tagChips.forEach(function(chip) {
            chip.addEventListener('click', function() {
                tagChips.forEach(function(c) { c.classList.remove('active'); });
                this.classList.add('active');
                state.tag = this.getAttribute('data-tag') || '전체';
                state.page = 1;
                render();
            });
        });

        archiveLinks.forEach(function(link) {
            link.addEventListener('click', function(event) {
                event.preventDefault();
                var month = this.getAttribute('data-month') || '';
                if (state.month === month) {
                    state.month = '';
                    this.classList.remove('active');
                } else {
                    state.month = month;
                    archiveLinks.forEach(function(item) { item.classList.remove('active'); });
                    this.classList.add('active');
                }
                state.page = 1;
                render();
            });
        });

        if (searchInput) {
            searchInput.addEventListener('input', function() {
                state.query = (this.value || '').trim().toLowerCase();
                state.page = 1;
                render();
            });
        }

        if (searchClear) {
            searchClear.addEventListener('click', function() {
                state.category = '전체';
                state.tag = '전체';
                state.query = '';
                state.month = '';
                state.page = 1;

                if (searchInput) searchInput.value = '';
                categoryTabs.forEach(function(t) {
                    var isDefault = (t.getAttribute('data-category') || '') === '전체';
                    t.classList.toggle('active', isDefault);
                });
                tagChips.forEach(function(c) {
                    var isDefault = (c.getAttribute('data-tag') || '') === '전체';
                    c.classList.toggle('active', isDefault);
                });
                archiveLinks.forEach(function(link) { link.classList.remove('active'); });
                render();
            });
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', function() {
                if (state.page > 1) {
                    state.page -= 1;
                    render();
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', function() {
                var filteredCards = getFilteredCards();
                var totalPages = Math.max(1, Math.ceil(filteredCards.length / state.pageSize));
                if (state.page < totalPages) {
                    state.page += 1;
                    render();
                }
            });
        }

        render();
        refreshPopularPosts();
        window.addEventListener('storage', refreshPopularPosts);
    })();
})();
