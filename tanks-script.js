# tanks-script.js
# https://cytu.be/r/BLOGUS

Thank you for the updated logs—they're super helpful for debugging. I'll break this down step by step: what I'm seeing in the logs, what the issues are, the fixes/changes I'm making, and how to get more debugging info (including hotkeys for copying console logs in Firefox). At the end, I'll provide the full updated script as one block.

### What I'm Seeing in the Logs
- The script initializes fine (loads libraries, adds canvas, etc.).
- Chat mutations are detected when you type messages (good—the observer is working).
- It identifies the message divs as `chat-msg-Head_Zionist` (so your username is "Head_Zionist", and messages are classed with the username).
- For the first message: It finds the div, finds the username container, but skips because `isMod` is false ("Not a mod message"). This means the class on the username span doesn't match what the script expects (e.g., not 'userlist-moderator', 'userlist-owner', or 'userlist-admin').
- For follow-up messages (if you send multiple in a row): It skips because there's no username container (Cytube omits the username span for consecutive messages from the same user, just adding the message text). This isn't breaking /startgame (which is likely a new message), but it's something to note for robustness.

No errors, so the core rendering should work once the command triggers. The game isn't starting because the script thinks you're not a mod (even if you are the room owner).

### Fixes and Code Changes
- **Expand Mod Check**: Cytube uses classes like 'userlist-owner' for owners, 'userlist-siteadmin' for admins, 'userlist-moderator' or sometimes 'userlist-op' for mods (from old docs/code). I'm adding all possible ones to `isMod` to cover variations. If none match, it won't trigger.
- **Temporary Disable Mod Check**: I've kept the mod check commented out (as in the last version) for testing—uncomment it once we confirm your class. This lets any user trigger /startgame, so we can see if the game renders.
- **Handle Follow-up Messages**: Added logic to look for the message text even if no username container (for consecutive messages). If no container, it assumes it's a continuation and skips mod check (since /startgame is probably new, but this makes it more robust).
- **More Debug Logs**: Added logs for username container classes and `isMod` value, so next run will show exactly why it's skipping (e.g., what classes are on your username span).
- **User List Fix (from earlier)**: Kept the improved user extraction using `.querySelectorAll('.username')`—this grabs names directly from <strong class="username"> spans in #userlist, which is more reliable.
- **Visibility Test**: Temporarily set `canvas.style.zIndex = '9999';` (instead of '-1') so the canvas overlays everything if the game starts—you'll see the magenta wireframe and boxes immediately. Revert to '-1' after confirming, and use the CSS `body { background: transparent !important; }` in room settings to see it as background.
- **No Other Changes**: No hotkeys in the script (it's passive simulation, no user input). Just type /startgame [level] in chat.

Run this new version, reload the page, type /startgame test, and share the new logs. If it triggers, you'll see "[Tanks Script] Game started!" and entity additions. If not, the logs will show the exact classes—then we can adjust.

### Hotkeys and Debugging Info in Firefox (F12 Console)
- **Open Console**: Press F12 (or Ctrl+Shift+I), then click the "Console" tab.
- **Copy Single Log**: Right-click a log entry > "Copy message".
- **Copy Multiple/All Logs**: Click and drag to select lines (or Ctrl+A for all visible), then right-click > "Copy selected" (or Ctrl+C).
- **Export All Visible Logs**: Right-click anywhere in the console > "Export visible messages to Clipboard" (pastes as text) or "Export visible messages to File" (saves as .txt).
- **Filter Logs**: Type "Tanks Script" in the search bar at the top of console to show only script logs.
- **Clear Console**: Right-click > "Clear console" (or Ctrl+L) before testing to start fresh.
- **Other Debugging**:
  - **Inspect Chat Structure**: In F12 > "Elements" tab, expand <div id="messagebuffer">, find a recent chat-msg-* div (yours will be chat-msg-Head_Zionist). Right-click the <span> around <strong class="username">Head_Zionist:</strong>, "Copy > Outer HTML". Paste that here—it'll show the exact classes (e.g., <span class="userlist-owner">...).
  - **Check Canvas**: In Elements tab, search for <canvas> (Ctrl+F). If present, right-click > "Screenshot node" to capture what it's rendering (even if hidden).
  - **Test Rendering**: If game starts but invisible, toggle zIndex in console: document.querySelector('canvas').style.zIndex = '9999'; (run in console).
  - **Room Permissions**: Confirm you're mod/owner—go to room settings; if not, /mod yourself or log in as owner.
  - **Browser Issues**: Try Incognito mode (Ctrl+Shift+N) to disable extensions. Ensure no ad blockers block CDNs (Three.js/Seedrandom).

If logs show your class (e.g., 'userlist-siteadmin'), I'll add it next.

### Updated Script
(function () {
    'use strict';
    console.log('[Tanks Script] Starting initialization...');
    // Load Three.js and Seedrandom dynamically
    const scriptThree = document.createElement('script');
    scriptThree.src = 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js';
    scriptThree.onload = () => {
        console.log('[Tanks Script] Three.js loaded');
        const scriptSeedRandom = document.createElement('script');
        scriptSeedRandom.src = 'https://cdnjs.cloudflare.com/ajax/libs/seedrandom/3.0.5/seedrandom.min.js';
        scriptSeedRandom.onload = () => {
            console.log('[Tanks Script] Seedrandom loaded');
            init();
        };
        scriptSeedRandom.onerror = () => console.error('[Tanks Script] Failed to load Seedrandom');
        document.head.appendChild(scriptSeedRandom);
    };
    scriptThree.onerror = () => console.error('[Tanks Script] Failed to load Three.js');
    document.head.appendChild(scriptThree);
    async function init() {
        console.log('[Tanks Script] Init function called');
        // Generate deterministic seed based on room name
        const roomName = window.location.pathname.split('/').pop();
        const seed = await generateCryptoSeed(roomName);
        console.log(`[Tanks Script] Room seed: ${seed.substring(0, 16)}...`);
        // Time synchronization with server
        let offset = 0;
        async function calculateOffset() {
            try {
                const start = Date.now() / 1000;
                const res = await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
                const end = Date.now() / 1000;
                const serverDate = new Date(res.headers.get('Date')).getTime() / 1000;
                const roundTrip = end - start;
                offset = (serverDate + roundTrip / 2) - end;
                console.log(`[Tanks Script] Server time offset: ${offset.toFixed(3)}s`);
            } catch (e) {
                console.error('[Tanks Script] Could not get server time:', e);
            }
        }
        await calculateOffset();
        const getTime = () => Date.now() / 1000 + offset;
        const TIME_STEP = 0.01;
        let lastSimulationTime = null;
        let initialSpawnTime = null;
        let currentLevel = null;
        // Create and insert the canvas
        const canvas = document.createElement('canvas');
        canvas.style.position = 'fixed';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100vw';
        canvas.style.height = '100vh';
        canvas.style.zIndex = '9999'; // Temp high for testing visibility; revert to '-1' after
        canvas.style.pointerEvents = 'none';
        document.body.appendChild(canvas);
        console.log('[Tanks Script] Canvas added to page');
        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        console.log('[Tanks Script] WebGLRenderer initialized');
        window.addEventListener('resize', () => {
            if (!camera) return;
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        });
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(0, 20, 40);
        camera.lookAt(0, 0, 0);
        // Terrain
        const terrainGeometry = new THREE.PlaneGeometry(100, 100, 30, 30);
        const terrainMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
        const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
        terrain.rotation.x = -Math.PI / 2;
        scene.add(terrain);
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        scene.add(new THREE.DirectionalLight(0xffffff, 0.4));
        // Load textures asynchronously
        const textureLoader = new THREE.TextureLoader();
        const userTexture = textureLoader.load('https://i.ibb.co/WQ9Py5J/Apu-Radio-Its-Over.webp', () => console.log('[Tanks Script] User texture loaded'), undefined, (err) => console.error('[Tanks Script] User texture error:', err));
        const foeTexture = textureLoader.load('https://i.ibb.co/MkG52QDN/Blogus-Foe.webp', () => console.log('[Tanks Script] Foe texture loaded'), undefined, (err) => console.error('[Tanks Script] Foe texture error:', err));
        const foodTexture = textureLoader.load('https://i.ibb.co/chvzwJhg/Food-Burger.webp', () => console.log('[Tanks Script] Food texture loaded'), undefined, (err) => console.error('[Tanks Script] Food texture error:', err));
        const userMaterial = new THREE.MeshBasicMaterial({ map: userTexture, transparent: true });
        const foeMaterial = new THREE.MeshBasicMaterial({ map: foeTexture, transparent: true });
        const foodMaterial = new THREE.MeshBasicMaterial({ map: foodTexture, transparent: true });
        const entityGeometry = new THREE.BoxGeometry(2, 3, 2);
        const entities = [];
        // Add entity with deterministic properties (includes level for variant starts)
        function addEntity(type, material, spawnTime, idOrName) {
            const timeSeed = `${seed}-${type}-${idOrName}-${currentLevel}`;
            const spawnPrng = new Math.seedrandom(timeSeed);
            const initialPosition = new THREE.Vector3(
                (spawnPrng() - 0.5) * 80,
                1.5,
                (spawnPrng() - 0.5) * 80
            );
            const velocity = new THREE.Vector3(
                (spawnPrng() - 0.5) * 0.4,
                0,
                (spawnPrng() - 0.5) * 0.4
            );
            const mesh = new THREE.Mesh(entityGeometry, material);
            mesh.position.copy(initialPosition);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const entity = {
                mesh,
                velocity,
                type,
                spawnTime,
                health: type === 'user' ? 3 : undefined,
                id: idOrName
            };
            entities.push(entity);
            scene.add(mesh);
            console.log(`[Tanks Script] Added ${type} "${idOrName}" at (${initialPosition.x.toFixed(1)}, ${initialPosition.z.toFixed(1)})`);
            return entity;
        }
        function removeEntity(entity) {
            scene.remove(entity.mesh);
            const index = entities.indexOf(entity);
            if (index > -1) entities.splice(index, 1);
        }
        function resetSimulation(startTime, level) {
            currentLevel = level;
            initialSpawnTime = startTime;
            lastSimulationTime = startTime;
            // Clear entities
            entities.forEach(e => scene.remove(e.mesh));
            entities.length = 0;
            // Add initial foes and food
            for (let i = 0; i < 4; i++) {
                addEntity('foe', foeMaterial, startTime, `foe${i}`);
                addEntity('food', foodMaterial, startTime, `food${i}`);
            }
            // Add current users as tanks (snapshot only - no late joiners)
            const userListElement = document.getElementById('userlist');
            if (userListElement) {
                const currentUsers = Array.from(userListElement.querySelectorAll('.username'))
                    .map(span => span.textContent.trim())
                    .filter(name => name && name !== 'Anonymous');
                currentUsers.forEach(username => {
                    addEntity('user', userMaterial, startTime, username);
                });
                console.log(`[Tanks Script] Added ${currentUsers.length} users for level "${level}"`);
            } else {
                console.error('[Tanks Script] #userlist not found');
            }
            console.log(`[Tanks Script] Game started! Level: "${level}", Entities: ${entities.length}`);
        }
        // Simulation step (fixed timestep for determinism)
        function simulateStep() {
            // Move
            for (let entity of entities) {
                entity.mesh.position.add(entity.velocity.clone().multiplyScalar(TIME_STEP));
            }
            // Boundaries
            for (let entity of entities) {
                if (entity.mesh.position.x > 49) {
                    entity.mesh.position.x = 49;
                    entity.velocity.x *= -1;
                } else if (entity.mesh.position.x < -49) {
                    entity.mesh.position.x = -49;
                    entity.velocity.x *= -1;
                }
                if (entity.mesh.position.z > 49) {
                    entity.mesh.position.z = 49;
                    entity.velocity.z *= -1;
                } else if (entity.mesh.position.z < -49) {
                    entity.mesh.position.z = -49;
                    entity.velocity.z *= -1;
                }
            }
            // Collisions (naive O(n^2), fine for small n)
            for (let i = 0; i < entities.length; i++) {
                for (let j = i + 1; j < entities.length; ) {
                    const a = entities[i], b = entities[j];
                    const boxA = new THREE.Box3().setFromObject(a.mesh);
                    const boxB = new THREE.Box3().setFromObject(b.mesh);
                    if (boxA.intersectsBox(boxB)) {
                        // Elastic bounce: swap velocities
                        const temp = a.velocity.clone();
                        a.velocity.copy(b.velocity);
                        b.velocity.copy(temp);
                        // Interactions
                        if (a.type === 'user' && b.type === 'foe' || a.type === 'foe' && b.type === 'user') {
                            const user = a.type === 'user' ? a : b;
                            user.health = (user.health || 0) - 2;
                            removeEntity(a.type === 'foe' ? a : b);
                        } else if (a.type === 'user' && b.type === 'food' || a.type === 'food' && b.type === 'user') {
                            const user = a.type === 'user' ? a : b;
                            user.health = (user.health || 0) + 1;
                            removeEntity(a.type === 'food' ? a : b);
                        } else if (a.type === 'user' && b.type === 'user') {
                            a.health -= 1;
                            b.health -= 1;
                        }
                        j = i + 1; // Restart inner loop after removal
                    } else {
                        j++;
                    }
                }
            }
            // Cleanup dead users
            for (let i = entities.length - 1; i >= 0; i--) {
                if (entities[i].type === 'user' && (entities[i].health || 0) <= 0) {
                    removeEntity(entities[i]);
                }
            }
        }
        // Animation/render loop
        function animate() {
            requestAnimationFrame(animate);
            if (initialSpawnTime === null) return;
            const currentTime = getTime();
            while (lastSimulationTime < currentTime) {
                simulateStep();
                lastSimulationTime += TIME_STEP;
            }
            // Visual flair
            for (let entity of entities) {
                entity.mesh.rotation.y += 0.02;
                if (entity.type === 'user' && entity.health !== undefined) {
                    entity.mesh.material.color.setHSL((entity.health / 3) * 0.3, 0.8, 0.5);
                }
            }
            renderer.render(scene, camera);
        }
        animate();
        // Chat observer for /startgame [level]
        const messageBuffer = document.getElementById('messagebuffer');
        if (messageBuffer) {
            const chatObserver = new MutationObserver((mutations) => {
                console.log('[Tanks Script] Chat mutation detected - added nodes:', mutations.reduce((acc, m) => acc + m.addedNodes.length, 0));
                for (let mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (let node of mutation.addedNodes) {
                            if (node.nodeType !== 1) continue;
                            console.log('[Tanks Script] Added node classes:', Array.from(node.classList).join(' '));
                            if (!Array.from(node.classList).some(cls => cls.startsWith('chat-msg-'))) continue;
                            console.log('[Tanks Script] Found chat-msg div');
                            const usernameContainer = node.querySelector('span:has(.username)');
                            let isMod = false;
                            if (usernameContainer) {
                                console.log('[Tanks Script] usernameContainer classes:', Array.from(usernameContainer.classList).join(' '));
                                isMod = usernameContainer.classList.contains('userlist-op') || usernameContainer.classList.contains('userlist-moderator') || usernameContainer.classList.contains('userlist-owner') || usernameContainer.classList.contains('userlist-admin') || usernameContainer.classList.contains('userlist-siteadmin');
                                console.log('[Tanks Script] isMod:', isMod);
                            } else {
                                console.log('[Tanks Script] No usernameContainer - treating as continuation; skipping mod check');
                            }
                            // Temporarily disable mod check for testing
                            // if (!isMod && usernameContainer) {
                            //     console.log('[Tanks Script] Not a mod message');
                            //     continue;
                            // }
                            const spans = node.querySelectorAll('span');
                            if (spans.length === 0) continue;
                            const msgText = spans[spans.length - 1].textContent.trim();
                            console.log('[Tanks Script] Extracted msgText:', msgText);
                            const match = msgText.match(/^\/startgame\s*(.*)$/i);
                            if (match) {
                                const level = match[1]?.trim() || 'default';
                                const startTime = getTime();
                                resetSimulation(startTime, level);
                            }
                        }
                    }
                }
            });
            chatObserver.observe(messageBuffer, { childList: true, subtree: true });
            console.log(`[Tanks Script] Ready! Mods type /startgame [level] (e.g., /startgame test) to begin`);
        } else {
            console.error('[Tanks Script] No #messagebuffer found – chat observer not set up');
        }
        async function generateCryptoSeed(baseString) {
            const encoder = new TextEncoder();
            const data = encoder.encode(baseString);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
    }
})();