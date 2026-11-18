// ============================================================
// SMART STUDY PLANNER — FRONTEND LOGIC
// ============================================================
// Phase 3: Form handling, API calls, results rendering
// Phase 4: Countdown timers, Chart.js, CSV download
// ============================================================


// --- DOM Elements ---
const subjectCountInput = document.getElementById("subject-count");
const stepperMinus = document.getElementById("stepper-minus");
const stepperPlus = document.getElementById("stepper-plus");
const subjectsContainer = document.getElementById("subjects-container");
const studyForm = document.getElementById("study-form");
const dailyHoursInput = document.getElementById("daily-hours");
const hoursDisplay = document.getElementById("hours-display");
const generateBtn = document.getElementById("generate-btn");
const errorBanner = document.getElementById("error-banner");
const errorMessages = document.getElementById("error-messages");
const errorClose = document.getElementById("error-close");
const resultsSection = document.getElementById("results-section");


// --- State ---
let countdownInterval = null;   // Stores the setInterval ID for live exam timers
let liveBreakInterval = null;   // Stores the setInterval ID for live break reminders
let chartInstance = null;       // Stores the Chart.js instance (so we can destroy + recreate)
let breakdownChartInstance = null; // Stores the breakdown chart instance
let currentPlanData = null;     // Stores the latest plan for CSV download


// --- Initialize ---
function getDefaultExamDateStr(daysFromNow = 30) {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    return d.toISOString().slice(0, 10);
}

function getChtPresetSubjects() {
    const examDate = getDefaultExamDateStr(30);
    return [
        { name: "計算機概論 (含網路/雲端/資安)", difficulty: "hard", exam_date: examDate, is_weak: true },
        { name: "專案管理 (PMBOK/CPM/EVM)", difficulty: "hard", exam_date: examDate, is_weak: true },
        { name: "行銷學 (STP/4P/CRM數位行銷)", difficulty: "medium", exam_date: examDate, is_weak: false },
        { name: "英文 (字彙/克漏字/閱讀)", difficulty: "medium", exam_date: examDate, is_weak: false },
        { name: "邏輯推理 (數列/圖形/語文邏輯)", difficulty: "easy", exam_date: examDate, is_weak: false },
    ];
}

function applyChtPreset() {
    const presets = getChtPresetSubjects();
    subjectCountInput.value = presets.length;
    subjectsContainer.innerHTML = "";
    presets.forEach((data, i) => {
        const card = createSubjectCard(i + 1, data);
        subjectsContainer.appendChild(card);
    });
    initInteractiveCards();
}

document.addEventListener("DOMContentLoaded", () => {
    applyChtPreset();
    updateHoursDisplay();
    initInteractiveCards(); // Initialize 3D effects on initial cards
    initScrollReveal();     // Initialize scroll reveal observer

    const chtPresetBtn = document.getElementById("cht-preset-btn");
    if (chtPresetBtn) {
        chtPresetBtn.addEventListener("click", () => {
            applyChtPreset();
        });
    }
});


// --- Stepper Controls ---
stepperMinus.addEventListener("click", () => {
    const current = parseInt(subjectCountInput.value);
    if (current > 1) {
        subjectCountInput.value = current - 1;
        renderSubjectCards(current - 1);
    }
});

stepperPlus.addEventListener("click", () => {
    const current = parseInt(subjectCountInput.value);
    if (current < 10) {
        subjectCountInput.value = current + 1;
        renderSubjectCards(current + 1);
    }
});


// --- Render Subject Cards ---
function renderSubjectCards(count) {
    const existing = subjectsContainer.querySelectorAll(".subject-card");
    const existingData = [];

    existing.forEach(card => {
        existingData.push({
            name: card.querySelector(".subject-name-input").value,
            difficulty: card.querySelector(".subject-difficulty-select").value,
            exam_date: card.querySelector(".subject-date-input").value,
            is_weak: card.querySelector(".subject-weak-checkbox").checked,
        });
    });

    subjectsContainer.innerHTML = "";

    for (let i = 0; i < count; i++) {
        const data = existingData[i] || { name: "", difficulty: "medium", exam_date: "", is_weak: false };
        const card = createSubjectCard(i + 1, data);
        subjectsContainer.appendChild(card);
    }
}

function createSubjectCard(index, data) {
    const card = document.createElement("div");
    card.className = "subject-card";
    card.style.animationDelay = `${index * 0.05}s`;

    card.innerHTML = `
        <div class="subject-card-header">
            <span class="subject-number">Subject ${index}</span>
        </div>
        <div>
            <input type="text" class="subject-input subject-name-input"
                   placeholder="e.g. Mathematics" value="${escapeHtml(data.name)}"
                   id="subject-name-${index}" aria-label="Subject ${index} name">
        </div>
        <div>
            <select class="subject-select subject-difficulty-select"
                    id="subject-difficulty-${index}" aria-label="Subject ${index} difficulty">
                <option value="easy" ${data.difficulty === "easy" ? "selected" : ""}>Easy</option>
                <option value="medium" ${data.difficulty === "medium" ? "selected" : ""}>Medium</option>
                <option value="hard" ${data.difficulty === "hard" ? "selected" : ""}>Hard</option>
            </select>
        </div>
        <div>
            <input type="date" class="subject-input subject-date-input"
                   value="${data.exam_date}" id="subject-date-${index}"
                   aria-label="Subject ${index} exam date">
        </div>
        <div>
            <label class="weak-label">
                <input type="checkbox" class="weak-checkbox subject-weak-checkbox"
                       ${data.is_weak ? "checked" : ""} id="subject-weak-${index}">
                Weak subject
            </label>
        </div>
    `;

    return card;
}


// --- Hours Slider ---
dailyHoursInput.addEventListener("input", updateHoursDisplay);

function updateHoursDisplay() {
    const val = parseFloat(dailyHoursInput.value);
    hoursDisplay.textContent = val === 1 ? "1 hr" : `${val} hrs`;
}


// --- Form Submission ---
studyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const subjects = collectSubjects();
    const dailyHours = parseFloat(dailyHoursInput.value);
    const preferredTime = document.querySelector('input[name="preferred-time"]:checked').value;

    setBtnLoading(true);

    try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei";
        const response = await fetch("/generate-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                subjects: subjects,
                daily_hours: dailyHours,
                preferred_time: preferredTime,
                focus_minutes: flowTimerState.focusDuration,
                timezone: userTimezone,
            }),
        });

        const result = await response.json();

        if (!response.ok || result.error) {
            const errors = Array.isArray(result.error) ? result.error : [result.error];
            showError(errors);
            return;
        }

        // Store the plan data for CSV / .ics download
        currentPlanData = result.plan;

        displayResults(result.plan, false);
        saveStudyStateLocal(subjects, dailyHours, preferredTime, result.plan);
        syncFlowStateToBackend();

    } catch (err) {
        showError(["Failed to connect to server. Make sure the Flask app is running."]);
    } finally {
        setBtnLoading(false);
    }
});


// --- Collect Form Data ---
function collectSubjects() {
    const cards = subjectsContainer.querySelectorAll(".subject-card");
    const subjects = [];

    cards.forEach(card => {
        subjects.push({
            name: card.querySelector(".subject-name-input").value.trim(),
            difficulty: card.querySelector(".subject-difficulty-select").value,
            exam_date: card.querySelector(".subject-date-input").value,
            is_weak: card.querySelector(".subject-weak-checkbox").checked,
        });
    });

    return subjects;
}


// ============================================================
// RESULTS DISPLAY
// ============================================================

function displayResults(plan, isRestoring = false) {
    initFlowOSWithPlan(plan, isRestoring);
    renderCountdownTimers(plan.priority_ranking);
    renderPriorityTable(plan.priority_ranking);
    renderTimetable(plan.daily_timetable);
    renderSuggestions(plan.suggestions);
    renderWeeklyPlan(plan.weekly_plan);
    renderDistributionChart(plan.priority_ranking);
    renderBreakdownChart(plan.priority_ranking);
    renderBreaks(plan.breaks);

    resultsSection.style.display = "block";
    
    setTimeout(() => {
        resultsSection.classList.add("show-results");
        if (!isRestoring) {
            resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        initInteractiveCards(); // Initialize effects on newly rendered result cards
        triggerSuccessCelebration();
    }, 50);

    startLiveBreakTimer(plan.breaks);
}


// ============================================================
// PHASE 4 — EXAM COUNTDOWN TIMERS
// ============================================================

function renderCountdownTimers(ranking) {
    const grid = document.getElementById("countdowns-grid");
    grid.innerHTML = "";

    // Clear any previous interval
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }

    ranking.forEach((s, i) => {
        const item = document.createElement("div");
        item.className = "countdown-item";
        item.style.animationDelay = `${i * 0.08}s`;
        item.setAttribute("data-exam-date", s.exam_date);
        item.id = `countdown-${i}`;

        // Format the exam date for display
        const examDate = new Date(s.exam_date + "T00:00:00");
        const formattedDate = examDate.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
        });

        item.innerHTML = `
            <div class="countdown-header">
                <div class="countdown-subject">
                    ${escapeHtml(s.name)}
                </div>
                <span class="countdown-exam-date">Exam: ${formattedDate}</span>
            </div>
            <div class="countdown-timer" id="countdown-timer-${i}">
                <!-- Populated by updateCountdowns() -->
            </div>
            <div class="countdown-progress">
                <div class="countdown-progress-fill" id="countdown-progress-${i}"></div>
            </div>
        `;

        grid.appendChild(item);
    });

    // Initial render + start ticking every second
    updateCountdowns(ranking);
    countdownInterval = setInterval(() => updateCountdowns(ranking), 1000);
}


function updateCountdowns(ranking) {
    const now = new Date();

    ranking.forEach((s, i) => {
        const timerEl = document.getElementById(`countdown-timer-${i}`);
        const progressEl = document.getElementById(`countdown-progress-${i}`);
        const itemEl = document.getElementById(`countdown-${i}`);

        if (!timerEl || !progressEl || !itemEl) return;

        const examDate = new Date(s.exam_date + "T23:59:59");
        const diff = examDate - now;

        // Determine urgency class
        const daysLeft = diff / (1000 * 60 * 60 * 24);
        let urgencyClass;
        if (daysLeft <= 0) {
            urgencyClass = "urgency-urgent";
        } else if (daysLeft <= 3) {
            urgencyClass = "urgency-urgent";
        } else if (daysLeft <= 7) {
            urgencyClass = "urgency-moderate";
        } else {
            urgencyClass = "urgency-relaxed";
        }

        // Update item urgency border
        itemEl.className = "countdown-item";
        if (daysLeft <= 0) {
            itemEl.classList.add("exam-today");
        } else {
            itemEl.classList.add(urgencyClass);
        }

        if (diff <= 0) {
            // Exam is today or has passed
            timerEl.innerHTML = `<div class="countdown-exam-today-text">EXAM TODAY!</div>`;
            progressEl.style.width = "100%";
            progressEl.className = "countdown-progress-fill urgency-urgent";
            return;
        }

        // Calculate days, hours, minutes, seconds
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        timerEl.innerHTML = `
            <div class="countdown-unit">
                <span class="countdown-value ${urgencyClass}">${String(days).padStart(2, "0")}</span>
                <span class="countdown-label">Days</span>
            </div>
            <span class="countdown-separator">:</span>
            <div class="countdown-unit">
                <span class="countdown-value ${urgencyClass}">${String(hours).padStart(2, "0")}</span>
                <span class="countdown-label">Hours</span>
            </div>
            <span class="countdown-separator">:</span>
            <div class="countdown-unit">
                <span class="countdown-value ${urgencyClass}">${String(minutes).padStart(2, "0")}</span>
                <span class="countdown-label">Min</span>
            </div>
            <span class="countdown-separator">:</span>
            <div class="countdown-unit">
                <span class="countdown-value ${urgencyClass}">${String(seconds).padStart(2, "0")}</span>
                <span class="countdown-label">Sec</span>
            </div>
        `;

        // Progress bar: from today to exam date
        // Calculate how much of the total prep time has elapsed
        // We approximate "total time" as 30 days before the exam
        const totalPrepMs = 30 * 24 * 60 * 60 * 1000;
        const elapsed = totalPrepMs - diff;
        const progressPercent = Math.max(0, Math.min(100, (elapsed / totalPrepMs) * 100));

        progressEl.style.width = `${progressPercent}%`;
        progressEl.className = `countdown-progress-fill ${urgencyClass}`;
    });
}


// ============================================================
// PHASE 4 — CHART.JS PIE/DOUGHNUT CHART
// ============================================================

// Curated color palette for the chart — vibrant, distinct colors
const CHART_COLORS = [
    "#818cf8", // Indigo
    "#f472b6", // Pink
    "#34d399", // Emerald
    "#fbbf24", // Amber
    "#38bdf8", // Sky
    "#fb923c", // Orange
    "#a78bfa", // Violet
    "#f87171", // Red
    "#2dd4bf", // Teal
    "#e879f9", // Fuchsia
];


function renderDistributionChart(ranking) {
    const canvas = document.getElementById("distribution-chart");
    const legendContainer = document.getElementById("chart-legend");

    // Destroy previous chart if it exists
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }

    const labels = ranking.map(s => s.name);
    const data = ranking.map(s => s.allocated_hours);
    const colors = ranking.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

    chartInstance = new Chart(canvas, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: function(context) {
                    const chart = context.chart;
                    const {ctx, chartArea} = chart;
                    
                    if (!chartArea) {
                        // This case happens on initial chart load
                        return null;
                    }
                    const colorIndex = context.dataIndex % CHART_COLORS.length;
                    const baseColor = CHART_COLORS[colorIndex];
                    
                    // Create a gradient to give a 3D cylindrical feel
                    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                    gradient.addColorStop(0, adjustColor(baseColor, 30));  // Lighter at top
                    gradient.addColorStop(0.5, baseColor);
                    gradient.addColorStop(1, adjustColor(baseColor, -30)); // Darker at bottom
                    return gradient;
                },
                borderColor: "rgba(10, 10, 26, 0.9)",
                borderWidth: 4,
                hoverBorderColor: "#fff",
                hoverBorderWidth: 3,
                hoverOffset: 15,
                // Add an inner shadow effect
                shadowOffsetX: 3,
                shadowOffsetY: 3,
                shadowBlur: 10,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
            }],
        },
        plugins: [{
            id: 'customShadow',
            beforeDraw: (chart) => {
                const ctx = chart.ctx;
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
                ctx.shadowBlur = 15;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 8;
            },
            afterDraw: (chart) => {
                chart.ctx.restore();
            }
        }],
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: "62%",
            plugins: {
                legend: {
                    display: false, // We use a custom legend below
                },
                tooltip: {
                    backgroundColor: "rgba(17, 17, 40, 0.95)",
                    titleColor: "#e8e8f0",
                    bodyColor: "#9898b0",
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    titleFont: { family: "'Inter', sans-serif", weight: "700" },
                    bodyFont: { family: "'Inter', sans-serif" },
                    callbacks: {
                        label: function(context) {
                            const hours = context.parsed;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = ((hours / total) * 100).toFixed(1);
                            return ` ${hours}h (${pct}%)`;
                        },
                    },
                },
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 1200,
                easing: "easeOutQuart",
            },
        },
    });

    // Build custom legend
    legendContainer.innerHTML = "";
    ranking.forEach((s, i) => {
        const color = CHART_COLORS[i % CHART_COLORS.length];
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML = `
            <span class="legend-dot" style="background: ${color}"></span>
            <span>${escapeHtml(s.name)}</span>
            <span class="legend-hours">${s.allocated_hours}h (${s.percentage}%)</span>
        `;
        legendContainer.appendChild(item);
    });
}


let barChartInstance = null;

