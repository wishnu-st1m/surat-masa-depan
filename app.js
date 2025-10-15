import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, addDoc, onSnapshot, collection, query, where, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global Variables
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

let db = null;
let auth = null;
let userId = null;

// UI Elements
const authStatusEl = document.getElementById('auth-status');
const sendBtn = document.getElementById('send-btn');
const letterListEl = document.getElementById('letter-list');
const noLettersMessage = document.getElementById('no-letters-message');
const loadingSpinner = document.getElementById('loading-spinner');
const sendAnimationOverlay = document.getElementById('send-animation-overlay');
const envelopeIcon = document.querySelector('.envelope');

// Modal Functions
const customModal = document.getElementById('custom-modal');
const modalTitleEl = document.getElementById('modal-title');
const modalBodyEl = document.getElementById('modal-body');

window.showModal = (title, body) => {
    modalTitleEl.textContent = title;
    modalBodyEl.textContent = body;
    customModal.style.display = 'flex';
};

window.hideModal = () => {
    customModal.style.display = 'none';
};

// --- FIREBASE INITIALIZATION & AUTH ---
if (firebaseConfig) {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        authStatusEl.textContent = "Menghubungkan...";
        
        const signIn = async () => {
            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                await signInAnonymously(auth);
            }
        };

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                authStatusEl.textContent = `Terkoneksi | User ID: ${userId.substring(0, 8)}...`;
                loadLetters(); 
            } else {
                try {
                    await signIn();
                } catch (error) {
                    console.error("Firebase Auth Error:", error);
                    authStatusEl.textContent = "Koneksi Gagal: Coba muat ulang.";
                }
            }
        });

    } catch (error) {
        console.error("Firebase Initialization Error:", error);
        authStatusEl.textContent = "Kesalahan Inisialisasi Firebase.";
    }
} else {
    authStatusEl.textContent = "Mode Demo: Fitur penyimpanan tidak aktif.";
    sendBtn.onclick = () => showModal("Demo Mode", "Fitur kirim tidak aktif karena Firebase belum dikonfigurasi.");
}


// --- FIREBASE DATA FUNCTIONS ---
const getLettersCollection = (uid) => {
    return collection(db, `artifacts/${appId}/users/${uid}/future_letters`);
};

// FUNGSI MENGIRIM / MENYIMPAN SURAT
window.handleSend = async () => {
    if (!userId || !db) {
        showModal("Kesalahan Koneksi", "Gagal mengirim. Pastikan Anda terhubung ke server.");
        return;
    }

    const content = document.getElementById('content').value.trim();
    const recipientEmail = document.getElementById('recipient-email').value.trim();
    const senderName = document.getElementById('sender-name').value.trim() || 'Anonim';
    const letterTitle = document.getElementById('letter-title').value.trim() || 'Surat Tanpa Judul';
    const deliveryDate = document.getElementById('delivery-date').value;
    const deliveryTime = document.getElementById('delivery-time').value || '00:00';

    if (!content || !recipientEmail || !deliveryDate) {
        showModal("Validasi Gagal", "Isi surat, email penerima, dan tanggal pengiriman wajib diisi.");
        return;
    }
    if (!recipientEmail.includes('@')) {
        showModal("Validasi Gagal", "Format email penerima tidak valid.");
        return;
    }

    const deliveryDateTime = new Date(`${deliveryDate}T${deliveryTime}`);
    const now = new Date();

    if (deliveryDateTime <= now) {
        showModal("Waktu Pengiriman Tidak Valid", "Tanggal dan waktu pengiriman harus di masa depan.");
        return;
    }
    
    sendBtn.disabled = true;
    loadingSpinner.style.display = 'block';

    // 1. Tampilkan Animasi
    sendAnimationOverlay.style.display = 'flex';
    
    // Atur ulang animasi untuk memastikan terpicu lagi
    envelopeIcon.style.animation = 'none';
    void envelopeIcon.offsetWidth; // Trigger reflow
    envelopeIcon.style.animation = null; 

    // Tambahkan waktu tunggu animasi (misalnya 2.5 detik)
    await new Promise(resolve => setTimeout(resolve, 2500)); 

    // 2. Lakukan Operasi Firestore
    const letterData = {
        title: letterTitle,
        content: content,
        recipientEmail: recipientEmail,
        senderName: senderName,
        deliveryTimestamp: deliveryDateTime.getTime(), 
        sent: false,
        createdAt: serverTimestamp(),
    };

    try {
        await addDoc(getLettersCollection(userId), letterData);
        
        // 3. Bersihkan Formulir dan Tampilkan Sukses
        document.getElementById('content').value = '';
        document.getElementById('recipient-email').value = '';
        document.getElementById('sender-name').value = '';
        document.getElementById('letter-title').value = '';
        document.getElementById('delivery-date').value = '';
        document.getElementById('delivery-time').value = '00:00';
        
        // Sembunyikan Animasi setelah operasi selesai
        sendAnimationOverlay.style.display = 'none';
        showModal("Berhasil Dikunci!", `Surat "${letterTitle}" telah dikunci dan akan dikirim pada ${deliveryDate} pukul ${deliveryTime}.`);

    } catch (e) {
        console.error("Error adding document: ", e);
        sendAnimationOverlay.style.display = 'none';
        showModal("Kesalahan", "Gagal menyimpan surat ke masa depan. Coba lagi.");
    } finally {
        loadingSpinner.style.display = 'none';
        sendBtn.disabled = false;
    }
};

