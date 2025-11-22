const SECTIONS = {
    basket: {
        label: "BASKET",
        theme: "theme-examples",
        subtitle: "YOUR BASKET"
    },
    about: {
        label: "ABOUT",
        theme: "theme-about",
        subtitle: "ABOUT US"
    },
    catalog: {
        label: "CATALOG",
        theme: "theme-instagram",
        subtitle: "PRODUCT CATALOG"
    },
    profile: {
        label: "PROFILE",
        theme: "theme-savee",
        subtitle: "YOUR PROFILE"
    }
};

const centerWordEl = document.getElementById("centerWord");
const centerLabelEl = document.getElementById("centerLabel");
const navLinks = document.querySelectorAll(".nav-link");

let currentSectionKey = null;

// idle / hero-анимация
let idleActive = true;
let idlePhase = "digits"; // "digits" | "brand"
let idleTimeout = null;
let idleInterval = null;

function generateTimeLikeString() {
    function randDigit() {
        return Math.floor(Math.random() * 10);
    }

    const h1 = randDigit();
    const h2 = randDigit();
    const m1 = randDigit();
    const m2 = randDigit();
    const s1 = randDigit();
    const s2 = randDigit();

    return `${h1}${h2}:${m1}${m2}:${s1}${s2}`;
}

function setCenterWord(text) {
    centerWordEl.innerHTML = "";
    [...text].forEach((ch, index) => {
        const span = document.createElement("span");
        span.textContent = ch;
        span.dataset.index = index;
        centerWordEl.appendChild(span);
    });
}

function applyTheme(themeClass) {
    document.body.className = themeClass;
}

// фазa с цифрами
function startDigitsPhase() {
    if (!idleActive) return;
    idlePhase = "digits";

    // сразу показать что-то
    setCenterWord(generateTimeLikeString());
    centerWordEl.classList.add("is-active");
    centerLabelEl.textContent = "HOVER ANY CORNER";

    if (idleInterval) clearInterval(idleInterval);
    idleInterval = setInterval(() => {
        if (!idleActive || idlePhase !== "digits") return;
        setCenterWord(generateTimeLikeString());
    }, 900);

    // через 5 секунд переключаемся на бренд
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        startBrandPhase();
    }, 5000);
}

// фаза с текстом NAE*LOVO
function startBrandPhase() {
    if (!idleActive) return;
    idlePhase = "brand";

    // стопаем смену цифр
    if (idleInterval) {
        clearInterval(idleInterval);
        idleInterval = null;
    }

    centerLabelEl.textContent = "NAE*LOVO";
    setCenterWord("NAE*LOVO");
    centerWordEl.classList.add("is-active");

    // через 3 секунды опять цифры
    if (idleTimeout) clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
        startDigitsPhase();
    }, 3000);
}

function startIdleLoop() {
    idleActive = true;
    startDigitsPhase();
}

function stopIdleLoop() {
    idleActive = false;
    if (idleInterval) {
        clearInterval(idleInterval);
        idleInterval = null;
    }
    if (idleTimeout) {
        clearTimeout(idleTimeout);
        idleTimeout = null;
    }
}

function activateSection(key) {
    if (currentSectionKey === key) return;

    const section = SECTIONS[key];
    if (!section) return;

    // как только пользователь выбрал раздел — гасим idle-режим
    if (idleActive) {
        stopIdleLoop();
    }

    currentSectionKey = key;

    applyTheme(section.theme);
    centerLabelEl.textContent = section.subtitle;
    setCenterWord(section.label);
    centerWordEl.classList.add("is-active");
}

navLinks.forEach((btn) => {
    const key = btn.dataset.key;
    btn.addEventListener("mouseenter", () => {
        activateSection(key);
    });
});

// стартуем цикл: цифры -> бренд -> цифры -> бренд ...
startIdleLoop();
