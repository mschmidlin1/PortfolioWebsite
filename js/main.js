document.addEventListener('DOMContentLoaded', function() {
    // Variables
    const themeToggle = document.querySelector('.theme-toggle');
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const navLinksItems = document.querySelectorAll('.nav-links a');
    const sections = document.querySelectorAll('.section');
    const resumeBtn = document.querySelector('.resume-btn');
    
    // Initialize counter animation
    initCounters();
    
    // Handle theme toggle
    themeToggle.addEventListener('click', function() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    });
    
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.remove('dark-mode');
    }
    
    // Mobile menu toggle
    hamburger.addEventListener('click', function() {
        navLinks.classList.toggle('active');
        hamburger.classList.toggle('active');
    });
    
    // Close mobile menu when clicking on a link
    navLinksItems.forEach(item => {
        item.addEventListener('click', function() {
            navLinks.classList.remove('active');
            hamburger.classList.remove('active');
        });
    });
    
    // Handle active navigation based on scroll position
    window.addEventListener('scroll', function() {
        let current = '';
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop - 100;
            const sectionHeight = section.clientHeight;
            
            if (pageYOffset >= sectionTop) {
                current = section.getAttribute('id');
            }
        });
        
        navLinksItems.forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('href').substring(1) === current) {
                item.classList.add('active');
            }
        });
        
        // Add shadow to header on scroll
        const header = document.querySelector('header');
        if (window.scrollY > 0) {
            header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
        } else {
            header.style.boxShadow = 'none';
        }
    });
    
    // Resume download button - replace with your resume file path
    resumeBtn.addEventListener('click', function(e) {
        // Let the HTML handle the download naturally
        // No need to preventDefault or use window.open
        // The download attribute and href in the HTML will handle it
    });
    
    // Function to handle counter animation
    function initCounters() {
        const counters = document.querySelectorAll('.counter');
        const speed = 200;
        
        const animateCounter = () => {
            counters.forEach(counter => {
                const target = +counter.textContent;
                const count = +counter.innerText;
                
                const inc = target / speed;
                
                if (count < target) {
                    counter.innerText = Math.ceil(count + inc);
                    setTimeout(animateCounter, 30);
                } else {
                    counter.innerText = target;
                }
            });
        };
        
        // Start animation when in viewport
        const counterSection = document.querySelector('.about-stats');
        
        const options = {
            threshold: 0.5
        };
        
        const observer = new IntersectionObserver(function(entries) {
            if (entries[0].isIntersecting) {
                animateCounter();
                observer.unobserve(counterSection);
            }
        }, options);
        
        if (counterSection) {
            observer.observe(counterSection);
        }
    }
}); 