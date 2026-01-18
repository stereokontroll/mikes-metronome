/* --- GLOBAL VARIABLES --- */
let currentMode = 'basic'; 
let isRunning = false;
let audioContext = null;
let timerID = null;
let nextNoteTime = 0.0;

// Wake Lock Variable
let wakeLock = null;

// Sound Settings
let currentSoundType = 'high'; // high, wood, soft

// Basic Mode State
let currentBeatIndex = 0;
let basicAccents = []; 

// Advanced Mode State
let sequence = [];
let countInSettings = { enabled: false, bpm: 100, beats: 4, value: 4, bars: 1, accents: [2,0,0,0] };
let isRepeatEnabled = false;

// Saved Songs
let savedSequences = [];

// Loop Variables
let playPhase = 0; // 0 = CountIn, 1 = Sequence
let currentStepIndex = 0; 
let advBarCounter = 1; 
let advBeatCounter = 0; 

// Tap Tempo Logic
let tapTimes = [];
let tapResetTimer = null;

// Italian Tempo Markings Definitions
const tempoMarkings = [
    { name: "Largo",       min: 30,  max: 60,  default: 50 },
    { name: "Adagio",      min: 60,  max: 76,  default: 70 },
    { name: "Andante",     min: 76,  max: 108, default: 90 },
    { name: "Moderato",    min: 108, max: 120, default: 110 },
    { name: "Allegro",     min: 120, max: 156, default: 130 },
    { name: "Vivace",      min: 156, max: 176, default: 160 },
    { name: "Presto",      min: 176, max: 200, default: 180 },
    { name: "Prestissimo", min: 200, max: 321, default: 210 }
];

// --- DOM ELEMENTS ---
const mainBtn = document.getElementById('mainActionBtn');
const basicPanel = document.getElementById('panel-basic');
const advPanel = document.getElementById('panel-advanced');

// Menu Elements
const menuDrawer = document.getElementById('menuDrawer');
const menuOverlay = document.getElementById('menuOverlay');
const savedSongsList = document.getElementById('savedSongsList');
const soundTypeSelect = document.getElementById('soundTypeSelect'); 

// Status Displays
const advStatus = document.getElementById('advStatus');
const advStepName = document.getElementById('advStepName');
const advBarCountEl = document.getElementById('advBarCount');

// Inputs Basic
const bpmInput = document.getElementById('bpm');
const beatCountInput = document.getElementById('beatCountInput');
const beatValueInput = document.getElementById('beatValueInput');
const beatContainer = document.getElementById('beatContainer');
const repeatCheckbox = document.getElementById('repeatCheckbox');
const tempoSelect = document.getElementById('tempoSelect'); // De dropdown

// Inputs Count-in
const countInBox = document.getElementById('countInBox');
const countInCheck = document.getElementById('countInCheck');
const ciBpm = document.getElementById('ciBpm');
const ciBeats = document.getElementById('ciBeats');
const ciValue = document.getElementById('ciValue');
const ciBars = document.getElementById('ciBars');
const ciAccentsContainer = document.getElementById('ciAccentsContainer');


// --- FUNCTIONS ---

// 1. Sound Settings Logic
function setSoundType(type) {
    currentSoundType = type;
    localStorage.setItem('mikeMetronomeSoundType', type);
    if(audioContext && audioContext.state === 'running' && !isRunning) {
        playSound(1000, audioContext.currentTime);
    }
}

// 2. Wake Lock Functions
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}

function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
}

// 3. Menu Logic
function toggleMenu() {
    const isOpen = menuDrawer.classList.contains('open');
    if (isOpen) {
        menuDrawer.classList.remove('open');
        menuOverlay.classList.remove('open');
        setTimeout(() => menuOverlay.style.display = 'none', 300);
    } else {
        menuOverlay.style.display = 'block';
        setTimeout(() => {
            menuDrawer.classList.add('open');
            menuOverlay.classList.add('open');
        }, 10);
    }
}

