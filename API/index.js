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
    
    let cookies = {};
    cookieHeader.split(';').forEach(cookie => {
        let parts = cookie.split('=');
        if (parts.length === 2) {
            cookies[parts[0].trim()] = parts[1].trim();
        }
    });

    if (!pw && cookies['base_pw']) pw = cookies['base_pw'];

    if (pw !== process.env.PROXY_PASSWORD) {
        return res.status(401).send("Unauthorized. Please append ?pw=YOUR_PASSWORD to the URL to login.");
    }

    res.setHeader('Set-Cookie', `base_pw=${pw}; Path=/; Max-Age=31536000; SameSite=Lax`);
    // ----------------------------------

    let target = req.query.target;
    
    if (!target) {
        return res.sendFile(path.join(__dirname, '../public/index.html'));
    }
    
    target = decode(target);
    
    // --- 🔍 NEW: BASE CUSTOM SEARCH ENGINE ---
    if (!target.includes('.') || target.includes(' ')) {
        try {
            // Fetch raw HTML results from a lightweight index
            const searchRes = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(target), {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
            const searchHtml = await searchRes.text();
            const $s = cheerio.load(searchHtml);
            
            let resultsHTML = '';
            
            // Extract the top 10 results
            $s('.result').slice(0, 10).each((i, el) => {
                const title = $s(el).find('.result__title a').text();
                const snippet = $s(el).find('.result__snippet').text();
                let rawLink = $s(el).find('.result__a').attr('href');
                
                if (title && rawLink) {
                    // Clean up tracking URLs
                    if (rawLink.startsWith('//duckduckgo.com/l/?')) {
                        const urlParams = new URLSearchParams(rawLink.split('?')[1]);
                        rawLink = decodeURIComponent(urlParams.get('uddg') || '');
                    }
                    
                    const domain = new URL(rawLink).hostname;
                    // Grab high-quality logo/favicon automatically
                    const logo = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
                    const encodedLink = encode(rawLink);

                    resultsHTML += `
                        <div style="background:#111; padding:20px; border-radius:12px; margin-bottom:15px; border: 1px solid #222; transition: border-color 0.2s;">
                            <div style="display:flex; align-items:center; margin-bottom:8px;">
                                <img src="${logo}" style="width:20px; height:20px; margin-right:10px; border-radius:4px; background:#fff;">
                                <span style="color:#888; font-size:13px; font-weight:bold;">${domain}</span>
                            </div>
                            <a href="/?pw=${pw}&target=${encodedLink}" style="color:#fff; font-size:22px; text-decoration:none; font-weight:bold; display:block; margin-bottom:8px;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${title}</a>
                            <p style="color:#aaa; font-size:15px; margin:0; line-height:1.6;">${snippet}</p>
                        </div>
                    `;
                }
            });

            // The Custom Search UI
            const customUI = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Base Search</title>
                    <style>
                        body { background:#000; color:#fff; font-family:sans-serif; margin:0; padding:40px 20px; }
                        .container { max-width:800px; margin:0 auto; }
                        .header { display:flex; align-items:center; gap:20px; margin-bottom:40px; }
                        .logo { font-size:2rem; font-weight:900; letter-spacing:-2px; cursor:pointer; margin:0; }
                        input { flex-grow:1; padding:16px; border-radius:12px; border:1px solid #333; background:#111; color:#fff; font-size:16px; outline:none; }
                        button { padding:16px 30px; border-radius:12px; border:none; background:#fff; color:#000; font-weight:bold; cursor:pointer; font-size:16px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <form id="searchForm" class="header">
                            <h1 class="logo" onclick="window.location.replace('/')">Base</h1>
                            <input type="text" id="s" value="${target}" autocomplete="off">
                            <button type="submit">Search</button>
                        </form>
                        <div id="results">
                            ${resultsHTML || '<h3 style="color:#888; text-align:center; margin-top:50px;">No results found for this query.</h3>'}
                        </div>
                    </div>
                    <script>
                        document.getElementById('searchForm').addEventListener('submit', e => {
                            e.preventDefault();
                            const val = document.getElementById('s').value;
                            window.location.replace('/?pw=${pw}&target=' + encodeURIComponent(btoa(val)));
                        });
                        // Override link clicks so they don't trigger the extension
                        document.addEventListener('click', e => {
                            const link = e.target.closest('a');
                            if (link && link.href.includes('target=')) {
                                e.preventDefault();
                                window.location.replace(link.href);
                            }
                        });
                    </script>
                </body>
                </html>
            `;
            
            res.setHeader('Content-Type', 'text/html');
            return res.send(customUI);

        } catch (err) {
            target = 'https://duckduckgo.com/?q=' + encodeURIComponent(target);
        }
    } 
    // --- 🌍 NORMAL PROXY ROUTING ---
    else if (!target.startsWith('http')) {
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

        if (!contentType.includes('text/html')) {
            const buffer = await response.arrayBuffer();
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

                document.addEventListener('submit', e => {
                    const form = e.target;
                    if (form.action && form.action.includes('target=')) {
                        e.preventDefault();
                        try {
                            const urlParams = new URLSearchParams(new URL(form.action).search);
                            const proxyTargetBase64 = urlParams.get('target');
                            if (proxyTargetBase64) {
                                const decodedAction = atob(decodeURIComponent(proxyTargetBase64));
                                if (!form.method || form.method.toLowerCase() === 'get') {
                                    const formData = new FormData(form);
                                    const searchParams = new URLSearchParams(formData).toString();
                                    const joiner = decodedAction.includes('?') ? '&' : '?';
                                    const finalTarget = encodeURIComponent(btoa(decodedAction + joiner + searchParams));
                                    window.location.replace('/?target=' + finalTarget);
                                }
                            }
                        } catch (err) {}
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
        res.send("<body style='background:#000;color:#fff;text-align:center;padding:50px;font-family:sans-serif;'><h1>Connection Error</h1><p>The proxy could not fetch this page safely.</p><button onclick='window.location.replace(\"/\")' style='padding:10px 20px;border-radius:10px;cursor:pointer;background:#fff;color:#000;font-weight:bold;border:none;'>Go Home</button></body>");
    }
});

module.exports = app;
