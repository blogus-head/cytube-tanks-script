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
