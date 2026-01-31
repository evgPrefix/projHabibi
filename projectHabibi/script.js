/* script.js */
/* script.js */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { translations } from "./translations.js";
// Очисти всё лишнее ниже этой строки, если там есть еще какие-то "import ..."

// --- ВАШИ НАСТРОЙКИ FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyABGlOmgn1cYcOjfO44r9w-XpBuFogVgmM",
  authDomain: "habitpop-d7f60.firebaseapp.com",
  projectId: "habitpop-d7f60",
  storageBucket: "habitpop-d7f60.firebasestorage.app",
  messagingSenderId: "703042488340",
  appId: "1:703042488340:web:07488c051bd83163bc3f01"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Глобальные переменные
let currentUser = null;
let currentHabits = [];
let viewDate = new Date();
let dailyChartInstance = null;
let monthlyChartInstance = null;
// Язык (берем из памяти или ставим английский по умолчанию)
let currentLang = localStorage.getItem('lang') || 'en';

// ==========================================
// ЛОГИКА ЛОКАЛИЗАЦИИ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const langSelect = document.getElementById('languageSelect');
    if (langSelect) {
        langSelect.value = currentLang;
        langSelect.addEventListener('change', (e) => {
            currentLang = e.target.value;
            localStorage.setItem('lang', currentLang);
            applyLanguage();
        });
    }
    applyLanguage();
});

function applyLanguage() {
    const t = translations[currentLang];
    if (!t) return;

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (t[key]) el.innerHTML = t[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        if (t[key]) el.placeholder = t[key];
    });

    if (document.getElementById('currentMonthDisplay')) {
        updateMonthDisplay();
    }
    
    if (currentHabits.length > 0) updateCharts(currentHabits);
}

// ==========================================
// ЛОГИКА АВТОРИЗАЦИИ
// ==========================================
const authForm = document.getElementById('authForm');
if (authForm) {
    let isLoginMode = true;
    const toggleBtn = document.getElementById('toggle-auth');
    const submitBtn = document.getElementById('submit-btn');
    const subtitle = document.getElementById('auth-subtitle');
    const errorMsg = document.getElementById('error-msg');
    const forgotBtn = document.getElementById('forgot-password');

    // Переключение Вход / Регистрация
    toggleBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        const t = translations[currentLang];
        
        submitBtn.setAttribute('data-i18n', isLoginMode ? 'btnLogin' : 'btnRegister');
        toggleBtn.setAttribute('data-i18n', isLoginMode ? 'toggleRegister' : 'toggleLogin');
        subtitle.setAttribute('data-i18n', isLoginMode ? 'loginSubtitle' : 'heroDesc');
        
        applyLanguage();
        errorMsg.style.display = 'none';
    });

    // Логика "Забыл пароль" (Вынесена отдельно для стабильности)
    if (forgotBtn) {
        forgotBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const t = translations[currentLang];

            if (!email) {
                alert(t.enterEmailFirst || "Please enter email first.");
                return;
            }

            try {
                await sendPasswordResetEmail(auth, email);
                alert(t.resetSent || "Password reset email sent!");
            } catch (error) {
                console.error(error);
                alert(getFriendlyErrorMessage(error.code)); 
            }
        });
    }

    // Отправка формы (Вход или Регистрация)
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        errorMsg.style.display = 'none';

        try {
            if (isLoginMode) await signInWithEmailAndPassword(auth, email, password);
            else await createUserWithEmailAndPassword(auth, email, password);
            window.location.href = "tracker.html";
        } catch (error) {
            errorMsg.innerText = getFriendlyErrorMessage(error.code);
            errorMsg.style.display = 'block';
            if (navigator.vibrate) navigator.vibrate(200);
        }
    });
}

function getFriendlyErrorMessage(errorCode) {
    const t = translations[currentLang];
    switch (errorCode) {
        case 'auth/invalid-credential':
        case 'auth/wrong-password': return t.errorAuth;
        case 'auth/email-already-in-use': return t.errorExists;
        case 'auth/weak-password': return t.errorWeak;
        case 'auth/invalid-email': return t.errorEmail;
        default: return t.errorGeneric;
    }
}

