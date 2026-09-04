const logoCard = document.querySelector(".logo-card");

const DISPLAY_TIME = 5000; // 5 seconds
const FLIP_TIME = 1000;    // 1 second

function flipLogo() {

    logoCard.classList.toggle("flipped");

}

function startAnimation() {

    setTimeout(() => {

        flipLogo();

        startAnimation();

    }, DISPLAY_TIME);

}

startAnimation();