// FUNGSI MENGHAPUS SURAT
window.deleteLetter = async (letterId, title) => {
    if (!userId || !db) return;

    // Karena kita tidak boleh menggunakan confirm(), kita akan menggunakan modal konfirmasi sederhana
    const confirmDelete = window.confirm(`Apakah Anda yakin ingin menghapus surat "${title}"? Tindakan ini tidak dapat dibatalkan.`);
    
    if (confirmDelete) {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/future_letters`, letterId));
            // Tidak perlu showModal sukses karena onSnapshot akan memicu render ulang
        } catch (e) {
            console.error("Error deleting document: ", e);
            showModal("Kesalahan Hapus", "Gagal menghapus surat. Coba lagi.");
        }
    }
};

// FUNGSI MEMUAT SURAT SECARA REAL-TIME
function loadLetters() {
    if (!db || !userId) return;

    const q = query(
        getLettersCollection(userId),
        where("sent", "==", false),
    );

    onSnapshot(q, (snapshot) => {
        const letters = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            letters.push({
                id: doc.id,
                ...data,
                deliveryTimestamp: data.deliveryTimestamp || 0,
                title: data.title || 'Surat Tanpa Judul'
            });
        });

        letters.sort((a, b) => a.deliveryTimestamp - b.deliveryTimestamp);
        renderLetters(letters);
    }, (error) => {
        console.error("Error fetching documents: ", error);
    });
}

// FUNGSI MERENDER DAFTAR SURAT
function renderLetters(letters) {
    letterListEl.innerHTML = '';
    
    if (letters.length === 0) {
        noLettersMessage.style.display = 'block';
        return;
    }

    noLettersMessage.style.display = 'none';

    letters.forEach(letter => {
        const item = document.createElement('li');
        item.className = 'letter-item';

        const date = new Date(letter.deliveryTimestamp);
        const formattedDate = date.toLocaleDateString('id-ID', { 
            year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        item.innerHTML = `
            <div class="letter-details">
                <strong>${letter.title}</strong>
                <span>Terkirim ke ${letter.recipientEmail}</span>
            </div>
            <span>Dikirim: ${formattedDate}</span>
            <button class="delete-btn" onclick="deleteLetter('${letter.id}', '${letter.title.replace(/'/g, "\\'")}')">
                    <i class="fas fa-trash-alt"></i>
            </button>
        `;
        letterListEl.appendChild(item);
    });
}

// Set event listener for the send button
sendBtn.addEventListener('click', window.handleSend);

// Set tanggal minimum saat halaman dimuat
window.onload = function() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('delivery-date').setAttribute('min', today);
};