// ==========================================
// ЛОГИКА ТРЕКЕРА
// ==========================================
const table = document.getElementById('trackerTable');

if (table) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            subscribeToHabits(user.uid);
            updateMonthDisplay();
        } else {
            window.location.href = "index.html";
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth).then(() => window.location.href = "index.html"));
    document.getElementById('prevMonthBtn').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonthBtn').addEventListener('click', () => changeMonth(1));

    // ОБНОВЛЕННОЕ ДОБАВЛЕНИЕ ПРИВЫЧКИ (С ТИПОМ)
    document.getElementById('addHabitBtn').addEventListener('click', async () => {
        const input = document.getElementById('newHabitInput');
        const typeSelect = document.getElementById('habitTypeSelect'); // Берем тип
        const name = input.value.trim();
        
        if (name && currentUser) {
            await addDoc(collection(db, "habits"), {
                uid: currentUser.uid,
                name: name,
                type: typeSelect ? typeSelect.value : 'build', // Сохраняем тип (build/quit)
                checks: [],
                createdAt: Date.now(),
                archived: false
            });
            input.value = '';
        }
    });
}

function changeMonth(offset) {
    viewDate.setMonth(viewDate.getMonth() + offset);
    updateMonthDisplay();
    render(currentHabits);
}

function updateMonthDisplay() {
    const monthIndex = viewDate.getMonth();
    const year = viewDate.getFullYear();
    const monthName = translations[currentLang].months[monthIndex];
    document.getElementById('currentMonthDisplay').innerText = `${monthName} ${year}`;
}

function subscribeToHabits(userId) {
    const q = query(collection(db, "habits"), where("uid", "==", userId));
    onSnapshot(q, (snapshot) => {
        currentHabits = [];
        snapshot.forEach((doc) => currentHabits.push({ id: doc.id, ...doc.data() }));
        currentHabits.sort((a, b) => a.createdAt - b.createdAt);
        render(currentHabits);
        updateCharts(currentHabits);
    });
}

// ==========================================
// RENDER & CHARTS (ОБНОВЛЕННЫЕ)
// ==========================================

function render(habits) {
    if (!table) return;
    const t = translations[currentLang];
    
    // Показываем только НЕ архивные
    const activeHabits = habits.filter(h => !h.archived);

    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysCount = new Date(year, month + 1, 0).getDate();
    
    let htmlHeader = '<thead><tr><th></th>';
    const today = new Date();
    
    for (let i = 1; i <= daysCount; i++) {
        const isToday = (today.getDate() === i && today.getMonth() === month && today.getFullYear() === year);
        const classToday = isToday ? 'class="is-today"' : '';
        htmlHeader += `<th ${classToday}>${i}</th>`;
    }
    htmlHeader += '</tr></thead>';

    let htmlBody = '<tbody>';
    activeHabits.forEach(habit => {
        // Определяем иконку по типу
        const typeIcon = habit.type === 'quit' ? '⛔' : '✨';

        htmlBody += `<tr>
            <td class="habit-name-cell">
                <span style="margin-right:5px; font-size:1.1em;">${typeIcon}</span>
                ${habit.name}
                <div class="row-actions">
                    <button class="archive-action-btn" data-id="${habit.id}" title="${t.archiveTooltip || 'Archive'}">📦</button>
                    <button class="delete-btn" data-id="${habit.id}">×</button>
                </div>
            </td>`;
        for (let day = 1; day <= daysCount; day++) {
            const m = String(month + 1).padStart(2, '0');
            const d = String(day).padStart(2, '0');
            const dateKey = `${year}-${m}-${d}`;
            const isChecked = habit.checks.includes(dateKey) || habit.checks.includes(day);
            const classChecked = isChecked ? 'completed' : '';
            htmlBody += `<td><div class="check-btn ${classChecked}" data-id="${habit.id}" data-date="${dateKey}"></div></td>`;
        }
        htmlBody += `</tr>`;
    });
    htmlBody += '</tbody>';

    table.innerHTML = htmlHeader + htmlBody;
    attachTableListeners(activeHabits);
}

