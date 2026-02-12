document.querySelectorAll('.screenshot-container img').forEach(function(img) {
    img.addEventListener('click', function() {
        var lb = document.getElementById('lightbox');
        if (lb) {
            document.getElementById('lightbox-img').src = this.src;
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
// Category filter
document.querySelectorAll('.cat-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.cat-tab').forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        var cat = this.getAttribute('data-category');
        document.querySelectorAll('.post-card').forEach(function(card) {
            if (cat === '전체' || card.getAttribute('data-category') === cat) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    });
});