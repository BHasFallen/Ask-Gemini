document.addEventListener('DOMContentLoaded', () => {
    const slides = document.querySelectorAll('.slide');
    const dots = document.querySelectorAll('.dot');
    const nextBtn = document.getElementById('next-btn');
    const btnSpan = nextBtn.querySelector('span');
    
    let currentSlide = 0;
    const totalSlides = slides.length;

    function transitionSlide(direction) {
        const prevSlide = slides[currentSlide];
        prevSlide.classList.remove('active');
        prevSlide.classList.add('exit');
        
        dots[currentSlide].classList.remove('active');
        
        currentSlide += direction;
        
        const newSlide = slides[currentSlide];
        newSlide.classList.remove('exit');
        newSlide.classList.add('active');
        
        dots[currentSlide].classList.add('active');

        // Track step reached
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ 
                type: 'TRACK_EVENT', 
                name: 'tour_step_reached',
                params: { step: currentSlide + 1, type: 'onboarding' }
            });
        }

        // Update button text if last slide
        if (currentSlide === totalSlides - 1) {
            btnSpan.textContent = "Start Using Extension";
            nextBtn.classList.add('finish');
            nextBtn.querySelector('svg').innerHTML = '<path d="M20 6L9 17l-5-5"/>';
        } else {
            btnSpan.textContent = "Continue";
            nextBtn.classList.remove('finish');
            nextBtn.querySelector('svg').innerHTML = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';
        }
    }

    nextBtn.addEventListener('click', () => {
        if (currentSlide < totalSlides - 1) {
            transitionSlide(1);
        } else {
            // Finish onboarding - Redirect to Gemini for tour
            btnSpan.textContent = "Loading Gemini...";
            nextBtn.classList.add('finish');
            
            // Track completion event on actual finish click
            if (chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({ 
                    type: 'TRACK_EVENT', 
                    name: 'tour_completed',
                    params: { type: 'onboarding' }
                });
            }
            
            if (chrome.runtime && chrome.storage) {
                chrome.storage.local.set({ ask_gemini_tour_active: false, tour_step: 1 }, () => {
                    window.location.href = "https://gemini.google.com/app";
                });
            } else {
                window.location.href = "https://gemini.google.com/app";
            }
        }
    });

    // Track initialization
    if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ 
            type: 'TRACK_EVENT', 
            name: 'tour_started',
            params: { type: 'onboarding' }
        });
        chrome.runtime.sendMessage({ 
            type: 'TRACK_EVENT', 
            name: 'tour_step_reached',
            params: { step: 1, type: 'onboarding' }
        });
    }
});
