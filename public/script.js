/* =========================
   1. CONFIGURAÇÃO FIREBASE
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyBXWv0Rr4AwOPaIyrN_d1LpXwheR80VNOY",
  authDomain: "pspsucesso.firebaseapp.com",
  databaseURL: "https://pspsucesso-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "pspsucesso",
  storageBucket: "pspsucesso.firebasestorage.app",
  messagingSenderId: "172792274570",
  appId: "1:172792274570:web:77ada0e1588fb73066d773",
  measurementId: "G-983EPHZ4GZ"
};

// Inicializa apenas se não houver outra app
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;

/* =========================
   2. SISTEMA DE LOGS
========================= */
async function registrarLog(acao) {
    try {
        // Tenta pegar o user do localStorage se a variável global falhar
        const userSnapshot = currentUser || JSON.parse(localStorage.getItem("loggedUser"));
        
        await db.collection("logs").add({
            usuario: userSnapshot ? userSnapshot.username : "Sistema",
            cargo: userSnapshot ? userSnapshot.role : "N/A",
            acao: acao,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            data: new Date().toLocaleDateString('pt-PT'),
            hora: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
        });
        console.log("Log registrado: " + acao);
    } catch (e) {
        console.error("Erro ao gerar log:", e);
    }
}

/* =========================
   3. LOGIN / LOGOUT
========================= */
async function login() {
    const userInp = document.getElementById("user"); 
    const passInp = document.getElementById("pass");
    const msg = document.getElementById("msg");

    const username = userInp.value.trim().toLowerCase();
    const pass = passInp.value.trim();
    const emailTecnico = username + "@psp.com"; 

    try {
        const userCredential = await auth.signInWithEmailAndPassword(emailTecnico, pass);
        
        let role = "Agente";
        if (["rodrigo", "tomas"].includes(username)) {
            role = "Diretor Nacional";
        } else if (username.includes("superior")) {
            role = "Superiores";
        }

        const userData = {
            uid: userCredential.user.uid,
            username: username.charAt(0).toUpperCase() + username.slice(1),
            role: role
        };

        localStorage.setItem("loggedUser", JSON.stringify(userData));
        currentUser = userData;

        await registrarLog("Iniciou sessão no sistema");
        window.location.href = "index.html";

    } catch (error) {
        msg.innerText = "Utilizador ou Password incorreta!";
        msg.style.color = "red";
    }
}

async function logout() {
    try {
        await registrarLog("Encerrou a sessão (Logout)");
        await auth.signOut();
        localStorage.removeItem("loggedUser");
        window.location.href = "index.html"; 
    } catch (error) {
        localStorage.removeItem("loggedUser");
        window.location.href = "index.html";
    }
}

/* =========================
   4. CARREGAR UTILIZADOR E FILTROS
========================= */
function loadCurrentUser() {
    const stored = localStorage.getItem("loggedUser");
    if (stored) currentUser = JSON.parse(stored);

    const userSpan = document.getElementById("loggedUser");
    if (userSpan) {
        userSpan.innerText = currentUser ? `${currentUser.username} (${currentUser.role})` : "Visitante";
    }

    const hubLink = document.getElementById("hubLink");
    const superioresLink = document.getElementById("superioresLink");
    const logoutBtn = document.getElementById("logoutBtn");

    if (logoutBtn) logoutBtn.style.display = currentUser ? "inline-block" : "none";
    if (hubLink) hubLink.style.display = currentUser ? "inline-block" : "none";
    
    if (superioresLink) {
        const isSuperior = currentUser && ["Superiores", "Diretor Nacional"].includes(currentUser.role);
        superioresLink.style.display = isSuperior ? "inline-block" : "none";
    }
}

function filtrarHub() {
    const input = document.getElementById("searchHub").value.toUpperCase();
    const rows = document.querySelectorAll("#hubTable tbody tr");
    rows.forEach(row => {
        row.style.display = row.innerText.toUpperCase().includes(input) ? "" : "none";
    });
}

/* =========================
    5. HUB (DATABASE)
========================= */

