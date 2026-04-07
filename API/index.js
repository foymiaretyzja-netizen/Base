const express = require('express');
const cheerio = require('cheerio');
const app = express();

// 1. THE MAIN SEARCH INTERFACE (Home Page)
const uiHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Netizen Browser</title>
    <style>
        body { font-family: sans-serif; background-color: #121212; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .container { text-align: center; border: 1px solid #333; padding: 40px; border-radius: 12px; background: #1e1e1e; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        input[type="url"] { width: 350px; padding: 12px; border-radius: 6px; border: 1px solid #444; background: #2a2a2a; color: white; margin-bottom: 20px; outline: none; }
        button { padding: 12px 24px; border-radius: 6px; border: none; background-color: #007bff; color: white; cursor: pointer; font-weight: bold; }
        button:hover { background-color: #0056b3; }
        p { color: #666; font-size: 0.8em; margin-top: 20px; }
        strong { color: #007bff; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Netizen Proxy V2</h1>
        <form id="proxyForm">
            <input type="url" id="targetUrl" placeholder="Enter URL (e.g. https://tiktok.com)" required><br>
            <button type="submit">Launch Site</button>
        </form>
        <p>Press <strong>Shift + Q</strong> for the Control Panel while browsing.</p>
    </div>
    <script>
        document.getElementById('proxyForm').addEventListener('submit', function(event) {
            event.preventDefault(); 
            const url = document.getElementById('targetUrl').value;
            const urlParams = new URLSearchParams(window.location.search);
            const pw = urlParams.get('pw') || '';
            window.location.href = '/?pw=' + encodeURIComponent(pw) + '&target=' + encodeURIComponent(url);
        });
    </script>
</body>
</html>
`;

app.all('*', async (req, res) => {
    const userPass = req.query.pw;
    const correctPass = process.env.PROXY_PASSWORD;

    // 2. AUTHENTICATION CHECK
    if (userPass !== correctPass) {
        return res.status(401).send("<div style='text-align:center; margin-top:20%; font-family:sans-serif;'><h1>Access Denied</h1><p>Please use your password link.</p></div>");
    }

    const targetUrl = req.query.target;
    if (!targetUrl) return res.send(uiHTML);

    // 3. SAFETY BLOCKLIST
    const blocklist = ['netflix.com', 'hulu.com', 'chase.com', 'bankofamerica.com', 'wellsfargo.com'];
    if (targetUrl && blocklist.some(domain => targetUrl.toLowerCase().includes(domain))) {
        return res.status(403).send("<h1 style='text-align:center; color:red; font-family:sans-serif;'>Safety Protocol: This site is blocked.</h1>");
    }

    try {
        // 4. FETCH THE EXTERNAL SITE
        const response = await fetch(targetUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
            }
        });
        
        let html = await response.text();
        const $ = cheerio.load(html);
        const base = new URL(targetUrl);

        // 5. INJECT BASE TAG (Helps complex sites find their assets/images)
        $('head').prepend(`<base href="${base.origin}">`);

        // 6. REWRITE LINKS & FORMS TO STAY IN PROXY
        $('a').each((i, el) => {
            let href = $(el).attr('href');
            if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
                try {
                    const absoluteUrl = new URL(href, base).href;
                    $(el).attr('href', `/?pw=${userPass}&target=` + encodeURIComponent(absoluteUrl));
                } catch(e) {}
            }
        });

        $('form').each((i, el) => {
            let action = $(el).attr('action');
            if (action) {
                try {
                    const absoluteAction = new URL(action, base).href;
                    $(el).attr('action', '/');
                    $(el).append(`<input type="hidden" name="pw" value="${userPass}">`);
                    $(el).append(`<input type="hidden" name="target" value="${absoluteAction}">`);
                } catch(e) {}
            }
        });

        // 7. INJECT THE DASHBOARD UI (Shift + Q)
        const injectUI = `
            <style>
                #netizen-panel { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: rgba(20,20,20,0.95); color: white; padding: 15px 25px; border-radius: 50px; z-index: 9999999; display: none; font-family: sans-serif; backdrop-filter: blur(8px); border: 1px solid #444; box-shadow: 0 10px 40px rgba(0,0,0,0.8); }
                #netizen-panel button { margin: 0 8px; padding: 10px 18px; cursor: pointer; background: #333; color: white; border: none; border-radius: 25px; font-size: 13px; transition: 0.2s; }
                #netizen-panel button:hover { background: #007bff; }
                .proxy-dark-mode { filter: invert(1) hue-rotate(180deg) !important; background-color: #fff !important; }
            </style>
            <div id="netizen-panel">
                <span style="margin-right:15px; font-weight:bold; color:#007bff;">Netizen Menu</span>
                <button onclick="window.location.href='/?pw=${userPass}'">Home</button>
                <button onclick="document.body.classList.toggle('proxy-dark-mode')">Dark Mode</button>
                <button onclick="location.reload()">Reload</button>
                <button onclick="document.getElementById('netizen-panel').style.display='none'">Exit</button>
            </div>
            <script>
                document.addEventListener('keydown', function(e) {
                    if (e.shiftKey && e.key.toLowerCase() === 'q') {
                        const panel = document.getElementById('netizen-panel');
                        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
                    }
                });
            </script>
        `;
        
        $('body').append(injectUI);
        
        // 8. SEND THE MODIFIED HTML
        res.send($.html());
        
    } catch (error) {
        res.status(500).send('<h1>Proxy Error</h1><p>The site could not be reached. Check the URL and try again.</p>');
    }
});

module.exports = app;
