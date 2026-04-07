const express = require('express');
const cheerio = require('cheerio');
const app = express();

// 1. THE MAIN INTERFACE
const uiHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Base</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: #0f0f0f; color: white; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .container { text-align: center; width: 90%; max-width: 400px; }
        h1 { font-size: 3rem; letter-spacing: -2px; margin-bottom: 20px; font-weight: 800; }
        input[type="url"] { width: 100%; padding: 15px; border-radius: 12px; border: 1px solid #333; background: #1a1a1a; color: white; margin-bottom: 20px; outline: none; box-sizing: border-box; font-size: 16px; }
        input[type="url"]:focus { border-color: #555; }
        button { width: 100%; padding: 15px; border-radius: 12px; border: none; background-color: white; color: black; cursor: pointer; font-weight: 600; font-size: 16px; transition: transform 0.1s; }
        button:hover { transform: scale(1.02); background-color: #e0e0e0; }
        p { color: #555; font-size: 0.8em; margin-top: 30px; text-transform: uppercase; letter-spacing: 1px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Base</h1>
        <form id="proxyForm">
            <input type="url" id="targetUrl" placeholder="Enter destination URL" required><br>
            <button type="submit">Open</button>
        </form>
        <p>Shift + Q to manage</p>
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

    if (userPass !== correctPass) {
        return res.status(401).send("<body style='background:#000;color:#333;display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;'><h1>401</h1></body>");
    }

    const targetUrl = req.query.target;
    if (!targetUrl) return res.send(uiHTML);

    try {
        const response = await fetch(targetUrl, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });
        
        let html = await response.text();
        const $ = cheerio.load(html);
        const base = new URL(targetUrl);

        // 1. IMPROVED IMAGE & ASSET SUPPORT
        // Injects a base tag so the browser knows where to find images natively
        $('head').prepend(`<base href="${base.origin}${base.pathname}">`);

        // 2. REWRITE ALL LINK ATTRIBUTES
        // We look for 'href', 'src', and 'action' to keep them inside the proxy
        const rewrite = (tag, attr) => {
            $(tag).each((i, el) => {
                let val = $(el).attr(attr);
                if (val && !val.startsWith('javascript:') && !val.startsWith('#') && !val.startsWith('data:')) {
                    try {
                        const absoluteUrl = new URL(val, base).href;
                        // Only proxy HTML links (a tags and forms), let images/scripts load via <base>
                        if (tag === 'a' || tag === 'form') {
                            $(el).attr(attr, `/?pw=${userPass}&target=` + encodeURIComponent(absoluteUrl));
                        }
                    } catch(e) {}
                }
            });
        };

        rewrite('a', 'href');
        rewrite('form', 'action');

        // Add hidden inputs to forms so they stay authenticated
        $('form').each((i, el) => {
            $(el).append(`<input type="hidden" name="pw" value="${userPass}">`);
        });

        // 3. BASE CONTROL UI (Shift + Q)
        const injectUI = `
            <style>
                #base-nav { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(15,15,15,0.98); color: white; padding: 10px 20px; border-radius: 16px; z-index: 2147483647; display: none; font-family: sans-serif; border: 1px solid #333; box-shadow: 0 8px 32px rgba(0,0,0,0.5); align-items: center; }
                #base-nav button { background: #222; color: white; border: 1px solid #444; padding: 8px 16px; border-radius: 8px; cursor: pointer; margin: 0 5px; font-size: 13px; }
                #base-nav button:hover { background: #333; }
                .base-invert { filter: invert(1) hue-rotate(180deg) !important; background-color: #fff !important; }
            </style>
            <div id="base-nav">
                <span style="font-weight:800; margin-right:15px; font-size:14px;">BASE</span>
                <button onclick="window.location.href='/?pw=${userPass}'">Home</button>
                <button onclick="document.body.classList.toggle('base-invert')">Dark Mode</button>
                <button onclick="location.reload()">Reload</button>
                <button onclick="document.getElementById('base-nav').style.display='none'">✕</button>
            </div>
            <script>
                document.addEventListener('keydown', function(e) {
                    if (e.shiftKey && e.key.toLowerCase() === 'q') {
                        const nav = document.getElementById('base-nav');
                        nav.style.display = (nav.style.display === 'none' || nav.style.display === '') ? 'flex' : 'none';
                    }
                });
            </script>
        `;
        
        $('body').append(injectUI);
        res.send($.html());
        
    } catch (error) {
        res.status(500).send('<h1>Base encountered an error.</h1>');
    }
});

module.exports = app;