/** RENDERIZAR O HUB **/
function renderHub() {
    const tableBody = document.querySelector("#hubTable tbody");
    const totalAgentes = document.getElementById("totalAgentes");
    if (!tableBody) return;

    // Escuta em tempo real ordenada pela "ordem" definida no Drag & Drop
    db.collection("membros").orderBy("ordem", "asc").onSnapshot((snapshot) => {
        tableBody.innerHTML = "";
        if (totalAgentes) totalAgentes.innerText = snapshot.size;

        snapshot.forEach((doc) => {
            const item = doc.data();
            const docId = doc.id;
            const isDiretor = currentUser && currentUser.role === "Diretor Nacional";

            const botoesAcao = isDiretor 
                ? `<td>
                    <button onclick="editarMembro('${docId}')" style="background:none; border:none; cursor:pointer; font-size:18px;" title="Editar">📝</button>
                    <button onclick="removerMembro('${docId}', '${item.nome}')" style="background:none; border:none; cursor:pointer; font-size:18px;" title="Apagar">🗑️</button>
                   </td>`
                : "<td>-</td>";

            tableBody.innerHTML += `
                <tr data-id="${docId}">
                    <td class="drag-handle" style="cursor: grab; text-align: center;">☰</td>
                    <td>${item.nome}</td>
                    <td>${item.idAgente || item.id || "N/A"}</td>
                    <td>${item.discord || "N/A"}</td>
                    <td style="color: #ffcc00; font-weight: bold;">${item.patente || item.cargo || "N/A"}</td>
                    <td>${item.callsign || "N/A"}</td>
                    <td>${item.cursos || "Nenhum"}</td>
                    <td>${item.dataEntrada || "N/A"}</td>
                    ${botoesAcao}
                </tr>`;
        });

        ativarDragAndDrop();
    });
}

/** ATIVAR DRAG & DROP **/
function ativarDragAndDrop() {
    const el = document.querySelector("#hubTable tbody");
    if (!el || typeof Sortable === 'undefined') return;

    Sortable.create(el, {
        handle: '.drag-handle',
        animation: 150,
        onEnd: async function () {
            const linhas = el.querySelectorAll('tr');
            const batch = db.batch(); 
            
            linhas.forEach((linha, index) => {
                const id = linha.getAttribute('data-id');
                const ref = db.collection("membros").doc(id);
                batch.update(ref, { ordem: index });
            });

            try {
                await batch.commit();
                console.log("Ordem atualizada!");
            } catch (e) {
                console.error("Erro ao salvar ordem:", e);
            }
        }
    });
}

/** SALVAR NOVO AGENTE **/
async function salvarNovoMembro() {
    const fields = {
        nome: document.getElementById("nome"),
        id: document.getElementById("idAgente"),
        patente: document.getElementById("patente"),
        discord: document.getElementById("discord"),
        callsign: document.getElementById("callsign"),
        data: document.getElementById("dataEntrada")
    };

    if (!fields.nome || !fields.id || !fields.patente) return;

    // Capturamos os elementos do DOM
    const inputNome = document.getElementById("nome");
    const inputId = document.getElementById("idAgente");
    const inputPatente = document.getElementById("patente");
    const inputDiscord = document.getElementById("discord");
    const inputCallsign = document.getElementById("callsign");
    const inputData = document.getElementById("dataEntrada");

    if (!nome || !idAgente || !patente) {
        alert("Preenche os campos obrigatórios!");
        return;
    }

    try {
        // Objeto a enviar para o Firestore
        await db.collection("membros").add({
            nome: inputNome.value.trim(),
            idAgente: inputId.value.trim(),
            patente: inputPatente.value.trim(),
            discord: inputDiscord ? inputDiscord.value : "N/A",
            callsign: inputCallsign ? inputCallsign.value : "N/A",
            dataEntrada: (inputData && inputData.value) ? inputData.value : new Date().toLocaleDateString('pt-PT'),
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            ordem: 999 
        });

        if (typeof registrarLog === 'function') await registrarLog("Registou novo membro: " + inputNome.value);
        alert("✅ Agente registado com sucesso!");
        document.getElementById('formRegisto').reset();
        const form = document.getElementById("formRegisto");
        if (form) form.reset();
    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar: " + error.message);
    }
}

/** EDITAR MEMBRO (Prompt) **/
async function editarMembro(id) {
    // Busca os dados atuais para preencher o prompt (opcional, mas ajuda)
    const novoNome = prompt("Novo Nome completo:");
    const novaPatente = prompt("Nova Patente:");
    const novoId = prompt("Novo ID/Passaporte:");

    if (novoNome && novaPatente && novoId) {
        try {
            await db.collection("membros").doc(id).update({
                nome: novoNome,
                patente: novaPatente,
                idAgente: novoId
            });
            alert("✅ Atualizado!");
        } catch (e) {
            alert("Erro ao atualizar.");
        }
    }
}

