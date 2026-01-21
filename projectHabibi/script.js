/* script.js */

// 1. Импортируем функции Firebase прямо из интернета (CDN)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, updateDoc, doc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- ВСТАВЬТЕ ВАШИ ДАННЫЕ СЮДА ---
const firebaseConfig = {
  apiKey: "AIzaSyABGlOmgn1cYcOjfO44r9w-XpBuFogVgmM",
  authDomain: "habitpop-d7f60.firebaseapp.com",
  projectId: "habitpop-d7f60",
  storageBucket: "habitpop-d7f60.firebasestorage.app",
  messagingSenderId: "703042488340",
  appId: "1:703042488340:web:07488c051bd83163bc3f01"
};
// ----------------------------------

// Инициализация
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const daysInMonth = 30;
let currentUser = null;

// ==========================================
// ЛОГИКА АВТОРИЗАЦИИ (Login Page)
// ==========================================

const authForm = document.getElementById('authForm');
if (authForm) {
    let isLoginMode = true;
    const toggleBtn = document.getElementById('toggle-auth');
    const submitBtn = document.getElementById('submit-btn');
    const errorMsg = document.getElementById('error-msg');

    // Переключатель Вход / Регистрация
    toggleBtn.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        submitBtn.innerText = isLoginMode ? "Войти" : "Создать аккаунт";
        toggleBtn.innerText = isLoginMode ? "Нет аккаунта? Создать" : "Уже есть аккаунт? Войти";
        document.getElementById('auth-subtitle').innerText = isLoginMode ? "Твой спокойный ритм жизни." : "Добро пожаловать!";
        errorMsg.style.display = 'none';
    });

    // Обработка формы
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        errorMsg.style.display = 'none';

        try {
            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            window.location.href = "tracker.html";
        } catch (error) {
            errorMsg.innerText = "Ошибка: " + error.message;
            errorMsg.style.display = 'block';
        }
    });
}

// ==========================================
// ЛОГИКА ТРЕКЕРА (Tracker Page)
// ==========================================

const table = document.getElementById('trackerTable');

if (table) {
    // Проверка: залогинен ли юзер?
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            subscribeToHabits(user.uid); // Слушаем базу данных
        } else {
            window.location.href = "login.html"; // Если нет, выкидываем на логин
        }
    });

    // Кнопка Выход
    document.getElementById('logoutBtn').addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = "login.html");
    });

    // Добавление привычки
    document.getElementById('addHabitBtn').addEventListener('click', async () => {
        const input = document.getElementById('newHabitInput');
        const name = input.value.trim();
        if (name && currentUser) {
            await addDoc(collection(db, "habits"), {
                uid: currentUser.uid, // Привязываем к юзеру
                name: name,
                checks: [],
                createdAt: Date.now()
            });
            input.value = '';
        }
    });
}

// ==========================================
// РЕНДЕРИНГ И БАЗА ДАННЫХ
// ==========================================

// Функция "Слушатель". Она срабатывает сама каждый раз, когда данные в облаке меняются.
function subscribeToHabits(userId) {
    const q = query(collection(db, "habits"), where("uid", "==", userId));
    
    // Это магия Firebase. Real-time updates.
    onSnapshot(q, (snapshot) => {
        const habits = [];
        snapshot.forEach((doc) => {
            habits.push({ id: doc.id, ...doc.data() });
        });
        
        // Сортируем по времени создания
        habits.sort((a, b) => a.createdAt - b.createdAt);
        render(habits);
    });
}

function render(habits) {
    if (!table) return;
    table.innerHTML = renderHeader() + renderBody(habits);
    
    // Восстанавливаем обработчики кликов (так как innerHTML перезаписывает DOM)
    attachClickHandlers(habits);
}

function renderHeader() {
    let html = '<thead><tr><th>Привычки</th>';
    const currentDay = new Date().getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        const isToday = i === currentDay;
        const classToday = isToday ? 'class="today"' : '';
        html += `<th ${classToday}>${i}</th>`;
    }
    html += '</tr></thead>';
    return html;
}

function renderBody(habits) {
    let html = '<tbody>';
    habits.forEach(habit => {
        html += `<tr>`;
        html += `<td>${habit.name} <button class="delete-btn" data-id="${habit.id}">×</button></td>`;
        for (let day = 1; day <= daysInMonth; day++) {
            const isChecked = habit.checks.includes(day);
            const classChecked = isChecked ? 'completed' : '';
            html += `<td><div class="check-btn ${classChecked}" data-id="${habit.id}" data-day="${day}"></div></td>`;
        }
        html += `</tr>`;
    });
    html += '</tbody>';
    return html;
}

function attachClickHandlers(habits) {
    // Клики по чекбоксам
    document.querySelectorAll('.check-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            const day = parseInt(e.target.dataset.day);
            const habit = habits.find(h => h.id === id);

            const habitRef = doc(db, "habits", id);

            if (habit.checks.includes(day)) {
                // Удалить день из массива в облаке
                await updateDoc(habitRef, { checks: arrayRemove(day) });
            } else {
                // Добавить день в массив в облаке
                await updateDoc(habitRef, { checks: arrayUnion(day) });
                if (navigator.vibrate) navigator.vibrate(50);
            }
        });
    });

    // Клики по удалению
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const id = e.target.dataset.id;
            if (confirm('Удалить привычку?')) {
                await deleteDoc(doc(db, "habits", id));
            }
        });
    });
}