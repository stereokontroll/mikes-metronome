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

// --- DOM ELEMENTS ---
const mainBtn = document.getElementById('mainActionBtn');
const basicPanel = document.getElementById('panel-basic');
const advPanel = document.getElementById('panel-advanced');

// Menu Elements
const menuDrawer = document.getElementById('menuDrawer');
const menuOverlay = document.getElementById('menuOverlay');
const savedSongsList = document.getElementById('savedSongsList');
const soundTypeSelect = document.getElementById('soundTypeSelect'); // Fallback if select is used
// Note: Radio buttons are queried dynamically

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

// Inputs Count-in
const countInBox = document.getElementById('countInBox');
const countInCheck = document.getElementById('countInCheck');
const ciBpm = document.getElementById('ciBpm');
const ciBeats = document.getElementById('ciBeats');
const ciValue = document.getElementById('ciValue');
const ciBars = document.getElementById('ciBars');
const ciAccentsContainer = document.getElementById('ciAccentsContainer');

// --- INITIALIZATION ---
loadSettings(); 
initAccordionMenu();
loadVersionFromSW(); 

// DEFAULT STATE
if(sequence.length === 0) {
    sequence = [
        { name: "", bpm: 100, beats: 4, value: 4, bars: 4, accents: [2,0,0,0] }
    ];
}

updateBasicDots(parseInt(beatCountInput.value));
const savedBasicAccents = localStorage.getItem('mikeMetronomeBasicAccents');
if(savedBasicAccents) {
    basicAccents = JSON.parse(savedBasicAccents);
    renderBasicDotsUI(); 
}

initCountInUI();
renderStepList();
renderSavedSongsMenu();

// --- SOUND SETTINGS LOGIC ---
function setSoundType(type) {
    currentSoundType = type;
    localStorage.setItem('mikeMetronomeSoundType', type);
    // Optioneel: speel een testgeluidje af bij klikken
    if(audioContext && audioContext.state === 'running' && !isRunning) {
        // Short preview click (Mid accent freq)
        playSound(1000, audioContext.currentTime);
    }
}

// --- WAKE LOCK FUNCTIONS ---
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

// --- MENU LOGIC ---
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

// --- ACCORDION LOGIC ---
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

// --- VERSION FETCH LOGIC ---
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

// --- LOCAL STORAGE ---
function saveBasicSettings() {
    localStorage.setItem('mikeMetronomeBasicBpm', bpmInput.value);
    localStorage.setItem('mikeMetronomeBasicCount', beatCountInput.value);
    localStorage.setItem('mikeMetronomeBasicValue', beatValueInput.value);
    localStorage.setItem('mikeMetronomeBasicAccents', JSON.stringify(basicAccents));
}

function saveSequence() {
    localStorage.setItem('mikeMetronomeSequence', JSON.stringify(sequence));
}

function saveCountIn() {
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
    
    // Load Sound Setting
    const storedSound = localStorage.getItem('mikeMetronomeSoundType');
    if (storedSound) {
        currentSoundType = storedSound;
    }
    // Update Radio Buttons visually
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
                    step.accents = generateDefaultAccents(step.beats);
                }
                if(step.name === undefined) step.name = "";
            });
        } catch(e) {}
    }
    
    const savedSongsStore = localStorage.getItem('mikeMetronomeSavedSongs');
    if(savedSongsStore) {
        try { savedSequences = JSON.parse(savedSongsStore); } catch(e) { savedSequences = []; }
    }
}

function generateDefaultAccents(count) {
    let arr = [];
    for(let i=0; i<count; i++) {
        if(i===0) arr.push(2); 
        else if(count >= 4 && i === Math.floor(count/2)) arr.push(1); 
        else arr.push(0); 
    }
    return arr;
}

// --- SAVED SEQUENCES LOGIC ---
function resetSequence() {
    if(confirm("Start a new empty sequence? Unsaved changes will be lost.")) {
        sequence = [{ name: "", bpm: 100, beats: 4, value: 4, bars: 4, accents: [2,0,0,0] }];
        countInSettings = { enabled: false, bpm: 100, beats: 4, value: 4, bars: 1, accents: [2,0,0,0] };
        saveSequence();
        saveCountIn();
        renderStepList();
        initCountInUI();
    }
}

