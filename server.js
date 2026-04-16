const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // serve screenshots

app.post('/test', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.json({ error: "URL is required" });
    }

    const browser = await puppeteer.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    let results = [];

    try {
        await page.goto(url, { timeout: 10000 });

        const title = await page.title();

        const screenshotPath = `screenshot-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath });

        results.push({
            test: "Page Load",
            status: "Passed",
            title
        });

        // FAST LINK CHECK
        const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

        let brokenLinks = [];

        const links = await page.$$eval('a', a => a.map(x => x.href));
        const uniqueLinks = [...new Set(links)].slice(0, 10);

        await Promise.all(uniqueLinks.map(async (link) => {
            if (!link || !link.startsWith('http')) return;

            try {
                const res = await fetch(link);
                if (res.status >= 400) brokenLinks.push(link);
            } catch {
                brokenLinks.push(link);
            }
        }));

        results.push({
            test: "Broken Links",
            status: brokenLinks.length ? "Failed" : "Passed",
            brokenCount: brokenLinks.length
        });

        await browser.close();

        // 🔥 IMPORTANT FIX (FULL URL)
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        res.json({
            results,
            screenshot: `${baseUrl}/${screenshotPath}`
        });

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