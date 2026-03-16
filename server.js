const express = require('express');
const { v4: uuidv4 } = require('uuid');
const app = express();

app.use(express.json());
app.use(express.static('public')); // Serves your index.html

// Global storage: Works across all servers
let activeGiveaways = {};

// THE START ENDPOINT
app.post('/gilbertapi/start', (req, res) => {
    const { serverId, duration, winners, prize } = req.body;

    // Create a unique ID so multiple giveaways can run at once
    const gId = uuidv4();
    const endAt = Date.now() + (duration * 60 * 60 * 1000);

    activeGiveaways[gId] = {
        prize,
        winnersNeeded: winners,
        endTime: endAt,
        serverId: serverId,
        participants: [], // Will store usernames here
        ended: false
    };

    console.log(`[GilbertAPI] New Giveaway Started in Server ${serverId}: ${prize}`);
    
    res.json({ 
        status: "success", 
        giveawayId: gId, 
        closesAt: new Date(endAt).toLocaleString() 
    });
});

// THE JOIN ENDPOINT (Bot sends user data here)
app.post('/gilbertapi/join', (req, res) => {
    const { giveawayId, username } = req.body;
    
    const giveaway = activeGiveaways[giveawayId];
    if (!giveaway) return res.status(404).json({ error: "Giveaway not found" });

    if (!giveaway.participants.includes(username)) {
        giveaway.participants.push(username);
        return res.json({ status: "joined", total: giveaway.participants.length });
    }
    
    res.status(400).json({ error: "User already in list" });
});

// VIEW ALL MEMBERS ENDPOINT
app.get('/gilbertapi/list/:id', (req, res) => {
    const g = activeGiveaways[req.params.id];
    if (!g) return res.status(404).json({ error: "Not found" });
    
    res.json({
        prize: g.prize,
        participantCount: g.participants.length,
        usernames: g.participants // This lets you see everyone who joined
    });
});

app.listen(3000, () => console.log('GilbertAPI is live on port 3000'));
