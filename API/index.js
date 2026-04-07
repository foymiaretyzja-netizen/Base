const express = require('express');
const cheerio = require('cheerio');
const app = express();

// FIXED: Safely URL-encode the Base64 string so the browser doesn't break on "=" or "+"
const encode = (str) => encodeURIComponent(Buffer.from(str).toString('base64'));
const decode = (str) => {
    try { return Buffer.from(decodeURIComponent(str), 'base64').toString('utf8'); }
    catch(e) { return str; }
};

const uiHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="https://ssl.gstatic.com/docs/doclist/images/infinite_drive_2022q4.ico">
    <title>My Drive - Google Drive</title>
    <style>
        body { font-family: sans-serif; background: #000; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .box { text-align: center; }
        h1 { font-size: 5rem; margin: 0; letter-spacing: -4px; font-weight: 900; }
        input { width: 320px; padding: 18px; border-radius: 14px; border: 1px solid #222; background: #111; color: #fff; margin-bottom: 15px; outline: none; font-size: 16px; }
        button { width: 358px; padding: 18px; border-radius: 14px; border: none; background: #fff; color: #000; font-weight: 700; cursor: pointer; font-size: 16px; }
    </style>
</head>
<body>
    <div class="box">
        <h1>Base</h1>
        <form id="p">
            <input type="url" id="u" placeholder="example.com" required><br>
            <button type="submit">Launch</button>
        </form>
    </div>
    <script>
        document.getElementById('p').addEventListener('submit', e => {
            e.preventDefault();
            const urlParams = new URLSearchParams(window.location.search);
            let rawUrl = document.getElementById('u').value;
            // FIXED: Auto-add https:// if the user forgets it
            if (!rawUrl.startsWith('http')) rawUrl = 'https://' + rawUrl;
            
            const target = encodeURIComponent(btoa(rawUrl));
            location.href = '/?pw=' + (urlParams.get('pw')||'') + '&target=' + target;
        });
    </script>
</body>
</html>
`;

app.all('*', async (req, res) => {
    const pw = req.query.pw;
    if (pw !== process.env.PROXY_PASSWORD) return res.status(401).send("Unauthorized");

    let target = req.query.target;
    if (!target) return res.send(uiHTML);
    
    target = decode(target);
    if (!target.startsWith('http')) target = 'https://' + target;

    try {
        const response = await fetch(target, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Referer': new URL(target).origin
            }
        });

        const contentType = response.headers.get('content-type') || '';

        if (!contentType.includes('text/html')) {
            const buffer = await response.arrayBuffer();
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'max-age=31536000');
            return res.send(Buffer.from(buffer));
        }

        let html = await response.text();
        const $ = cheerio.load(html);
        const origin = new URL(target).origin;

        $('title').text('My Drive - Google Drive');
        
        const rewrite = (tag, attr) => {
            $(tag).each((i, el) => {
                let val = $(el).attr(attr);
                if (val && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('#')) {
                    try {
                        const absolute = new URL(val, target).href;
                        // FIXED: Clean string concatenation to prevent syntax crashes
                        $(el).attr(attr, '/?pw=' + pw + '&target=' + encode(absolute));
                        if (tag === 'a') $(el).attr('target', '_self');
                    } catch(e) {}
                }
            });
        };

        ['img', 'script', 'link', 'source', 'a', 'iframe', 'form'].forEach(t => {
            const a = (t === 'link' || t === 'a') ? 'href' : (t === 'form' ? 'action' : 'src');
            rewrite(t, a);
        });

        const vNav = `
            <script>
                document.addEventListener('click', e => {
                    const link = e.target.closest('a');
                    if (link && link.href.includes('target=')) {
                        e.preventDefault();
                        window.location.replace(link.href);
                    }
                });

                window.open = (url) => { window.location.replace(url); return null; };
                
                document.addEventListener('keydown', e => {
                    if(e.shiftKey && e.key.toLowerCase() === 'q') {
                        const menu = document.getElementById('base-menu');
                        menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
                    }
                });
            </script>
            <div id="base-menu" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.95);color:#fff;padding:10px 25px;border-radius:50px;z-index:9999999;display:none;border:1px solid #333;font-family:sans-serif;align-items:center;box-shadow:0 0 20px rgba(0,0,0,0.5);">
                <span style="font-weight:bold;color:#fff;margin-right:15px">BASE</span>
                <button onclick="location.href='/?pw=${pw}'" style="background:#222;color:#fff;border:none;padding:8px 15px;border-radius:20px;cursor:pointer;">Home</button>
                <button onclick="location.reload()" style="background:#222;color:#fff;border:none;padding:8px 15px;border-radius:20px;margin-left:5px;cursor:pointer;">Reload</button>
            </div>
        `;

        $('body').append(vNav);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send($.html());

    } catch (e) {
        // FIXED: Graceful error handling instead of throwing a 500 crash
        res.send("<body style='background:#000;color:#fff;text-align:center;padding:50px;font-family:sans-serif;'><h1>Connection Error</h1><p>The proxy could not fetch this page safely.</p><button onclick='window.history.back()' style='padding:10px 20px;border-radius:10px;cursor:pointer;'>Go Back</button></body>");
    }
});

module.exports = app;
