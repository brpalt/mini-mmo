const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// --- Game State ---
const peer = new Peer(); // Create P2P object
let myId = "";
let connections = [];
let players = {}; // Stores all stick figures {id: {x, y, color, hp}}
let items = []; // For collecting abilities

const localPlayer = {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    color: '#' + Math.floor(Math.random()*16777215).toString(16),
    hp: 100,
    isAttacking: false
};

// --- Networking ---
peer.on('open', (id) => {
    myId = id;
    document.getElementById('my-id').innerText = id;
    document.getElementById('status').innerText = "Online - Share ID with friends";
    players[myId] = localPlayer;
});

// Handling incoming connections (Someone joins you)
peer.on('connection', (conn) => {
    setupConnection(conn);
});

function joinGame() {
    const friendId = document.getElementById('joinId').value;
    if (friendId) {
        const conn = peer.connect(friendId);
        setupConnection(conn);
    }
}

function setupConnection(conn) {
    conn.on('open', () => {
        connections.push(conn);
        document.getElementById('status').innerText = "Connected to Player!";
        // Send initial state
        conn.send({ type: 'init', id: myId, data: localPlayer });
    });

    conn.on('data', (data) => {
        if (data.type === 'update') {
            players[data.id] = data.data;
        }
        if (data.type === 'init') {
            players[data.id] = data.data;
        }
    });
}

// --- Game Loop ---
function drawStickFigure(p) {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    const {x, y} = p;
    
    // Head
    ctx.beginPath(); ctx.arc(x, y-30, 10, 0, Math.PI*2); ctx.stroke();
    // Body
    ctx.beginPath(); ctx.moveTo(x, y-20); ctx.lineTo(x, y+10); ctx.stroke();
    // Arms
    ctx.beginPath(); ctx.moveTo(x-15, y-10); ctx.lineTo(x+15, y-10); ctx.stroke();
    // Legs
    ctx.beginPath(); ctx.moveTo(x, y+10); ctx.lineTo(x-10, y+30);
    ctx.moveTo(x, y+10); ctx.lineTo(x+10, y+30); ctx.stroke();

    // Health Bar
    ctx.fillStyle = "red";
    ctx.fillRect(x-15, y-50, 30 * (p.hp/100), 5);
}

function update() {
    // Movement
    if (keys['ArrowUp'] || keys['w']) localPlayer.y -= 4;
    if (keys['ArrowDown'] || keys['s']) localPlayer.y += 4;
    if (keys['ArrowLeft'] || keys['a']) localPlayer.x -= 4;
    if (keys['ArrowRight'] || keys['d']) localPlayer.x += 4;

    // Broadcast position to all connected peers
    connections.forEach(conn => {
        conn.send({ type: 'update', id: myId, data: localPlayer });
    });

    // Draw
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    Object.values(players).forEach(p => drawStickFigure(p));

    requestAnimationFrame(update);
}

// Input Handling
const keys = {};
window.onkeydown = (e) => keys[e.key] = true;
window.onkeyup = (e) => keys[e.key] = false;

update();