function attachTableListeners(activeHabits) {
    document.querySelectorAll('.check-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const dateKey = e.target.dataset.date;
            const habitRef = doc(db, "habits", id);
            const habit = activeHabits.find(h => h.id === id);
            if (habit.checks.includes(dateKey)) await updateDoc(habitRef, { checks: arrayRemove(dateKey) });
            else { await updateDoc(habitRef, { checks: arrayUnion(dateKey) }); if (navigator.vibrate) navigator.vibrate(50); }
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => { 
            if(confirm('Delete forever?')) await deleteDoc(doc(db, "habits", e.target.dataset.id)); 
        });
    });

    document.querySelectorAll('.archive-action-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if(confirm('Move to archive?')) {
                await updateDoc(doc(db, "habits", id), { 
                    archived: true,
                    archivedAt: Date.now(),
                    result: null
                });
            }
        });
    });
}

function updateCharts(habits) {
    // 1. Фильтруем активные
    const activeHabits = habits.filter(h => !h.archived);
    
    // Считаем стрики и обновляем баннер
    calculateAndShowStreaks(activeHabits);

    if(activeHabits.length === 0) {
        document.getElementById('dailyText').innerText = `0%`;
        if (dailyChartInstance) dailyChartInstance.destroy();
        if (monthlyChartInstance) monthlyChartInstance.destroy();
        return;
    }

    const t = translations[currentLang];
    const todayStr = new Date().toISOString().split('T')[0];
    
    // --- ДНЕВНОЙ ГРАФИК ---
    let completedToday = 0;
    activeHabits.forEach(h => { if(h.checks.includes(todayStr)) completedToday++; });
    const percent = Math.round((completedToday / activeHabits.length) * 100);
    
    document.getElementById('dailyText').innerText = `${percent}% ${t.done || 'done'}`;

    const ctxDaily = document.getElementById('dailyChart');
    if (dailyChartInstance) dailyChartInstance.destroy();
    
    dailyChartInstance = new Chart(ctxDaily, {
        type: 'doughnut',
        data: {
            labels: [t.chartDone || 'Done', t.chartLeft || 'Left'],
            datasets: [{
                data: [completedToday, activeHabits.length - completedToday],
                backgroundColor: ['#D7ECCD', '#eee'],
                borderWidth: 0
            }]
        },
        options: { cutout: '70%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // --- МЕСЯЧНЫЙ ГРАФИК ---
    const ctxMonthly = document.getElementById('monthlyChart');
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    
    const currentMonthPrefix = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}`;
    const labels = [];
    const data = [];

    activeHabits.forEach(h => {
        const count = h.checks.filter(c => String(c).startsWith(currentMonthPrefix)).length;
        labels.push(h.name);
        data.push(count);
    });

    monthlyChartInstance = new Chart(ctxMonthly, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: t.chartDays || 'Days', data: data, backgroundColor: '#D4D4F7', borderRadius: 5 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: {display:false} }, x: { grid: {display:false} } }, plugins: { legend: { display: false } } }
    });
}

// ==========================================
// ЛОГИКА СТРИКОВ (НОВАЯ)
// ==========================================
function calculateAndShowStreaks(habits) {
    const buildHabits = habits.filter(h => h.type !== 'quit');
    const quitHabits = habits.filter(h => h.type === 'quit');

    const todayStr = new Date().toISOString().split('T')[0];
    
    // 1. ОГОНЬ (Productivity)
    let prodStreak = 0;
    if (buildHabits.length > 0) {
        let currentCheckDate = new Date();
        const isTodayDone = buildHabits.some(h => h.checks.includes(todayStr));
        if (!isTodayDone) currentCheckDate.setDate(currentCheckDate.getDate() - 1);

        while (true) {
            const dateStr = currentCheckDate.toISOString().split('T')[0];
            const anyHabitDone = buildHabits.some(h => h.checks.includes(dateStr));
            if (anyHabitDone) {
                prodStreak++;
                currentCheckDate.setDate(currentCheckDate.getDate() - 1);
            } else { break; }
        }
    }

    // 2. ЩИТ (Clean)
    let cleanStreak = 0;
    if (quitHabits.length > 0) {
        let currentCheckDate = new Date();
        const isTodayClean = quitHabits.every(h => h.checks.includes(todayStr));
        if (!isTodayClean) currentCheckDate.setDate(currentCheckDate.getDate() - 1);

        while (true) {
            const dateStr = currentCheckDate.toISOString().split('T')[0];
            const allClean = quitHabits.every(h => h.checks.includes(dateStr));
            if (allClean) {
                cleanStreak++;
                currentCheckDate.setDate(currentCheckDate.getDate() - 1);
            } else { break; }
        }
    }

    // Сохраняем и Обновляем БАННЕР
    localStorage.setItem('prodStreak', prodStreak);
    localStorage.setItem('cleanStreak', cleanStreak);

    const prodCountEl = document.getElementById('bannerProdCount');
    const cleanCountEl = document.getElementById('bannerCleanCount');
    const prodIconEl = document.getElementById('bannerProdIcon');
    const cleanIconEl = document.getElementById('bannerCleanIcon');

    if (prodCountEl) prodCountEl.innerText = prodStreak;
    if (cleanCountEl) cleanCountEl.innerText = cleanStreak;

    if (prodIconEl) {
        if (prodStreak < 3) prodIconEl.innerText = '✨';
        else if (prodStreak < 14) prodIconEl.innerText = '🔥';
        else if (prodStreak < 30) prodIconEl.innerText = '🎇';
        else prodIconEl.innerText = '🐉';
    }

    if (cleanIconEl) {
        if (cleanStreak < 3) cleanIconEl.innerText = '🛡️';
        else if (cleanStreak < 14) cleanIconEl.innerText = '🏰';
        else if (cleanStreak < 30) cleanIconEl.innerText = '⚔️';
        else cleanIconEl.innerText = '🦄';
    }
}

// ==========================================
// ЛОГИКА ТЕМНОЙ ТЕМЫ
// ==========================================
const themeBtn = document.getElementById('themeToggle');
const body = document.body;
const savedTheme = localStorage.getItem('theme');

if (savedTheme === 'dark') {
    body.setAttribute('data-theme', 'dark');
}

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        if (body.getAttribute('data-theme') === 'dark') {
            body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        } else {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        }
    });
}

// ==========================================
// ЛОГИКА АРХИВА (МОДАЛЬНОЕ ОКНО)
// ==========================================

const modal = document.getElementById("archiveModal");
const openBtn = document.getElementById("openArchiveBtn");
const closeBtn = document.querySelector(".close-modal");

if(openBtn) {
    openBtn.onclick = function() {
        modal.style.display = "block";
        renderArchiveList();
    }
}

if(closeBtn) {
    closeBtn.onclick = function() {
        modal.style.display = "none";
    }
}

window.onclick = function(event) {
    if (event.target == modal) {
        modal.style.display = "none";
    }
}

function renderArchiveList() {
    const listContainer = document.getElementById('archiveList');
    const t = translations[currentLang];
    
    const archivedHabits = currentHabits.filter(h => h.archived);
    
    if (archivedHabits.length === 0) {
        listContainer.innerHTML = `<p style="text-align:center; color:#888;">${t.emptyArchive || 'Archive is empty'}</p>`;
        return;
    }

    let html = '';
    archivedHabits.forEach(h => {
        const successClass = h.result === 'success' ? 'active' : '';
        const failClass = h.result === 'fail' ? 'active' : '';

        html += `
        <div class="archive-item">
            <span class="archive-name">${h.name}</span>
            <div class="archive-actions">
                <button class="rate-btn success ${successClass}" onclick="window.rateHabit('${h.id}', 'success')">
                    ✅ ${t.btnSuccess || 'Achieved'}
                </button>
                <button class="rate-btn fail ${failClass}" onclick="window.rateHabit('${h.id}', 'fail')">
                    ❌ ${t.btnFail || 'Dropped'}
                </button>
                <button class="rate-btn" onclick="window.restoreHabit('${h.id}')" title="Restore">
                    ↩️
                </button>
            </div>
        </div>`;
    });
    listContainer.innerHTML = html;
}

window.rateHabit = async (id, status) => {
    await updateDoc(doc(db, "habits", id), { result: status });
    renderArchiveList();
};

window.restoreHabit = async (id) => {
    if(confirm('Restore habit?')) {
        await updateDoc(doc(db, "habits", id), { archived: false });
        renderArchiveList(); 
    }
};