function saveCurrentSequence() {
    const name = prompt("Enter a name for this sequence:");
    if(name && name.trim() !== "") {
        const newSong = {
            id: Date.now(),
            name: name.trim(),
            sequence: JSON.parse(JSON.stringify(sequence)),
            countIn: JSON.parse(JSON.stringify(countInSettings))
        };
        savedSequences.push(newSong);
        localStorage.setItem('mikeMetronomeSavedSongs', JSON.stringify(savedSequences));
        renderSavedSongsMenu();
        
        const acc = document.getElementsByClassName("accordion-btn");
        // Open saved songs (index 0) if not open
        if(acc[0] && !acc[0].classList.contains("active")) {
           acc[0].click(); 
        }
        toggleMenu(); 
    }
}

function loadSavedSequence(id) {
    const song = savedSequences.find(s => s.id === id);
    if(song) {
        if(confirm(`Load "${song.name}"? This will replace your current sequence.`)) {
            sequence = JSON.parse(JSON.stringify(song.sequence));
            countInSettings = JSON.parse(JSON.stringify(song.countIn));
            
            saveSequence();
            saveCountIn();
            
            renderStepList();
            initCountInUI();
            
            toggleMenu();
            switchTab('advanced');
        }
    }
}

function deleteSavedSong(id, event) {
    event.stopPropagation(); 
    if(confirm("Are you sure you want to delete this song?")) {
        savedSequences = savedSequences.filter(s => s.id !== id);
        localStorage.setItem('mikeMetronomeSavedSongs', JSON.stringify(savedSequences));
        renderSavedSongsMenu();
    }
}

function renderSavedSongsMenu() {
    savedSongsList.innerHTML = "";
    if(savedSequences.length === 0) {
        savedSongsList.innerHTML = '<p style="font-size: 12px; color:#888; text-align:center; padding: 10px 0;">No songs saved yet</p>';
        return;
    }
    
    savedSequences.forEach(song => {
        const div = document.createElement('div');
        div.className = 'saved-song-item';
        div.onclick = () => loadSavedSequence(song.id);
        div.innerHTML = `
            <span class="saved-song-name">${song.name}</span>
            <button class="delete-song-btn" onclick="deleteSavedSong(${song.id}, event)">×</button>
        `;
        savedSongsList.appendChild(div);
    });
    
    const acc = document.getElementsByClassName("accordion-btn")[0];
    const panel = acc.nextElementSibling;
    if (acc.classList.contains("active")) {
        panel.style.maxHeight = panel.scrollHeight + "px";
    }
}

// --- NAVIGATION LOGIC ---
function switchTab(mode) {
    stopMetronome(); 
    currentMode = mode;
    
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

    if (mode === 'basic') {
        basicPanel.classList.add('active');
        document.querySelector('button[onclick="switchTab(\'basic\')"]').classList.add('active');
    } else {
        advPanel.classList.add('active');
        document.querySelector('button[onclick="switchTab(\'advanced\')"]').classList.add('active');
    }
}

// --- UI LOGIC: COUNT IN ---
function initCountInUI() {
    countInCheck.checked = countInSettings.enabled;
    ciBpm.value = countInSettings.bpm;
    ciBeats.value = countInSettings.beats;
    ciValue.value = countInSettings.value || 4;
    ciBars.value = countInSettings.bars;
    updateCountInDots();
    updateCountInUIState();
}

function toggleCountIn() { saveCountIn(); }

function updateCountInUIState() {
    if(countInSettings.enabled) {
        countInBox.classList.remove('disabled');
        document.getElementById('countInControls').style.opacity = "1";
        document.getElementById('countInControls').style.pointerEvents = "auto";
    } else {
        countInBox.classList.add('disabled');
        document.getElementById('countInControls').style.opacity = "0.3";
        document.getElementById('countInControls').style.pointerEvents = "none";
    }
}

function updateCountInDots() {
    const beats = parseInt(ciBeats.value);
    const oldAccents = countInSettings.accents;
    let newAccents = [];
    for(let i=0; i<beats; i++) {
        if(i < oldAccents.length) newAccents.push(oldAccents[i]);
        else if(i===0) newAccents.push(2);
        else newAccents.push(0);
    }
    countInSettings.accents = newAccents;

    ciAccentsContainer.innerHTML = '';
    countInSettings.accents.forEach((level, i) => {
        const d = document.createElement('div');
        d.className = 'mini-dot';
        d.dataset.level = level;
        d.onclick = () => {
            countInSettings.accents[i] = (countInSettings.accents[i] + 1) % 3;
            d.dataset.level = countInSettings.accents[i];
            localStorage.setItem('mikeMetronomeCountIn', JSON.stringify(countInSettings));
        };
        ciAccentsContainer.appendChild(d);
    });
}

