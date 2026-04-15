const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post('/test', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.json({ error: "URL is required" });
    }

    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    let results = [];

    try {
        await page.goto(url, { timeout: 15000 });

        const title = await page.title();

        const screenshotPath = `screenshot-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath });

        results.push({
            test: "Page Load",
            status: "Passed",
            title
        });

        // Links
        let brokenLinks = [];
        const links = await page.$$eval('a', a => a.map(x => x.href));
        const uniqueLinks = [...new Set(links)];

        for (let link of uniqueLinks) {
            if (!link || !link.startsWith('http')) continue;

            const p = await browser.newPage();

            try {
                const r = await p.goto(link, { timeout: 5000 });
                if (!r || r.status() >= 400) brokenLinks.push(link);
            } catch {
                brokenLinks.push(link);
            }

            await p.close();
        }

        results.push({
            test: "Broken Links",
            status: brokenLinks.length ? "Failed" : "Passed",
            brokenCount: brokenLinks.length
        });

        // Images
        let brokenImages = [];
        const images = await page.$$eval('img', i => i.map(x => x.src));
        const uniqueImages = [...new Set(images)];

        for (let img of uniqueImages) {
            if (!img || img.startsWith('data:')) continue;

            const p = await browser.newPage();

            try {
                const r = await p.goto(img, { timeout: 5000 });
                if (!r || r.status() >= 400) brokenImages.push(img);
            } catch {
                brokenImages.push(img);
            }

            await p.close();
        }

        results.push({
            test: "Broken Images",
            status: brokenImages.length ? "Failed" : "Passed",
            brokenCount: brokenImages.length
        });

        await browser.close();

        res.json({ results, screenshot: screenshotPath });

    } catch (err) {
        await browser.close();

        res.json({
            results: [{
                test: "Page Load",
                status: "Failed",
                error: err.message
            }]
        });
    }
});

app.get('/', (req, res) => {
    res.send("🚀 Website Tester API Running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});