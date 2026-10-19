const logos = JSON.parse(process.env.LOGOS);
console.log(logos);

const logoCard = document.querySelector(".logo-card");
const frontImg = document.getElementById("front-img");
const backImg = document.getElementById("back-img");

let currentIndex = 0;
let isFlipped = false;

const DISPLAY_TIME = 5000;

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
    let nextIndex = (currentIndex + 1) % logos.length;

    setTimeout(() => {
        if (isFlipped) {
            frontImg.src = logos[nextIndex];
        } else {
            backImg.src = logos[nextIndex];
        }
    }, 400); 
}

setInterval(flipToNextLogo, DISPLAY_TIME);