// --- UI LOGIC: BASIC MODE ---
function updateBasicDots(count) {
    count = parseInt(count);
    let oldAccents = [...basicAccents];
    basicAccents = [];
    for (let i = 0; i < count; i++) {
        let level = 0;
        if (i < oldAccents.length) level = oldAccents[i];
        else if (i === 0) level = 2; 
        basicAccents.push(level);
    }
    renderBasicDotsUI();
    saveBasicSettings();
}

function renderBasicDotsUI() {
    beatContainer.innerHTML = '';
    basicAccents.forEach((level, i) => {
        const dot = document.createElement('div');
        dot.className = 'beat-dot';
        dot.dataset.index = i;
        dot.dataset.level = level;
        dot.addEventListener('click', () => {
            let newLevel = (parseInt(dot.dataset.level) + 1) % 3;
            dot.dataset.level = newLevel;
            basicAccents[i] = newLevel;
            saveBasicSettings();
        });
        beatContainer.appendChild(dot);
    });
}

// --- UI LOGIC: ADVANCED STEPS ---
function renderStepList() {
    const container = document.getElementById('stepListContainer');
    container.innerHTML = '';
    
    sequence.forEach((step, index) => {
        const el = document.createElement('div');
        el.className = 'step-item';
        el.id = `step-row-${index}`;
        
        if(!step.accents) step.accents = generateDefaultAccents(step.beats);
        // Ensure name exists
        if(step.name === undefined) step.name = "";
        
        el.innerHTML = `
            <div class="step-header">
                <input type="text" class="step-name-input" value="${step.name}" placeholder="Step ${index + 1}" onchange="updateStep(${index}, 'name', this.value)">
                <button class="delete-btn" onclick="removeStep(${index})">×</button>
            </div>
            <div class="step-inputs">
                <div class="step-input-group">
                    <label>BPM</label>
                    <input type="number" value="${step.bpm}" onchange="updateStep(${index}, 'bpm', this.value)">
                </div>
                <div class="step-input-group">
                    <label>Sig.</label>
                    <div style="display:flex; gap:2px;">
                        <input type="number" value="${step.beats}" onchange="updateStep(${index}, 'beats', this.value)">
                        <select onchange="updateStep(${index}, 'value', this.value)">
                            <option value="4" ${step.value==4?'selected':''}>/4</option>
                            <option value="8" ${step.value==8?'selected':''}>/8</option>
                            <option value="2" ${step.value==2?'selected':''}>/2</option>
                        </select>
                    </div>
                </div>
                <div class="step-input-group">
                    <label>Bars</label>
                    <input type="number" value="${step.bars}" onchange="updateStep(${index}, 'bars', this.value)">
                </div>
            </div>
            <label style="font-size:10px; color:#666;">Accents:</label>
            <div class="step-accents" id="step-accents-${index}"></div>
        `;
        container.appendChild(el);

        const dotsContainer = document.getElementById(`step-accents-${index}`);
        step.accents.forEach((level, beatIdx) => {
            const d = document.createElement('div');
            d.className = 'mini-dot';
            d.dataset.level = level;
            d.onclick = () => toggleStepAccent(index, beatIdx);
            dotsContainer.appendChild(d);
        });
    });
}

function toggleStepAccent(stepIdx, beatIdx) {
    let current = sequence[stepIdx].accents[beatIdx];
    sequence[stepIdx].accents[beatIdx] = (current + 1) % 3;
    renderStepList();
    saveSequence();
}

function addStep() {
    let newBpm = 100;
    if (sequence.length > 0) {
        newBpm = sequence[sequence.length - 1].bpm;
    }
    sequence.push({ name: "", bpm: newBpm, beats: 4, value: 4, bars: 4, accents: [2,0,0,0] });
    renderStepList();
    saveSequence();
}

function removeStep(index) {
    sequence.splice(index, 1);
    renderStepList();
    saveSequence();
}

function updateStep(index, field, value) {
    if(field === 'name') {
        sequence[index][field] = value;
    } else {
        value = parseInt(value);
        sequence[index][field] = value;
    }
    
    if(field === 'beats') {
        const oldAccents = sequence[index].accents;
        let newAccents = [];
        for(let i=0; i<value; i++) {
            if(i < oldAccents.length) newAccents.push(oldAccents[i]);
            else if(i===0) newAccents.push(2);
            else newAccents.push(0);
        }
        sequence[index].accents = newAccents;
        renderStepList(); 
    }
    saveSequence();
}

