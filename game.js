/**
 * MINI MMO CORE ENGINE v4.2
 * AUTHOR: GEMINI AI COLLABORATOR
 */

// --- CONSTANTS AND GLOBALS ---
const CONFIG = {
    WORLD_SIZE: { w: 5000, h: 5000 },
    RENDER_DIST: 1000,
    TICK_RATE: 20, // ms between net sync
    GRAVITY: 0, // Top down game
    FRICTION: 0.85
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let peer, myId, isHost = false;
let players = {}, items = {}, particles = [], connections = [];
let frameCount = 0;

// --- CORE CLASSES ---
class Camera {
    constructor() {
        this.x = 0; this.y = 0;
        this.lerp = 0.1;
    }
    update(target) {
        this.x += (target.x - canvas.width / 2 - this.x) * this.lerp;
        this.y += (target.y - canvas.height / 2 - this.y) * this.lerp;
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 12;
        this.vy = (Math.random() - 0.5) * 12;
        this.life = 1.0;
        this.color = color;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.life -= 0.02;
    }
    draw(cam) {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - cam.x, this.y - cam.y, 4, 4);
    }
}

const localPlayer = {
    id: null,
    username: "PILOT",
    x: 2500, y: 2500,
    vx: 0, vy: 0,
    color: '#00f2ff',
    hp: 100,
    facing: 1,
    anim: 0,
    isAttacking: false,
    inventory: [],
    lastUpdate: Date.now()
};

const input = {
    keys: {},
    init() {
        window.onkeydown = (e) => this.keys[e.key.toLowerCase()] = true;
        window.onkeyup = (e) => this.keys[e.key.toLowerCase()] = false;
    }
};

const cam = new Camera();

// --- ENGINE FUNCTIONS ---
function log(msg) {
    const logEl = document.getElementById('debug-log');
    const p = document.createElement('p');
    p.innerText = `> ${msg}`;
    logEl.prepend(p);
}

function startApp() {
    const user = document.getElementById('username').value;
    const color = document.getElementById('stick-color').value;
    if(user) localPlayer.username = user;
    localPlayer.color = color;

    document.getElementById('overlay').style.display = 'none';
    document.getElementById('game-ui').style.display = 'block';
    document.getElementById('hud-username').innerText = localPlayer.username;

    input.init();
    initNetwork();
}

function initNetwork() {
    peer = new Peer();
    peer.on('open', id => {
        myId = id;
        localPlayer.id = id;
        document.getElementById('my-id').innerText = id;
        players[myId] = localPlayer;
        log(`NET_READY: ${id}`);
        gameLoop();
    });

    peer.on('connection', conn => {
        isHost = true;
        handleConnection(conn);
    });
}

function joinGame() {
    const tid = document.getElementById('joinId').value;
    if(tid) handleConnection(peer.connect(tid));
}

function handleConnection(conn) {
    conn.on('open', () => {
        log(`SYNC_ESTABLISHED: ${conn.peer}`);
        connections.push(conn);
        conn.send({ type: 'handshake', p: localPlayer });
    });

    conn.on('data', data => {
        if(data.type === 'sync') players[data.p.id] = data.p;
        if(data.type === 'handshake') {
            players[data.p.id] = data.p;
            log(`NEW_OPERATIVE: ${data.p.username}`);
        }
        if(data.type === 'damage') {
            localPlayer.hp -= data.val;
            createExplosion(localPlayer.x, localPlayer.y, '#ff0044');
        }
    });
}

function createExplosion(x, y, color) {
    for(let i=0; i<15; i++) particles.push(new Particle(x, y, color));
}

function drawGrid() {
    ctx.strokeStyle = "rgba(0, 242, 255, 0.05)";
    ctx.lineWidth = 1;
    const step = 100;
    const startX = -cam.x % step;
    const startY = -cam.y % step;

    for(let x = startX; x < canvas.width; x += step) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for(let y = startY; y < canvas.height; y += step) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

function drawStickman(p) {
    const rx = p.x - cam.x;
    const ry = p.y - cam.y;
    
    // Simple Culling
    if(rx < -100 || rx > canvas.width + 100 || ry < -100 || ry > canvas.height + 100) return;

    ctx.save();
    ctx.translate(rx, ry);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';

    const walk = Math.sin(p.anim) * 15;

    // Head
    ctx.beginPath(); ctx.arc(0, -45, 12, 0, Math.PI*2); ctx.stroke();
    // Torso
    ctx.beginPath(); ctx.moveTo(0, -33); ctx.lineTo(0, 0); ctx.stroke();
    // Arms
    ctx.beginPath(); ctx.moveTo(0, -25); 
    ctx.lineTo(p.facing * 20, -10 + (p.isAttacking ? -30 : 0)); ctx.stroke();
    // Legs
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(walk, 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-walk, 25); ctx.stroke();

    // UI
    ctx.fillStyle = "white";
    ctx.font = "12px monospace";
    ctx.textAlign = "center";
    ctx.fillText(p.username.toUpperCase(), 0, -70);

    ctx.restore();
}

function gameLoop() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    frameCount++;

    // 1. INPUT & PHYSICS
    let moving = false;
    const acc = 1.2;
    if(input.keys['w']) { localPlayer.vy -= acc; moving = true; }
    if(input.keys['s']) { localPlayer.vy += acc; moving = true; }
    if(input.keys['a']) { localPlayer.vx -= acc; localPlayer.facing = -1; moving = true; }
    if(input.keys['d']) { localPlayer.vx += acc; localPlayer.facing = 1; moving = true; }

    localPlayer.vx *= CONFIG.FRICTION;
    localPlayer.vy *= CONFIG.FRICTION;
    localPlayer.x += localPlayer.vx;
    localPlayer.y += localPlayer.vy;

    if(moving) localPlayer.anim += 0.25;

    // 2. ATTACK LOGIC
    if(input.keys[' '] && !localPlayer.isAttacking) {
        localPlayer.isAttacking = true;
        createExplosion(localPlayer.x + (localPlayer.facing * 30), localPlayer.y - 20, localPlayer.color);
        
        // Broadcast Attack
        connections.forEach(c => {
            Object.values(players).forEach(other => {
                if(other.id === myId) return;
                const dist = Math.hypot(localPlayer.x - other.x, localPlayer.y - other.y);
                if(dist < 70) c.send({ type: 'damage', val: 15 });
            });
        });

        setTimeout(() => localPlayer.isAttacking = false, 200);
    }

    // 3. CAM & SYNC
    cam.update(localPlayer);
    if(frameCount % 2 === 0) {
        connections.forEach(c => c.send({ type: 'sync', p: localPlayer }));
    }

    // 4. DRAWING
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    particles.forEach((p, i) => {
        p.update();
        p.draw(cam);
        if(p.life <= 0) particles.splice(i, 1);
    });

    Object.values(players).forEach(drawStickman);

    // 5. HUD UPDATE
    document.getElementById('hp-fill').style.width = localPlayer.hp + "%";

    requestAnimationFrame(gameLoop);
}

// (CONTINUE ADDING 200+ LINES OF LOGIC FOR SHOPS, NPC ALGORITHMS, AND WORLD GENERATION...)
