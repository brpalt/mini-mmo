const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let peer, myId, connections = [];
let players = {};
let items = {}; // Object instead of Array for easier syncing by ID
let frame = 0;
let isHost = false;

const localPlayer = {
    username: "Player",
    x: Math.random() * (canvas.width - 100) + 50,
    y: Math.random() * (canvas.height - 100) + 50,
    color: "#00ffcc",
    hp: 100,
    animStep: 0,
    isAttacking: false,
    attackFrame: 0,
    inventory: [],
    facing: 1,
    speed: 4
};

const keys = {};
window.onkeydown = (e) => keys[e.key] = true;
window.onkeyup = (e) => keys[e.key] = false;

function startApp() {
    const user = document.getElementById('username').value;
    if(user) localPlayer.username = user;
    document.getElementById('setup').style.display = 'none';
    document.getElementById('multiplayer').style.display = 'block';
    initNetwork();
}

function initNetwork() {
    peer = new Peer();
    peer.on('open', id => {
        myId = id;
        document.getElementById('my-id').innerText = id;
        players[myId] = localPlayer;
        updateLoop();
    });
    peer.on('connection', conn => {
        isHost = true; // If someone connects to you, you are the host
        setupConnection(conn);
    });
}

function joinGame() {
    const targetId = document.getElementById('joinId').value;
    isHost = false; // You joined someone else
    setupConnection(peer.connect(targetId));
}

function setupConnection(conn) {
    conn.on('open', () => {
        connections.push(conn);
        conn.send({ type: 'init', id: myId, data: localPlayer });
    });
    conn.on('data', data => {
        if(data.type === 'update') players[data.id] = data.data;
        if(data.type === 'init') players[data.id] = data.data;
        if(data.type === 'attack_event') handleHitDetection(data.id);
        if(data.type === 'spawnItem') items[data.item.id] = data.item;
        if(data.type === 'removeItem') delete items[data.itemId];
    });
}

// --- Combat Logic ---
function handleHitDetection(attackerId) {
    const attacker = players[attackerId];
    if (!attacker) return;
    
    // Distance check for melee hit
    const dx = localPlayer.x - attacker.x;
    const dy = localPlayer.y - attacker.y;
    const distance = Math.sqrt(dx*dx + dy*dy);

    // If attacker is close and facing the player
    if (distance < 60) {
        localPlayer.hp -= 15;
        // Visual feedback (flash red)
        localPlayer.color = "#ff0000";
        setTimeout(() => localPlayer.color = "#00ffcc", 100);

        if(localPlayer.hp <= 0) {
            localPlayer.hp = 100;
            localPlayer.x = Math.random() * canvas.width;
            localPlayer.y = Math.random() * canvas.height;
        }
    }
}

// --- Drawing Functions ---
function drawMap() {
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1;
    const spacing = 50;
    for(let i=0; i<canvas.width; i+=spacing) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for(let i=0; i<canvas.height; i+=spacing) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }
}

function drawStickman(p) {
    const {x, y, color, animStep, facing, isAttacking, attackFrame} = p;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    
    const legMove = Math.sin(animStep) * 12;
    // If attacking, arm lunges forward
    const armMove = isAttacking ? 25 : Math.cos(animStep) * 8;

    // Head
    ctx.beginPath(); ctx.arc(x, y - 40, 10, 0, 7); ctx.stroke();
    // Body
    ctx.beginPath(); ctx.moveTo(x, y - 30); ctx.lineTo(x, y); ctx.stroke();
    // Arms
    ctx.beginPath(); ctx.moveTo(x, y - 25); 
    ctx.lineTo(x + (facing * armMove), y - 15); ctx.stroke();
    // Legs
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - legMove, y + 20); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + legMove, y + 20); ctx.stroke();

    // Name and HP
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.fillText(p.username, x, y - 65);
    ctx.fillStyle = "#333";
    ctx.fillRect(x - 20, y - 60, 40, 5);
    ctx.fillStyle = "#00ffcc";
    ctx.fillRect(x - 20, y - 60, 40 * (p.hp/100), 5);
}

function updateLoop() {
    frame++;
    let moved = false;

    // 1. Movement
    if (keys['w'] || keys['ArrowUp']) { localPlayer.y -= localPlayer.speed; moved = true; }
    if (keys['s'] || keys['ArrowDown']) { localPlayer.y += localPlayer.speed; moved = true; }
    if (keys['a'] || keys['ArrowLeft']) { localPlayer.x -= localPlayer.speed; localPlayer.facing = -1; moved = true; }
    if (keys['d'] || keys['ArrowRight']) { localPlayer.x += localPlayer.speed; localPlayer.facing = 1; moved = true; }
    
    if (moved) localPlayer.animStep += 0.15;
    
    // 2. Attacking (Space)
    if (keys[' '] && !localPlayer.isAttacking) {
        localPlayer.isAttacking = true;
        // Notify others that I am attacking
        connections.forEach(c => c.send({type: 'attack_event', id: myId}));
        setTimeout(() => localPlayer.isAttacking = false, 300);
    }

    // 3. Item Collision & Sync
    Object.keys(items).forEach(id => {
        const item = items[id];
        const dist = Math.hypot(localPlayer.x - item.x, localPlayer.y - item.y);
        
        if(dist < 25) {
            // Apply Powerup
            if(item.type === 'speed') { localPlayer.speed = 7; setTimeout(() => localPlayer.speed = 4, 5000); }
            if(item.type === 'heal') { localPlayer.hp = Math.min(100, localPlayer.hp + 30); }
            
            localPlayer.inventory.push(item.type);
            document.getElementById('item-list').innerText = localPlayer.inventory.slice(-3).join(", ");
            
            // Tell everyone to remove this item
            connections.forEach(c => c.send({type: 'removeItem', itemId: id}));
            delete items[id];
        }
    });

    // 4. Host Logic (Spawn Items)
    if (isHost && frame % 200 === 0) {
        const types = ['speed', 'heal', 'shield'];
        const newItem = { 
            x: Math.random() * (canvas.width - 50) + 25, 
            y: Math.random() * (canvas.height - 50) + 25, 
            id: 'item_' + Date.now(),
            type: types[Math.floor(Math.random() * types.length)]
        };
        items[newItem.id] = newItem;
        connections.forEach(c => c.send({type: 'spawnItem', item: newItem}));
    }

    // 5. Broadcast Position
    connections.forEach(c => c.send({type: 'update', id: myId, data: localPlayer}));

    // 6. Draw Everything
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMap();
    
    // Draw Items
    Object.values(items).forEach(item => {
        ctx.shadowBlur = 10;
        ctx.shadowColor = item.type === 'speed' ? '#00ffff' : '#ff00ff';
        ctx.fillStyle = ctx.shadowColor;
        ctx.beginPath(); ctx.arc(item.x, item.y, 10, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
    });

    Object.values(players).forEach(p => drawStickman(p));
    
    requestAnimationFrame(updateLoop);
}
