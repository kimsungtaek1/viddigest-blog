(function() {
    var readerStorageKey = 'viddigest-reader-font-size';
    var readerSizes = [
        { key: 'small', label: '소' },
        { key: 'medium', label: '중' },
        { key: 'large', label: '대' }
    ];
    var validReaderSizes = { small: true, medium: true, large: true };

    function ensureNewsletterNavigation() {
        var header = document.querySelector('.header');
        if (!header || header.querySelector('.nav-links a[href*="/newsletters/"]')) return;

        var navigation = header.querySelector('.nav-links');
        if (!navigation) {
            navigation = document.createElement('nav');
            navigation.className = 'nav-links';
            navigation.setAttribute('aria-label', '주요 메뉴');

            var blogLink = document.createElement('a');
            blogLink.className = 'nav-link';
            blogLink.href = '/';
            blogLink.textContent = '블로그';
            navigation.appendChild(blogLink);
            header.appendChild(navigation);
        }

        var newsletterLink = document.createElement('a');
        newsletterLink.className = 'nav-link';
        newsletterLink.href = '/newsletters/';
        newsletterLink.textContent = '뉴스레터';
        navigation.appendChild(newsletterLink);
    }

    ensureNewsletterNavigation();

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
            'body[data-post-slug] .toc-title,body[data-post-slug] .toc li,body[data-post-slug] .toc a,body[data-post-slug] .series-kicker,body[data-post-slug] .series-notice p,body[data-post-slug] .series-link span,body[data-post-slug] .series-link strong{font-size:var(--reader-body-font-size)!important}',
            'body[data-post-slug] .key-content-highlight,body[data-post-slug] .key-content-highlight p,body[data-post-slug] .key-content-highlight li{font-weight:700!important}',
            'body[data-post-slug] .key-content-highlight strong{font-weight:800!important}',
            'body[data-post-slug] .container>blockquote,body[data-post-slug] .container>blockquote p{font-size:var(--reader-quote-font-size)!important}',
            'body[data-post-slug] .container>pre,body[data-post-slug] .container>pre code{font-size:var(--reader-code-block-font-size)!important}',
            'body[data-post-slug] .container>p code,body[data-post-slug] .container>ul code,body[data-post-slug] .container>ol code{font-size:var(--reader-code-font-size)!important}'
        ].join('');
        document.head.appendChild(style);
    }

    function normalizeSeriesHref(href) {
        try {
            var parsed = new URL(href, window.location.href);
            if (parsed.origin !== window.location.origin && parsed.pathname.indexOf('/posts/') === 0) {
                return parsed.pathname + parsed.search + parsed.hash;
            }
            return parsed.href;
        } catch (error) {
            return href || '#';
        }
    }

    function createReaderPageLink(seriesLink, index, totalPages) {
        var pageLink = document.createElement('a');
        var pageText = seriesLink.querySelector('span');
        var pageMatch = pageText ? (pageText.textContent || '').match(/(\d+)\s*\/\s*(\d+)/) : null;
        var pageNumber = pageMatch ? pageMatch[1] : String(index + 1);

        pageLink.className = 'reader-page-link';
        pageLink.href = normalizeSeriesHref(seriesLink.href);
        pageLink.textContent = 'Page ' + pageNumber;
        pageLink.setAttribute('title', '시리즈 Page ' + pageNumber + ' / ' + totalPages + ' 보기');

        if (seriesLink.classList.contains('current') || seriesLink.getAttribute('aria-current') === 'page') {
            pageLink.classList.add('current');
            pageLink.setAttribute('aria-current', 'page');
        }

        return pageLink;
    }

    function createReaderPageControl() {
        var seriesLinks = Array.prototype.slice.call(document.querySelectorAll('.series-links .series-link'));
        if (seriesLinks.length < 2) return null;

        var pageControl = document.createElement('nav');
        pageControl.className = 'reader-page-control';
        pageControl.setAttribute('aria-label', '시리즈 페이지 이동');

        seriesLinks.forEach(function(seriesLink, index) {
            pageControl.appendChild(createReaderPageLink(seriesLink, index, seriesLinks.length));
        });

        return pageControl;
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
        var pageControl = createReaderPageControl();
        if (pageControl) control.appendChild(pageControl);
        container.insertBefore(control, container.firstElementChild);
        setReaderSize(readReaderSize(), false);
    }

    function normalizeHeadingText(value) {
        return String(value || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function isKeyContentHeading(heading) {
        if (!heading || heading.tagName !== 'H2') return false;

        var headingText = normalizeHeadingText(heading.textContent);
        var headingId = normalizeHeadingText(heading.id);
        var keyLabels = [
            '핵심 내용',
            '핵심 요약',
            '주요 내용',
            '주요 요약',
            '결론 및 시사점'
        ];

        return keyLabels.some(function(label) {
            return headingText.indexOf(label) !== -1 || headingId.indexOf(label) !== -1;
        });
    }

    function markKeyContentSections(body) {
        var container = document.querySelector('.container');
        if (!body || !body.getAttribute('data-post-slug') || !container) return;

        container.querySelectorAll(':scope > h2').forEach(function(heading) {
            if (!isKeyContentHeading(heading)) return;

            var sectionNode = heading.nextElementSibling;
            while (sectionNode && sectionNode.tagName !== 'H2') {
                if (!sectionNode.classList.contains('toc') && !sectionNode.classList.contains('series-notice')) {
                    sectionNode.classList.add('key-content-highlight');
                }
                sectionNode = sectionNode.nextElementSibling;
            }
        });
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
    markKeyContentSections(body);
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

    function apiJson(url, options) {
        var requestOptions = options || {};
        requestOptions.credentials = 'include';
        return fetch(url, requestOptions).then(function(response) {
            return response.json().catch(function() {
                return {};
            }).then(function(data) {
                if (!response.ok) {
                    var error = new Error(data.error || '요청을 처리하지 못했습니다.');
                    error.data = data;
                    throw error;
                }
                return data;
            });
        });
    }

    function setAdminMessage(control, text, isError) {
        var message = control.querySelector('.admin-message');
        setAdminMessageElement(message, text, isError);
    }

    function setAdminMessageElement(message, text, isError) {
        if (!message) return;
        message.textContent = text || '';
        message.classList.toggle('admin-message-error', Boolean(isError));
    }

    function createAdminButton(label, className) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = className || 'admin-button';
        button.textContent = label;
        return button;
    }

    function requestPostDeletion(slug, title, button, message) {
        if (!slug) return;
        var ok = window.confirm('이 글을 삭제할까요?\n\n' + (title || slug));
        if (!ok) return;

        var idleLabel = button.textContent || '삭제';
        button.disabled = true;
        button.textContent = '요청 중';
        setAdminMessageElement(message, '', false);

        apiJson('/api/posts/' + encodeURIComponent(slug) + '/delete', {
            method: 'POST'
        }).then(function() {
            button.textContent = '삭제 대기';
            setAdminMessageElement(message, 'GitHub Actions에서 삭제와 배포를 진행합니다.', false);
        }).catch(function(error) {
            button.disabled = false;
            button.textContent = idleLabel;
            setAdminMessageElement(message, error.message || '삭제 요청 실패', true);
        });
    }

    function postCardFrame(card) {
        if (!card || !card.parentElement) return card;
        return card.parentElement.classList.contains('admin-post-card') ? card.parentElement : card;
    }

    function setPostCardVisible(card, visible) {
        var frame = postCardFrame(card);
        if (frame && frame !== card) {
            frame.style.display = visible ? '' : 'none';
            card.style.display = '';
            return;
        }
        if (card) card.style.display = visible ? '' : 'none';
    }

    function ensurePostCardFrame(card) {
        if (!card || !card.parentNode) return null;
        if (card.parentElement && card.parentElement.classList.contains('admin-post-card')) {
            return card.parentElement;
        }

        var wasHidden = card.style.display === 'none';
        var frame = document.createElement('div');
        frame.className = 'admin-post-card';
        card.parentNode.insertBefore(frame, card);
        frame.appendChild(card);
        if (wasHidden) {
            frame.style.display = 'none';
            card.style.display = '';
        }
        return frame;
    }

    function directChildByClass(parent, className) {
        if (!parent) return null;
        for (var i = 0; i < parent.children.length; i += 1) {
            if (parent.children[i].classList.contains(className)) return parent.children[i];
        }
        return null;
    }

    function renderPostListAdminActions(state) {
        var cards = Array.prototype.slice.call(document.querySelectorAll('#post-list .post-card'));
        var canDelete = Boolean(state && state.admin);

        cards.forEach(function(card) {
            var frame = ensurePostCardFrame(card);
            if (!frame) return;

            var existing = directChildByClass(frame, 'admin-post-actions');
            if (existing) existing.parentNode.removeChild(existing);
            frame.classList.toggle('has-admin-action', canDelete);
            if (!canDelete) return;

            var slug = card.getAttribute('data-slug') || '';
            if (!slug) return;

            var actions = document.createElement('div');
            actions.className = 'admin-post-actions';

            var message = document.createElement('span');
            message.className = 'admin-post-status';

            var button = createAdminButton('삭제', 'admin-button admin-button-danger admin-post-delete');
            var title = card.getAttribute('data-title') || cardText(card, '.post-title') || slug;
            button.addEventListener('click', function() {
                requestPostDeletion(slug, title, button, message);
            });

            actions.appendChild(message);
            actions.appendChild(button);
            frame.appendChild(actions);
        });
    }

    function renderAdminControl(state) {
        var control = document.getElementById('admin-control');
        if (!control) {
            control = document.createElement('div');
            control.id = 'admin-control';
            control.className = 'admin-control';
            document.body.appendChild(control);
        }

        control.innerHTML = '';

        var message = document.createElement('div');
        message.className = 'admin-message';

        if (!state || !state.configured) {
            var disabled = createAdminButton('로그인 설정 필요', 'admin-button admin-button-muted');
            disabled.disabled = true;
            control.appendChild(disabled);
            control.appendChild(message);
            setAdminMessage(control, 'OAuth 환경 변수를 설정해야 합니다.', true);
            return;
        }

        if (!state.authenticated) {
            var login = createAdminButton('GitHub 로그인', 'admin-button');
            login.addEventListener('click', function() {
                var returnTo = window.location.pathname + window.location.search + window.location.hash;
                window.location.href = '/api/auth/login?returnTo=' + encodeURIComponent(returnTo);
            });
            control.appendChild(login);
            control.appendChild(message);
            return;
        }

        var user = document.createElement('span');
        user.className = 'admin-user';
        user.textContent = state.user && state.user.login ? state.user.login : '로그인됨';
        control.appendChild(user);

        if (state.admin && currentSlug) {
            var deleteButton = createAdminButton('삭제', 'admin-button admin-button-danger');
            deleteButton.addEventListener('click', function() {
                requestPostDeletion(currentSlug, shareTitle || currentSlug, deleteButton, message);
            });
            control.appendChild(deleteButton);
        } else if (!state.admin) {
            var badge = document.createElement('span');
            badge.className = 'admin-readonly';
            badge.textContent = '읽기 전용';
            control.appendChild(badge);
        }

        var logout = createAdminButton('로그아웃', 'admin-button admin-button-muted');
        logout.addEventListener('click', function() {
            logout.disabled = true;
            apiJson('/api/auth/logout', { method: 'POST' }).then(function() {
                var signedOutState = { configured: true, authenticated: false, admin: false, user: null };
                renderAdminControl(signedOutState);
                renderPostListAdminActions(signedOutState);
            }).catch(function() {
                logout.disabled = false;
            });
        });
        control.appendChild(logout);
        control.appendChild(message);
    }

    function initAdminControl() {
        if (!window.fetch || !document.body) return;
        apiJson('/api/auth/me').then(function(state) {
            renderAdminControl(state);
            renderPostListAdminActions(state);
        }).catch(function() {});
    }

    initAdminControl();

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
        var mdCount = document.querySelectorAll('#md-resource-list .resource-card').length;
        if (blogCountEl) blogCountEl.textContent = String(blogCount);
        if (mdCountEl) mdCountEl.textContent = String(mdCount);
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

            cards.forEach(function(card) { setPostCardVisible(card, false); });

            var start = (state.page - 1) * state.pageSize;
            var end = start + state.pageSize;
            filteredCards.slice(start, end).forEach(function(card) {
                setPostCardVisible(card, true);
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
