(function () {
    'use strict';

    var list = document.getElementById('newsletter-list');
    var status = document.getElementById('newsletter-status');
    var search = document.getElementById('newsletter-search');
    var category = document.getElementById('newsletter-category');
    var language = document.getElementById('newsletter-language');
    var source = document.getElementById('newsletter-source');
    var sourceStrip = document.getElementById('newsletter-source-strip');
    var loadMore = document.getElementById('newsletter-load-more');
    var itemCount = document.getElementById('newsletter-item-count');
    var feedCount = document.getElementById('newsletter-feed-count');
    var updatedAt = document.getElementById('newsletter-updated-at');
    var snapshot = { feeds: [], items: [], categoryOrder: [] };
    var fallbackCategories = ['종합·해설', '자기계발', '사업', '법률', '컴퓨터 사이언스', 'AI', '양자컴퓨터', '제약'];
    var pageSize = 60;
    var visibleLimit = pageSize;
    var sourceChipLimit = 12;

    function formatDate(value, includeTime) {
        if (!value) return '날짜 미상';
        var date = new Date(value);
        if (Number.isNaN(date.getTime())) return value.slice(0, 10);
        return new Intl.DateTimeFormat('ko-KR', includeTime ? {
            timeZone: 'Asia/Seoul',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        } : {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }).format(date);
    }

    function appendText(parent, tag, className, text) {
        var element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = text || '';
        parent.appendChild(element);
        return element;
    }

    function filteredItems(ignoreSource) {
        var query = (search.value || '').trim().toLocaleLowerCase('ko-KR');
        var selectedCategory = category.value || '';
        var selectedLanguage = language.value || '';
        var selectedSource = ignoreSource ? '' : (source.value || '');
        return snapshot.items.filter(function (item) {
            if (selectedSource && item.feedId !== selectedSource) return false;
            if (selectedCategory && item.category !== selectedCategory) return false;
            if ((selectedLanguage === 'ko' || selectedLanguage === 'en') && item.language !== selectedLanguage) return false;
            if (!query) return true;
            return [item.title, item.summary, item.source, item.category]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase('ko-KR')
                .includes(query);
        });
    }

    function renderSources() {
        var selectedSource = source.value || '';
        var counts = {};
        filteredItems(true).forEach(function (item) {
            counts[item.feedId] = (counts[item.feedId] || 0) + 1;
        });
        var compatibleFeeds = snapshot.feeds.filter(function (feed) { return counts[feed.id] > 0; });
        compatibleFeeds.sort(function (left, right) {
            var featuredRank = Number(Boolean(right.featured)) - Number(Boolean(left.featured));
            var languageRank = (left.language === 'ko' ? 0 : 1) - (right.language === 'ko' ? 0 : 1);
            return featuredRank
                || languageRank
                || Number(right.priority || 0) - Number(left.priority || 0)
                || String(left.title || '').localeCompare(String(right.title || ''), 'ko');
        });
        if (selectedSource && !counts[selectedSource]) selectedSource = '';

        source.textContent = '';
        var allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = '전체 발행처 (' + compatibleFeeds.length + ')';
        source.appendChild(allOption);
        compatibleFeeds.forEach(function (feed) {
            var option = document.createElement('option');
            option.value = feed.id || '';
            option.textContent = (feed.title || feed.id || '알 수 없는 발행처') + ' (' + counts[feed.id] + ')';
            source.appendChild(option);
        });
        source.value = selectedSource;

        sourceStrip.textContent = '';
        compatibleFeeds.slice(0, sourceChipLimit).forEach(function (feed) {
            var label = (feed.title || feed.id || '알 수 없는 발행처') + ' ' + counts[feed.id];
            var chip = appendText(sourceStrip, 'span', 'newsletter-source-chip', label);
            chip.dataset.error = feed.error ? 'true' : 'false';
            if (feed.error) chip.title = feed.error;
        });
        if (compatibleFeeds.length > sourceChipLimit) {
            appendText(
                sourceStrip,
                'span',
                'newsletter-source-chip newsletter-source-chip-more',
                '+' + (compatibleFeeds.length - sourceChipLimit) + '개 소스'
            );
        }
    }

    function renderCategories() {
        category.textContent = '';
        var allOption = document.createElement('option');
        allOption.value = '';
        allOption.textContent = '전체 카테고리';
        category.appendChild(allOption);

        var categories = [];
        snapshot.items.forEach(function (item) {
            var value = item.category || '';
            if (value && !categories.includes(value)) categories.push(value);
        });
        var preferredCategories = snapshot.categoryOrder.length ? snapshot.categoryOrder : fallbackCategories;
        categories.sort(function (left, right) {
            var leftIndex = preferredCategories.indexOf(left);
            var rightIndex = preferredCategories.indexOf(right);
            var leftRank = leftIndex < 0 ? preferredCategories.length : leftIndex;
            var rightRank = rightIndex < 0 ? preferredCategories.length : rightIndex;
            return leftRank - rightRank || left.localeCompare(right, 'ko');
        });
        categories.forEach(function (value) {
            var option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            category.appendChild(option);
        });
    }

    function cardFor(item) {
        var card = document.createElement('a');
        card.className = 'newsletter-card';
        card.href = item.url;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        if (item.language === 'ko' || item.language === 'en') card.lang = item.language;

        var top = document.createElement('div');
        top.className = 'newsletter-card-top';
        appendText(top, 'span', 'newsletter-card-source', item.source || '뉴스레터');
        appendText(top, 'span', 'newsletter-card-category', item.category || '기타');
        card.appendChild(top);

        appendText(card, 'h3', '', item.title || '제목 없음');
        if (item.summary) appendText(card, 'p', 'newsletter-card-summary', item.summary);

        var footer = document.createElement('div');
        footer.className = 'newsletter-card-footer';
        appendText(footer, 'time', '', formatDate(item.publishedAt || item.collectedAt, false));
        appendText(footer, 'span', 'newsletter-open-label', '원문 보기 ↗');
        card.appendChild(footer);
        return card;
    }

    function renderItems() {
        var selectedLanguage = language.value || '';
        var items = filteredItems(false);
        if (selectedLanguage === 'ko-first') {
            items.sort(function (left, right) {
                var leftRank = left.language === 'ko' ? 0 : (left.language === 'en' ? 1 : 2);
                var rightRank = right.language === 'ko' ? 0 : (right.language === 'en' ? 1 : 2);
                return leftRank - rightRank;
            });
        }

        var visibleItems = items.slice(0, visibleLimit);
        list.textContent = '';
        if (!items.length) {
            appendText(list, 'p', 'newsletter-empty', '조건에 맞는 뉴스레터 글이 없습니다.');
        } else {
            visibleItems.forEach(function (item) { list.appendChild(cardFor(item)); });
        }
        var modeLabel = selectedLanguage === 'ko-first' ? '한국어 우선 · ' : '';
        status.textContent = modeLabel + '조건에 맞는 ' + items.length + '개 중 ' + visibleItems.length + '개를 표시합니다.';
        loadMore.hidden = visibleItems.length >= items.length;
        loadMore.textContent = loadMore.hidden ? '더 보기' : '더 보기 · ' + (items.length - visibleItems.length) + '개 남음';
    }

    function render(snapshotData) {
        snapshot = {
            feeds: Array.isArray(snapshotData.feeds) ? snapshotData.feeds : [],
            items: Array.isArray(snapshotData.items) ? snapshotData.items : [],
            categoryOrder: Array.isArray(snapshotData.categoryOrder) ? snapshotData.categoryOrder : []
        };
        itemCount.textContent = String(snapshot.items.length);
        feedCount.textContent = String(snapshot.feeds.length);
        updatedAt.textContent = formatDate(snapshotData.generatedAt, true);
        renderCategories();
        renderSources();
        renderItems();
    }

    function renderAfterFilterChange() {
        visibleLimit = pageSize;
        renderSources();
        renderItems();
    }

    search.addEventListener('input', renderAfterFilterChange);
    category.addEventListener('change', renderAfterFilterChange);
    language.addEventListener('change', renderAfterFilterChange);
    source.addEventListener('change', function () {
        visibleLimit = pageSize;
        renderItems();
    });
    loadMore.addEventListener('click', function () {
        visibleLimit += pageSize;
        renderItems();
    });

    fetch('./newsletters.json', { cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(render)
        .catch(function () {
            status.textContent = '뉴스레터 목록을 불러오지 못했습니다.';
            list.textContent = '';
            loadMore.hidden = true;
            appendText(list, 'p', 'newsletter-error', '잠시 후 다시 시도해 주세요. 기존 블로그 글에는 영향이 없습니다.');
        });
}());
