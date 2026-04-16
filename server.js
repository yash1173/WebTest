const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post('/test', async (req, res) => {
    const { url, username, password } = req.body;

    if (!url) {
        return res.json({ error: "URL is required" });
    }

    let browser;

    try {
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.goto(url, { timeout: 15000 });

        let results = [];

        // ======================
        // 🔐 LOGIN TEST
        // ======================
        if (username && password) {
            try {
                // try common selectors
                await page.type('input[type="text"], input[type="email"]', username, { delay: 50 });
                await page.type('input[type="password"]', password, { delay: 50 });

                await Promise.all([
                    page.click('button, input[type="submit"]'),
                    page.waitForNavigation({ timeout: 10000 }).catch(() => {})
                ]);

                const currentUrl = page.url();

                results.push({
                    test: "Login Test",
                    status: currentUrl !== url ? "Passed" : "Failed"
                });

            } catch (err) {
                results.push({
                    test: "Login Test",
                    status: "Failed",
                    error: "Could not perform login"
                });
            }
        }

        // ======================
        // 📄 PAGE LOAD
        // ======================
        const title = await page.title();

        results.push({
            test: "Page Load",
            status: "Passed",
            title
        });

        // ======================
        // 📸 SCREENSHOT (BASE64)
        // ======================
        const screenshot = await page.screenshot({
            encoding: 'base64',
            fullPage: true
        });

        // ======================
        // 🔗 BROKEN LINKS CHECK
        // ======================
        const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

        let brokenLinks = [];

        const links = await page.$$eval('a', a => a.map(x => x.href));
        const uniqueLinks = [...new Set(links)].slice(0, 10);

        await Promise.all(uniqueLinks.map(async (link) => {
            if (!link || !link.startsWith('http')) return;

            try {
                const response = await fetch(link);
                if (response.status >= 400) brokenLinks.push(link);
            } catch {
                brokenLinks.push(link);
            }
        }));

        results.push({
            test: "Broken Links",
            status: brokenLinks.length ? "Failed" : "Passed",
            brokenCount: brokenLinks.length,
            sample: brokenLinks.slice(0, 5)
        });

        await browser.close();

        res.json({
            results,
            screenshot: `data:image/png;base64,${screenshot}`
        });

    } catch (err) {
        if (browser) await browser.close();

        res.json({
            results: [
                {
                    test: "Page Load",
                    status: "Failed",
                    error: err.message
                }
            ]
        });
    }
});

// ROOT
app.get('/', (req, res) => {
    res.send("🚀 Website Tester API Running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});