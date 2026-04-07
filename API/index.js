const express = require('express');
const cheerio = require('cheerio');
const app = express();

// 1. WE STORE THE HTML UI HERE NOW SO VERCEL CAN'T BYPASS IT
const uiHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>My Simple Proxy</title>
    <style>
        body { font-family: sans-serif; background-color: #f4f4f9; display: flex; flex-direction: column; align-items: center; margin-top: 15%; }
        input[type="url"] { width: 300px; padding: 10px; border-radius: 5px; border: 1px solid #ccc; }
        button { padding: 10px 20px; border-radius: 5px; border: none; background-color: #007bff; color: white; cursor: pointer; }
        button:hover { background-color: #0056b3; }
    </style>
</head>
<body>
    <h1>Prototype Proxy</h1>
    <p>Enter a URL to browse safely</p>
    <form id="proxyForm">
        <input type="url" id="targetUrl" placeholder="https://example.com" required>
        <button type="submit">Go</button>
    </form>
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

// 2. USE '*' TO CATCH EVERY SINGLE ROUTE VERCEL TRIES TO THROW AT IT
app.all('*', async (req, res) => {
    
    const userPass = req.query.pw;
    const correctPass = process.env.PROXY_PASSWORD;

    // 3. PASSWORD CHECK
    if (userPass !== correctPass) {
        return res.status(401).send("<h1>Access Denied</h1><p>Please add ?pw=YOUR_PASSWORD to the URL.</p>");
    }

    const targetUrl = req.query.target;

    // 4. LOAD THE HTML UI IF NO TARGET IS TYPED
    if (!targetUrl) {
        return res.send(uiHTML);
    }

    // 5. THE HIGH-RISK BLOCKLIST
    // Add any sites here you want to prevent the proxy from ever loading
    const blocklist = ['netflix.com', 'hulu.com', 'bankofamerica.com', 'chase.com', 'wellsfargo.com', 'youtube.com'];
    if (targetUrl && blocklist.some(domain => targetUrl.toLowerCase().includes(domain))) {
        return res.status(403).send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 10%;">
                <h1 style="color: red;">Safety Protocol Active</h1>
                <p>This domain is blocked to protect your Vercel account from being flagged.</p>
                <a href="/?pw=${userPass}">Go Back</a>
            </div>
        `);
    }

    // 6. RUN THE PROXY ENGINE
    try {
        const fetchUrl = new URL(targetUrl);
        for (let key in req.query) {
            if (key !== 'target' && key !== 'pw') {
                fetchUrl.searchParams.append(key, req.query[key]);
            }
        }

        const response = await fetch(fetchUrl.toString(), {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64 AppleWebKit/537.36)' }
        });
        
        const html = await response.text();
        const $ = cheerio.load(html);
        const base = new URL(targetUrl);

        $('a').each((i, link) => {
            let href = $(link).attr('href');
            if (href && !href.startsWith('javascript:')) {
                try {
                    let absoluteUrl = new URL(href, base.href).href;
                    $(link).attr('href', `/?pw=${userPass}&target=` + encodeURIComponent(absoluteUrl));
                } catch (e) {}
            }
        });

        $('form').each((i, form) => {
            let action = $(form).attr('action');
            if (action) {
                try {
                    let absoluteAction = new URL(action, base.href).href;
                    $(form).attr('action', '/');
                    $(form).append(`<input type="hidden" name="target" value="${absoluteAction}">`);
                    $(form).append(`<input type="hidden" name="pw" value="${userPass}">`);
                } catch (e) {}
            }
        });

        res.send($.html());
        
    } catch (error) {
        res.status(500).send('Error fetching the website. Make sure it includes https://');
    }
});

module.exports = app;
