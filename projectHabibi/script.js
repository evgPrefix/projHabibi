/* script.js */
/* script.js */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// Импорт словаря
import { translations } from "./translations.js";

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
// Язык (берем из памяти или ставим русский по умолчанию)
let currentLang = localStorage.getItem('lang') || 'ru';

// ==========================================
// ЛОГИКА ЛОКАЛИЗАЦИИ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Настраиваем переключатель языка
    const langSelect = document.getElementById('languageSelect');
    if (langSelect) {
        langSelect.value = currentLang;
        langSelect.addEventListener('change', (e) => {
            currentLang = e.target.value;
            localStorage.setItem('lang', currentLang);
            applyLanguage();
        });
    }
    // Применяем язык при старте
    applyLanguage();
});

function applyLanguage() {
    const t = translations[currentLang];
    
    // 1. Тексты (innerHTML)
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (t[key]) el.innerHTML = t[key]; // innerHTML позволяет теги типа <strong>
    });

    // 2. Плейсхолдеры (поля ввода)
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.dataset.i18nPlaceholder;
        if (t[key]) el.placeholder = t[key];
    });

    // 3. Обновляем месяц (если мы в трекере)
    if (document.getElementById('currentMonthDisplay')) {
        updateMonthDisplay();
    }
    
    // 4. Перерисовываем графики (чтобы обновились слова внутри них)
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

    toggleBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        
        // Обновляем атрибуты перевода и сразу текст
        const t = translations[currentLang];
        
        // Меняем ключи data-i18n
        submitBtn.setAttribute('data-i18n', isLoginMode ? 'btnLogin' : 'btnRegister');
        toggleBtn.setAttribute('data-i18n', isLoginMode ? 'toggleRegister' : 'toggleLogin');
        subtitle.setAttribute('data-i18n', isLoginMode ? 'loginSubtitle' : 'heroDesc'); // Просто ставим heroDesc как заглушку, но можно сделать отдельный ключ registerSubtitle
        
        // Применяем перевод
        applyLanguage();
        errorMsg.style.display = 'none';
    });

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
            // Ошибка теперь тоже переводится
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

    document.getElementById('addHabitBtn').addEventListener('click', async () => {
        const input = document.getElementById('newHabitInput');
        const name = input.value.trim();
        if (name && currentUser) {
            await addDoc(collection(db, "habits"), {
                uid: currentUser.uid,
                name: name,
                checks: [],
                createdAt: Date.now()
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
    // Берем название месяца из словаря
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

function render(habits) {
    if (!table) return;
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysCount = new Date(year, month + 1, 0).getDate();
    
    // Хедер
    let htmlHeader = '<thead><tr><th></th>'; // Пустая ячейка для названий
    const today = new Date();
    
    for (let i = 1; i <= daysCount; i++) {
        const isToday = (today.getDate() === i && today.getMonth() === month && today.getFullYear() === year);
        const classToday = isToday ? 'class="is-today"' : '';
        htmlHeader += `<th ${classToday}>${i}</th>`;
    }
    htmlHeader += '</tr></thead>';

    // Тело
    let htmlBody = '<tbody>';
    habits.forEach(habit => {
        htmlBody += `<tr><td>${habit.name} <button class="delete-btn" data-id="${habit.id}">×</button></td>`;
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
    
    // Обработчики
    document.querySelectorAll('.check-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const dateKey = e.target.dataset.date;
            const habitRef = doc(db, "habits", id);
            const habit = habits.find(h => h.id === id);
            if (habit.checks.includes(dateKey)) await updateDoc(habitRef, { checks: arrayRemove(dateKey) });
            else { await updateDoc(habitRef, { checks: arrayUnion(dateKey) }); if (navigator.vibrate) navigator.vibrate(50); }
        });
    });
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => { if(confirm('Удалить?')) await deleteDoc(doc(db, "habits", e.target.dataset.id)); });
    });
}

function updateCharts(habits) {
    if(habits.length === 0) return;
    const t = translations[currentLang];

    // Chart 1
    const todayStr = new Date().toISOString().split('T')[0];
    let completedToday = 0;
    habits.forEach(h => { if(h.checks.includes(todayStr)) completedToday++; });
    const percent = Math.round((completedToday / habits.length) * 100);
    
    document.getElementById('dailyText').innerText = `${percent}% ${t.done}`;

    const ctxDaily = document.getElementById('dailyChart');
    if (dailyChartInstance) dailyChartInstance.destroy();
    
    dailyChartInstance = new Chart(ctxDaily, {
        type: 'doughnut',
        data: {
            labels: [t.chartDone, t.chartLeft],
            datasets: [{
                data: [completedToday, habits.length - completedToday],
                backgroundColor: ['#D7ECCD', '#eee'],
                borderWidth: 0
            }]
        },
        options: { cutout: '70%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // Chart 2
    const ctxMonthly = document.getElementById('monthlyChart');
    if (monthlyChartInstance) monthlyChartInstance.destroy();
    
    const currentMonthPrefix = `${viewDate.getFullYear()}-${String(viewDate.getMonth()+1).padStart(2,'0')}`;
    const labels = [];
    const data = [];
    habits.forEach(h => {
        const count = h.checks.filter(c => String(c).startsWith(currentMonthPrefix)).length;
        labels.push(h.name);
        data.push(count);
    });

    monthlyChartInstance = new Chart(ctxMonthly, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{ label: t.chartDays, data: data, backgroundColor: '#D4D4F7', borderRadius: 5 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: {display:false} }, x: { grid: {display:false} } }, plugins: { legend: { display: false } } }
    });
}

// ==========================================
// ЛОГИКА ТЕМНОЙ ТЕМЫ
// ==========================================
const themeBtn = document.getElementById('themeToggle');
const body = document.body;
const savedTheme = localStorage.getItem('theme');

if (savedTheme === 'dark') {
    body.setAttribute('data-theme', 'dark');
    if(themeBtn) themeBtn.innerText = '☀️';
}

if (themeBtn) {
    themeBtn.addEventListener('click', () => {
        if (body.getAttribute('data-theme') === 'dark') {
            body.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
            themeBtn.innerText = '🌙';
        } else {
            body.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
            themeBtn.innerText = '☀️';
        }
    });
}