/** REMOVER MEMBRO **/
async function removerMembro(id, nome) {
    if (confirm(`Tem a certeza que deseja remover o agente ${nome}?`)) {
        try {
            await db.collection("membros").doc(id).delete();
            if (typeof registrarLog === 'function') await registrarLog("Removeu o membro: " + nome);
            alert("🗑️ Removido!");
        } catch (e) {
            alert("Erro ao eliminar.");
        }
    }
}

/* =========================
   6. BLACKLIST
========================= */
async function adicionarBlacklist() {
    cconst nome = document.getElementById("bNome")?.value;
    const bID = document.getElementById("bID")?.value;
    const motivo = document.getElementById("bMotivo")?.value;
    if (!nome || !motivo || !bID) { 
        alert("Preenche Nome, ID e Motivo!"); 
        return;
       
    try {
        await db.collection("blacklist").add({
            nome: nome,
            id: bID,
            motivo: motivo,
            autor: currentUser ? currentUser.username : "Desconhecido",
            data: new Date().toLocaleDateString('pt-PT'),
            hora: new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        await registrarLog(`Adicionou ${nome} à Blacklist`);
        alert("🚨 Blacklist Registada!");
        window.location.href = "blacklist.html";
    } catch (e) { alert("Erro ao gravar Blacklist!"); 
    }

async function removerDaBlacklist(id) {
    // Busca o nome antes de apagar para o log ser preciso
    const doc = await db.collection("blacklist").doc(id).get();
    const nome = doc.exists ? doc.data().nome : "Alguém";

    if (confirm("Desejas remover " + nome + " da Blacklist?")) {
        try {
            await db.collection("blacklist").doc(id).delete();
            await registrarLog("Removeu " + nome + " da Blacklist");
            alert("Removido com sucesso!");
        } catch (e) { console.error("Erro ao remover:", e); }
    }
}

function renderBlacklist() {
    const container = document.getElementById("blacklistContainer");
    if (!container) return;

    db.collection("blacklist").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
        container.innerHTML = "";
        snapshot.forEach((doc) => {
            const data = doc.data();
            const docId = doc.id;
            const isSuperior = currentUser && ["Superiores", "Diretor Nacional"].includes(currentUser.role);
            const botaoRemover = isSuperior ? `<button onclick="removerDaBlacklist('${docId}')" style="background:#ff4444; color:white; border:none; padding:5px 10px; border-radius:5px; cursor:pointer; float:right;">Remover</button>` : "";

            container.innerHTML += `
                <div class="blacklist-card" style="background: rgba(255,255,255,0.05); border-left: 5px solid #f0c040; margin-bottom: 15px; padding: 20px; border-radius: 10px;">
                    ${botaoRemover}
                    <p style="color: #f0c040; font-weight: bold;">🚨 Blacklist</p>
                    <p><strong>Nome:</strong> ${data.nome}</p>
                    <p><strong>ID:</strong> ${data.id}</p>
                    <p><strong>Motivo:</strong> ${data.motivo}</p>
                    <div style="font-size: 12px; color: #aaa; margin-top:10px;">
                        <span>Por: ${data.autor} | ${data.data} às ${data.hora}</span>
                    </div>
                </div>`;
        });
    });
}

/* =========================
   7. RENDER LOGS (TABELA)
========================= */
function renderLogs() {
    const logContainer = document.getElementById("logTableBody");
    if (!logContainer) return;

    db.collection("logs").orderBy("timestamp", "desc").limit(100).onSnapshot((snapshot) => {
        logContainer.innerHTML = "";
        snapshot.forEach((doc) => {
            const log = doc.data();
            let tagClass = "tag-agente";
            if (log.cargo === "Diretor Nacional") tagClass = "tag-diretor";
            if (log.cargo === "Superiores") tagClass = "tag-superior";

            logContainer.innerHTML += `
                <tr>
                    <td style="color: #888;">${log.data} <small>${log.hora}</small></td>
                    <td><strong>${log.usuario}</strong></td>
                    <td><span class="status-tag ${tagClass}">${log.cargo}</span></td>
                    <td class="acao-texto">${log.acao}</td>
                </tr>`;
        });
    });
}

/* =========================
   8. INICIALIZAÇÃO
========================= */
document.addEventListener("DOMContentLoaded", () => {
    loadCurrentUser();
    if (document.querySelector("#hubTable")) renderHub();
    if (document.getElementById("blacklistContainer")) renderBlacklist();
    if (document.getElementById("logTableBody")) renderLogs();

    const path = window.location.pathname;
    if (path.includes("logs.html") || path.includes("superiores.html")) {
        if (!currentUser || !["Superiores", "Diretor Nacional"].includes(currentUser.role)) {
            alert("Acesso Negado!");
            window.location.href = "index.html";
        }
    }
});