// --- AUDIO ENGINE ---
function playSound(freq, time) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);

    const type = currentSoundType;
    
    // Map input frequency (from accents) to sound profile
    if (type === 'wood') {
        osc.type = 'triangle';
        if (freq > 1000) osc.frequency.value = 800;      
        else if (freq > 800) osc.frequency.value = 600;  
        else osc.frequency.value = 400;                  

        gain.gain.setValueAtTime(1.0, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
        osc.start(time);
        osc.stop(time + 0.05);

    } else if (type === 'soft') {
        osc.type = 'sine';
        if (freq > 1000) osc.frequency.value = 880;      
        else if (freq > 800) osc.frequency.value = 440;  
        else osc.frequency.value = 220;                  

        gain.gain.setValueAtTime(0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
        osc.start(time);
        osc.stop(time + 0.15);

    } else {
        // Sharp (Default)
        osc.type = 'square'; 
        osc.frequency.value = freq;
        if(freq > 1000) gain.gain.value = 0.8; 
        else if (freq > 800) gain.gain.value = 0.4; 
        else gain.gain.value = 0.2; 

        osc.start(time);
        osc.stop(time + 0.05); 
    }
}

function scheduler() {
    const lookahead = 0.1; 
    while (nextNoteTime < audioContext.currentTime + lookahead) {
        if(!isRunning) return; 

        if (currentMode === 'basic') {
            scheduleBasic();
        } else {
            scheduleAdvanced();
        }
    }
    if (isRunning) timerID = setTimeout(scheduler, 25);
}

function scheduleBasic() {
    const level = basicAccents[currentBeatIndex];
    
    // Frequencies for Sharp/Digital logic (passed to playSound to be mapped if needed)
    let freq = 600; 
    if (level === 2) freq = 1500;
    if (level === 1) freq = 1000;
    
    playSound(freq, nextNoteTime);

    const beatIndexForVisual = currentBeatIndex;
    const timeForVisual = (nextNoteTime - audioContext.currentTime) * 1000;
    setTimeout(() => {
        document.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('playing'));
        const dot = beatContainer.children[beatIndexForVisual];
        if(dot) dot.classList.add('playing');
    }, timeForVisual);

    const bpm = parseFloat(bpmInput.value);
    const den = parseInt(beatValueInput.value);
    const secondsPerBeat = 60.0 / (bpm * (den / 4));
    
    nextNoteTime += secondsPerBeat;
    
    currentBeatIndex++;
    if (currentBeatIndex >= basicAccents.length) currentBeatIndex = 0;
}

