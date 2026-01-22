/* script.js */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- ВАШИ НАСТРОЙКИ FIREBASE ---
const firebaseConfig = {
    // Вставьте свои данные сюда (apiKey, authDomain и т.д.)
    // Те же самые, что были раньше
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Глобальные переменные
let currentUser = null;
let currentHabits = []; // Храним загруженные привычки
let viewDate = new Date(); // Дата, которую мы сейчас просматриваем (месяц/год)
let dailyChartInstance = null;
let monthlyChartInstance = null;

// ==========================================
// ЛОГИКА АВТОРИЗАЦИИ
// ==========================================
const authForm = document.getElementById('authForm');
if (authForm) {
    let isLoginMode = true;
    const toggleBtn = document.getElementById('toggle-auth');
    const submitBtn = document.getElementById('submit-btn');
    const errorMsg = document.getElementById('error-msg');

    toggleBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        submitBtn.innerText = isLoginMode ? "Войти" : "Создать аккаунт";
        toggleBtn.innerText = isLoginMode ? "Нет аккаунта? Создать" : "Уже есть аккаунт? Войти";
        document.getElementById('auth-subtitle').innerText = isLoginMode ? "Твой спокойный ритм жизни." : "Добро пожаловать!";
        errorMsg.style.display = 'none';
    });

    // Обработка формы (Вход / Регистрация)
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        // Скрываем старую ошибку перед новой попыткой
        errorMsg.style.display = 'none';

        try {
            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            // Если всё ок — переходим
            window.location.href = "tracker.html";
        } catch (error) {
            // ВМЕСТО error.message МЫ ВЫЗЫВАЕМ НАШУ ФУНКЦИЮ
            errorMsg.innerText = getFriendlyErrorMessage(error.code);
            errorMsg.style.display = 'block';
            
            // Если ошибка в пароле, можно добавить вибрацию для тактильности
            if (navigator.vibrate) navigator.vibrate(200);
        }
    });

    // --- ФУНКЦИЯ-ПЕРЕВОДЧИК ОШИБОК ---
    function getFriendlyErrorMessage(errorCode) {
        switch (errorCode) {
            case 'auth/invalid-credential':
            case 'auth/user-not-found':
            case 'auth/wrong-password':
                return "Неверная почта или пароль. Попробуйте ещё раз.";
            
            case 'auth/email-already-in-use':
                return "Такой аккаунт уже есть. Попробуйте войти, а не регистрироваться.";
            
            case 'auth/weak-password':
                return "Пароль слишком простой. Нужно хотя бы 6 символов.";
            
            case 'auth/invalid-email':
                return "Кажется, в адресе почты ошибка. Проверьте его.";
            
            case 'auth/too-many-requests':
                return "Слишком много попыток. Подождите минутку и попробуйте снова.";
            
            case 'auth/network-request-failed':
                return "Нет интернета. Проверьте соединение.";
                
            default:
                // Если ошибка какая-то редкая, выводим общий текст
                return "Что-то пошло не так. Попробуйте позже.";
        }
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
            window.location.href = "login.html";
        }
    });

    document.getElementById('logoutBtn').addEventListener('click', () => signOut(auth).then(() => window.location.href = "index.html"));

    // Навигация по месяцам
    document.getElementById('prevMonthBtn').addEventListener('click', () => changeMonth(-1));
    document.getElementById('nextMonthBtn').addEventListener('click', () => changeMonth(1));

    document.getElementById('addHabitBtn').addEventListener('click', async () => {
        const input = document.getElementById('newHabitInput');
        const name = input.value.trim();
        if (name && currentUser) {
            await addDoc(collection(db, "habits"), {
                uid: currentUser.uid,
                name: name,
                checks: [], // Здесь будут храниться полные даты "YYYY-MM-DD"
                createdAt: Date.now()
            });
            input.value = '';
        }
    });
}

// Управление датой просмотра
function changeMonth(offset) {
    viewDate.setMonth(viewDate.getMonth() + offset);
    updateMonthDisplay();
    render(currentHabits); // Перерисовываем таблицу для нового месяца
}

function updateMonthDisplay() {
    const options = { month: 'long', year: 'numeric' };
    // Первая буква заглавная
    let text = viewDate.toLocaleDateString('ru-RU', options);
    text = text.charAt(0).toUpperCase() + text.slice(1);
    document.getElementById('currentMonthDisplay').innerText = text;
}

// Слушатель базы данных
function subscribeToHabits(userId) {
    const q = query(collection(db, "habits"), where("uid", "==", userId));
    onSnapshot(q, (snapshot) => {
        currentHabits = [];
        snapshot.forEach((doc) => {
            currentHabits.push({ id: doc.id, ...doc.data() });
        });
        currentHabits.sort((a, b) => a.createdAt - b.createdAt);
        render(currentHabits);
        updateCharts(currentHabits); // Обновляем графики
    });
}

