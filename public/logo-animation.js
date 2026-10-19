async function initLogoAnimation() {
    try {
        const response = await fetch('/api/config');

        if (!response.ok) {
            throw new Error(`Failed to load config: HTTP ${response.status}`);
        }

        const config = await response.json();
        const logos = config.logos;

        console.log('Logos:', logos);

        if (!Array.isArray(logos) || logos.length < 2) {
            throw new Error('LOGOS must contain at least 2 logo URLs');
        }

        const logoCard = document.querySelector(".logo-card");
        const frontImg = document.getElementById("front-img");
        const backImg = document.getElementById("back-img");

        if (!logoCard || !frontImg || !backImg) {
            throw new Error('Logo animation elements not found');
        }

        let currentIndex = 0;
        let isFlipped = false;

        const DISPLAY_TIME = 5000;
        const FLIP_TIME = 400;

        frontImg.src = logos[0];
        backImg.src = logos[1];

        function flipToNextLogo() {
            isFlipped = !isFlipped;

            if (isFlipped) {
                logoCard.classList.add("flipped");
            } else {
                logoCard.classList.remove("flipped");
            }

            currentIndex = (currentIndex + 1) % logos.length;

            const nextIndex = (currentIndex + 1) % logos.length;

            setTimeout(() => {
                if (isFlipped) {
                    frontImg.src = logos[nextIndex];
                } else {
                    backImg.src = logos[nextIndex];
                }
            }, FLIP_TIME);
        }

        setInterval(flipToNextLogo, DISPLAY_TIME);

    } catch (error) {
        console.error('Failed to initialize logo animation:', error);
    }
}

initLogoAnimation();