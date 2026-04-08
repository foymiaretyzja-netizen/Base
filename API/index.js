const express = require('express');
const cheerio = require('cheerio');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, '../public'), { index: false }));

const encode = (str) => encodeURIComponent(Buffer.from(str).toString('base64'));
const decode = (str) => {
    try { return Buffer.from(decodeURIComponent(str), 'base64').toString('utf8'); }
    catch(e) { return str; }
};

app.all('*', async (req, res) => {
    // --- 🍪 THE COOKIE AUTH SYSTEM ---
    let pw = req.query.pw;
    let cookieHeader = req.headers.cookie || '';
    
    // Read the browser's cookies
    let cookies = {};
    cookieHeader.split(';').forEach(cookie => {
        let parts = cookie.split('=');
        if (parts.length === 2) {
            cookies[parts[0].trim()] = parts[1].trim();
        }
    });

    // If the password isn't in the URL, check if the browser remembered it
    if (!pw && cookies['base_pw']) {
        pw = cookies['base_pw'];
    }

    // If there is still no valid password, block access
    if (pw !== process.env.PROXY_PASSWORD) {
        return res.status(401).send("Unauthorized. Please append ?pw=YOUR_PASSWORD to the URL to login.");
    }

    // Tell the browser to memorize this password securely in the background
    res.setHeader('Set-Cookie', `base_pw=${pw}; Path=/; Max-Age=31536000; SameSite=Lax`);
    // ----------------------------------

    let target = req.query.target;
    
    if (!target) {
        return res.sendFile(path.join(__dirname, '../public/index.html'));
    }
    
    target = decode(target);
    
    if (!target.includes('.') || target.includes(' ')) {
        target = 'https://duckduckgo.com/?q=' + encodeURIComponent(target);
    } else if (!target.startsWith('http')) {
        target = 'https://' + target;
    }

    try {
        const response = await fetch(target, {
            headers: { 
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Referer': new URL(target).origin
            }
        });

        const finalTarget = response.url;
        const contentType = response.headers.get('content-type') || '';

        // Route for passing Images, Games, and CSS
        if (!contentType.includes('text/html')) {
            const buffer = await response.arrayBuffer();
            // Re-apply cookie header here so game assets keep the authentication
            res.setHeader('Set-Cookie', `base_pw=${pw}; Path=/; Max-Age=31536000; SameSite=Lax`);
            res.setHeader('Content-Type', contentType);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cache-Control', 'max-age=31536000');
            return res.send(Buffer.from(buffer));
        }

        let html = await response.text();
        const $ = cheerio.load(html);

        $('meta[http-equiv="refresh"]').remove();
        $('title').text('My Drive - Google Drive');
        
        const rewrite = (tag, attr) => {
            $(tag).each((i, el) => {
                let val = $(el).attr(attr);
                if (val && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('#')) {
                    try {
                        const absolute = new URL(val, finalTarget).href;
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
                <button onclick="window.location.replace('/')" style="background:#222;color:#fff;border:none;padding:8px 15px;border-radius:20px;cursor:pointer;">Home</button>
                <button onclick="location.reload()" style="background:#222;color:#fff;border:none;padding:8px 15px;border-radius:20px;margin-left:5px;cursor:pointer;">Reload</button>
            </div>
        `;

        $('body').append(vNav);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send($.html());

    } catch (e) {
        res.send("<body style='background:#000;color:#fff;text-align:center;padding:50px;font-family:sans-serif;'><h1>Connection Error</h1><p>The proxy could not fetch this page safely.</p><button onclick='window.history.back()' style='padding:10px 20px;border-radius:10px;cursor:pointer;'>Go Back</button></body>");
    }
});

module.exports = app;
