;(function () {
  'use strict'

  var PAGE_SIZE = 7

  // --------
  // Lightbox
  // --------
  document.querySelectorAll('.screenshot-container img').forEach(function (img) {
    img.addEventListener('click', function () {
      var lb = document.getElementById('lightbox')
      var lbImg = document.getElementById('lightbox-img')
      if (lb && lbImg) {
        lbImg.src = this.src
        lb.classList.add('active')
      }
    })
  })

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var lb = document.getElementById('lightbox')
      if (lb) lb.classList.remove('active')
    }
  })

  // --------------------------
  // Post detail: back to list
  // --------------------------
  var isPostPage = /\/posts\//.test(window.location.pathname)
  if (isPostPage) {
    var postContainer = document.querySelector('.container')
    if (postContainer && !document.querySelector('.vd-post-nav')) {
      var nav = document.createElement('div')
      nav.className = 'vd-post-nav'

      var btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'vd-back-button'
      btn.textContent = '← 목록으로'
      btn.addEventListener('click', function () {
        var listUrl = sessionStorage.getItem('vd:list:url')
        if (listUrl) {
          sessionStorage.setItem('vd:list:restore', '1')
          window.location.href = listUrl
          return
        }
        window.location.href = '../../'
      })

      nav.appendChild(btn)
      postContainer.insertBefore(nav, postContainer.firstChild)
    }
  }

  function cardText(anchor, selector) {
    var el = anchor && anchor.querySelector ? anchor.querySelector(selector) : null
    return el ? (el.textContent || '').trim() : ''
  }

  function cardMeta(anchor) {
    var spans = Array.prototype.slice
      .call(anchor.querySelectorAll('.post-meta span'))
      .map(function (span) {
        return (span.textContent || '').trim()
      })
      .filter(Boolean)

    return {
      category:
        cardText(anchor, '.post-category-badge') ||
        anchor.getAttribute('data-category') ||
        '기타',
      reading:
        spans.find(function (text) {
          return /분 읽기/.test(text)
        }) || '',
      date:
        anchor.getAttribute('data-date') ||
        spans
          .slice()
          .reverse()
          .find(Boolean) ||
        '',
    }
  }

  function markdownSourceHref(href) {
    if (!href) return '#'
    var normalized = href.replace(/\/+$/, '')
    var match = normalized.match(/\/md\/([^/]+)$/)
    if (!match) return href
    return normalized.replace(/\/md\/([^/]+)$/, '/md/posts/$1.md')
  }

  function createResourceCard(anchor) {
    var meta = cardMeta(anchor)
    var title = anchor.getAttribute('data-title') || cardText(anchor, '.post-title')
    var excerpt =
      anchor.getAttribute('data-excerpt') || cardText(anchor, '.post-excerpt')
    var href = anchor.getAttribute('href') || anchor.href || '#'

    var article = document.createElement('article')
    article.className = 'resource-card'

    var body = document.createElement('div')
    body.className = 'resource-body'

    var eyebrow = document.createElement('div')
    eyebrow.className = 'resource-eyebrow'
    eyebrow.textContent = 'MD'

    var heading = document.createElement('h3')
    heading.className = 'resource-title'

    var titleLink = document.createElement('a')
    titleLink.href = href
    titleLink.textContent = title
    heading.appendChild(titleLink)

    var excerptEl = document.createElement('p')
    excerptEl.className = 'resource-excerpt'
    excerptEl.textContent =
      excerpt || 'Claude와 Codex를 이용해 앱에서 대화형으로 다듬은 실행 문서입니다.'

    var metaEl = document.createElement('div')
    metaEl.className = 'resource-meta'
    ;[meta.category, meta.reading, meta.date].filter(Boolean).forEach(function (item) {
      var span = document.createElement('span')
      span.textContent = item
      metaEl.appendChild(span)
    })

    body.appendChild(eyebrow)
    body.appendChild(heading)
    body.appendChild(excerptEl)
    body.appendChild(metaEl)

    var actions = document.createElement('div')
    actions.className = 'resource-actions'

    var openLink = document.createElement('a')
    openLink.className = 'resource-link'
    openLink.href = href
    openLink.textContent = '문서 보기'

    var sourceLink = document.createElement('a')
    sourceLink.className = 'resource-link resource-link-secondary'
    sourceLink.href = markdownSourceHref(href)
    sourceLink.textContent = '.md 파일'

    actions.appendChild(openLink)
    actions.appendChild(sourceLink)

    article.appendChild(body)
    article.appendChild(actions)
    return article
  }

  function syncHomeCounts() {
    var blogCountEl = document.getElementById('home-blog-count')
    var mdCountEl = document.getElementById('home-md-count')
    var blogCount = document.querySelectorAll('#post-list .post-card').length
    var mdCount = document.querySelectorAll(
      '#home-md-list .resource-card, #md-resource-list .resource-card'
    ).length

    if (blogCountEl) blogCountEl.textContent = String(blogCount)
    if (mdCountEl) mdCountEl.textContent = String(mdCount)
  }

  function organizeLegacyHomeSections() {
    var homeMdList = document.getElementById('home-md-list')
    var postListEl = document.getElementById('post-list')
    if (!homeMdList || !postListEl) return
    if (homeMdList.querySelector('.resource-card')) {
      syncHomeCounts()
      return
    }

    var legacyMdCards = Array.prototype.slice
      .call(postListEl.querySelectorAll('.post-card'))
      .filter(function (card) {
        var href = card.getAttribute('href') || card.href || ''
        return /\/md\//.test(href)
      })

    if (legacyMdCards.length === 0) {
      syncHomeCounts()
      return
    }

    homeMdList.innerHTML = ''
    legacyMdCards.slice(0, 4).forEach(function (card) {
      homeMdList.appendChild(createResourceCard(card))
    })

    legacyMdCards.forEach(function (card) {
      if (card.parentNode) card.parentNode.removeChild(card)
    })

    syncHomeCounts()
  }

  function organizeLegacyMdList() {
    var resourceList = document.getElementById('md-resource-list')
    if (!resourceList || resourceList.querySelector('.resource-card')) return

    var legacyCards = Array.prototype.slice.call(
      resourceList.querySelectorAll('.post-card')
    )
    if (legacyCards.length === 0) return

    var fragment = document.createDocumentFragment()
    legacyCards.forEach(function (card) {
      fragment.appendChild(createResourceCard(card))
    })
    resourceList.innerHTML = ''
    resourceList.appendChild(fragment)
    syncHomeCounts()
  }

  organizeLegacyHomeSections()
  organizeLegacyMdList()

  // ----------------------
  // Index: category + paging
  // ----------------------
  var postList = document.querySelector('#post-list')
  var allCards = Array.prototype.slice.call(
    document.querySelectorAll('#post-list .post-card')
  )
  var allTabs = Array.prototype.slice.call(
    document.querySelectorAll('.cat-tab')
  )

  if (!postList || allCards.length === 0) return

  var currentCat = '전체'
  var currentPage = 1

  function getQueryState() {
    var params = new URLSearchParams(window.location.search)
    var cat = params.get('cat') || params.get('category')
    var pageRaw = params.get('page') || '1'
    var page = parseInt(pageRaw, 10)
    if (!Number.isFinite(page) || page < 1) page = 1

    if (
      cat &&
      allTabs.some(function (t) {
        return t.getAttribute('data-category') === cat
      })
    ) {
      currentCat = cat
    }

    currentPage = page
  }

  function setActiveTab(cat) {
    allTabs.forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-category') === cat)
    })
  }

  function filteredCards() {
    if (currentCat === '전체') return allCards
    return allCards.filter(function (card) {
      return card.getAttribute('data-category') === currentCat
    })
  }

  function buildListUrl(cat, page) {
    var params = new URLSearchParams()
    if (cat && cat !== '전체') params.set('cat', cat)
    if (page && page !== 1) params.set('page', String(page))
    var qs = params.toString()
    return qs ? window.location.pathname + '?' + qs : window.location.pathname
  }

  function updateUrl(push) {
    var url = buildListUrl(currentCat, currentPage)
    if (push) {
      window.history.pushState({ cat: currentCat, page: currentPage }, '', url)
      return
    }
    window.history.replaceState({ cat: currentCat, page: currentPage }, '', url)
  }

  function ensurePager() {
    var existing = document.querySelector('.vd-pagination')
    if (existing) return existing

    var pager = document.createElement('nav')
    pager.className = 'vd-pagination'
    pager.setAttribute('aria-label', 'Posts pagination')

    var footer = document.querySelector('.footer')
    if (footer && footer.parentNode) {
      footer.parentNode.insertBefore(pager, footer)
    } else {
      postList.parentNode.appendChild(pager)
    }

    pager.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a') : null
      if (!a || !pager.contains(a)) return
      if (a.classList.contains('is-disabled')) {
        e.preventDefault()
        return
      }

      var nextPage = parseInt(a.getAttribute('data-page') || '0', 10)
      if (!Number.isFinite(nextPage) || nextPage < 1) return
      if (nextPage === currentPage) {
        e.preventDefault()
        return
      }

      e.preventDefault()
      currentPage = nextPage
      render(true)
      scrollToListTop()
    })

    return pager
  }

  function pageModel(totalPages) {
    if (totalPages <= 7) {
      var all = []
      for (var i = 1; i <= totalPages; i++) all.push(i)
      return all
    }

    var model = [1]
    var left = Math.max(2, currentPage - 2)
    var right = Math.min(totalPages - 1, currentPage + 2)

    if (currentPage <= 4) {
      left = 2
      right = 5
    } else if (currentPage >= totalPages - 3) {
      left = totalPages - 4
      right = totalPages - 1
    }

    if (left > 2) model.push('...')
    for (var p = left; p <= right; p++) model.push(p)
    if (right < totalPages - 1) model.push('...')
    model.push(totalPages)
    return model
  }

  function pagerHtml(totalPages) {
    if (totalPages <= 1) return ''

    var parts = []
    var prev = Math.max(1, currentPage - 1)
    var next = Math.min(totalPages, currentPage + 1)

    parts.push(
      '<a class="vd-page is-prev ' +
        (currentPage === 1 ? 'is-disabled' : '') +
        '" href="' +
        buildListUrl(currentCat, prev) +
        '" data-page="' +
        prev +
        '">이전</a>'
    )

    pageModel(totalPages).forEach(function (item) {
      if (item === '...') {
        parts.push('<span class="vd-ellipsis">…</span>')
        return
      }
      var page = item
      parts.push(
        '<a class="vd-page ' +
          (page === currentPage ? 'is-active' : '') +
          '" href="' +
          buildListUrl(currentCat, page) +
          '" data-page="' +
          page +
          '">' +
          page +
          '</a>'
      )
    })

    parts.push(
      '<a class="vd-page is-next ' +
        (currentPage === totalPages ? 'is-disabled' : '') +
        '" href="' +
        buildListUrl(currentCat, next) +
        '" data-page="' +
        next +
        '">다음</a>'
    )

    return parts.join('')
  }

  function applyVisibility(filtered) {
    allCards.forEach(function (c) {
      c.style.display = 'none'
    })

    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    if (currentPage > totalPages) currentPage = totalPages
    if (currentPage < 1) currentPage = 1

    var start = (currentPage - 1) * PAGE_SIZE
    var end = start + PAGE_SIZE
    filtered.slice(start, end).forEach(function (c) {
      c.style.display = ''
    })

    return totalPages
  }

  function scrollToListTop() {
    var container = document.querySelector('.container')
    if (!container) return
    var y = container.getBoundingClientRect().top + window.scrollY - 10
    if (y < 0) y = 0
    window.scrollTo({ top: y, behavior: 'smooth' })
  }

  function maybeRestoreScroll() {
    var restore = sessionStorage.getItem('vd:list:restore')
    if (restore !== '1') return

    var yRaw = sessionStorage.getItem('vd:list:scrollY') || '0'
    var y = parseInt(yRaw, 10)
    if (!Number.isFinite(y) || y < 0) y = 0

    sessionStorage.setItem('vd:list:restore', '0')
    requestAnimationFrame(function () {
      window.scrollTo(0, y)
    })
  }

  function render(pushUrl) {
    setActiveTab(currentCat)
    var filtered = filteredCards()
    var totalPages = applyVisibility(filtered)

    var pager = ensurePager()
    pager.innerHTML = pagerHtml(totalPages)
    pager.style.display = totalPages <= 1 ? 'none' : ''

    updateUrl(!!pushUrl)
  }

  // Category click
  allTabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var cat = this.getAttribute('data-category') || '전체'
      if (cat === currentCat) return
      currentCat = cat
      currentPage = 1
      render(true)
      scrollToListTop()
    })
  })

  // Store list state before navigating to a post
  function isModifiedClick(e) {
    return (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
  }

  allCards.forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (isModifiedClick(e)) return
      sessionStorage.setItem('vd:list:url', buildListUrl(currentCat, currentPage))
      sessionStorage.setItem('vd:list:scrollY', String(window.scrollY))
      sessionStorage.setItem('vd:list:restore', '0')
    })
  })

  window.addEventListener('popstate', function () {
    getQueryState()
    render(false)
  })

  getQueryState()
  render(false)
  maybeRestoreScroll()
})()
