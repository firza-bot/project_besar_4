// Intelligence Creation Landing Page Scripts
document.addEventListener('DOMContentLoaded', function() {
    
    // =====================
    // Smooth Scroll
    // =====================
    document.querySelectorAll('a[href^="#"]').forEach(function(anchor) {
        anchor.addEventListener('click', function(e) {
            var href = this.getAttribute('href');
            if (href !== '#') {
                e.preventDefault();
                var target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                }
            }
        });
    });

    // =====================
    // Navbar Scroll Effect
    // =====================
    var navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', function() {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }

    // =====================
    // Scroll Animation Observer
    // =====================
    var observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, observerOptions);

    document.querySelectorAll('.scroll-animate').forEach(function(el) {
        observer.observe(el);
    });

    // =====================
    // Contact Form
    // =====================
    var contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Add success animation
            var btn = this.querySelector('.btn-primary');
            var originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Terkirim!';
            btn.style.background = '#10b981';
            
            setTimeout(function() {
                btn.innerHTML = originalText;
                btn.style.background = '';
            }, 2000);
            
            this.reset();
            
            // Show toast
            alert('Terima kasih! Pesan Anda telah dikirim.');
        });
    }

    // =====================
    // Button Hover Effects
    // =====================
    document.querySelectorAll('.btn').forEach(function(btn) {
        btn.addEventListener('mouseenter', function(e) {
            var ripple = document.createElement('span');
            ripple.style.cssText = 'position:absolute;top:50%;left:50%;width:0;height:0;background:rgba(255,255,255,0.3);border-radius:50%;transform:translate(-50%,-50%);transition:width 0.4s,height 0.4s;';
            this.appendChild(ripple);
            
            var rect = this.getBoundingClientRect();
            var size = Math.max(rect.width, rect.height) * 2;
            ripple.style.width = size + 'px';
            ripple.style.height = size + 'px';
        });
        
        btn.addEventListener('mouseleave', function(e) {
            var ripple = this.querySelector('span');
            if (ripple) ripple.remove();
        });
    });

    // =====================
    // Parallax Effect for Hero
    // =====================
    window.addEventListener('scroll', function() {
        var scrolled = window.scrollY;
        var heroLogo = document.querySelector('.hero-logo');
        if (heroLogo && scrolled < 600) {
            heroLogo.style.transform = 'translateY(' + (scrolled * 0.1) + 'px)';
        }
    });

    // =====================
    // Stats Counter Animation
    // =====================
    var statsSection = document.querySelector('.hero-stats');
    if (statsSection) {
        var statsObserver = new IntersectionObserver(function(entries) {
            if (entries[0].isIntersecting) {
                document.querySelectorAll('.stat-number').forEach(function(stat) {
                    var target = parseInt(stat.textContent);
                    var current = 0;
                    var increment = target / 30;
                    var timer = setInterval(function() {
                        current += increment;
                        if (current >= target) {
                            stat.textContent = target;
                            clearInterval(timer);
                        } else {
                            stat.textContent = Math.floor(current);
                        }
                    }, 30);
                });
                statsObserver.unobserve(statsSection);
            }
        }, { threshold: 0.5 });
        
        statsObserver.observe(statsSection);
    }

    // =====================
    // Footer Link Hover
    // =====================
    document.querySelectorAll('.footer-link').forEach(function(link) {
        link.addEventListener('mouseenter', function() {
            this.style.transform = 'translateX(10px)';
        });
        link.addEventListener('mouseleave', function() {
            this.style.transform = 'translateX(0)';
        });
    });

    // =====================
    // Sequence Logo Animation
    // =====================
    var sequenceLogos = document.querySelectorAll('.sequence-logo');
    if (sequenceLogos.length > 0) {
        var currentFrame = 1;
        var totalFrames = 240;
        
        setInterval(function() {
            currentFrame++;
            if (currentFrame > totalFrames) currentFrame = 1;
            
            var frameStr = currentFrame.toString().padStart(3, '0');
            
            sequenceLogos.forEach(function(logo) {
                var currentSrc = logo.src;
                var newSrc = currentSrc.replace(/ezgif-frame-\d{3}\.jpg/, 'ezgif-frame-' + frameStr + '.jpg');
                logo.src = newSrc;
            });
        }, 33);
    }

});