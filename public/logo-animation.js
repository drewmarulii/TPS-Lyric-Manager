const logos = ["https://www.dropbox.com/scl/fi/95aiq9089df325vgwv5ie/LOGO-TPS.png?rlkey=e6o1qhz941362dwathwd26982&st=7jg0xpin&dl=0&raw=1","https://www.dropbox.com/scl/fi/47i4g0hr9tbdb3tramme0/ALL-THINGS-NEW.png?rlkey=8syjq2l6relv9ozmq5fw292ag&st=d92e4b4q&dl=0&raw=1","https://www.dropbox.com/scl/fi/98vbbgcz8uhs7ez642j77/KKR2026.png?rlkey=2qrcbpiot7il2w8qebidv6wqb&st=ltga0kux&dl=0&raw=1"];

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