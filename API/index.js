const express = require('express');
const cheerio = require('cheerio');
const app = express();

const uiHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Base</title>
    <style>
        body { font-family: -apple-system, sans-serif; background: #050505; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; overflow: hidden; }
        .box { text-align: center; }
        h1 { font-size: 5rem; margin: 0; letter-spacing: -4px; font-weight: 900; }
        input { width: 320px; padding: 18px; border-radius: 14px; border: 1px solid #222; background: #111; color: #fff; margin-bottom: 15px; outline: none; font-size: 16px; transition: 0.3s; }
        input:focus { border-color: #444; background: #151515; }
        button { width: 358px; padding: 18px; border-radius: 14px; border: none; background: #fff; color: #000; font-weight: 700; cursor: pointer; font-size: 16px; }
        p { color: #444; margin-top: 20px; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; }
    </style>
</head>
<body>
    <div class="box">
        <h1>Base</h1>
        <form id="p">
            <input type="url" id="u" placeholder="Enter URL..." required><br>
            <button type="submit">Launch</button>
        </form>
        <p>Shift + Q for Dashboard</p>
    </div>
    <script>
        document.getElementById('p').addEventListener('submit', e => {
            e.preventDefault();
            const urlParams = new URLSearchParams(window.location.search);
            location.href = '/?pw=' + (urlParams.get('pw')||'') + '&target=' + encodeURIComponent(document.getElementById('u').value);
        });
    </script>
</body>
</html>
`;

app.all('*', async (req, res) => {
    const pw = req.query.pw;
    if (pw !== process.env.PROXY_PASSWORD) return res.status(401).send("Unauthorized");

    const target = req.query.target;
    if (!target) return res.send(uiHTML);

    try {
        const response = await fetch(target, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Referer': new URL(target).origin
            }
        });

        const contentType = response.headers.get('content-type') || '';

        // 1. ASSET PIPING (For Images, Scripts, Styles, and WASM for games)
        if (!contentType.includes('text/html')) {
            const buffer = await response.arrayBuffer();
            res.setHeader('Content-Type', contentType);
            // UNBLOCK CORS: This is the secret for Poki/now.gg
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.send(Buffer.from(buffer));
        }

        // 2. HTML REWRITING
        let html = await response.text();
        const $ = cheerio.load(html);
        const origin = new URL(target).origin;

        // INJECT BASE TAG
        $('head').prepend(`<base href="${origin}/">`);

        // REWRITE ALL ATTRIBUTES (Including iFrames for Game Windows)
        const selectors = ['img', 'script', 'link', 'source', 'a', 'iframe', 'form'];
        selectors.forEach(tag => {
            $(tag).each((i, el) => {
                const attr = (tag === 'link' || tag === 'a') ? 'href' : (tag === 'form' ? 'action' : 'src');
                let val = $(el).attr(attr);
                
                if (val && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('#')) {
                    try {
                        const absolute = new URL(val, target).href;
                        $(el).attr(attr, `/?pw=${pw}&target=${encodeURIComponent(absolute)}`);
                    } catch(e) {}
                }
            });
        });

        // 3. DASHBOARD INJECTION
        const panel = `
            <div id="base-ui" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(10,10,10,0.9);backdrop-filter:blur(10px);color:#fff;padding:12px 25px;border-radius:100px;z-index:2147483647;display:none;border:1px solid #333;font-family:sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
                <b style="letter-spacing:1px">BASE</b> 
                <button onclick="location.href='/?pw=${pw}'" style="background:#222;color:#fff;border:none;padding:8px 15px;border-radius:20px;margin-left:15px;cursor:pointer;">Home</button>
                <button onclick="location.reload()" style="background:#222;color:#fff;border:none;padding:8px 15px;border-radius:20px;margin-left:5px;cursor:pointer;">Reload</button>
            </div>
            <script>
                document.addEventListener('keydown', e => {
                    if(e.shiftKey && e.key.toLowerCase() === 'q') {
                        const ui = document.getElementById('base-ui');
                        ui.style.display = ui.style.display === 'none' ? 'flex' : 'none';
                    }
                });
            </script>
        `;

        $('body').append(panel);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send($.html());

    } catch (e) {
        res.status(500).send("Base could not connect to the site.");
    }
});

module.exports = app;