function renderBreakdownChart(ranking) {
    const canvas = document.getElementById("breakdown-chart");
    if (!canvas) return;

    if (barChartInstance) {
        barChartInstance.destroy();
        barChartInstance = null;
    }

    const labels = ranking.map(s => s.name);
    
    // Extract the individual components of the score (which we added to the python backend)
    // If the backend doesn't provide these, we'll gracefully fallback
    const difficultyData = ranking.map(s => s.difficulty_component !== undefined ? s.difficulty_component : 0);
    const urgencyData = ranking.map(s => s.urgency_component !== undefined ? s.urgency_component : 0);
    const weaknessData = ranking.map(s => s.weakness_component !== undefined ? s.weakness_component : 0);

    // Helper function to create 3D bar gradient
    function createBarGradient(ctx, chartArea, baseColor) {
        if (!chartArea) return baseColor;
        const gradient = ctx.createLinearGradient(chartArea.left, 0, chartArea.right, 0);
        gradient.addColorStop(0, adjustColor(baseColor, -20)); // Darker left
        gradient.addColorStop(0.5, baseColor); // Base middle
        gradient.addColorStop(1, adjustColor(baseColor, 30));  // Lighter right
        return gradient;
    }

    barChartInstance = new Chart(canvas, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Exam Urgency",
                    data: urgencyData,
                    backgroundColor: function(context) {
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        return createBarGradient(ctx, chartArea, "#f87171");
                    },
                    borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 },
                    borderWidth: 1,
                    borderColor: "rgba(0,0,0,0.2)",
                },
                {
                    label: "Difficulty",
                    data: difficultyData,
                    backgroundColor: function(context) {
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        return createBarGradient(ctx, chartArea, "#fbbf24");
                    },
                    borderRadius: 0,
                    borderWidth: 1,
                    borderColor: "rgba(0,0,0,0.2)",
                },
                {
                    label: "Weakness",
                    data: weaknessData,
                    backgroundColor: function(context) {
                        const chart = context.chart;
                        const {ctx, chartArea} = chart;
                        return createBarGradient(ctx, chartArea, "#818cf8");
                    },
                    borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
                    borderWidth: 1,
                    borderColor: "rgba(0,0,0,0.2)",
                }
            ],
        },
        plugins: [{
            id: 'customShadow',
            beforeDraw: (chart) => {
                const ctx = chart.ctx;
                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                ctx.shadowBlur = 8;
                ctx.shadowOffsetX = 3;
                ctx.shadowOffsetY = 4;
            },
            afterDraw: (chart) => {
                chart.ctx.restore();
            }
        }],
        options: {
            responsive: true,
            maintainAspectRatio: false, // Important: allows the chart to stretch to wrapper height
            scales: {
                x: {
                    stacked: true,
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: { color: "#9898b0", font: { family: "'Inter', sans-serif" } }
                },
                y: {
                    stacked: true,
                    grid: { color: "rgba(255, 255, 255, 0.05)" },
                    ticks: { color: "#9898b0", font: { family: "'Inter', sans-serif" } },
                    title: { display: true, text: "Score Contribution", color: "#6b6b85" }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: "#9898b0", usePointStyle: true, padding: 20, font: { family: "'Inter', sans-serif" } }
                },
                tooltip: {
                    backgroundColor: "rgba(17, 17, 40, 0.95)",
                    titleColor: "#e8e8f0",
                    bodyColor: "#9898b0",
                    borderColor: "rgba(255, 255, 255, 0.1)",
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    mode: 'index',
                    intersect: false,
                },
            },
            animation: {
                duration: 1200,
                easing: "easeOutQuart",
            },
        },
    });
    
    // Force a specific height for the wrapper so the chart has room
    canvas.parentElement.style.height = "300px";
}


// ============================================================
// PHASE 4 — .ICS CALENDAR & CSV DOWNLOAD
// ============================================================

const icsDownloadBtn = document.getElementById("ics-download-btn");
if (icsDownloadBtn) {
    icsDownloadBtn.addEventListener("click", () => {
        if (!currentPlanData) return;
        downloadICS(currentPlanData);
    });
}

document.getElementById("csv-download-btn").addEventListener("click", () => {
    if (!currentPlanData) return;
    downloadCSV(currentPlanData);
});

document.getElementById("print-btn").addEventListener("click", () => {
    window.print();
});

async function downloadICS(plan) {
    try {
        if (plan.calendar_ics_b64) {
            const binaryStr = atob(plan.calendar_ics_b64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: "text/calendar;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `study_schedule_${new Date().toISOString().slice(0, 10)}.ics`;
            link.click();
            URL.revokeObjectURL(url);
            return;
        }

        // Fallback API call to /export-ics
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Taipei";
        const response = await fetch("/export-ics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                plan: plan,
                daily_hours: parseFloat(dailyHoursInput.value),
                preferred_time: document.querySelector('input[name="preferred-time"]:checked').value,
                focus_minutes: flowTimerState.focusDuration,
                timezone: userTimezone,
            }),
        });
        if (!response.ok) throw new Error("Export failed");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `study_schedule_${new Date().toISOString().slice(0, 10)}.ics`;
        link.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        showError(["匯出 .ics 行事曆失敗：" + err.message]);
    }
}