// --- РЕНДЕРИНГ ТАБЛИЦЫ ---

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

// Формат даты YYYY-MM-DD для сравнения
function formatDateKey(year, month, day) {
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${year}-${m}-${d}`;
}

function render(habits) {
    if (!table) return;
    
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const daysCount = getDaysInMonth(year, month);
    
    // Хедер (дни месяца)
    let htmlHeader = '<thead><tr><th>Привычки</th>';
    const today = new Date();
    
    for (let i = 1; i <= daysCount; i++) {
        // Проверяем, является ли этот день "Сегодня"
        const isToday = (today.getDate() === i && today.getMonth() === month && today.getFullYear() === year);
        const classToday = isToday ? 'class="is-today"' : '';
        htmlHeader += `<th ${classToday}>${i}</th>`;
    }
    htmlHeader += '</tr></thead>';

    // Тело (привычки)
    let htmlBody = '<tbody>';
    habits.forEach(habit => {
        htmlBody += `<tr>`;
        htmlBody += `<td>${habit.name} <button class="delete-btn" data-id="${habit.id}">×</button></td>`;
        
        for (let day = 1; day <= daysCount; day++) {
            const dateKey = formatDateKey(year, month, day);
            // Проверяем, есть ли эта дата в массиве checks
            // Поддержка старого формата (просто числа) и нового (даты)
            const isChecked = habit.checks.includes(dateKey) || habit.checks.includes(day); 
            
            const classChecked = isChecked ? 'completed' : '';
            htmlBody += `<td><div class="check-btn ${classChecked}" data-id="${habit.id}" data-date="${dateKey}"></div></td>`;
        }
        htmlBody += `</tr>`;
    });
    htmlBody += '</tbody>';

    table.innerHTML = htmlHeader + htmlBody;
    attachClickHandlers(habits);
}

function attachClickHandlers(habits) {
    document.querySelectorAll('.check-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const dateKey = e.target.dataset.date;
            const habitRef = doc(db, "habits", id);
            const habit = habits.find(h => h.id === id);

            // Логика: если уже есть эта дата -> удаляем, иначе -> добавляем
            if (habit.checks.includes(dateKey)) {
                await updateDoc(habitRef, { checks: arrayRemove(dateKey) });
            } else {
                await updateDoc(habitRef, { checks: arrayUnion(dateKey) });
                if (navigator.vibrate) navigator.vibrate(50);
            }
        });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (confirm('Удалить?')) await deleteDoc(doc(db, "habits", e.target.dataset.id));
        });
    });
}

// --- ГРАФИКИ (CHART.JS) ---

function updateCharts(habits) {
    if(habits.length === 0) return;

    // 1. График дня (сколько привычек выполнено сегодня)
    const todayStr = formatDateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
    let completedToday = 0;
    habits.forEach(h => {
        if(h.checks.includes(todayStr)) completedToday++;
    });
    
    const percent = Math.round((completedToday / habits.length) * 100);
    document.getElementById('dailyText').innerText = `${percent}% выполнено сегодня`;

    const ctxDaily = document.getElementById('dailyChart');
    if (dailyChartInstance) dailyChartInstance.destroy();
    
    dailyChartInstance = new Chart(ctxDaily, {
        type: 'doughnut',
        data: {
            labels: ['Сделано', 'Осталось'],
            datasets: [{
                data: [completedToday, habits.length - completedToday],
                backgroundColor: ['#D7ECCD', '#eee'], // Sage Green vs Grey
                borderWidth: 0
            }]
        },
        options: { cutout: '70%', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 2. График Топ привычек (кто молодец в этом месяце)
    const ctxMonthly = document.getElementById('monthlyChart');
    if (monthlyChartInstance) monthlyChartInstance.destroy();

    // Считаем сколько раз каждая привычка была выполнена в ТЕКУЩЕМ месяце
    const currentMonthPrefix = formatDateKey(viewDate.getFullYear(), viewDate.getMonth(), 1).substring(0, 7); // "2026-01"
    
    const labels = [];
    const data = [];
    
    habits.forEach(h => {
        // Считаем только те чеки, которые начинаются с "2026-01..."
        const count = h.checks.filter(c => String(c).startsWith(currentMonthPrefix)).length;
        labels.push(h.name);
        data.push(count);
    });

    monthlyChartInstance = new Chart(ctxMonthly, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Дней',
                data: data,
                backgroundColor: '#D4D4F7', // Soft Purple
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}