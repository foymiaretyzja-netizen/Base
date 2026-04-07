const express = require('express');
const path = require('path');
const cheerio = require('cheerio');
const app = express();

app.get('/', async (req, res) => {
    const targetUrl = req.query.target;

    // 1. Show the search bar if there's no target
    if (!targetUrl) {
        return res.sendFile(path.join(__dirname, 'index.html'));
    }

    try {
        // 2. Fetch the target website
        const response = await fetch(targetUrl);
        const html = await response.text();
        
        // 3. Load the HTML into Cheerio so we can manipulate it
        const $ = cheerio.load(html);
        const base = new URL(targetUrl);

        // 4. Find EVERY link (<a> tag) and rewrite it
        $('a').each((i, link) => {
            let href = $(link).attr('href');
            if (href && !href.startsWith('javascript:')) {
                try {
                    // Turn relative links into full URLs, then route through proxy
                    let absoluteUrl = new URL(href, base.href).href;
                    $(link).attr('href', '/?target=' + encodeURIComponent(absoluteUrl));
                } catch (e) {
                    // Ignore broken links
                }
            }
        });

        // 5. Send the strictly confined HTML back to the browser
        res.send($.html());
        
    } catch (error) {
        res.status(500).send('Error fetching the website. Make sure it includes https://');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Confined Prototype ready on port ${PORT}!`));