function scheduleAdvanced() {
    const currentBeatVis = advBeatCounter; 

    // --- PHASE 0: COUNT IN ---
    if (playPhase === 0) {
        const step = countInSettings;
        let level = step.accents[advBeatCounter];
        
        let freq = 600;
        if(level === 2) freq = 1500;
        if(level === 1) freq = 1000;
        
        playSound(freq, nextNoteTime);

        const curBar = advBarCounter;
        const timeForVisual = (nextNoteTime - audioContext.currentTime) * 1000;
        
        setTimeout(() => {
            document.querySelectorAll('.mini-dot').forEach(d => d.classList.remove('playing'));

            countInBox.classList.add('active');
            document.querySelectorAll('.step-item').forEach(el => el.classList.remove('active'));
            
            advStepName.textContent = `Count-in`;
            advBarCountEl.textContent = `Bar ${curBar} / ${step.bars}`;
            
            if(ciAccentsContainer.children[currentBeatVis]) {
                ciAccentsContainer.children[currentBeatVis].classList.add('playing');
            }

            if(level === 2) {
                  advBarCountEl.style.color = "#03dac6";
                  setTimeout(()=>advBarCountEl.style.color="#fff", 100);
            }
        }, timeForVisual);

        const secondsPerBeat = 60.0 / (step.bpm * (step.value / 4)); 
        nextNoteTime += secondsPerBeat;

        advBeatCounter++;
        if(advBeatCounter >= step.beats) {
            advBeatCounter = 0;
            advBarCounter++;
            if(advBarCounter > step.bars) {
                playPhase = 1; 
                currentStepIndex = 0;
                advBarCounter = 1;
                advBeatCounter = 0;
            }
        }
        return;
    }

    // --- PHASE 1: SEQUENCE ---
    if (currentStepIndex >= sequence.length) {
        if(isRepeatEnabled) {
            playPhase = 1;
            currentStepIndex = 0;
            advBarCounter = 1;
            advBeatCounter = 0;
        } else {
            stopMetronome();
            return;
        }
    }

    if(sequence.length === 0) { stopMetronome(); return; }

    const step = sequence[currentStepIndex];
    
    let accentLevel = 0;
    if(step.accents && step.accents[advBeatCounter] !== undefined) {
        accentLevel = step.accents[advBeatCounter];
    }
    
    let freq = 600;
    if (accentLevel === 2) freq = 1500;
    if (accentLevel === 1) freq = 1000;

    playSound(freq, nextNoteTime);

    const currentStepIdxVis = currentStepIndex;
    const currentBarVis = advBarCounter;
    const timeForVisual = (nextNoteTime - audioContext.currentTime) * 1000;
    
    setTimeout(() => {
        document.querySelectorAll('.mini-dot').forEach(d => d.classList.remove('playing'));

        countInBox.classList.remove('active');
        document.querySelectorAll('.step-item').forEach(el => el.classList.remove('active'));
        
        const activeRow = document.getElementById(`step-row-${currentStepIdxVis}`);
        if(activeRow) {
            activeRow.classList.add('active');
            activeRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        
        let displayName = step.name ? `${step.name} (Step ${currentStepIdxVis + 1})` : `Step ${currentStepIdxVis + 1} / ${sequence.length}`;
        advStepName.textContent = displayName;
        advBarCountEl.textContent = `Bar ${currentBarVis} / ${step.bars}`;
        
        const stepDotsContainer = document.getElementById(`step-accents-${currentStepIdxVis}`);
        if(stepDotsContainer && stepDotsContainer.children[currentBeatVis]) {
            stepDotsContainer.children[currentBeatVis].classList.add('playing');
        }

        if (accentLevel === 2) {
            advBarCountEl.style.color = "#03dac6";
            setTimeout(()=>advBarCountEl.style.color="#fff", 100);
        }
    }, timeForVisual);

    const secondsPerBeat = 60.0 / (step.bpm * (step.value / 4));
    nextNoteTime += secondsPerBeat;

    advBeatCounter++;
    if (advBeatCounter >= step.beats) {
        advBeatCounter = 0;
        advBarCounter++;
        if (advBarCounter > step.bars) {
            currentStepIndex++;
            advBarCounter = 1;
            advBeatCounter = 0;
        }
    }
}

// --- START / STOP ---
function stopMetronome() {
    clearTimeout(timerID);
    isRunning = false;
    
    mainBtn.textContent = "START";
    mainBtn.classList.remove('stop');
    document.querySelectorAll('.beat-dot').forEach(d => d.classList.remove('playing'));
    document.querySelectorAll('.mini-dot').forEach(d => d.classList.remove('playing'));
    
    advStatus.style.display = 'none';
    document.querySelectorAll('.step-item').forEach(el => el.classList.remove('active'));
    countInBox.classList.remove('active');

    releaseWakeLock();
}

mainBtn.addEventListener('click', () => {
    if (isRunning) {
        stopMetronome();
    } else {
        if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') audioContext.resume();

        currentBeatIndex = 0;
        
        if(currentMode === 'advanced') {
            advStatus.style.display = 'block';
            if(countInSettings.enabled) {
                playPhase = 0; 
            } else {
                playPhase = 1; 
            }
            currentStepIndex = 0;
            advBarCounter = 1;
            advBeatCounter = 0;
        }

        nextNoteTime = audioContext.currentTime + 0.05;
        isRunning = true;
        mainBtn.textContent = "STOP";
        mainBtn.classList.add('stop');

        requestWakeLock();
        scheduler();
    }
});

// --- SERVICE WORKER ---
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").then((registration) => {
            console.log("Service Worker geregistreerd met scope:", registration.scope);

            if (registration.waiting) {
                notifyUserOfUpdate(registration.waiting);
            }

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        notifyUserOfUpdate(newWorker);
                    }
                });
            });
        }).catch((err) => {
            console.log("Service Worker registratie mislukt:", err);
        });
    });

    function notifyUserOfUpdate(worker) {
        if (confirm("A new version of the Mike's Metronome app is available. Do you want to reload now?")) {
            worker.postMessage({ action: 'skipWaiting' });
        }
    }

    let refreshing;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        window.location.reload();
        refreshing = true;
    });
}
