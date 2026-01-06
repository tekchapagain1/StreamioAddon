const express = require("express");
const addon = require("./addon");
const seedrApi = require("./seedrApi");

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 8000;

// Enable CORS for all routes
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    next();
});

// ============================================
// Configuration Page - Device Code Authorization
// ============================================
app.get("/configure", async (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seedr Cloud Player - Setup</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        h1 {
            font-size: 2rem;
            margin-bottom: 10px;
            color: #4ade80;
        }
        .subtitle { color: #94a3b8; margin-bottom: 30px; }
        .step { margin: 20px 0; padding: 20px; background: rgba(0,0,0,0.2); border-radius: 12px; }
        .step-number {
            display: inline-block;
            width: 30px;
            height: 30px;
            background: #4ade80;
            color: #1a1a2e;
            border-radius: 50%;
            line-height: 30px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .code-display {
            font-size: 2.5rem;
            font-family: monospace;
            letter-spacing: 8px;
            color: #4ade80;
            background: rgba(0,0,0,0.3);
            padding: 15px 25px;
            border-radius: 8px;
            margin: 15px 0;
            display: inline-block;
        }
        .link { color: #60a5fa; text-decoration: none; font-weight: bold; }
        .link:hover { text-decoration: underline; }
        .status { margin-top: 20px; padding: 15px; border-radius: 8px; }
        .status.waiting { background: rgba(251,191,36,0.2); color: #fbbf24; }
        .status.success { background: rgba(74,222,128,0.2); color: #4ade80; }
        .status.error { background: rgba(248,113,113,0.2); color: #f87171; }
        .btn {
            display: inline-block;
            background: #4ade80;
            color: #1a1a2e;
            padding: 12px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin-top: 20px;
            transition: transform 0.2s;
        }
        .btn:hover { transform: scale(1.05); }
        .hidden { display: none; }
        .spinner {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: #4ade80;
            animation: spin 1s linear infinite;
            margin-right: 10px;
            vertical-align: middle;
        }
        .url-container {
            display: flex;
            margin: 15px 0;
            gap: 8px;
        }
        .url-input {
            flex: 1;
            padding: 12px;
            border: none;
            border-radius: 8px;
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-size: 12px;
            font-family: monospace;
        }
        .copy-btn {
            padding: 12px 16px;
            border: none;
            border-radius: 8px;
            background: #60a5fa;
            color: #1a1a2e;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.2s;
        }
        .copy-btn:hover { background: #93c5fd; }
        .copy-btn.copied { background: #4ade80; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Seedr Cloud Player</h1>
        <p class="subtitle">Connect your Seedr account to Stremio</p>
        
        <div id="loading">
            <div class="spinner"></div>
            <span>Getting authorization code...</span>
        </div>
        
        <div id="auth-steps" class="hidden">
            <div class="step">
                <div class="step-number">1</div>
                <p>Visit <a href="https://www.seedr.cc/devices" target="_blank" class="link">seedr.cc/devices</a></p>
            </div>
            
            <div class="step">
                <div class="step-number">2</div>
                <p>Enter this code:</p>
                <div id="user-code" class="code-display">--------</div>
            </div>
            
            <div class="step">
                <div class="step-number">3</div>
                <p>Click "Authorize" on Seedr</p>
            </div>
            
            <div id="status" class="status waiting">
                <span class="spinner"></span>
                Waiting for authorization...
            </div>
        </div>
        
        <div id="success" class="hidden">
            <div class="status success">
                ✅ Authorization successful!
            </div>
            <p style="margin-top: 15px; color: #94a3b8;">Copy this URL to install manually:</p>
            <div class="url-container">
                <input type="text" id="manifest-url" readonly class="url-input">
                <button onclick="copyUrl()" class="copy-btn" id="copy-btn">📋 Copy</button>
            </div>
            <a id="install-btn" href="#" class="btn">Install in Stremio</a>
        </div>
        
        <div id="error" class="hidden">
            <div class="status error" id="error-message">
                ❌ An error occurred
            </div>
            <a href="/configure" class="btn">Try Again</a>
        </div>
    </div>
    
    <script>
        const baseUrl = window.location.origin;
        let deviceCode = null;
        let pollInterval = null;
        
        async function startAuth() {
            try {
                // Get device code
                const response = await fetch('/api/device-code');
                const data = await response.json();
                
                if (data.error) {
                    showError(data.error);
                    return;
                }
                
                deviceCode = data.device_code;
                document.getElementById('user-code').textContent = data.user_code;
                
                document.getElementById('loading').classList.add('hidden');
                document.getElementById('auth-steps').classList.remove('hidden');
                
                // Start polling
                pollInterval = setInterval(pollForAuth, (data.interval || 5) * 1000);
                
            } catch (error) {
                showError('Failed to start authorization: ' + error.message);
            }
        }
        
        async function pollForAuth() {
            try {
                const response = await fetch('/api/poll-token?device_code=' + encodeURIComponent(deviceCode));
                const data = await response.json();
                
                if (data.access_token) {
                    clearInterval(pollInterval);
                    showSuccess(data.access_token);
                }
            } catch (error) {
                // Continue polling
            }
        }
        
        function showSuccess(token) {
            document.getElementById('auth-steps').classList.add('hidden');
            document.getElementById('success').classList.remove('hidden');
            
            // Create Stremio install URL with token
            const encodedToken = encodeURIComponent(token);
            const manifestUrl = baseUrl + '/' + encodedToken + '/manifest.json';
            const stremioUrl = 'stremio://' + manifestUrl.replace(/^https?:\\/\\//, '');
            
            document.getElementById('manifest-url').value = manifestUrl;
            document.getElementById('install-btn').href = stremioUrl;
        }
        
        function copyUrl() {
            const urlInput = document.getElementById('manifest-url');
            urlInput.select();
            document.execCommand('copy');
            
            const copyBtn = document.getElementById('copy-btn');
            copyBtn.textContent = '✅ Copied!';
            copyBtn.classList.add('copied');
            
            setTimeout(() => {
                copyBtn.textContent = '📋 Copy';
                copyBtn.classList.remove('copied');
            }, 2000);
        }
        
        function showError(message) {
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('auth-steps').classList.add('hidden');
            document.getElementById('error').classList.remove('hidden');
            document.getElementById('error-message').textContent = '❌ ' + message;
            
            if (pollInterval) clearInterval(pollInterval);
        }
        
        // Start authorization on page load
        startAuth();
    </script>
</body>
</html>
    `);
});

// ============================================
// API Endpoints for Device Authorization
// ============================================
app.get("/api/device-code", async (req, res) => {
    try {
        const data = await seedrApi.getDeviceCode();
        res.json(data);
    } catch (error) {
        console.error("Error getting device code:", error.message);
        res.json({ error: error.message });
    }
});

app.get("/api/poll-token", async (req, res) => {
    try {
        const deviceCode = req.query.device_code;
        if (!deviceCode) {
            return res.json({ error: "Missing device_code" });
        }

        const data = await seedrApi.pollForToken(deviceCode);
        res.json(data || { pending: true });
    } catch (error) {
        console.error("Error polling for token:", error.message);
        res.json({ error: error.message });
    }
});

// ============================================
// Token-based Addon Routes
// ============================================
// Handle configure page with token (redirect to main configure or show reconfigure option)
app.get("/:token/configure", (req, res) => {
    const token = req.params.token;
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Seedr Cloud Player - Configuration</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        h1 { font-size: 2rem; margin-bottom: 10px; color: #4ade80; }
        .subtitle { color: #94a3b8; margin-bottom: 30px; }
        .status { margin: 20px 0; padding: 20px; background: rgba(74,222,128,0.2); border-radius: 12px; }
        .status.success { color: #4ade80; }
        .btn {
            display: inline-block;
            background: #4ade80;
            color: #1a1a2e;
            padding: 12px 30px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            margin: 10px;
            transition: transform 0.2s;
        }
        .btn:hover { transform: scale(1.05); }
        .btn.secondary {
            background: rgba(255,255,255,0.2);
            color: #fff;
        }
        .info { margin-top: 20px; padding: 15px; background: rgba(0,0,0,0.2); border-radius: 8px; color: #94a3b8; font-size: 0.9rem; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎬 Seedr Cloud Player</h1>
        <p class="subtitle">Configuration</p>
        
        <div class="status success">
            ✅ Your addon is already configured and connected to Seedr!
        </div>
        
        <p style="margin: 20px 0; color: #94a3b8;">
            Your Seedr account is linked. You can browse your files in Stremio under "My Seedr Files".
        </p>
        
        <div style="margin: 20px 0;">
            <a id="install-btn" href="#" class="btn">📥 Install Addon in Stremio</a>
        </div>
        
        <p style="margin: 15px 0; color: #94a3b8; font-size: 0.9rem;">Or copy this URL to install manually:</p>
        <div style="display: flex; margin: 15px 0; gap: 8px;">
            <input type="text" id="manifest-url" readonly style="flex: 1; padding: 12px; border: none; border-radius: 8px; background: rgba(0,0,0,0.3); color: #fff; font-size: 12px; font-family: monospace;">
            <button onclick="copyUrl()" id="copy-btn" style="padding: 12px 16px; border: none; border-radius: 8px; background: #60a5fa; color: #1a1a2e; font-weight: bold; cursor: pointer;">📋 Copy</button>
        </div>
        
        <div>
            <a href="/configure" class="btn secondary">🔄 Reconfigure with Different Account</a>
        </div>
        
        <div class="info">
            <strong>Tip:</strong> To see your Seedr files in Stremio, go to the Discover tab and select "My Seedr Files" from the catalog.
        </div>
        
        <script>
            const token = "${token}";
            const baseUrl = window.location.origin;
            const manifestUrl = baseUrl + '/' + encodeURIComponent(token) + '/manifest.json';
            const stremioUrl = 'stremio://' + manifestUrl.replace(/^https?:\\/\\//, '');
            
            document.getElementById('manifest-url').value = manifestUrl;
            document.getElementById('install-btn').href = stremioUrl;
            
            function copyUrl() {
                const urlInput = document.getElementById('manifest-url');
                urlInput.select();
                document.execCommand('copy');
                
                const copyBtn = document.getElementById('copy-btn');
                copyBtn.textContent = '✅ Copied!';
                copyBtn.style.background = '#4ade80';
                
                setTimeout(() => {
                    copyBtn.textContent = '📋 Copy';
                    copyBtn.style.background = '#60a5fa';
                }, 2000);
            }
        </script>
    </div>
</body>
</html>
    `);
});

// Handle manifest request with token
app.get("/:token/manifest.json", (req, res) => {
    const manifest = addon.manifest;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");
    res.json(manifest);
});

// Custom router to handle token extraction
app.get("/:token/catalog/:type/:id.json", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");

    try {
        const { token, type, id } = req.params;

        const result = await addon.catalogHandler({
            type,
            id: id.replace(".json", ""),
            config: { token: decodeURIComponent(token) }
        });

        res.json(result);
    } catch (error) {
        console.error("Catalog error:", error);
        res.json({ metas: [] });
    }
});

app.get("/:token/stream/:type/:id.json", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Content-Type", "application/json");

    try {
        const { token, type, id } = req.params;
        const serverBaseUrl = `${req.protocol}://${req.get('host')}`;

        const result = await addon.streamHandler({
            type,
            id: id.replace(".json", ""),
            config: { token: decodeURIComponent(token) }
        }, serverBaseUrl);

        res.json(result);
    } catch (error) {
        console.error("Stream error:", error);
        res.json({ streams: [] });
    }
});

// ============================================
// Resolve Endpoint - Download torrent and redirect to stream
// ============================================
// Keep track of active processing to prevent race conditions
const processingLocks = new Set();
// Cache for resolved stream URLs to prevent repetitive API calls
const resolveCache = new Map();
const RESOLVE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

app.get("/:token/resolve/:infoHash", async (req, res) => {
    const { token, infoHash } = req.params;
    const { name, trackers, fileIdx, torrentFile } = req.query;
    const accessToken = decodeURIComponent(token);

    // Check cache first
    if (resolveCache.has(infoHash)) {
        const cached = resolveCache.get(infoHash);
        if (Date.now() - cached.timestamp < RESOLVE_CACHE_TTL) {
            console.log(`⚡ Using cached stream URL for ${infoHash}`);
            return res.redirect(307, cached.url);
        } else {
            resolveCache.delete(infoHash);
        }
    }

    console.log("============================================");
    console.log("🔄 Resolve request for infoHash:", infoHash);
    console.log("   Name:", name);
    console.log("   Type:", torrentFile ? "Torrent File" : "Magnet Link");
    console.log("============================================");

    // Wait if this infoHash is already being processed (simple busy-wait or just join)
    // Since we can't easily "join" the other request's specific state in this architecture without complex event emitters,
    // we will just wait until the lock is released, then proceed with checks (which should catch the newly added transfer).
    if (processingLocks.has(infoHash)) {
        console.log("⏳ Another request is processing this infoHash. Waiting for lock release...");
        let waitTime = 0;
        while (processingLocks.has(infoHash) && waitTime < 30000) { // 30s max wait
            await new Promise(r => setTimeout(r, 1000));
            waitTime += 1000;
        }
        console.log("🔓 Lock released (or timed out). Proceeding...");
    }

    try {
        // Poll for completion (5 minute timeout, 3 second intervals)
        const maxAttempts = 100; // 100 * 3s = 5 minutes
        const pollInterval = 3000;
        let attempts = 0;

        const pollForCompletion = async () => {
            console.log("⏳ Waiting for download to complete...");
            let lastProgress = -1;

            while (attempts < maxAttempts) {
                attempts++;
                await new Promise(resolve => setTimeout(resolve, pollInterval));

                // Check transfers for progress
                let transfers = await seedrApi.getActiveTransfers(accessToken);
                const transfer = transfers.find(t =>
                    t.name && name && t.name.toLowerCase().includes(name.toLowerCase().substring(0, 20))
                );

                if (transfer) {
                    const progress = transfer.progress || 0;
                    if (progress !== lastProgress) {
                        console.log(`   Progress: ${progress}% (attempt ${attempts}/${maxAttempts})`);
                        lastProgress = progress;
                    }

                    if (progress >= 100) {
                        // Download complete - wait a moment for file to be moved to folder
                        // If it stays at 100% without disappearing from transfers, it might be processing
                        if (attempts % 5 === 0) console.log("   (Stuck at 100%? waiting for file processing...)");
                    }
                } else {
                    // If no transfer found, it might be done or failed.
                    // We continue to check videos.
                }

                // Check if file is now in videos
                const videos = await seedrApi.getAllVideoFiles(accessToken);

                // DEBUG: Log first few videos found to see what we are comparing against
                if (attempts === 1 || attempts % 10 === 0) {
                    // console.log("   Current videos in specific folder:", videos.map(v => v.name).slice(0, 3));
                }

                const matchingVideo = videos.find(v => {
                    const videoNameLower = v.name.toLowerCase();
                    const searchName = (name || "").toLowerCase();
                    // Try more flexible matching
                    // 1. Exact substring match (first 20 chars)
                    const match1 = videoNameLower.includes(searchName.substring(0, 20));
                    // 2. Reverse match (search name includes video name - careful with short names)
                    const cleanVideoName = videoNameLower.replace(/\.[^/.]+$/, ""); // remove extension
                    const match2 = searchName.includes(cleanVideoName.substring(0, 20));

                    return match1 || match2;
                });

                if (matchingVideo) {
                    console.log("✅ Download complete:", matchingVideo.name);
                    const streamData = await seedrApi.getStreamUrl(accessToken, matchingVideo.id);
                    if (streamData && streamData.url) {
                        console.log("🎬 Redirecting to stream URL");
                        // Cache the successful result
                        resolveCache.set(infoHash, {
                            url: streamData.url,
                            timestamp: Date.now()
                        });
                        return res.redirect(307, streamData.url);
                    }
                } else if (!transfer && attempts > 5) {
                    // If no active transfer and no video found after a few attempts, 
                    // maybe look for ANY video in the top folder if we just added one?
                    // Or look for the specific folder we added to?
                    // For now, just log that we haven't found it yet.
                    if (attempts % 5 === 0) {
                        console.log(`   ❓ No transfer and no matching video found yet for "${name}"`);
                        // DEBUG: Inspect what IS there
                        if (videos.length > 0) {
                            console.log(`      Available videos: ${videos.map(v => v.name).join(", ")}`);
                        } else {
                            console.log("      No videos found in account.");
                        }
                    }
                }
            }

            // Timeout reached
            console.log("⏰ Timeout waiting for download");
            return res.status(408).json({
                error: "Download timeout",
                message: "The download is taking longer than expected. Please check Seedr Downloads catalog and try again."
            });
        };

        // Determine if we're using a torrent file or magnet link
        let isTorrentFile = !!torrentFile;
        let magnet = null;
        let torrentData = null;

        if (!isTorrentFile) {
            // Build magnet link from parameters
            magnet = `magnet:?xt=urn:btih:${infoHash}`;
            if (name) {
                magnet += `&dn=${encodeURIComponent(name)}`;
            }
            if (trackers) {
                const trackerList = trackers.split(",");
                for (const tracker of trackerList) {
                    magnet += `&tr=${encodeURIComponent(tracker)}`;
                }
            }
        } else {
            // Torrent file is base64 encoded in the query
            torrentData = decodeURIComponent(torrentFile);
        }

        console.log("🔒 Acquiring processing lock...");
        processingLocks.add(infoHash);

        try {
            // Step 1: Check if folder exists for this info_hash (cached downloads)
            console.log("📁 Looking for existing folder...");
            let targetFolder = await seedrApi.getFolderByName(accessToken, infoHash);

            if (targetFolder) {
                console.log("✅ Using existing folder:", targetFolder.id);

                // Check if torrent is already downloading or completed in this folder
                const folderContent = await seedrApi.getFolder(accessToken, targetFolder.id);

                if (folderContent.folders && folderContent.folders.length > 0) {
                    console.log("✅ Torrent already completed in this folder");
                    // Get files from the first subfolder (completed torrent)
                    const completedFolder = folderContent.folders[0];
                    const completedContent = await seedrApi.getFolder(accessToken, completedFolder.id);

                    if (completedContent.files && completedContent.files.length > 0) {
                        // Find a playable video file
                        const videoFile = completedContent.files.find(f => f.play_video);
                        if (videoFile) {
                            console.log("🎬 Found playable file:", videoFile.name);
                            const streamData = await seedrApi.getStreamUrl(accessToken, videoFile.folder_file_id);
                            if (streamData && streamData.url) {
                                console.log("🎬 Redirecting to stream URL");
                                return res.redirect(307, streamData.url);
                            }
                        }
                    }
                } else if (folderContent.torrents && folderContent.torrents.length > 0) {
                    console.log("⏳ Torrent already downloading in this folder, waiting for completion...");
                    // Don't add again - skip to polling
                    return pollForCompletion();
                }
            }

            // Step 1.5: Check if torrent is already in active transfers (prevent duplicate additions)
            console.log("🔍 Checking for existing transfers...");
            const activeTransfers = await seedrApi.getActiveTransfers(accessToken);
            const existingTransfer = activeTransfers.find(t => {
                if (!t.name || !name) return false;
                const tNameLower = t.name.toLowerCase();
                const searchName = name.toLowerCase();
                return tNameLower.includes(searchName.substring(0, 30)) ||
                    tNameLower.includes(infoHash.substring(0, 16));
            });

            if (existingTransfer) {
                console.log("⏳ Torrent already in transfer queue, waiting for completion...");
                console.log("   Current progress:", existingTransfer.progress || 0, "%");
                // Skip adding - go straight to polling
                attempts = 0; // Reset attempts counter
                return pollForCompletion();
            }

            // Step 1.8: Check if the file is already completed and in the library 
            // (Previous check only looked for folder named infoHash, but Magnet links created folders with torrent name)
            console.log("🔍 Checking for existing completed files...");
            const allVideos = await seedrApi.getAllVideoFiles(accessToken);
            const existingVideo = allVideos.find(v => {
                const videoNameLower = v.name.toLowerCase();
                const searchName = (name || "").toLowerCase();
                const match1 = videoNameLower.includes(searchName.substring(0, 20));
                const cleanVideoName = videoNameLower.replace(/\.[^/.]+$/, "");
                const match2 = searchName.includes(cleanVideoName.substring(0, 20));
                return match1 || match2;
            });

            if (existingVideo) {
                console.log("✅ Match found in library:", existingVideo.name);
                const streamData = await seedrApi.getStreamUrl(accessToken, existingVideo.id);
                if (streamData && streamData.url) {
                    console.log("🎬 Redirecting to stream URL (Cached)");
                    resolveCache.set(infoHash, {
                        url: streamData.url,
                        timestamp: Date.now()
                    });
                    return res.redirect(307, streamData.url);
                }
            }

            // Step 2: Add torrent (magnet link or file) to root
            let addResult;
            let retryCount = 0;
            const maxRetries = 1;

            while (retryCount <= maxRetries) {
                try {
                    if (isTorrentFile) {
                        console.log(`📥 Adding torrent file to Seedr (Attempt ${retryCount + 1})...`);
                        addResult = await seedrApi.addTorrentFile(accessToken, torrentData, name || `torrent-${infoHash}.torrent`);
                    } else {
                        console.log(`📥 Adding magnet to Seedr (Attempt ${retryCount + 1})...`);
                        addResult = await seedrApi.addMagnet(accessToken, magnet, -1);
                    }

                    // Check for "soft" failures that are actually successes-with-conditions in API (result: "queue_full...")
                    // But user wants to CLEAR if this happens, so treat as failure needing clear
                    if (addResult.result === "queue_full_added_to_wishlist" || addResult.result === "not_enough_space_added_to_wishlist") {
                        throw new Error(`Space/Queue full (code: ${addResult.result})`);
                    }

                    // If we get here and result is true/success, we are done
                    if (addResult.result === true || addResult.result === "success") {
                        console.log("✅ Torrent added to active downloads");
                        break;
                    } else {
                        // Unknown success code, but assume success
                        console.log("✅ Torrent added successfully (code: " + addResult.result + ")");
                        break;
                    }

                } catch (error) {
                    console.error(`❌ Attempt ${retryCount + 1} failed:`, error.message);

                    // If last retry or not a space issue (optional check, but good for safety), rethrow
                    // Actually, we want to clear ONLY on space/queue issues or if we just want to force clear on any error (risky)
                    // User said: "if no space is available then clear all"
                    // So we check for keywords in error or the specific codes above
                    const isSpaceIssue = error.message.includes("not_enough_space") ||
                        error.message.includes("queue_full") ||
                        error.message.includes("storage_full"); // Add more keywords if needed

                    if (retryCount < maxRetries && isSpaceIssue) {
                        console.log("⚠️  Space/Queue limit reached. Clearing Seedr account as requested...");

                        // If it was added to wishlist during the failed attempt (soft fail), delete it first to be clean
                        if (addResult && addResult.wt && addResult.wt.id) {
                            await seedrApi.deleteFromWishlist(accessToken, addResult.wt.id);
                        }

                        const clearResult = await seedrApi.clearAccount(accessToken);
                        if (!clearResult.result) {
                            console.error("❌ Failed to clear account:", clearResult.error);
                            // If clear fails, we probably can't add anyway, but let loop continue to fail naturally or try
                        }
                        retryCount++;
                        // Continue to next iteration (retry)
                    } else {
                        // No more retries or not a space issue
                        return res.status(507).json({
                            error: "Storage full or queue full",
                            message: "Not enough space in Seedr. Attempted to clear account but failed or space still insufficient."
                        });
                    }
                }
            }
        } finally {
            console.log("🔓 Releasing processing lock...");
            processingLocks.delete(infoHash);
        }

        // Start polling
        await pollForCompletion();

    } catch (error) {
        console.error("❌ Resolve error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Root redirect to configure
// ============================================
app.get("/", (req, res) => {
    res.redirect("/configure");
});

// ============================================
// Start Server
// ============================================
app.listen(PORT, () => {
    console.log("============================================");
    console.log("🎬 Seedr Cloud Player for Stremio");
    console.log("============================================");
    console.log("");
    console.log("📍 Server running at: http://127.0.0.1:" + PORT);
    console.log("");
    console.log("🔧 To connect your Seedr account:");
    console.log("   1. Open: http://127.0.0.1:" + PORT + "/configure");
    console.log("   2. Follow the on-screen instructions");
    console.log("   3. Click 'Install in Stremio' when done");
    console.log("");
    console.log("Press Ctrl+C to stop the server");
    console.log("============================================");
});