function initAccordionMenu() {
    const acc = document.getElementsByClassName("accordion-btn");
    for (let i = 0; i < acc.length; i++) {
        acc[i].addEventListener("click", function() {
            this.classList.toggle("active");
            const panel = this.nextElementSibling;
            if (panel.style.maxHeight) {
                panel.style.maxHeight = null;
            } else {
                panel.style.maxHeight = panel.scrollHeight + "px";
            } 
        });
    }
}

// 4. Version Fetch Logic
async function loadVersionFromSW() {
    try {
        const response = await fetch('./sw.js?t=' + Date.now());
        const text = await response.text();
        const match = text.match(/CACHE_NAME\s*=\s*["']([^"']+)["']/);
        if (match && match[1]) {
            const v = match[1].replace('metronome-', '');
            const versionEl = document.getElementById('appVersion');
            if(versionEl) versionEl.textContent = `${v}`;
        }
    } catch (e) {
        console.log("Could not fetch version");
    }
}

// 5. Local Storage & Settings
function saveBasicSettings() {
    // Validatie
    let val = parseInt(bpmInput.value);
    if (val < 30) val = 30;
    if (val > 320) val = 320;
    bpmInput.value = val;

    localStorage.setItem('mikeMetronomeBasicBpm', bpmInput.value);
    localStorage.setItem('mikeMetronomeBasicCount', beatCountInput.value);
    localStorage.setItem('mikeMetronomeBasicValue', beatValueInput.value);
    localStorage.setItem('mikeMetronomeBasicAccents', JSON.stringify(basicAccents));

    // Update de Italiaanse term als BPM wijzigt
    updateDropdownVisuals();
}

function saveSequence() {
    localStorage.setItem('mikeMetronomeSequence', JSON.stringify(sequence));
}

function saveCountIn() {
    let val = parseInt(ciBpm.value);
    if (val < 30) val = 30;
    if (val > 320) val = 320;
    ciBpm.value = val;

    countInSettings.enabled = countInCheck.checked;
    countInSettings.bpm = parseInt(ciBpm.value);
    countInSettings.beats = parseInt(ciBeats.value);
    countInSettings.value = parseInt(ciValue.value);
    countInSettings.bars = parseInt(ciBars.value);
    localStorage.setItem('mikeMetronomeCountIn', JSON.stringify(countInSettings));
    updateCountInUIState();
}

function saveRepeatSetting() {
    isRepeatEnabled = repeatCheckbox.checked;
    localStorage.setItem('mikeMetronomeRepeat', isRepeatEnabled);
}

function loadSettings() {
    if(localStorage.getItem('mikeMetronomeBasicBpm')) bpmInput.value = localStorage.getItem('mikeMetronomeBasicBpm');
    if(localStorage.getItem('mikeMetronomeBasicCount')) beatCountInput.value = localStorage.getItem('mikeMetronomeBasicCount');
    if(localStorage.getItem('mikeMetronomeBasicValue')) beatValueInput.value = localStorage.getItem('mikeMetronomeBasicValue');
    
    if(localStorage.getItem('mikeMetronomeRepeat') === 'true') {
        isRepeatEnabled = true;
        repeatCheckbox.checked = true;
    }
    
    const storedSound = localStorage.getItem('mikeMetronomeSoundType');
    if (storedSound) {
        currentSoundType = storedSound;
    }
    const radioBtn = document.querySelector(`input[name="soundType"][value="${currentSoundType}"]`);
    if(radioBtn) radioBtn.checked = true;

    const savedCI = localStorage.getItem('mikeMetronomeCountIn');
    if(savedCI) {
        try { countInSettings = JSON.parse(savedCI); } catch(e) {}
    }
    if(!countInSettings.value) countInSettings.value = 4;
    if(!countInSettings.accents || countInSettings.accents.length !== countInSettings.beats) {
        countInSettings.accents = generateDefaultAccents(countInSettings.beats);
    }

    const savedSeq = localStorage.getItem('mikeMetronomeSequence');
    if(savedSeq) {
        try {
            sequence = JSON.parse(savedSeq);
            sequence.forEach(step => {
                if(!step.accents || step.accents.length !== step.beats) {
                    step.accents = generateDefaultAccents(step