function downloadCSV(plan) {
    const rows = [];

    // --- Section 1: Priority Ranking ---
    rows.push(["=== PRIORITY RANKING ==="]);
    rows.push(["Rank", "Subject", "Priority", "Score", "Hours", "Pomodoros", "Percentage", "Exam In (days)", "Difficulty", "Weak"]);
    plan.priority_ranking.forEach((s, i) => {
        rows.push([
            i + 1,
            s.name,
            s.priority_level,
            s.priority_score,
            s.allocated_hours,
            s.pomodoros || Math.ceil((s.allocated_hours * 60) / flowTimerState.focusDuration),
            `${s.percentage}%`,
            s.days_until_exam,
            s.difficulty,
            s.is_weak ? "Yes" : "No",
        ]);
    });

    rows.push([]); // Blank separator

    // --- Section 2: Daily Timetable ---
    rows.push(["=== DAILY TIMETABLE ==="]);
    rows.push(["Time", "Subject", "Duration (hours)", "Pomodoros", "Type"]);
    plan.daily_timetable.forEach(slot => {
        rows.push([
            slot.time,
            slot.subject,
            slot.duration,
            slot.pomodoros || 0,
            slot.is_break ? "Break" : "Study",
        ]);
    });

    rows.push([]);

    // --- Section 3: Suggestions ---
    rows.push(["=== SUGGESTIONS ==="]);
    rows.push(["Suggestion"]);
    plan.suggestions.forEach(s => {
        // Strip markdown bold markers for CSV
        rows.push([s.replace(/\*\*/g, "")]);
    });

    rows.push([]);

    // --- Section 4: Weekly Plan ---
    rows.push(["=== WEEKLY PLAN ==="]);
    rows.push(["Day", "Subject", "Hours", "Pomodoros"]);
    plan.weekly_plan.forEach(day => {
        day.subjects.forEach(s => {
            rows.push([day.day, s.name, s.hours, s.pomodoros || Math.ceil((s.hours * 60) / flowTimerState.focusDuration)]);
        });
    });

    rows.push([]);

    // --- Section 5: Breaks ---
    rows.push(["=== BREAK SCHEDULE ==="]);
    rows.push(["Time", "Tip"]);
    plan.breaks.forEach(b => {
        rows.push([b.time, b.tip]);
    });

    // Convert to CSV string
    const csvContent = rows.map(row =>
        row.map(cell => {
            const str = String(cell);
            // Escape quotes and wrap in quotes if contains comma/quote/newline
            if (str.includes(",") || str.includes('"') || str.includes("\n")) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        }).join(",")
    ).join("\n");

    // Trigger download
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `study_plan_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}


// ============================================================
// EXISTING RESULT RENDERERS (Phase 3)
// ============================================================

// --- Priority Ranking Table ---
function renderPriorityTable(ranking) {
    const tbody = document.getElementById("priority-body");
    tbody.innerHTML = "";

    ranking.forEach((s, i) => {
        const priorityClass = s.priority_level.toLowerCase();
        const daysClass = s.days_until_exam <= 3 ? "urgent" :
                          s.days_until_exam <= 7 ? "moderate" : "relaxed";
        const daysText = s.days_until_exam === 0 ? "TODAY" : `${s.days_until_exam}d`;
        const pomodoros = s.pomodoros || Math.max(1, Math.ceil((s.allocated_hours * 60) / flowTimerState.focusDuration));

        const tr = document.createElement("tr");
        tr.style.animationDelay = `${i * 0.05}s`;

        tr.innerHTML = `
            <td><span class="rank-badge">${i + 1}</span></td>
            <td><strong>${escapeHtml(s.name)}</strong></td>
            <td><span class="priority-badge ${priorityClass}">${s.priority_level}</span></td>
            <td>
                <div class="score-bar-wrapper">
                    <div class="score-bar">
                        <div class="score-bar-fill" style="width: ${s.priority_score}%"></div>
                    </div>
                    <span class="score-text">${s.priority_score}</span>
                </div>
            </td>
            <td><span class="hours-text">${s.allocated_hours}h</span></td>
            <td><span class="pomodoro-pill">🍅 ${pomodoros} 顆</span></td>
            <td><span class="days-text ${daysClass}">${daysText}</span></td>
        `;

        tbody.appendChild(tr);
    });
}


// --- Daily Timetable ---
function renderTimetable(timetable) {
    const grid = document.getElementById("timetable-grid");
    grid.innerHTML = "";

    timetable.forEach((slot, i) => {
        const div = document.createElement("div");
        div.className = `timetable-slot ${slot.is_break ? "break-slot" : ""}`;
        div.style.animationDelay = `${i * 0.04}s`;

        const durationMin = Math.round(slot.duration * 60);
        const durationText = durationMin >= 60
            ? `${Math.floor(durationMin / 60)}h ${durationMin % 60}m`
            : `${durationMin}m`;
        const pomoBadge = !slot.is_break && slot.pomodoros
            ? `<span class="slot-pomo-badge">🍅 ${slot.pomodoros} 顆</span>`
            : "";

        div.innerHTML = `
            <span class="slot-time">${escapeHtml(slot.time)}</span>
            <span class="slot-subject">${escapeHtml(slot.subject)} ${pomoBadge}</span>
            <span class="slot-duration">${durationText}</span>
        `;

        grid.appendChild(div);
    });
}


// --- Suggestions ---
function renderSuggestions(suggestions) {
    const list = document.getElementById("suggestions-list");
    list.innerHTML = "";

    suggestions.forEach((text, i) => {
        const div = document.createElement("div");
        div.className = "suggestion-item";
        div.style.animationDelay = `${i * 0.05}s`;
        div.innerHTML = formatMarkdownBold(escapeHtml(text));
        list.appendChild(div);
    });
}


// --- Weekly Plan ---
function renderWeeklyPlan(weekly) {
    const grid = document.getElementById("weekly-grid");
    if (!grid || !Array.isArray(weekly)) return;
    grid.innerHTML = "";

    const todayISO = getLocalDateISO();
    const todayWeekday = getWeekdayNameFromISO(todayISO);

    weekly.forEach((day, i) => {
        const totalHours = day.subjects.reduce((sum, s) => sum + s.hours, 0);
        const totalPomos = day.subjects.reduce((sum, s) => sum + (s.pomodoros || Math.max(1, Math.ceil((s.hours * 60) / flowTimerState.focusDuration))), 0);

        let intensityClass = "intensity-low";
        if (totalHours > 8) intensityClass = "intensity-max";
        else if (totalHours > 5) intensityClass = "intensity-high";
        else if (totalHours > 3) intensityClass = "intensity-medium";

        const isTodayDynamic = day.date ? day.date === todayISO : day.day === todayWeekday;
        const isSelectedDay = day.date
            ? day.date === flowTimerState.activeDateStr
            : day.day === getWeekdayNameFromISO(flowTimerState.activeDateStr);
        const rec = day.date ? flowTimerState.dailyRecords[day.date] : null;
        const isCheckedIn = Boolean(rec && rec.checkedIn);
        const zhDay = WEEKDAY_ZH_SHORT[day.day] || day.day;
        const dateLabel = day.date ? formatMonthDaySlash(day.date) : "";

        const card = document.createElement("div");
        card.className = `day-card ${isTodayDynamic ? "today" : ""} ${isSelectedDay ? "active-plan-day" : ""} ${isCheckedIn ? "checked-in-day" : ""} ${intensityClass}`;
        card.style.animationDelay = `${i * 0.06}s`;
        card.style.cursor = "pointer";
        card.title = `點擊切換至 ${zhDay} (${dateLabel}) 的番茄鐘課表`;

        let subjectsHtml = "";
        day.subjects.forEach((s, idx) => {
            const pCount = s.pomodoros || Math.max(1, Math.ceil((s.hours * 60) / flowTimerState.focusDuration));
            const doneCount = rec && rec.subjectsMap && typeof rec.subjectsMap[s.name] === "number" ? rec.subjectsMap[s.name] : 0;
            const subjDone = doneCount >= pCount;
            subjectsHtml += `
                <div class="day-subject-item ${subjDone ? "day-subj-done" : ""}">
                    <span class="day-subject-name">${idx === 0 ? "⭐ " : ""}${escapeHtml(s.name)}</span>
                    <span class="day-subject-hours">${s.hours}h (🍅${doneCount}/${pCount})</span>
                </div>
            `;
        });

        card.innerHTML = `
            <div class="day-name">
                <span>${zhDay} ${escapeHtml(day.day)} ${dateLabel ? `<small style="opacity:0.75;">(${dateLabel})</small>` : ""}</span>
                <span style="display:flex; gap:4px; align-items:center;">
                    ${isCheckedIn ? '<span class="today-badge" style="background:rgba(16,185,129,0.25);color:#6ee7b7;border-color:#34d399;">✅ 已完成</span>' : ""}
                    ${isTodayDynamic ? '<span class="today-badge">TODAY</span>' : ""}
                </span>
            </div>
            <div class="day-subjects">${subjectsHtml}</div>
            <div class="day-footer" style="margin-top: 10px; font-size: 0.75rem; color: var(--text-muted); display: flex; justify-content: space-between; align-items: center;">
                <span style="color:#38bdf8;">${isSelectedDay ? "🎯 目前顯示中" : "點擊切換此日 👉"}</span>
                <span>Total: ${totalHours.toFixed(1)}h · 🍅 ${totalPomos} 顆</span>
            </div>
        `;

        card.addEventListener("click", () => {
            if (day.date) {
                switchActiveScheduleDate(day.date);
            }
        });

        grid.appendChild(card);
    });
}


// --- Breaks ---
function renderBreaks(breaks) {
    const list = document.getElementById("breaks-list");
    list.innerHTML = "";

    if (breaks.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No breaks needed for short study sessions.</p>';
        return;
    }

    breaks.forEach((b, i) => {
        const div = document.createElement("div");
        div.className = "break-item";
        div.style.animationDelay = `${i * 0.06}s`;

        div.innerHTML = `
            <span class="break-time">${escapeHtml(b.time)}</span>
            <span class="break-tip">${escapeHtml(b.tip)}</span>
        `;

        list.appendChild(div);
    });
}

function startLiveBreakTimer(breaks) {
    const banner = document.getElementById("live-break-banner");
    const timerText = document.getElementById("break-timer-text");
    const tipText = document.getElementById("break-banner-tip");

    if (liveBreakInterval) {
        clearInterval(liveBreakInterval);
        liveBreakInterval = null;
    }

    if (!breaks || breaks.length === 0) {
        banner.style.display = "none";
        return;
    }

    banner.style.display = "flex";

    // Helper to convert "09:00 AM - 09:15 AM" into Date objects for today
    function parseTimeRange(timeStr) {
        const parts = timeStr.split(" - ");
        const parseDate = (t) => {
            const date = new Date();
            const match = t.match(/(\d+):(\d+)\s+(AM|PM)/);
            if (!match) return date;
            let [_, h, m, modifier] = match;
            h = parseInt(h);
            if (modifier === "PM" && h < 12) h += 12;
            if (modifier === "AM" && h === 12) h = 0;
            date.setHours(h, parseInt(m), 0, 0);
            return date;
        };
        return { start: parseDate(parts[0]), end: parseDate(parts[1]) };
    }

    const breakDates = breaks.map(b => ({
        ...b,
        ...parseTimeRange(b.time)
    }));

    function update() {
        const now = new Date();
        
        // Find current active break
        const activeBreak = breakDates.find(b => now >= b.start && now < b.end);
        
        if (activeBreak) {
            banner.classList.add("active-break");
            document.querySelector(".break-banner-title").innerHTML = `ACTIVE BREAK: <span>Time to recharge!</span>`;
            tipText.textContent = activeBreak.tip;
            return;
        }

        // Otherwise find next upcoming break
        const nextBreak = breakDates.find(b => b.start > now);
        
        if (nextBreak) {
            banner.classList.remove("active-break");
            document.querySelector(".break-banner-title").innerHTML = `Next Break In: <span id="break-timer-text">--:--</span>`;
            
            const diff = nextBreak.start - now;
            const h = Math.floor(diff / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);
            
            const timeStr = [
                h > 0 ? h.toString().padStart(2, '0') : null,
                m.toString().padStart(2, '0'),
                s.toString().padStart(2, '0')
            ].filter(Boolean).join(':');

            document.getElementById("break-timer-text").textContent = timeStr;
            tipText.textContent = `Coming up: ${nextBreak.time}`;
        } else {
            banner.classList.remove("active-break");
            document.querySelector(".break-banner-title").innerHTML = `All breaks completed! <span>Great job today.</span>`;
            tipText.textContent = "You've finished all your scheduled breaks.";
            clearInterval(liveBreakInterval);
        }
    }

    update();
    liveBreakInterval = setInterval(update, 1000);
}

// ============================================================
// PHASE 5 — ADVANCED ANIMATIONS & INTERACTIVE EFFECTS
// ============================================================

function initInteractiveCards() {
    const cards = document.querySelectorAll(".card, .subject-card, .countdown-item, .day-card");
    
    cards.forEach(card => {
        // Add glow element if not exists
        if (!card.querySelector(".card-glow-effect")) {
            const glow = document.createElement("div");
            glow.className = "card-glow-effect";
            card.style.position = "relative";
            card.appendChild(glow);
        }

        card.classList.add("card-interactive");

        card.addEventListener("mousemove", (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Update glow position
            card.style.setProperty("--mouse-x", `${(x / rect.width) * 100}%`);
            card.style.setProperty("--mouse-y", `${(y / rect.height) * 100}%`);

            // Calculate 3D tilt
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = (centerY - y) / 15; // Vertical tilt
            const rotateY = (x - centerX) / 15; // Horizontal tilt

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-5px)`;
        });

        card.addEventListener("mouseleave", () => {
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)`;
        });
    });
}

function triggerSuccessCelebration() {
    const headerTitle = document.querySelector(".header-title");
    headerTitle.classList.add("shimmer-text");
    
    setTimeout(() => {
        headerTitle.classList.remove("shimmer-text");
    }, 3000);

    // Refresh scroll reveal for new elements
    initScrollReveal();
}

function initScrollReveal() {
    const reveals = document.querySelectorAll(".card, .result-card, .suggestion-item, .countdown-item");
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("active");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    reveals.forEach(el => {
        el.classList.add("reveal");
        observer.observe(el);
    });
}

// ============================================================
// ERROR HANDLING & UTILITIES
// ============================================================

function showError(messages) {
    errorMessages.innerHTML = messages.map(m => `<div>• ${escapeHtml(m)}</div>`).join("");
    errorBanner.style.display = "flex";
    errorBanner.scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideError() {
    errorBanner.style.display = "none";
}

if (errorClose) {
    errorClose.addEventListener("click", hideError);
}


// --- Button Loading State ---
function setBtnLoading(loading) {
    const btnText = generateBtn.querySelector(".btn-text");
    const btnLoading = generateBtn.querySelector(".btn-loading");

    if (loading) {
        btnText.style.display = "none";
        btnLoading.style.display = "inline";
        generateBtn.disabled = true;
    } else {
        btnText.style.display = "inline";
        btnLoading.style.display = "none";
        generateBtn.disabled = false;
    }
}


// --- Utilities ---
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function formatMarkdownBold(text) {
    return text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function adjustColor(color, amount) {
    let usePound = false;
    if (color[0] == "#") {
        color = color.slice(1);
        usePound = true;
    }
    let num = parseInt(color, 16);
    let r = (num >> 16) + amount;
    if (r > 255) r = 255;
    else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amount;
    if (b > 255) b = 255;
    else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amount;
    if (g > 255) g = 255;
    else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
}


// ============================================================
// PHASE 6 — FLOW-OS POMODORO ENGINE, MARIO COIN FX & REWARD SHOP
// (Ported from https://github.com/thc1006/Flow-OS + Gamification)
// ============================================================

const FLOW_STROKE_LENGTH = 2 * Math.PI * 45; // r=45 in SVG
const FLOW_RESET_CONFIRM_MS = 4500;
const FLOW_STORAGE_KEY = "flow-os.settings";
const FLOW_REWARD_STORAGE_KEY = "flow-os.reward-shop";
const FLOW_STUDY_STORAGE_KEY = "flow-os.study-state";
const BASE_POMODORO_REWARD = 250; // +$250 per Pomodoro (multiplied by Combo!)

const DEFAULT_REWARD_ITEMS = [
    { id: "reward-boba", name: "🧋 手搖飲一杯", price: 500 },
    { id: "reward-game", name: "🎮 無罪惡感打電動 1 小時", price: 800 },
    { id: "reward-cake", name: "🍰 週末精緻甜點", price: 1200 },
];

const FLOW_SESSION_LABELS = {
    focus: "🎯 專注時間",
    shortBreak: "☕ 短休息",
    longBreak: "🌙 長休息",
};

const WEEKDAY_EN_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAY_ZH_SHORT = {
    Monday: "週一",
    Tuesday: "週二",
    Wednesday: "週三",
    Thursday: "週四",
    Friday: "週五",
    Saturday: "週六",
    Sunday: "週日",
};

function getLocalDateISO(dateObj = new Date()) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function parseLocalDateISO(isoStr) {
    if (!isoStr || typeof isoStr !== "string") return new Date();
    const parts = isoStr.split("-").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return new Date();
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function getWeekdayNameFromISO(isoStr) {
    const d = parseLocalDateISO(isoStr);
    return WEEKDAY_EN_NAMES[d.getDay()];
}

function formatMonthDaySlash(isoStr) {
    const d = parseLocalDateISO(isoStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMonthDayZh(isoStr) {
    const d = parseLocalDateISO(isoStr);
    const wd = WEEKDAY_ZH_SHORT[WEEKDAY_EN_NAMES[d.getDay()]] || "";
    return `${d.getMonth() + 1}月${d.getDate()}日 (${wd})`;
}

const _initNow = new Date();
const flowTimerState = {
    isRunning: false,
    sessionType: "focus", // 'focus' | 'shortBreak' | 'longBreak'
    focusDuration: 25,
    shortBreakDuration: 5,
    longBreakDuration: 15,
    currentTime: 25 * 60,
    sessionsCompleted: 0,
    comboCount: 0, // Consecutive uninterrupted Pomodoros
    walletBalance: 0,
    rewardItems: [...DEFAULT_REWARD_ITEMS],
    redemptionHistory: [], // [{ id, name, price, time }]
    soundEnabled: true,
    activeSubjectIndex: 0,
    subjectsProgress: [], // [{ name, priority_level, allocated_hours, targetPomodoros, completedPomodoros }]
    activeDateStr: getLocalDateISO(_initNow), // Currently viewed/active date (YYYY-MM-DD)
    lastActiveDateStr: "", // Last saved date for subjectsProgress rollover detection
    dailyRecords: {}, // { 'YYYY-MM-DD': { checkedIn: bool, completedPomodoros: int, targetPomodoros: int, subjectsMap: { [name]: int } } }
    calendarViewYear: _initNow.getFullYear(),
    calendarViewMonth: _initNow.getMonth(), // 0-11
    tickHandle: null,
    targetEndMs: null,
    isIntroCountingDown: false,
    introStepText: "",
    introTimeoutHandles: [],
    resetArmed: false,
    resetConfirmTimer: null,
    noticeTimer: null,
};

// Load saved settings & reward shop data from localStorage
(function loadFlowSettings() {
    try {
        const raw = localStorage.getItem(FLOW_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed.focusDuration >= 1 && parsed.focusDuration <= 120) {
                flowTimerState.focusDuration = parsed.focusDuration;
            }
            if (parsed.shortBreakDuration >= 1 && parsed.shortBreakDuration <= 120) {
                flowTimerState.shortBreakDuration = parsed.shortBreakDuration;
            }
            if (parsed.longBreakDuration >= 1 && parsed.longBreakDuration <= 120) {
                flowTimerState.longBreakDuration = parsed.longBreakDuration;
            }
            if (typeof parsed.soundEnabled === "boolean") {
                flowTimerState.soundEnabled = parsed.soundEnabled;
            }
            flowTimerState.currentTime = flowTimerState.focusDuration * 60;
        }

        const rewardRaw = localStorage.getItem(FLOW_REWARD_STORAGE_KEY);
        if (rewardRaw) {
            const rParsed = JSON.parse(rewardRaw);
            if (typeof rParsed.walletBalance === "number" && rParsed.walletBalance >= 0) {
                flowTimerState.walletBalance = rParsed.walletBalance;
            }
            if (typeof rParsed.comboCount === "number" && rParsed.comboCount >= 0) {
                flowTimerState.comboCount = rParsed.comboCount;
            }
            if (Array.isArray(rParsed.rewardItems) && rParsed.rewardItems.length > 0) {
                flowTimerState.rewardItems = rParsed.rewardItems;
            }
            if (Array.isArray(rParsed.redemptionHistory)) {
                flowTimerState.redemptionHistory = rParsed.redemptionHistory;
            }
            if (rParsed.dailyRecords && typeof rParsed.dailyRecords === "object") {
                flowTimerState.dailyRecords = rParsed.dailyRecords;
            }
            if (typeof rParsed.lastActiveDateStr === "string") {
                flowTimerState.lastActiveDateStr = rParsed.lastActiveDateStr;
            }
        }
    } catch (e) {
        console.warn("Failed to load Flow-OS settings:", e);
    }
})();

function saveFlowSettings() {
    try {
        localStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify({
            focusDuration: flowTimerState.focusDuration,
            shortBreakDuration: flowTimerState.shortBreakDuration,
            longBreakDuration: flowTimerState.longBreakDuration,
            soundEnabled: flowTimerState.soundEnabled,
        }));
    } catch (e) {
        console.warn("Failed to save Flow-OS settings:", e);
    }
    syncFlowStateToBackend();
}

function saveRewardShopState() {
    try {
        localStorage.setItem(FLOW_REWARD_STORAGE_KEY, JSON.stringify({
            walletBalance: flowTimerState.walletBalance,
            comboCount: flowTimerState.comboCount,
            rewardItems: flowTimerState.rewardItems,
            redemptionHistory: flowTimerState.redemptionHistory,
            subjectsProgress: flowTimerState.subjectsProgress,
            activeSubjectIndex: flowTimerState.activeSubjectIndex,
            sessionsCompleted: flowTimerState.sessionsCompleted,
            lastActiveDateStr: flowTimerState.lastActiveDateStr || flowTimerState.activeDateStr,
            dailyRecords: flowTimerState.dailyRecords,
        }));
    } catch (e) {
        console.warn("Failed to save Reward Shop state:", e);
    }
    syncFlowStateToBackend();
}

function saveStudyStateLocal(subjects, dailyHours, preferredTime, plan) {
    try {
        localStorage.setItem(FLOW_STUDY_STORAGE_KEY, JSON.stringify({
            subjects: subjects,
            daily_hours: dailyHours,
            preferred_time: preferredTime,
            plan: plan,
        }));
    } catch (e) {
        console.warn("Failed to save study state locally:", e);
    }
}

function syncFlowStateToBackend() {
    try {
        fetch("/api/state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                flow_state: {
                    focusDuration: flowTimerState.focusDuration,
                    shortBreakDuration: flowTimerState.shortBreakDuration,
                    longBreakDuration: flowTimerState.longBreakDuration,
                    soundEnabled: flowTimerState.soundEnabled,
                    walletBalance: flowTimerState.walletBalance,
                    comboCount: flowTimerState.comboCount,
                    rewardItems: flowTimerState.rewardItems,
                    redemptionHistory: flowTimerState.redemptionHistory,
                    subjectsProgress: flowTimerState.subjectsProgress,
                    activeSubjectIndex: flowTimerState.activeSubjectIndex,
                    sessionsCompleted: flowTimerState.sessionsCompleted,
                    lastActiveDateStr: flowTimerState.lastActiveDateStr || flowTimerState.activeDateStr,
                    dailyRecords: flowTimerState.dailyRecords,
                },
            }),
        }).catch(() => {});
    } catch (e) {
        // ignore network error
    }
}

// --- Web Audio API Sound Effects (Mario Coin "Ding-Ling!", Break Chime & Stamp Impact) ---
let audioCtx = null;

function ensureAudioCtx() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
        audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
    return audioCtx;
}

// Classic Super Mario Coin "Ding-Ling!" (B5 -> E6) + Combo Critical Fanfare
function playMarioCoinSound(isCombo = false) {
    if (!flowTimerState.soundEnabled) return;
    try {
        const ctx = ensureAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        const playSingleCoin = (startTime, pitchScale = 1.0) => {
            // Note 1: B5 (987.77 Hz) short crisp blip
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = "square";
            osc1.frequency.setValueAtTime(987.77 * pitchScale, startTime);
            gain1.gain.setValueAtTime(0.16, startTime);
            gain1.gain.exponentialRampToValueAtTime(0.01, startTime + 0.08);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(startTime);
            osc1.stop(startTime + 0.08);

            // Note 2: E6 (1318.51 Hz) ringing metallic coin sustain ("Ding-Ling!")
            const osc2 = ctx.createOscillator();
            const osc2Bell = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = "square";
            osc2Bell.type = "sine";
            osc2.frequency.setValueAtTime(1318.51 * pitchScale, startTime + 0.08);
            osc2Bell.frequency.setValueAtTime(2637.02 * pitchScale, startTime + 0.08); // Octave harmonic sparkle
            gain2.gain.setValueAtTime(0.22, startTime + 0.08);
            gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.68);
            osc2.connect(gain2);
            osc2Bell.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(startTime + 0.08);
            osc2Bell.start(startTime + 0.08);
            osc2.stop(startTime + 0.70);
            osc2Bell.stop(startTime + 0.70);
        };

        playSingleCoin(now, 1.0);
        if (isCombo) {
            // Combo Critical: second rapid coin + high power-up chime!
            playSingleCoin(now + 0.16, 1.122); // D#6 -> F#6
            playSingleCoin(now + 0.32, 1.26);  // High critical chime
        }
    } catch (e) {
        console.warn("Mario coin sound failed:", e);
    }
}

function playCompletionSound(kind = "focus", isCombo = false) {
    if (!flowTimerState.soundEnabled) return;
    if (kind === "focus") {
        playMarioCoinSound(isCombo);
        return;
    }
    try {
        const ctx = ensureAudioCtx();
        if (!ctx) return;
        const notes = [392.00, 523.25, 659.25, 783.99];
        const now = ctx.currentTime;
        notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, now + idx * 0.14);
            gain.gain.setValueAtTime(0.001, now + idx * 0.14);
            gain.gain.exponentialRampToValueAtTime(0.25, now + idx * 0.14 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.14 + 0.8);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + idx * 0.14);
            osc.stop(now + idx * 0.14 + 0.85);
        });
    } catch (e) {
        console.warn("Audio playback failed:", e);
    }
}

// Stamp impact sound + cash register chime when redeeming a reward
function playStampRedeemSound() {
    if (!flowTimerState.soundEnabled) return;
    try {
        const ctx = ensureAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        // 1. Heavy stamp thud (low frequency punch)
        const thudOsc = ctx.createOscillator();
        const thudGain = ctx.createGain();
        thudOsc.type = "triangle";
        thudOsc.frequency.setValueAtTime(140, now);
        thudOsc.frequency.exponentialRampToValueAtTime(38, now + 0.18);
        thudGain.gain.setValueAtTime(0.45, now);
        thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        thudOsc.connect(thudGain);
        thudGain.connect(ctx.destination);
        thudOsc.start(now);
        thudOsc.stop(now + 0.23);

        // 2. Crisp Cash Register "Ka-Ching!" bell
        [1046.5, 1318.5, 1567.98, 2093.0].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, now + 0.12 + i * 0.06);
            g.gain.setValueAtTime(0.18, now + 0.12 + i * 0.06);
            g.gain.exponentialRampToValueAtTime(0.0001, now + 0.65 + i * 0.06);
            osc.connect(g);
            g.connect(ctx.destination);
            osc.start(now + 0.12 + i * 0.06);
            osc.stop(now + 0.7 + i * 0.06);
        });
    } catch (e) {
        console.warn("Stamp sound failed:", e);
    }
}

// --- 5-4-3-2-1-START! English Voice + Arcade Race Beep Sound ---
let cachedEnglishVoice = null;

function getBestEnglishVoice() {
    if (!("speechSynthesis" in window)) return null;
    if (cachedEnglishVoice) return cachedEnglishVoice;
    const voices = window.speechSynthesis.getVoices() || [];
    cachedEnglishVoice =
        voices.find(v => v.lang === "en-US" && /Samantha|Alex|Google|Natural|Ava|Daniel/i.test(v.name)) ||
        voices.find(v => /^en(-|_)/i.test(v.lang)) ||
        null;
    return cachedEnglishVoice;
}

if ("speechSynthesis" in window && typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
    window.speechSynthesis.onvoiceschanged = () => {
        cachedEnglishVoice = null;
        getBestEnglishVoice();
    };
}

function speakEnglishCountdownWord(word, isStart = false) {
    if (!flowTimerState.soundEnabled || !("speechSynthesis" in window)) return;
    try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(String(word));
        utter.lang = "en-US";
        const voice = getBestEnglishVoice();
        if (voice) utter.voice = voice;
        utter.rate = isStart ? 1.05 : 1.15;
        utter.pitch = isStart ? 1.22 : 1.02;
        utter.volume = 1.0;
        window.speechSynthesis.speak(utter);
    } catch (e) {
        console.warn("Speech synthesis failed:", e);
    }
}

function playCountdownBeep(isGo = false) {
    if (!flowTimerState.soundEnabled) return;
    try {
        const ctx = ensureAudioCtx();
        if (!ctx) return;
        const now = ctx.currentTime;

        if (!isGo) {
            // Crisp arcade countdown beep (440 Hz A4)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(523.25, now); // C5 crisp beep
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        } else {
            // Energetic "START!" high octave fanfare chord (C5 + E5 + G5 + C6)
            [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = idx === 3 ? "square" : "triangle";
                osc.frequency.setValueAtTime(freq, now + idx * 0.03);
                gain.gain.setValueAtTime(idx === 3 ? 0.14 : 0.18, now + idx * 0.03);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + idx * 0.03);
                osc.stop(now + 0.58);
            });
        }
    } catch (e) {
        console.warn("Countdown beep failed:", e);
    }
}

// --- Point A: Super Mario Coin Jump + Floating +$250 / Combo 2x Critical FX ---
function triggerMarioCoinAndFloatingText(earnedAmount, comboCount) {
    const isCombo = comboCount >= 2;

    // 1. Spawn spinning pixel coin above the timer ring
    const coinStage = document.getElementById("flow-coin-stage");
    if (coinStage) {
        const coinEl = document.createElement("div");
        coinEl.className = `mario-jumping-coin ${isCombo ? "combo-coin" : ""}`;
        coinEl.innerHTML = `
            <div class="pixel-coin-disc">
                <span class="pixel-coin-symbol">$</span>
            </div>
            <div class="coin-sparkle s1">✦</div>
            <div class="coin-sparkle s2">✦</div>
            <div class="coin-sparkle s3">★</div>
        `;
        coinStage.appendChild(coinEl);
        setTimeout(() => coinEl.remove(), 1400);
    }

    // 2. Spawn floating green "+$250" (or "🔥 2x 暴擊！ +$500") in the center of the screen
    const floatLayer = document.getElementById("flow-floating-reward-layer");
    if (floatLayer) {
        const floatEl = document.createElement("div");
        floatEl.className = `floating-reward-popup ${isCombo ? "is-combo-crit" : ""}`;
        if (isCombo) {
            floatEl.innerHTML = `
                <div class="floating-combo-tag">🔥 ${comboCount}x COMBO 暴擊！</div>
                <div class="floating-money-text">+$${earnedAmount.toLocaleString()}</div>
                <div class="floating-sub-coin">🪙 連續專注加成獎勵！</div>
            `;
        } else {
            floatEl.innerHTML = `
                <div class="floating-money-text">+$${earnedAmount.toLocaleString()}</div>
                <div class="floating-sub-coin">🪙 獲得番茄鐘專注幣！</div>
            `;
        }
        floatLayer.appendChild(floatEl);
        setTimeout(() => floatEl.remove(), 2200);
    }

    // 3. If Combo >= 2, flash golden light around screen edges!
    if (isCombo) {
        const flashEl = document.getElementById("flow-combo-screen-flash");
        if (flashEl) {
            flashEl.classList.remove("active-flash");
            void flashEl.offsetWidth; // trigger reflow
            flashEl.classList.add("active-flash");
            setTimeout(() => flashEl.classList.remove("active-flash"), 1500);
        }
    }

    // 4. Pulse wallet badge
    const walletBadge = document.getElementById("flow-wallet-badge");
    if (walletBadge) {
        walletBadge.classList.remove("wallet-bump");
        void walletBadge.offsetWidth;
        walletBadge.classList.add("wallet-bump");
    }

    // 5. If Always-on-Top Document PiP window is open, also show floating coin banner inside it!
    triggerPiPCoinCelebration(earnedAmount, comboCount);
}

// --- Confetti Celebration ---
function playFlowConfetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const container = document.createElement("div");
    container.className = "flow-confetti-container";
    document.body.appendChild(container);

    const colors = ["#fbbf24", "#34d399", "#00f3ff", "#f472b6", "#818cf8"];
    for (let i = 0; i < 45; i++) {
        const piece = document.createElement("div");
        piece.className = "flow-confetti-piece";
        piece.style.left = `${Math.random() * 100}%`;
        piece.style.backgroundColor = colors[i % colors.length];
        piece.style.animationDelay = `${Math.random() * 0.4}s`;
        piece.style.animationDuration = `${1.2 + Math.random() * 1.2}s`;
        container.appendChild(piece);
    }
    setTimeout(() => container.remove(), 2600);
}

// --- Flow-OS Helper Functions ---
function getFlowSessionTotalSec() {
    if (flowTimerState.sessionType === "focus") return flowTimerState.focusDuration * 60;
    if (flowTimerState.sessionType === "shortBreak") return flowTimerState.shortBreakDuration * 60;
    return flowTimerState.longBreakDuration * 60;
}

function formatFlowClock(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function easedPlantScale(p) {
    return 1 + (1 - (1 - p) * (1 - p)) * 0.6;
}

function showFlowNotice(text, ttlMs = 4500) {
    const strip = document.getElementById("flow-notice-strip");
    if (!strip) return;
    strip.textContent = text;
    if (flowTimerState.noticeTimer) {
        clearTimeout(flowTimerState.noticeTimer);
    }
    if (text && ttlMs > 0) {
        flowTimerState.noticeTimer = setTimeout(() => {
            if (strip.textContent === text) strip.textContent = "";
        }, ttlMs);
    }
}

function updateFlowTimerUI() {
    const clockEl = document.getElementById("flow-clock-display");
    const ringEl = document.getElementById("flow-ring-progress");
    const plantEl = document.getElementById("flow-plant-icon");
    const badgeEl = document.getElementById("flow-session-badge");
    const startBtn = document.getElementById("flow-start-btn");
    const resetBtn = document.getElementById("flow-reset-btn");
    const walletEl = document.getElementById("flow-wallet-balance");
    const shopBalanceEl = document.getElementById("reward-shop-balance");
    const comboTextEl = document.getElementById("flow-combo-text");
    const comboBadgeEl = document.getElementById("flow-combo-badge");

    if (!clockEl || !ringEl) return;

    const totalSec = getFlowSessionTotalSec();
    const progress = totalSec > 0 ? Math.max(0, Math.min(1, (totalSec - flowTimerState.currentTime) / totalSec)) : 0;
    const dashoffset = FLOW_STROKE_LENGTH * (1 - progress);
    const formatted = formatFlowClock(flowTimerState.currentTime);

    clockEl.textContent = formatted;
    clockEl.setAttribute("aria-label", `剩餘時間 ${formatted}`);

    ringEl.style.strokeDasharray = `${FLOW_STROKE_LENGTH}`;
    ringEl.style.strokeDashoffset = `${dashoffset}`;
    ringEl.className.baseVal = `flow-ring-fg mode-${flowTimerState.sessionType}`;

    if (plantEl) {
        plantEl.style.transform = `scale(${easedPlantScale(progress).toFixed(3)})`;
        plantEl.textContent = progress >= 0.85 ? "🌳" : progress >= 0.4 ? "🌿" : "🌱";
    }

    if (badgeEl) {
        badgeEl.textContent = FLOW_SESSION_LABELS[flowTimerState.sessionType];
        badgeEl.className = `flow-session-badge mode-${flowTimerState.sessionType}`;
    }

    // Update Wallet & Combo badges
    const formattedBalance = `$${flowTimerState.walletBalance.toLocaleString()}`;
    if (walletEl) walletEl.textContent = formattedBalance;
    if (shopBalanceEl) shopBalanceEl.textContent = formattedBalance;

    const nextMultiplier = Math.min(5, flowTimerState.comboCount + 1);
    if (comboTextEl) {
        if (flowTimerState.comboCount >= 2) {
            comboTextEl.textContent = `${flowTimerState.comboCount} 連擊 🔥 (${Math.min(5, flowTimerState.comboCount)}x 暴擊中！)`;
        } else if (flowTimerState.comboCount === 1) {
            comboTextEl.textContent = `1 連擊 (下一顆觸發 ${nextMultiplier}x 暴擊！)`;
        } else {
            comboTextEl.textContent = `0 連擊 (1x)`;
        }
    }
    if (comboBadgeEl) {
        comboBadgeEl.classList.toggle("combo-hot", flowTimerState.comboCount >= 2);
    }

    // Update mode tabs
    ["focus", "shortBreak", "longBreak"].forEach(mode => {
        const tab = document.getElementById(`tab-${mode}`);
        if (tab) {
            tab.classList.toggle("active", flowTimerState.sessionType === mode);
        }
    });

    const tabFocusMin = document.getElementById("tab-focus-min");
    const tabShortMin = document.getElementById("tab-short-min");
    const tabLongMin = document.getElementById("tab-long-min");
    if (tabFocusMin) tabFocusMin.textContent = flowTimerState.focusDuration;
    if (tabShortMin) tabShortMin.textContent = flowTimerState.shortBreakDuration;
    if (tabLongMin) tabLongMin.textContent = flowTimerState.longBreakDuration;

    if (startBtn) {
        startBtn.setAttribute("aria-pressed", String(flowTimerState.isRunning || flowTimerState.isIntroCountingDown));
        if (flowTimerState.isIntroCountingDown) {
            startBtn.textContent = `⏳ 倒數準備 (${flowTimerState.introStepText || "..."}) — 點擊取消`;
            startBtn.classList.add("is-running");
        } else if (flowTimerState.isRunning) {
            startBtn.textContent = "⏸ 暫停計時";
            startBtn.classList.add("is-running");
        } else {
            startBtn.textContent = flowTimerState.sessionType === "focus" ? "▶ 開始專注" : "▶ 開始休息";
            startBtn.classList.remove("is-running");
        }
    }

    if (resetBtn) {
        resetBtn.textContent = flowTimerState.resetArmed ? "⚠️ 確認重設" : "↺ 重設";
        resetBtn.classList.toggle("is-armed", flowTimerState.resetArmed);
    }

    // Active subject banner
    const currentSubj = flowTimerState.subjectsProgress[flowTimerState.activeSubjectIndex];
    const activeSubjEl = document.getElementById("flow-active-subject-name");
    if (activeSubjEl) {
        if (currentSubj) {
            activeSubjEl.textContent = `${currentSubj.name} （已完成 🍅 ${currentSubj.completedPomodoros} / ${currentSubj.targetPomodoros} 顆）`;
        } else {
            activeSubjEl.textContent = "自由專注模式";
        }
    }

    // Update browser tab title with live countdown
    if (flowTimerState.isRunning) {
        const subjTitle = currentSubj ? currentSubj.name.split(" ")[0] : "專注中";
        document.title = `(${formatted}) 🍅 ${subjTitle} — Smart Study Planner`;
    } else {
        document.title = "Smart Study Planner Generator";
    }

    // Sync Always-on-Top Floating Window (Document PiP / Video PiP)
    updateFloatingPiPUI();
}

function stopFlowTicker() {
    if (flowTimerState.tickHandle !== null) {
        clearInterval(flowTimerState.tickHandle);
        flowTimerState.tickHandle = null;
    }
}

function clearIntroCountdown() {
    if (Array.isArray(flowTimerState.introTimeoutHandles)) {
        flowTimerState.introTimeoutHandles.forEach(h => clearTimeout(h));
        flowTimerState.introTimeoutHandles = [];
    }
    flowTimerState.isIntroCountingDown = false;
    flowTimerState.introStepText = "";
    if ("speechSynthesis" in window) {
        try {
            window.speechSynthesis.cancel();
        } catch (e) {
            // ignore
        }
    }
    const overlay = document.getElementById("flow-intro-countdown-overlay");
    if (overlay) {
        overlay.style.display = "none";
    }
    if (pipDocWindow && !pipDocWindow.closed) {
        const pipOverlay = pipDocWindow.document.getElementById("pip-intro-overlay");
        if (pipOverlay) pipOverlay.style.display = "none";
    }
}

function showIntroStepVisual(label, isGo = false) {
    flowTimerState.introStepText = label;

    const overlay = document.getElementById("flow-intro-countdown-overlay");
    const textEl = document.getElementById("flow-intro-countdown-text");
    if (overlay && textEl) {
        overlay.style.display = "flex";
        textEl.textContent = label;
        textEl.className = `flow-intro-countdown-text ${isGo ? "is-start" : ""} pop-anim`;
        void textEl.offsetWidth;
        textEl.className = `flow-intro-countdown-text ${isGo ? "is-start" : ""} pop-anim`;
    }

    if (pipDocWindow && !pipDocWindow.closed) {
        const pipOverlay = pipDocWindow.document.getElementById("pip-intro-overlay");
        const pipText = pipDocWindow.document.getElementById("pip-intro-text");
        if (pipOverlay && pipText) {
            pipOverlay.style.display = "flex";
            pipText.textContent = label;
            pipText.className = `pip-intro-text ${isGo ? "is-start" : ""}`;
        }
    }

    updateFlowTimerUI();
}

function beginActualFlowCountdown() {
    clearIntroCountdown();
    stopFlowTicker();
    const now = Date.now();
    flowTimerState.targetEndMs = now + flowTimerState.currentTime * 1000;
    flowTimerState.isRunning = true;
    updateFlowTimerUI();

    flowTimerState.tickHandle = setInterval(() => {
        if (flowTimerState.targetEndMs === null) return;
        const remainingSec = Math.max(0, Math.ceil((flowTimerState.targetEndMs - Date.now()) / 1000));
        if (remainingSec <= 0) {
            stopFlowTicker();
            flowTimerState.currentTime = 0;
            completeFlowSession();
            return;
        }
        if (remainingSec !== flowTimerState.currentTime) {
            flowTimerState.currentTime = remainingSec;
            updateFlowTimerUI();
        }
    }, 250);
}

function DisarmResetConfirm() {
    if (flowTimerState.resetConfirmTimer) {
        clearTimeout(flowTimerState.resetConfirmTimer);
        flowTimerState.resetConfirmTimer = null;
    }
    flowTimerState.resetArmed = false;
}

async function startFlowTimer() {
    DisarmResetConfirm();

    if ("Notification" in window && Notification.permission === "default") {
        try {
            const res = await Notification.requestPermission();
            if (res !== "granted") {
                showFlowNotice("提示：桌面通知未開啟，但計時結束仍會播放內建金幣音效 🔔");
            }
        } catch (e) {
            // ignore
        }
    }

    ensureAudioCtx();
    stopFlowTicker();
    clearIntroCountdown();

    // Run "5, 4, 3, 2, 1, START!" English voice + arcade beep intro sequence
    flowTimerState.isIntroCountingDown = true;
    const steps = [
        { label: "5", word: "5", isGo: false, delay: 0 },
        { label: "4", word: "4", isGo: false, delay: 950 },
        { label: "3", word: "3", isGo: false, delay: 1900 },
        { label: "2", word: "2", isGo: false, delay: 2850 },
        { label: "1", word: "1", isGo: false, delay: 3800 },
        { label: "START!", word: "Start!", isGo: true, delay: 4750 },
    ];

    showFlowNotice("🎙️ Ready... 5, 4, 3, 2, 1, START!");

    steps.forEach(step => {
        const h = setTimeout(() => {
            if (!flowTimerState.isIntroCountingDown) return;
            showIntroStepVisual(step.label, step.isGo);
            playCountdownBeep(step.isGo);
            speakEnglishCountdownWord(step.word, step.isGo);
        }, step.delay);
        flowTimerState.introTimeoutHandles.push(h);
    });

    const finishHandle = setTimeout(() => {
        if (!flowTimerState.isIntroCountingDown) return;
        beginActualFlowCountdown();
    }, 5550);
    flowTimerState.introTimeoutHandles.push(finishHandle);
}

function pauseFlowTimer() {
    clearIntroCountdown();
    stopFlowTicker();
    flowTimerState.targetEndMs = null;
    flowTimerState.isRunning = false;
    updateFlowTimerUI();
}

function resetFlowTimer() {
    clearIntroCountdown();
    const totalSec = getFlowSessionTotalSec();
    const midSession = flowTimerState.currentTime > 0 && flowTimerState.currentTime < totalSec;

    if (midSession && !flowTimerState.resetArmed) {
        flowTimerState.resetArmed = true;
        showFlowNotice("再按一次「確認重設」將放棄目前進度，且連擊 Combo 會歸零！", FLOW_RESET_CONFIRM_MS);
        updateFlowTimerUI();
        flowTimerState.resetConfirmTimer = setTimeout(() => {
            flowTimerState.resetArmed = false;
            updateFlowTimerUI();
        }, FLOW_RESET_CONFIRM_MS);
        return;
    }

    // Confirmed mid-session reset breaks the uninterrupted Combo streak!
    if (midSession && flowTimerState.sessionType === "focus") {
        flowTimerState.comboCount = 0;
        saveRewardShopState();
    }

    DisarmResetConfirm();
    stopFlowTicker();
    flowTimerState.targetEndMs = null;
    flowTimerState.isRunning = false;
    flowTimerState.currentTime = totalSec;
    showFlowNotice("");
    updateFlowTimerUI();
}

function switchFlowMode(mode) {
    clearIntroCountdown();
    DisarmResetConfirm();
    stopFlowTicker();
    flowTimerState.targetEndMs = null;
    flowTimerState.isRunning = false;
    flowTimerState.sessionType = mode;
    flowTimerState.currentTime = getFlowSessionTotalSec();
    updateFlowTimerUI();
}

function awardPomodoroCoins() {
    flowTimerState.comboCount += 1;
    const multiplier = Math.min(5, flowTimerState.comboCount); // 1x, 2x, 3x, 4x, 5x max
    const earned = BASE_POMODORO_REWARD * multiplier;
    flowTimerState.walletBalance += earned;
    saveRewardShopState();

    const isCombo = flowTimerState.comboCount >= 2;
    playMarioCoinSound(isCombo);
    triggerMarioCoinAndFloatingText(earned, flowTimerState.comboCount);
    playFlowConfetti();
    renderRewardShop();
    updateFlowTimerUI();
    return { earned, multiplier, isCombo };
}

function completeFlowSession() {
    stopFlowTicker();
    flowTimerState.targetEndMs = null;
    flowTimerState.isRunning = false;

    const finishedMode = flowTimerState.sessionType;

    if (finishedMode === "focus") {
        flowTimerState.sessionsCompleted += 1;

        // Award Mario Coin + Combo Multiplier!
        const { earned, multiplier, isCombo } = awardPomodoroCoins();

        // Increment active subject's completed Pomodoros
        const activeSubj = flowTimerState.subjectsProgress[flowTimerState.activeSubjectIndex];
        let subjMsg = "";
        if (activeSubj) {
            activeSubj.completedPomodoros += 1;
            subjMsg = `（${activeSubj.name} +1 🍅）`;

            if (activeSubj.completedPomodoros >= activeSubj.targetPomodoros) {
                const nextIdx = flowTimerState.subjectsProgress.findIndex(
                    (s, idx) => idx !== flowTimerState.activeSubjectIndex && s.completedPomodoros < s.targetPomodoros
                );
                if (nextIdx !== -1) {
                    flowTimerState.activeSubjectIndex = nextIdx;
                }
            }
            syncActiveDateProgressToRecord(true);
            saveRewardShopState();
            renderFlowSubjectsList();
            renderStudyCheckinCalendar();
            if (currentPlanData && currentPlanData.weekly_plan) {
                renderWeeklyPlan(currentPlanData.weekly_plan);
            }
        }

        const nextType = flowTimerState.sessionsCompleted % 4 === 0 ? "longBreak" : "shortBreak";
        flowTimerState.sessionType = nextType;
        flowTimerState.currentTime = getFlowSessionTotalSec();

        const comboTag = isCombo ? `🔥 ${multiplier}x 暴擊！` : "";
        const msg = `🪙 叮鈴！獲得 +$${earned} 專注幣 ${comboTag} ${subjMsg}，該休息了！`;
        showFlowNotice(msg, 8000);
        sendFlowBrowserNotification(msg);
    } else {
        playCompletionSound("break", false);
        flowTimerState.sessionType = "focus";
        flowTimerState.currentTime = getFlowSessionTotalSec();

        const msg = "💪 休息結束！準備開始下一顆專注番茄鐘（延續連擊 Combo）！";
        showFlowNotice(msg, 8000);
        sendFlowBrowserNotification(msg);
    }

    updateFlowTimerUI();
}

function sendFlowBrowserNotification(bodyText) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
        new Notification("Flow-OS 番茄鐘提醒", {
            body: bodyText,
            tag: "flow-os-timer",
        });
    } catch (e) {
        console.warn("Notification failed:", e);
    }
}

// ============================================================================
// Always-on-Top Floating Timer Window (Document PiP + Canvas Video PiP Fallback)
// ============================================================================
let pipDocWindow = null;
let pipCanvasEl = null;
let pipVideoEl = null;
let pipCoinBannerText = "";
let pipCoinBannerUntil = 0;

function isFloatingPiPOpen() {
    if (pipDocWindow && !pipDocWindow.closed) return true;
    if (document.pictureInPictureElement && document.pictureInPictureElement === pipVideoEl) return true;
    return false;
}

function syncPiPToggleButtons() {
    const open = isFloatingPiPOpen();
    const headerBtn = document.getElementById("flow-pip-btn");
    const panelBtn = document.getElementById("flow-pip-panel-btn");

    if (headerBtn) {
        headerBtn.textContent = open ? "📌 關閉置頂小視窗" : "📌 置頂浮動小視窗";
        headerBtn.classList.toggle("is-active", open);
    }
    if (panelBtn) {
        panelBtn.textContent = open
            ? "📌 置頂浮動計時器執行中（點擊關閉子母畫面）"
            : "📌 開啟桌面置頂浮動計時器（Always-on-Top 子母畫面）";
        panelBtn.classList.toggle("is-active", open);
    }
}

function triggerPiPCoinCelebration(earnedAmount, comboCount) {
    const isCombo = comboCount >= 2;
    pipCoinBannerText = isCombo
        ? `🪙 🔥 ${comboCount}x 暴擊！ +$${earnedAmount.toLocaleString()}`
        : `🪙 叮鈴！ +$${earnedAmount.toLocaleString()} 專注幣`;
    pipCoinBannerUntil = Date.now() + 2600;

    if (pipDocWindow && !pipDocWindow.closed) {
        const doc = pipDocWindow.document;
        const toast = doc.getElementById("pip-coin-toast");
        if (toast) {
            toast.textContent = pipCoinBannerText;
            toast.className = `pip-coin-toast show ${isCombo ? "combo" : ""}`;
            setTimeout(() => {
                if (toast) toast.classList.remove("show");
            }, 2400);
        }
    }
    updateFloatingPiPUI();
}

function renderCanvasPiPFrame() {
    if (!pipCanvasEl) return;
    const ctx = pipCanvasEl.getContext("2d");
    if (!ctx) return;

    const W = pipCanvasEl.width;
    const H = pipCanvasEl.height;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0b0f24");
    grad.addColorStop(1, "#161d3f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle border
    ctx.strokeStyle = "rgba(0, 243, 255, 0.35)";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, W - 4, H - 4);

    const totalSec = getFlowSessionTotalSec();
    const progress = totalSec > 0 ? Math.max(0, Math.min(1, (totalSec - flowTimerState.currentTime) / totalSec)) : 0;
    const formatted = formatFlowClock(flowTimerState.currentTime);
    const currentSubj = flowTimerState.subjectsProgress[flowTimerState.activeSubjectIndex];
    const subjName = currentSubj ? currentSubj.name : "自由專注模式";
    const plantEmoji = progress >= 0.85 ? "🌳" : progress >= 0.4 ? "🌿" : "🌱";

    // Top bar: Subject + Wallet
    ctx.fillStyle = "#00f3ff";
    ctx.font = "bold 18px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
    ctx.textAlign = "left";
    const shortSubj = subjName.length > 14 ? subjName.slice(0, 14) + "…" : subjName;
    ctx.fillText(`🎯 ${shortSubj}`, 22, 34);

    ctx.fillStyle = "#fde68a";
    ctx.font = "bold 17px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`🪙 $${flowTimerState.walletBalance.toLocaleString()}`, W - 22, 34);

    // Center Circular Ring
    const cx = W / 2;
    const cy = 148;
    const radius = 78;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = 10;
    ctx.stroke();

    const ringColor =
        flowTimerState.sessionType === "focus"
            ? "#818cf8"
            : flowTimerState.sessionType === "shortBreak"
            ? "#34d399"
            : "#38bdf8";

    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 10;
    ctx.lineCap = "round";
    ctx.stroke();

    // Plant + Countdown Clock inside ring
    ctx.textAlign = "center";
    if (flowTimerState.isIntroCountingDown && flowTimerState.introStepText) {
        const isStart = flowTimerState.introStepText === "START!";
        ctx.fillStyle = isStart ? "#4ade80" : "#fbbf24";
        ctx.font = isStart
            ? "900 32px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif"
            : "900 58px -apple-system, BlinkMacSystemFont, 'Inter', sans-serif";
        ctx.fillText(flowTimerState.introStepText, cx, cy + 16);
    } else {
        ctx.font = "28px sans-serif";
        ctx.fillText(plantEmoji, cx, cy - 24);

        ctx.fillStyle = "#ffffff";
        ctx.font = "800 38px 'Inter', monospace";
        ctx.fillText(formatted, cx, cy + 18);

        ctx.fillStyle = "#cbd5e1";
        ctx.font = "bold 14px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(FLOW_SESSION_LABELS[flowTimerState.sessionType], cx, cy + 44);
    }

    // Bottom status / coin banner
    if (Date.now() < pipCoinBannerUntil && pipCoinBannerText) {
        ctx.fillStyle = "#4ade80";
        ctx.font = "800 18px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(pipCoinBannerText, cx, H - 22);
    } else {
        const statusStr = flowTimerState.isRunning ? "⏳ 倒數進行中" : "⏸ 已暫停";
        const comboStr = flowTimerState.comboCount >= 1 ? ` ｜ 🔥 ${flowTimerState.comboCount} 連擊` : "";
        ctx.fillStyle = "#94a3b8";
        ctx.font = "600 15px -apple-system, BlinkMacSystemFont, sans-serif";
        ctx.fillText(`${statusStr}${comboStr}`, cx, H - 22);
    }
}

function updateFloatingPiPUI() {
    syncPiPToggleButtons();

    // 1. Update Document Picture-in-Picture window if active
    if (pipDocWindow && !pipDocWindow.closed) {
        const doc = pipDocWindow.document;
        const totalSec = getFlowSessionTotalSec();
        const progress = totalSec > 0 ? Math.max(0, Math.min(1, (totalSec - flowTimerState.currentTime) / totalSec)) : 0;
        const dashoffset = FLOW_STROKE_LENGTH * (1 - progress);
        const formatted = formatFlowClock(flowTimerState.currentTime);
        const currentSubj = flowTimerState.subjectsProgress[flowTimerState.activeSubjectIndex];

        const clockEl = doc.getElementById("pip-clock");
        const ringEl = doc.getElementById("pip-ring-fg");
        const plantEl = doc.getElementById("pip-plant");
        const modeEl = doc.getElementById("pip-mode");
        const subjEl = doc.getElementById("pip-subj");
        const walletEl = doc.getElementById("pip-wallet");
        const comboEl = doc.getElementById("pip-combo");
        const startBtn = doc.getElementById("pip-start-btn");

        if (clockEl) clockEl.textContent = formatted;
        if (ringEl) {
            ringEl.style.strokeDasharray = `${FLOW_STROKE_LENGTH}`;
            ringEl.style.strokeDashoffset = `${dashoffset}`;
            const ringColor =
                flowTimerState.sessionType === "focus"
                    ? "#818cf8"
                    : flowTimerState.sessionType === "shortBreak"
                    ? "#34d399"
                    : "#38bdf8";
            ringEl.style.stroke = ringColor;
        }
        if (plantEl) {
            plantEl.textContent = progress >= 0.85 ? "🌳" : progress >= 0.4 ? "🌿" : "🌱";
        }
        if (modeEl) {
            modeEl.textContent = FLOW_SESSION_LABELS[flowTimerState.sessionType];
        }
        if (subjEl) {
            subjEl.textContent = currentSubj
                ? `🎯 ${currentSubj.name} (${currentSubj.completedPomodoros}/${currentSubj.targetPomodoros}🍅)`
                : "🎯 自由專注模式";
        }
        if (walletEl) {
            walletEl.textContent = `🪙 $${flowTimerState.walletBalance.toLocaleString()}`;
        }
        if (comboEl) {
            comboEl.textContent =
                flowTimerState.comboCount >= 2
                    ? `🔥 ${flowTimerState.comboCount}x 暴擊`
                    : `🔥 ${flowTimerState.comboCount} 連擊`;
        }
        if (startBtn) {
            const active = flowTimerState.isRunning || flowTimerState.isIntroCountingDown;
            startBtn.textContent = flowTimerState.isIntroCountingDown
                ? `⏳ ${flowTimerState.introStepText || "..."}`
                : flowTimerState.isRunning
                ? "⏸ 暫停"
                : "▶ 開始";
            startBtn.className = `pip-btn primary ${active ? "running" : ""}`;
        }
    }

    // 2. Always keep Canvas frame updated if Video PiP is used
    if (pipCanvasEl) {
        renderCanvasPiPFrame();
    }
}

async function openDocumentPiP() {
    const pipWin = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: 360,
    });
    pipDocWindow = pipWin;

    const doc = pipWin.document;
    doc.head.innerHTML = `
        <meta charset="UTF-8">
        <title>🍅 番茄鐘置頂小視窗</title>
        <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                background: linear-gradient(145deg, #090d1f, #131b3a);
                color: #f8fafc;
                font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
                height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: space-between;
                padding: 12px 14px;
                overflow: hidden;
                user-select: none;
            }
            .pip-top {
                width: 100%;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                font-weight: 700;
            }
            .pip-wallet {
                background: rgba(251, 191, 36, 0.15);
                border: 1px solid rgba(251, 191, 36, 0.5);
                color: #fde68a;
                padding: 3px 8px;
                border-radius: 999px;
            }
            .pip-combo {
                background: rgba(239, 68, 68, 0.18);
                border: 1px solid rgba(248, 113, 113, 0.45);
                color: #fca5a5;
                padding: 3px 8px;
                border-radius: 999px;
            }
            .pip-subj {
                width: 100%;
                text-align: center;
                font-size: 12.5px;
                font-weight: 700;
                color: #00f3ff;
                background: rgba(0, 243, 255, 0.07);
                border: 1px solid rgba(0, 243, 255, 0.2);
                padding: 5px 8px;
                border-radius: 8px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .pip-ring-wrap {
                position: relative;
                width: 165px;
                height: 165px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .pip-svg {
                width: 100%;
                height: 100%;
                transform: rotate(-90deg);
            }
            .pip-center {
                position: absolute;
                inset: 0;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
            }
            .pip-plant { font-size: 24px; }
            .pip-clock {
                font-size: 34px;
                font-weight: 900;
                font-variant-numeric: tabular-nums;
                letter-spacing: 1px;
                color: #ffffff;
            }
            .pip-mode {
                font-size: 11px;
                font-weight: 700;
                color: #cbd5e1;
                background: rgba(255,255,255,0.1);
                padding: 2px 8px;
                border-radius: 999px;
            }
            .pip-controls {
                width: 100%;
                display: grid;
                grid-template-columns: 1.4fr 1fr 1.1fr;
                gap: 6px;
            }
            .pip-btn {
                border: 1px solid transparent;
                border-radius: 8px;
                padding: 8px 6px;
                font-size: 12.5px;
                font-weight: 800;
                color: #fff;
                cursor: pointer;
                transition: transform 0.12s ease, opacity 0.12s ease;
            }
            .pip-btn:active { transform: scale(0.96); }
            .pip-btn.primary { background: #4f46e5; border-color: #6366f1; }
            .pip-btn.primary.running { background: #d97706; border-color: #f59e0b; }
            .pip-btn.reset { background: #334155; border-color: #475569; }
            .pip-btn.complete { background: rgba(16, 185, 129, 0.28); border-color: #34d399; color: #6ee7b7; }
            .pip-coin-toast {
                position: fixed;
                top: 46%;
                left: 50%;
                transform: translate(-50%, -50%) scale(0.8);
                background: rgba(6, 78, 59, 0.96);
                border: 2px solid #4ade80;
                color: #4ade80;
                padding: 8px 14px;
                border-radius: 12px;
                font-size: 15px;
                font-weight: 900;
                box-shadow: 0 8px 25px rgba(0,0,0,0.65);
                opacity: 0;
                pointer-events: none;
                transition: all 0.25s cubic-bezier(0.22, 1, 0.36, 1);
                white-space: nowrap;
                z-index: 50;
            }
            .pip-coin-toast.combo {
                background: rgba(120, 53, 15, 0.96);
                border-color: #fbbf24;
                color: #fde68a;
            }
            .pip-coin-toast.show {
                opacity: 1;
                transform: translate(-50%, -65%) scale(1);
            }
            .pip-intro-overlay {
                position: absolute;
                inset: 6px;
                border-radius: 50%;
                background: rgba(9, 13, 31, 0.92);
                display: none;
                align-items: center;
                justify-content: center;
                z-index: 20;
            }
            .pip-intro-text {
                font-size: 56px;
                font-weight: 900;
                color: #fbbf24;
                text-shadow: 0 0 18px rgba(251, 191, 36, 0.65);
            }
            .pip-intro-text.is-start {
                font-size: 30px;
                color: #4ade80;
                text-shadow: 0 0 18px rgba(74, 222, 128, 0.75);
            }
        </style>
    `;

    doc.body.innerHTML = `
        <div class="pip-top">
            <span class="pip-wallet" id="pip-wallet">🪙 $0</span>
            <span class="pip-combo" id="pip-combo">🔥 0 連擊</span>
        </div>
        <div class="pip-subj" id="pip-subj">🎯 自由專注模式</div>
        <div class="pip-ring-wrap">
            <svg class="pip-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="6"></circle>
                <circle id="pip-ring-fg" cx="50" cy="50" r="45" fill="none" stroke="#818cf8" stroke-width="6" stroke-linecap="round" stroke-dasharray="283" stroke-dashoffset="0"></circle>
            </svg>
            <div class="pip-center">
                <div class="pip-plant" id="pip-plant">🌱</div>
                <div class="pip-clock" id="pip-clock">25:00</div>
                <div class="pip-mode" id="pip-mode">專注時段</div>
            </div>
            <div class="pip-intro-overlay" id="pip-intro-overlay">
                <span class="pip-intro-text" id="pip-intro-text">5</span>
            </div>
        </div>
        <div class="pip-controls">
            <button type="button" class="pip-btn primary" id="pip-start-btn">▶ 開始</button>
            <button type="button" class="pip-btn reset" id="pip-reset-btn">↺ 重設</button>
            <button type="button" class="pip-btn complete" id="pip-complete-btn">🪙 完成</button>
        </div>
        <div class="pip-coin-toast" id="pip-coin-toast"></div>
    `;

    doc.getElementById("pip-start-btn").addEventListener("click", () => {
        if (flowTimerState.isRunning || flowTimerState.isIntroCountingDown) {
            pauseFlowTimer();
        } else {
            startFlowTimer();
        }
    });
    doc.getElementById("pip-reset-btn").addEventListener("click", () => {
        resetFlowTimer();
    });
    doc.getElementById("pip-complete-btn").addEventListener("click", () => {
        completeFlowSession();
    });

    pipWin.addEventListener("pagehide", () => {
        pipDocWindow = null;
        syncPiPToggleButtons();
    });

    updateFloatingPiPUI();
    showFlowNotice("📌 已開啟桌面置頂浮動計時器！切換到其他視窗或瀏覽器也能隨時看到倒數！");
}

async function openCanvasVideoPiP() {
    if (!pipCanvasEl) {
        pipCanvasEl = document.createElement("canvas");
        pipCanvasEl.width = 360;
        pipCanvasEl.height = 300;
    }
    renderCanvasPiPFrame();

    if (!pipVideoEl) {
        pipVideoEl = document.createElement("video");
        pipVideoEl.muted = true;
        pipVideoEl.playsInline = true;
        pipVideoEl.style.position = "fixed";
        pipVideoEl.style.bottom = "0";
        pipVideoEl.style.right = "0";
        pipVideoEl.style.width = "1px";
        pipVideoEl.style.height = "1px";
        pipVideoEl.style.opacity = "0";
        pipVideoEl.style.pointerEvents = "none";
        document.body.appendChild(pipVideoEl);

        const stream = pipCanvasEl.captureStream(15);
        pipVideoEl.srcObject = stream;

        pipVideoEl.addEventListener("leavepictureinpicture", () => {
            syncPiPToggleButtons();
        });
    }

    await pipVideoEl.play();
    await pipVideoEl.requestPictureInPicture();

    if ("mediaSession" in navigator) {
        try {
            navigator.mediaSession.setActionHandler("play", () => startFlowTimer());
            navigator.mediaSession.setActionHandler("pause", () => pauseFlowTimer());
        } catch (e) {
            // ignore unsupported mediaSession actions
        }
    }

    syncPiPToggleButtons();
    showFlowNotice("📌 已開啟子母畫面置頂計時器！切換到其他應用程式也能看到倒數畫面！");
}

async function toggleFloatingTimerPiP() {
    try {
        // Close if already open
        if (pipDocWindow && !pipDocWindow.closed) {
            pipDocWindow.close();
            pipDocWindow = null;
            syncPiPToggleButtons();
            return;
        }
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
            syncPiPToggleButtons();
            return;
        }

        // Prefer Document Picture-in-Picture (interactive buttons inside floating window)
        if ("documentPictureInPicture" in window) {
            await openDocumentPiP();
            return;
        }

        // Fallback to Canvas -> Video Picture-in-Picture (Safari / older Chrome / Edge)
        if (document.pictureInPictureEnabled) {
            await openCanvasVideoPiP();
            return;
        }

        showFlowNotice("⚠️ 您的瀏覽器目前不支援子母畫面置頂功能，建議使用 Chrome、Edge 或 Safari。");
    } catch (err) {
        console.warn("Floating PiP error:", err);
        // Try Canvas fallback if Document PiP failed
        if (document.pictureInPictureEnabled && (!pipDocWindow || pipDocWindow.closed)) {
            try {
                await openCanvasVideoPiP();
                return;
            } catch (e2) {
                console.warn("Fallback Video PiP failed:", e2);
            }
        }
        showFlowNotice("⚠️ 無法開啟置頂小視窗，請確認瀏覽器支援子母畫面 (Picture-in-Picture) 並再試一次。");
    }
}

// --- Reward Shop & Red Stamp Redemption ---
let stampHideTimeout = null;

function showRedemptionStamp(item) {
    const overlay = document.getElementById("flow-stamp-overlay");
    const box = document.getElementById("flow-stamp-box");
    const itemText = document.getElementById("flow-stamp-item-text");
    if (!overlay || !box || !itemText) return;

    itemText.textContent = `${item.name} (-$${item.price.toLocaleString()})`;
    overlay.style.display = "flex";
    box.classList.remove("stamp-slam");
    void box.offsetWidth;
    box.classList.add("stamp-slam");

    if (stampHideTimeout) clearTimeout(stampHideTimeout);
    stampHideTimeout = setTimeout(() => {
        overlay.style.display = "none";
    }, 2400);

    overlay.onclick = () => {
        overlay.style.display = "none";
    };
}

function redeemRewardItem(itemId) {
    const item = flowTimerState.rewardItems.find(r => r.id === itemId);
    if (!item) return;

    if (flowTimerState.walletBalance < item.price) {
        const diff = item.price - flowTimerState.walletBalance;
        showFlowNotice(`⚠️ 專注幣不足！還差 $${diff.toLocaleString()} 才能兌換「${item.name}」`);
        return;
    }

    flowTimerState.walletBalance -= item.price;
    const nowStr = new Date().toLocaleString("zh-TW", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });

    flowTimerState.redemptionHistory.unshift({
        id: "tx-" + Date.now(),
        name: item.name,
        price: item.price,
        time: nowStr,
    });

    saveRewardShopState();
    playStampRedeemSound();
    showRedemptionStamp(item);
    playFlowConfetti();
    renderRewardShop();
    updateFlowTimerUI();
    showFlowNotice(`✅ 已核准兌換「${item.name}」！扣除 $${item.price.toLocaleString()} 專注幣`);
}

function renderRewardShop() {
    const listEl = document.getElementById("reward-items-list");
    const historyEl = document.getElementById("reward-history-list");
    const shopBalanceEl = document.getElementById("reward-shop-balance");
    const headerBalanceEl = document.getElementById("flow-wallet-balance");

    const formattedBalance = `$${flowTimerState.walletBalance.toLocaleString()}`;
    if (shopBalanceEl) shopBalanceEl.textContent = formattedBalance;
    if (headerBalanceEl) headerBalanceEl.textContent = formattedBalance;

    if (listEl) {
        listEl.innerHTML = "";
        flowTimerState.rewardItems.forEach(item => {
            const canAfford = flowTimerState.walletBalance >= item.price;
            const row = document.createElement("div");
            row.className = `reward-shop-item ${canAfford ? "can-afford" : "locked"}`;
            row.innerHTML = `
                <div class="reward-item-info">
                    <span class="reward-item-name">${escapeHtml(item.name)}</span>
                    <span class="reward-item-price">$${item.price.toLocaleString()}</span>
                </div>
                <div class="reward-item-actions">
                    <button type="button" class="reward-redeem-btn ${canAfford ? "affordable" : ""}" data-redeem-id="${escapeHtml(item.id)}" ${canAfford ? "" : "disabled"} title="${canAfford ? "立即兌換此獎勵" : `還差 $${(item.price - flowTimerState.walletBalance).toLocaleString()}`}">
                        ${canAfford ? "兌換" : `差 $${item.price - flowTimerState.walletBalance}`}
                    </button>
                    <button type="button" class="reward-delete-btn" data-delete-id="${escapeHtml(item.id)}" title="刪除此商品">&times;</button>
                </div>
            `;
            listEl.appendChild(row);
        });

        listEl.querySelectorAll("button[data-redeem-id]").forEach(btn => {
            btn.addEventListener("click", () => {
                redeemRewardItem(btn.getAttribute("data-redeem-id"));
            });
        });

        listEl.querySelectorAll("button[data-delete-id]").forEach(btn => {
            btn.addEventListener("click", () => {
                const delId = btn.getAttribute("data-delete-id");
                flowTimerState.rewardItems = flowTimerState.rewardItems.filter(r => r.id !== delId);
                saveRewardShopState();
                renderRewardShop();
            });
        });
    }

    if (historyEl) {
        historyEl.innerHTML = "";
        if (flowTimerState.redemptionHistory.length === 0) {
            historyEl.innerHTML = `<div class="reward-history-empty">尚無兌換紀錄，完成番茄鐘賺取專注幣吧！</div>`;
        } else {
            flowTimerState.redemptionHistory.slice(0, 15).forEach(tx => {
                const txEl = document.createElement("div");
                txEl.className = "reward-history-row";
                txEl.innerHTML = `
                    <div class="reward-tx-left">
                        <span class="reward-tx-stamp">已核准</span>
                        <span class="reward-tx-name">${escapeHtml(tx.name)}</span>
                    </div>
                    <div class="reward-tx-right">
                        <span class="reward-tx-price">-$${tx.price.toLocaleString()}</span>
                        <span class="reward-tx-time">${escapeHtml(tx.time)}</span>
                    </div>
                `;
                historyEl.appendChild(txEl);
            });
        }
    }
}

// --- Daily Rollover, 7-Day Schedule Switcher & Monthly Study Check-in Calendar ---

function getOrderedSubjectsForDate(plan, dateStr) {
    const ranking = (plan && plan.priority_ranking) || [];
    if (!plan || !Array.isArray(plan.weekly_plan) || plan.weekly_plan.length === 0) {
        return ranking;
    }

    const weekdayEn = getWeekdayNameFromISO(dateStr);
    const matchedDay =
        plan.weekly_plan.find(d => d.date === dateStr) ||
        plan.weekly_plan.find(d => d.day === weekdayEn);

    if (!matchedDay || !Array.isArray(matchedDay.subjects) || matchedDay.subjects.length === 0) {
        return ranking;
    }

    const rankingMap = {};
    ranking.forEach(s => {
        rankingMap[s.name] = s;
    });

    const ordered = [];
    matchedDay.subjects.forEach(ds => {
        if (rankingMap[ds.name]) {
            ordered.push(rankingMap[ds.name]);
        } else {
            ordered.push({
                name: ds.name,
                priority_level: ds.priority_level || "Medium",
                allocated_hours: ds.hours || 1,
                pomodoros: ds.pomodoros,
            });
        }
    });

    // Append any subject in ranking that wasn't in matchedDay
    ranking.forEach(s => {
        if (!ordered.some(o => o.name === s.name)) {
            ordered.push(s);
        }
    });

    return ordered;
}

function syncActiveDateProgressToRecord(autoCheckinIfDone = false) {
    const dateStr = flowTimerState.activeDateStr || getLocalDateISO();
    if (!flowTimerState.dailyRecords || typeof flowTimerState.dailyRecords !== "object") {
        flowTimerState.dailyRecords = {};
    }

    const existing = flowTimerState.dailyRecords[dateStr] || {
        checkedIn: false,
        completedPomodoros: 0,
        targetPomodoros: 0,
        subjectsMap: {},
    };

    const subjectsMap = { ...(existing.subjectsMap || {}) };
    let totalTarget = 0;
    let totalCompleted = 0;

    flowTimerState.subjectsProgress.forEach(s => {
        subjectsMap[s.name] = s.completedPomodoros || 0;
        totalTarget += s.targetPomodoros || 0;
        totalCompleted += s.completedPomodoros || 0;
    });

    const wasCheckedIn = Boolean(existing.checkedIn);
    let nowCheckedIn = wasCheckedIn;
    if (autoCheckinIfDone && totalTarget > 0 && totalCompleted >= totalTarget) {
        nowCheckedIn = true;
    }

    flowTimerState.dailyRecords[dateStr] = {
        checkedIn: nowCheckedIn,
        completedPomodoros: totalCompleted,
        targetPomodoros: totalTarget,
        subjectsMap: subjectsMap,
        updatedAt: new Date().toISOString(),
    };

    flowTimerState.lastActiveDateStr = dateStr;

    if (!wasCheckedIn && nowCheckedIn) {
        playFlowConfetti();
        showFlowNotice(`🎉 太棒了！${formatMonthDayZh(dateStr)} 的番茄鐘已 100% 全部完成，已自動在月曆打勾 ✅！`, 7000);
    }
}

function loadSubjectsProgressForDate(plan, dateStr) {
    if (!plan) return;
    const orderedSubjects = getOrderedSubjectsForDate(plan, dateStr);
    const dayRecord = (flowTimerState.dailyRecords && flowTimerState.dailyRecords[dateStr]) || null;
    const savedMap = (dayRecord && dayRecord.subjectsMap) || {};

    flowTimerState.subjectsProgress = orderedSubjects.map(s => {
        const target = Math.max(1, Math.ceil((s.allocated_hours * 60) / flowTimerState.focusDuration));
        const completed = typeof savedMap[s.name] === "number" ? savedMap[s.name] : 0;
        return {
            name: s.name,
            priority_level: s.priority_level || "Medium",
            allocated_hours: s.allocated_hours,
            targetPomodoros: target,
            completedPomodoros: completed,
        };
    });

    // Pick first unfinished subject as activeSubjectIndex
    const firstUnfinished = flowTimerState.subjectsProgress.findIndex(
        s => s.completedPomodoros < s.targetPomodoros
    );
    flowTimerState.activeSubjectIndex = firstUnfinished !== -1 ? firstUnfinished : 0;

    syncActiveDateProgressToRecord(false);
}

function switchActiveScheduleDate(dateStr) {
    if (!dateStr) return;
    flowTimerState.activeDateStr = dateStr;

    if (currentPlanData) {
        loadSubjectsProgressForDate(currentPlanData, dateStr);

        // Also update Daily Timetable if Weekly Plan has a timetable for this day
        const weekdayEn = getWeekdayNameFromISO(dateStr);
        const matchedDay =
            (currentPlanData.weekly_plan || []).find(d => d.date === dateStr) ||
            (currentPlanData.weekly_plan || []).find(d => d.day === weekdayEn);
        if (matchedDay && Array.isArray(matchedDay.timetable)) {
            renderTimetable(matchedDay.timetable);
        }
        if (currentPlanData.weekly_plan) {
            renderWeeklyPlan(currentPlanData.weekly_plan);
        }
    }

    renderFlowSubjectsList();
    renderStudyCheckinCalendar();
    updateFlowTimerUI();
    saveRewardShopState();
}

function checkAndRolloverNewDay() {
    const todayISO = getLocalDateISO();
    if (flowTimerState.lastActiveDateStr && flowTimerState.lastActiveDateStr !== todayISO) {
        const prevDate = flowTimerState.lastActiveDateStr;
        flowTimerState.activeDateStr = todayISO;
        flowTimerState.lastActiveDateStr = todayISO;
        if (currentPlanData) {
            loadSubjectsProgressForDate(currentPlanData, todayISO);
            if (currentPlanData.weekly_plan) {
                renderWeeklyPlan(currentPlanData.weekly_plan);
            }
        }
        renderFlowSubjectsList();
        renderStudyCheckinCalendar();
        updateFlowTimerUI();
        saveRewardShopState();
        showFlowNotice(
            `🌅 新的一天開始了！已封存 ${formatMonthDaySlash(prevDate)} 紀錄，並自動切換至今日 ${formatMonthDayZh(todayISO)} 的輪轉番茄鐘課表！`,
            8000
        );
    }
}

function toggleDateCheckin(dateStr, forceState = null) {
    if (!dateStr) return;
    if (!flowTimerState.dailyRecords || typeof flowTimerState.dailyRecords !== "object") {
        flowTimerState.dailyRecords = {};
    }

    const totalTargetDefault = flowTimerState.subjectsProgress.reduce((sum, s) => sum + (s.targetPomodoros || 0), 0);
    const existing = flowTimerState.dailyRecords[dateStr] || {
        checkedIn: false,
        completedPomodoros: 0,
        targetPomodoros: totalTargetDefault,
        subjectsMap: {},
    };

    const nextChecked = forceState !== null ? Boolean(forceState) : !existing.checkedIn;
    existing.checkedIn = nextChecked;
    if (nextChecked && existing.targetPomodoros === 0 && totalTargetDefault > 0) {
        existing.targetPomodoros = totalTargetDefault;
    }
    existing.updatedAt = new Date().toISOString();
    flowTimerState.dailyRecords[dateStr] = existing;

    if (nextChecked) {
        playMarioCoinSound(true);
        playFlowConfetti();
        showFlowNotice(`✅ 太棒了！已在 ${formatMonthDayZh(dateStr)} 蓋上「已完成」勾勾印記！今天超棒！`, 6000);
    } else {
        showFlowNotice(`已取消 ${formatMonthDayZh(dateStr)} 的完成勾勾標記。`, 3500);
    }

    saveRewardShopState();
    renderFlowSubjectsList();
    renderStudyCheckinCalendar();
    if (currentPlanData && currentPlanData.weekly_plan) {
        renderWeeklyPlan(currentPlanData.weekly_plan);
    }
}

function getWeekDatesMonToSun(referenceISO) {
    const refDate = parseLocalDateISO(referenceISO);
    const dayOfWeek = refDate.getDay(); // 0 (Sun) .. 6 (Sat)
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + diffToMon);

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
        const iso = getLocalDateISO(d);
        const enName = WEEKDAY_EN_NAMES[d.getDay()];
        days.push({
            iso,
            enName,
            zhName: WEEKDAY_ZH_SHORT[enName],
            slashDate: `${d.getMonth() + 1}/${d.getDate()}`,
        });
    }
    return days;
}

function renderWeekdaySwitcherTabs() {
    const switcher = document.getElementById("flow-weekday-switcher");
    if (!switcher) return;

    const todayISO = getLocalDateISO();
    const activeISO = flowTimerState.activeDateStr || todayISO;
    const weekDays = getWeekDatesMonToSun(activeISO);

    switcher.innerHTML = "";
    weekDays.forEach(d => {
        const isActive = d.iso === activeISO;
        const isToday = d.iso === todayISO;
        const rec = flowTimerState.dailyRecords && flowTimerState.dailyRecords[d.iso];
        const isChecked = Boolean(rec && rec.checkedIn);
        const doneCount = rec ? rec.completedPomodoros || 0 : 0;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `flow-weekday-tab ${isActive ? "active" : ""} ${isToday ? "is-today" : ""} ${isChecked ? "is-checked" : ""}`;
        btn.setAttribute("role", "tab");
        btn.setAttribute("aria-selected", String(isActive));

        let statusBadge = "";
        if (isChecked) {
            statusBadge = `<span class="wd-status-icon checked">✅</span>`;
        } else if (doneCount > 0) {
            statusBadge = `<span class="wd-status-icon progress">🍅${doneCount}</span>`;
        }

        btn.innerHTML = `
            <span class="wd-top-row">
                <span class="wd-zh">${d.zhName}</span>
                ${isToday ? '<span class="wd-today-dot">今日</span>' : ""}
                ${statusBadge}
            </span>
            <span class="wd-date">${d.slashDate}</span>
        `;

        btn.addEventListener("click", () => {
            switchActiveScheduleDate(d.iso);
        });

        switcher.appendChild(btn);
    });
}

function calculateStudyStreak() {
    const records = flowTimerState.dailyRecords || {};
    const todayISO = getLocalDateISO();
    let streak = 0;
    let cursor = parseLocalDateISO(todayISO);

    // If today isn't checked in yet, check if yesterday was checked in to count active streak
    const todayRec = records[todayISO];
    if (!todayRec || !todayRec.checkedIn) {
        const yesterday = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
        const yISO = getLocalDateISO(yesterday);
        if (records[yISO] && records[yISO].checkedIn) {
            cursor = yesterday;
        } else {
            return 0;
        }
    }

    while (true) {
        const iso = getLocalDateISO(cursor);
        const r = records[iso];
        if (r && r.checkedIn) {
            streak += 1;
            cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

function renderStudyCheckinCalendar() {
    const grid = document.getElementById("study-calendar-grid");
    const monthTitleEl = document.getElementById("calendar-month-title");
    const streakBadgeEl = document.getElementById("calendar-streak-badge");
    const monthCountBadgeEl = document.getElementById("calendar-month-count-badge");
    const heroCheckinBtn = document.getElementById("calendar-hero-checkin-btn");

    if (!grid) return;

    const year = flowTimerState.calendarViewYear;
    const month = flowTimerState.calendarViewMonth; // 0-11
    const todayISO = getLocalDateISO();
    const activeISO = flowTimerState.activeDateStr || todayISO;
    const todaySlash = formatMonthDaySlash(todayISO);

    if (monthTitleEl) {
        monthTitleEl.textContent = `${year} 年 ${month + 1} 月`;
    }

    // Hero check-in button: prioritize 2026-11-16 if it has completed pomodoros and isn't checked in yet, otherwise activeDateStr / todayISO
    const nov16Rec = flowTimerState.dailyRecords && flowTimerState.dailyRecords["2026-11-16"];
    const targetHeroISO =
        nov16Rec && !nov16Rec.checkedIn && (nov16Rec.completedPomodoros || 0) > 0
            ? "2026-11-16"
            : activeISO || todayISO;
    const targetHeroSlash = formatMonthDaySlash(targetHeroISO);

    if (heroCheckinBtn) {
        heroCheckinBtn.setAttribute("data-target-date", targetHeroISO);
        const heroRec = flowTimerState.dailyRecords && flowTimerState.dailyRecords[targetHeroISO];
        const isHeroChecked = Boolean(heroRec && heroRec.checkedIn);
        if (isHeroChecked) {
            heroCheckinBtn.textContent = `🌟 ${targetHeroSlash} 已打勾完成！你超棒！（點擊可取消）`;
            heroCheckinBtn.classList.add("is-checked");
        } else {
            heroCheckinBtn.textContent = `✅ 點我打勾 ${targetHeroSlash}（我很棒有完成！）`;
            heroCheckinBtn.classList.remove("is-checked");
        }
    }

    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday-based index: Mon=0, Tue=1, ..., Sun=6
    const startWeekdayMon0 = (firstDayOfMonth.getDay() + 6) % 7;

    grid.innerHTML = "";

    // Leading empty cells from previous month
    for (let i = 0; i < startWeekdayMon0; i++) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "study-cal-cell empty-cell";
        grid.appendChild(emptyCell);
    }

    let monthCheckedCount = 0;

    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        const cellDate = new Date(year, month, dayNum);
        const iso = getLocalDateISO(cellDate);
        const isToday = iso === todayISO;
        const isActive = iso === activeISO;
        const rec = (flowTimerState.dailyRecords && flowTimerState.dailyRecords[iso]) || null;
        const isChecked = Boolean(rec && rec.checkedIn);
        const donePomos = rec ? rec.completedPomodoros || 0 : 0;
        const targetPomos = rec ? rec.targetPomodoros || 0 : 0;

        if (isChecked) {
            monthCheckedCount += 1;
        }

        const isGoalReachedUnchecked = !isChecked && targetPomos > 0 && donePomos >= targetPomos;

        const cell = document.createElement("div");
        cell.className = `study-cal-cell ${isToday ? "is-today" : ""} ${isActive ? "is-active-schedule" : ""} ${isChecked ? "is-checked-in" : ""} ${isGoalReachedUnchecked ? "is-goal-ready" : ""}`;
        cell.setAttribute("data-date", iso);
        cell.title = isChecked
            ? `${month + 1}/${dayNum} 已完成打卡！（點擊可切換狀態）`
            : `點擊為 ${month + 1}月${dayNum}日 打勾打卡 ✅`;

        let pomoTagHtml = "";
        if (donePomos > 0) {
            pomoTagHtml = `<div class="cal-pomo-pill ${donePomos >= targetPomos && targetPomos > 0 ? "completed" : ""}">🍅 ${donePomos}${targetPomos > 0 ? `/${targetPomos}` : ""} 顆</div>`;
        } else if (isChecked) {
            pomoTagHtml = `<div class="cal-pomo-pill completed">🍅 目標達成</div>`;
        }

        cell.innerHTML = `
            <div class="cal-cell-top">
                <span class="cal-day-number">${month + 1}/${dayNum}</span>
                ${isToday ? '<span class="cal-today-tag">今日</span>' : ""}
            </div>
            <div class="cal-cell-center">
                ${
                    isChecked
                        ? `<div class="cal-check-stamp">
                               <span class="cal-check-icon">✅</span>
                               <span class="cal-check-text">很棒完成！</span>
                           </div>`
                        : isGoalReachedUnchecked
                        ? `<div class="cal-ready-hint">🎉 已達標！點我打勾</div>`
                        : `<div class="cal-uncheck-hint">＋ 點擊打勾</div>`
                }
            </div>
            <div class="cal-cell-bottom">
                ${pomoTagHtml}
            </div>
        `;

        cell.addEventListener("click", () => {
            toggleDateCheckin(iso);
        });

        grid.appendChild(cell);
    }

    const streak = calculateStudyStreak();
    if (streakBadgeEl) {
        streakBadgeEl.innerHTML = `🔥 連續打卡：<strong>${streak} 天</strong>`;
    }
    if (monthCountBadgeEl) {
        monthCountBadgeEl.innerHTML = `✅ 本月完成：<strong>${monthCheckedCount} 天</strong>`;
    }
}

// --- Initialize & Render Daily Subject Pomodoro List ---
function initFlowOSWithPlan(plan, isRestoring = false) {
    const todayISO = getLocalDateISO();

    // Migrate legacy subjectsProgress into dailyRecords if dailyRecords has no entry yet
    if (isRestoring && Array.isArray(flowTimerState.subjectsProgress) && flowTimerState.subjectsProgress.length > 0) {
        const recordDate = flowTimerState.lastActiveDateStr || todayISO;
        if (!flowTimerState.dailyRecords || typeof flowTimerState.dailyRecords !== "object") {
            flowTimerState.dailyRecords = {};
        }
        if (!flowTimerState.dailyRecords[recordDate]) {
            const subjectsMap = {};
            let totalDone = 0;
            let totalTarget = 0;
            flowTimerState.subjectsProgress.forEach(p => {
                subjectsMap[p.name] = p.completedPomodoros || 0;
                totalDone += p.completedPomodoros || 0;
                totalTarget += p.targetPomodoros || 0;
            });
            flowTimerState.dailyRecords[recordDate] = {
                checkedIn: totalTarget > 0 && totalDone >= totalTarget,
                completedPomodoros: totalDone,
                targetPomodoros: totalTarget,
                subjectsMap: subjectsMap,
                updatedAt: new Date().toISOString(),
            };
        }
    }

    // Automatic rollover to today's schedule when opening on a new day
    flowTimerState.activeDateStr = todayISO;
    flowTimerState.lastActiveDateStr = todayISO;

    loadSubjectsProgressForDate(plan, todayISO);
    renderFlowSubjectsList();
    renderRewardShop();
    renderStudyCheckinCalendar();
    updateFlowTimerUI();
    saveRewardShopState();
}

function recalculateSubjectsPomodoros() {
    if (!currentPlanData) return;
    flowTimerState.subjectsProgress.forEach(s => {
        s.targetPomodoros = Math.max(1, Math.ceil((s.allocated_hours * 60) / flowTimerState.focusDuration));
    });
    currentPlanData.priority_ranking.forEach(s => {
        s.pomodoros = Math.max(1, Math.ceil((s.allocated_hours * 60) / flowTimerState.focusDuration));
    });
    syncActiveDateProgressToRecord(false);
    renderFlowSubjectsList();
    renderPriorityTable(currentPlanData.priority_ranking);
    renderWeeklyPlan(currentPlanData.weekly_plan);
    renderStudyCheckinCalendar();
    updateFlowTimerUI();
    saveRewardShopState();
}

function renderFlowSubjectsList() {
    const container = document.getElementById("flow-subject-pomodoro-list");
    const totalBadge = document.getElementById("flow-total-pomodoros-badge");
    const overallText = document.getElementById("flow-overall-progress-text");
    const overallFill = document.getElementById("flow-overall-bar-fill");
    const panelTitleEl = document.getElementById("flow-daily-panel-title");
    const rolloverHintEl = document.getElementById("flow-day-rollover-hint");
    const checkinBarEl = document.getElementById("flow-daily-checkin-bar");
    const checkinIconEl = document.getElementById("flow-checkin-status-icon");
    const checkinTextEl = document.getElementById("flow-checkin-status-text");
    const quickCheckinBtn = document.getElementById("flow-quick-checkin-btn");

    renderWeekdaySwitcherTabs();

    if (!container) return;
    container.innerHTML = "";

    const todayISO = getLocalDateISO();
    const activeISO = flowTimerState.activeDateStr || todayISO;
    const isViewingToday = activeISO === todayISO;
    const activeDateZh = formatMonthDayZh(activeISO);
    const activeSlash = formatMonthDaySlash(activeISO);

    // Compute tomorrow's preview info
    const activeDateObj = parseLocalDateISO(activeISO);
    const nextDayObj = new Date(activeDateObj.getFullYear(), activeDateObj.getMonth(), activeDateObj.getDate() + 1);
    const nextDayISO = getLocalDateISO(nextDayObj);
    const nextDayZh = formatMonthDayZh(nextDayISO);
    const nextDayFirstSubj =
        currentPlanData && currentPlanData.priority_ranking
            ? (getOrderedSubjectsForDate(currentPlanData, nextDayISO)[0] || {}).name || "週二第一科"
            : "隔日排定科目";

    if (panelTitleEl) {
        panelTitleEl.textContent = `📋 ${activeDateZh} 各科應完成「番茄鐘顆數」${isViewingToday ? "（今日課表）" : ""}`;
    }

    const totalTarget = flowTimerState.subjectsProgress.reduce((sum, s) => sum + s.targetPomodoros, 0);
    const totalCompleted = flowTimerState.subjectsProgress.reduce((sum, s) => sum + s.completedPomodoros, 0);
    const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalCompleted / totalTarget) * 100)) : 0;

    if (rolloverHintEl) {
        if (totalTarget > 0 && totalCompleted >= totalTarget) {
            rolloverHintEl.innerHTML = `✨ <strong>${activeDateZh} 番茄鐘已全數達標！</strong> 明天（<strong>${nextDayZh}</strong>）打開將自動從「<strong>${escapeHtml(nextDayFirstSubj)}</strong>」開始新的一天！`;
        } else {
            rolloverHintEl.innerHTML = `📅 目前顯示 <strong>${activeDateZh}</strong> 課表；跨日進入 <strong>${nextDayZh}</strong> 時，將自動切換至隔日輪轉科目（首科：<strong>${escapeHtml(nextDayFirstSubj)}</strong>）`;
        }
    }

    const dayRec = flowTimerState.dailyRecords && flowTimerState.dailyRecords[activeISO];
    const isDateCheckedIn = Boolean(dayRec && dayRec.checkedIn);

    if (checkinBarEl && checkinIconEl && checkinTextEl && quickCheckinBtn) {
        checkinBarEl.classList.toggle("is-checked-in", isDateCheckedIn);
        if (isDateCheckedIn) {
            checkinIconEl.textContent = "✅";
            checkinTextEl.innerHTML = `<strong>${activeDateZh} 已在月曆打勾完成！</strong> 你今天超棒！明天會自動從 ${nextDayZh} 的番茄鐘開始！`;
            quickCheckinBtn.textContent = `🌟 ${activeSlash} 已完成打卡`;
            quickCheckinBtn.classList.add("checked");
        } else {
            checkinIconEl.textContent = "🗓️";
            checkinTextEl.innerHTML = `完成了 <strong>${activeDateZh}</strong> 的讀書進度嗎？點擊右側按鈕在 <strong>${activeSlash}</strong> 月曆打勾犒賞自己！`;
            quickCheckinBtn.textContent = `✅ 在 ${activeSlash} 月曆打勾`;
            quickCheckinBtn.classList.remove("checked");
        }
    }

    if (totalBadge) {
        totalBadge.textContent = `${activeSlash} 目標：${totalTarget} 顆 🍅（單顆 ${flowTimerState.focusDuration} 分鐘）`;
    }
    if (overallText) {
        overallText.textContent = `已完成 ${totalCompleted} / ${totalTarget} 顆 (${overallPct}%)`;
    }
    if (overallFill) {
        overallFill.style.width = `${overallPct}%`;
    }

    flowTimerState.subjectsProgress.forEach((subj, idx) => {
        const isSelected = idx === flowTimerState.activeSubjectIndex;
        const isDone = subj.completedPomodoros >= subj.targetPomodoros;
        const pct = subj.targetPomodoros > 0
            ? Math.min(100, Math.round((subj.completedPomodoros / subj.targetPomodoros) * 100))
            : 0;

        const maxIcons = Math.min(12, Math.max(subj.targetPomodoros, subj.completedPomodoros));
        let tomatoesHtml = "";
        for (let t = 0; t < maxIcons; t++) {
            const filled = t < subj.completedPomodoros;
            tomatoesHtml += `<span class="flow-tomato-icon ${filled ? "filled" : "empty"}" title="${filled ? "已完成" : "待完成"}">🍅</span>`;
        }
        if (subj.targetPomodoros > 12) {
            tomatoesHtml += `<span class="flow-tomato-more">+${subj.targetPomodoros - 12}</span>`;
        }

        const item = document.createElement("div");
        item.className = `flow-subject-item ${isSelected ? "active-subject" : ""} ${isDone ? "completed-subject" : ""}`;
        item.innerHTML = `
            <div class="flow-subj-top">
                <div class="flow-subj-title-group">
                    <span class="priority-badge ${subj.priority_level.toLowerCase()}">${subj.priority_level}</span>
                    <strong class="flow-subj-name">${idx === 0 ? "⭐ " : ""}${escapeHtml(subj.name)}</strong>
                    <span class="flow-subj-hours">(${subj.allocated_hours}h)</span>
                </div>
                <div class="flow-subj-counter">
                    <button type="button" class="flow-step-btn" data-action="dec" data-idx="${idx}" title="減少 1 顆">−</button>
                    <span class="flow-subj-count-badge">🍅 ${subj.completedPomodoros} / ${subj.targetPomodoros} 顆</span>
                    <button type="button" class="flow-step-btn" data-action="inc" data-idx="${idx}" title="完成 1 顆並領取金幣">+</button>
                    <button type="button" class="flow-select-subj-btn ${isSelected ? "selected" : ""}" data-action="select" data-idx="${idx}">
                        ${isSelected ? "🎯 專注中" : "選擇此科"}
                    </button>
                </div>
            </div>
            <div class="flow-tomatoes-row">${tomatoesHtml}</div>
            <div class="flow-subj-bar">
                <div class="flow-subj-bar-fill" style="width: ${pct}%"></div>
            </div>
        `;

        container.appendChild(item);
    });

    container.querySelectorAll("button[data-action]").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const action = btn.getAttribute("data-action");
            const idx = parseInt(btn.getAttribute("data-idx"), 10);
            const subj = flowTimerState.subjectsProgress[idx];
            if (!subj) return;

            if (action === "inc") {
                subj.completedPomodoros += 1;
                syncActiveDateProgressToRecord(true);
                const { earned, multiplier, isCombo } = awardPomodoroCoins();
                const comboTag = isCombo ? `🔥 ${multiplier}x 暴擊！` : "";
                showFlowNotice(`🪙 叮鈴！完成 1 顆「${subj.name}」番茄鐘，獲得 +$${earned} ${comboTag}`);
            } else if (action === "dec") {
                subj.completedPomodoros = Math.max(0, subj.completedPomodoros - 1);
                syncActiveDateProgressToRecord(false);
                saveRewardShopState();
            } else if (action === "select") {
                flowTimerState.activeSubjectIndex = idx;
                saveRewardShopState();
            }
            renderFlowSubjectsList();
            renderStudyCheckinCalendar();
            if (currentPlanData && currentPlanData.weekly_plan) {
                renderWeeklyPlan(currentPlanData.weekly_plan);
            }
            updateFlowTimerUI();
        });
    });
}

function applySavedFormAndPlan(studyState, flowState) {
    if (flowState) {
        if (typeof flowState.focusDuration === "number") flowTimerState.focusDuration = flowState.focusDuration;
        if (typeof flowState.shortBreakDuration === "number") flowTimerState.shortBreakDuration = flowState.shortBreakDuration;
        if (typeof flowState.longBreakDuration === "number") flowTimerState.longBreakDuration = flowState.longBreakDuration;
        if (typeof flowState.soundEnabled === "boolean") flowTimerState.soundEnabled = flowState.soundEnabled;
        if (typeof flowState.walletBalance === "number") flowTimerState.walletBalance = flowState.walletBalance;
        if (typeof flowState.comboCount === "number") flowTimerState.comboCount = flowState.comboCount;
        if (Array.isArray(flowState.rewardItems) && flowState.rewardItems.length > 0) {
            flowTimerState.rewardItems = flowState.rewardItems;
        }
        if (Array.isArray(flowState.redemptionHistory)) {
            flowTimerState.redemptionHistory = flowState.redemptionHistory;
        }
        if (flowState.dailyRecords && typeof flowState.dailyRecords === "object") {
            flowTimerState.dailyRecords = flowState.dailyRecords;
        }
        if (typeof flowState.lastActiveDateStr === "string") {
            flowTimerState.lastActiveDateStr = flowState.lastActiveDateStr;
        }
        if (Array.isArray(flowState.subjectsProgress)) {
            flowTimerState.subjectsProgress = flowState.subjectsProgress;
        }
        if (typeof flowState.activeSubjectIndex === "number") {
            flowTimerState.activeSubjectIndex = flowState.activeSubjectIndex;
        }
        if (typeof flowState.sessionsCompleted === "number") {
            flowTimerState.sessionsCompleted = flowState.sessionsCompleted;
        }
        if (!flowTimerState.isRunning) {
            flowTimerState.currentTime = getFlowSessionTotalSec();
        }
    }

    if (studyState && Array.isArray(studyState.subjects) && studyState.subjects.length > 0) {
        subjectCountInput.value = studyState.subjects.length;
        subjectsContainer.innerHTML = "";
        studyState.subjects.forEach((subj, i) => {
            subjectsContainer.appendChild(createSubjectCard(i + 1, subj));
        });
        if (studyState.daily_hours) {
            dailyHoursInput.value = studyState.daily_hours;
            updateHoursDisplay();
        }
        if (studyState.preferred_time) {
            const radio = document.querySelector(`input[name="preferred-time"][value="${studyState.preferred_time}"]`);
            if (radio) radio.checked = true;
        }
        if (studyState.plan) {
            currentPlanData = studyState.plan;
            displayResults(studyState.plan, true);
        }
    }

    renderRewardShop();
    renderStudyCheckinCalendar();
    updateFlowTimerUI();
}

async function restoreSavedStateOnBoot() {
    try {
        const res = await fetch("/api/state");
        if (res.ok) {
            const data = await res.json();
            if (data.study_state || data.flow_state) {
                applySavedFormAndPlan(data.study_state, data.flow_state);
                return;
            }
        }
    } catch (e) {
        // Fallback to localStorage below
    }

    try {
        const localStudyRaw = localStorage.getItem(FLOW_STUDY_STORAGE_KEY);
        const localRewardRaw = localStorage.getItem(FLOW_REWARD_STORAGE_KEY);
        const studyState = localStudyRaw ? JSON.parse(localStudyRaw) : null;
        const flowState = localRewardRaw ? JSON.parse(localRewardRaw) : null;
        if (studyState || flowState) {
            applySavedFormAndPlan(studyState, flowState);
        }
    } catch (e) {
        console.warn("Local restore failed:", e);
    }
}

// --- Attach Flow-OS & Reward Shop DOM Event Listeners ---
document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("flow-start-btn");
    const resetBtn = document.getElementById("flow-reset-btn");
    const completeBtn = document.getElementById("flow-complete-btn");
    const soundTestBtn = document.getElementById("flow-sound-test-btn");
    const muteBtn = document.getElementById("flow-mute-btn");
    const settingsOpenBtn = document.getElementById("flow-settings-open-btn");
    const settingsCloseBtn = document.getElementById("flow-settings-close-btn");
    const settingsBackdrop = document.getElementById("flow-settings-backdrop");
    const settingsSaveBtn = document.getElementById("flow-settings-save-btn");
    const settingsModal = document.getElementById("flow-settings-modal");
    const rewardAddForm = document.getElementById("reward-add-form");
    const rewardClearBtn = document.getElementById("reward-history-clear-btn");
    const pipHeaderBtn = document.getElementById("flow-pip-btn");
    const pipPanelBtn = document.getElementById("flow-pip-panel-btn");
    const quickCheckinBtn = document.getElementById("flow-quick-checkin-btn");
    const heroCheckinBtn = document.getElementById("calendar-hero-checkin-btn");
    const calPrevBtn = document.getElementById("cal-prev-month-btn");
    const calNextBtn = document.getElementById("cal-next-month-btn");
    const calTodayBtn = document.getElementById("cal-today-btn");

    if (quickCheckinBtn) {
        quickCheckinBtn.addEventListener("click", () => {
            const targetISO = flowTimerState.activeDateStr || getLocalDateISO();
            toggleDateCheckin(targetISO);
        });
    }

    if (heroCheckinBtn) {
        heroCheckinBtn.addEventListener("click", () => {
            const targetISO =
                heroCheckinBtn.getAttribute("data-target-date") ||
                flowTimerState.activeDateStr ||
                getLocalDateISO();
            toggleDateCheckin(targetISO);
        });
    }

    if (calPrevBtn) {
        calPrevBtn.addEventListener("click", () => {
            flowTimerState.calendarViewMonth -= 1;
            if (flowTimerState.calendarViewMonth < 0) {
                flowTimerState.calendarViewMonth = 11;
                flowTimerState.calendarViewYear -= 1;
            }
            renderStudyCheckinCalendar();
        });
    }

    if (calNextBtn) {
        calNextBtn.addEventListener("click", () => {
            flowTimerState.calendarViewMonth += 1;
            if (flowTimerState.calendarViewMonth > 11) {
                flowTimerState.calendarViewMonth = 0;
                flowTimerState.calendarViewYear += 1;
            }
            renderStudyCheckinCalendar();
        });
    }

    if (calTodayBtn) {
        calTodayBtn.addEventListener("click", () => {
            const now = new Date();
            flowTimerState.calendarViewYear = now.getFullYear();
            flowTimerState.calendarViewMonth = now.getMonth();
            switchActiveScheduleDate(getLocalDateISO(now));
        });
    }

    // Periodically check for midnight day rollover (e.g. Monday -> Tuesday)
    setInterval(() => {
        checkAndRolloverNewDay();
    }, 30000);

    window.addEventListener("focus", () => {
        checkAndRolloverNewDay();
    });

    if (pipHeaderBtn) {
        pipHeaderBtn.addEventListener("click", () => {
            toggleFloatingTimerPiP();
        });
    }

    if (pipPanelBtn) {
        pipPanelBtn.addEventListener("click", () => {
            toggleFloatingTimerPiP();
        });
    }

    if (startBtn) {
        startBtn.addEventListener("click", () => {
            if (flowTimerState.isRunning || flowTimerState.isIntroCountingDown) {
                pauseFlowTimer();
            } else {
                startFlowTimer();
            }
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            resetFlowTimer();
        });
    }

    if (completeBtn) {
        completeBtn.addEventListener("click", () => {
            completeFlowSession();
        });
    }

    ["focus", "shortBreak", "longBreak"].forEach(mode => {
        const tab = document.getElementById(`tab-${mode}`);
        if (tab) {
            tab.addEventListener("click", () => switchFlowMode(mode));
        }
    });

    if (soundTestBtn) {
        soundTestBtn.addEventListener("click", () => {
            const prev = flowTimerState.soundEnabled;
            flowTimerState.soundEnabled = true;
            const previewCombo = Math.max(1, flowTimerState.comboCount || 1);
            playMarioCoinSound(previewCombo >= 2);
            triggerMarioCoinAndFloatingText(BASE_POMODORO_REWARD * Math.min(5, previewCombo), previewCombo);
            flowTimerState.soundEnabled = prev;
            showFlowNotice("🪙 叮鈴！正在預覽「頂金幣 + 漂浮數字」特效與音效！");
        });
    }

    if (muteBtn) {
        const syncMuteUI = () => {
            muteBtn.textContent = flowTimerState.soundEnabled ? "🔔 音效：開" : "🔕 音效：關";
            muteBtn.setAttribute("aria-pressed", String(!flowTimerState.soundEnabled));
        };
        syncMuteUI();
        muteBtn.addEventListener("click", () => {
            flowTimerState.soundEnabled = !flowTimerState.soundEnabled;
            saveFlowSettings();
            syncMuteUI();
        });
    }

    if (rewardAddForm) {
        rewardAddForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const nameInput = document.getElementById("reward-custom-name");
            const priceInput = document.getElementById("reward-custom-price");
            const name = nameInput.value.trim();
            const price = parseInt(priceInput.value, 10);
            if (!name || isNaN(price) || price <= 0) return;

            flowTimerState.rewardItems.push({
                id: "reward-" + Date.now(),
                name: name,
                price: price,
            });
            nameInput.value = "";
            priceInput.value = "500";
            saveRewardShopState();
            renderRewardShop();
            showFlowNotice(`🏪 已新增自訂獎勵「${name} ($${price.toLocaleString()})」！`);
        });
    }

    if (rewardClearBtn) {
        rewardClearBtn.addEventListener("click", () => {
            flowTimerState.redemptionHistory = [];
            saveRewardShopState();
            renderRewardShop();
        });
    }

    const openSettings = () => {
        if (!settingsModal) return;
        document.getElementById("setting-focus-min").value = flowTimerState.focusDuration;
        document.getElementById("setting-short-min").value = flowTimerState.shortBreakDuration;
        document.getElementById("setting-long-min").value = flowTimerState.longBreakDuration;
        settingsModal.style.display = "flex";
    };

    const closeSettings = () => {
        if (settingsModal) settingsModal.style.display = "none";
    };

    if (settingsOpenBtn) settingsOpenBtn.addEventListener("click", openSettings);
    if (settingsCloseBtn) settingsCloseBtn.addEventListener("click", closeSettings);
    if (settingsBackdrop) settingsBackdrop.addEventListener("click", closeSettings);

    if (settingsSaveBtn) {
        settingsSaveBtn.addEventListener("click", () => {
            const clamp = (val, fallback) => {
                const n = parseInt(val, 10);
                if (isNaN(n)) return fallback;
                return Math.max(1, Math.min(120, n));
            };
            flowTimerState.focusDuration = clamp(document.getElementById("setting-focus-min").value, 25);
            flowTimerState.shortBreakDuration = clamp(document.getElementById("setting-short-min").value, 5);
            flowTimerState.longBreakDuration = clamp(document.getElementById("setting-long-min").value, 15);
            saveFlowSettings();

            if (!flowTimerState.isRunning) {
                flowTimerState.currentTime = getFlowSessionTotalSec();
            }
            recalculateSubjectsPomodoros();
            closeSettings();
            showFlowNotice("✅ 已儲存時長設定並更新各科應完成番茄鐘顆數！");
        });
    }

    renderRewardShop();
    updateFlowTimerUI();
    restoreSavedStateOnBoot();
});
