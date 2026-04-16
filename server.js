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
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        let results = [];

        // ======================
        // 🔐 LOGIN TEST (STABLE)
        // ======================
        if (username && password) {
            try {
                // wait for inputs
                const userField = await page.waitForSelector(
                    'input[type="text"], input[type="email"]',
                    { visible: true, timeout: 5000 }
                );

                await userField.click({ clickCount: 3 });
                await userField.type(username, { delay: 50 });

                const passField = await page.waitForSelector(
                    'input[type="password"]',
                    { visible: true, timeout: 5000 }
                );

                await passField.click({ clickCount: 3 });
                await passField.type(password, { delay: 50 });

                // wait for button
                const btn = await page.waitForSelector(
                    'button, input[type="submit"]',
                    { visible: true, timeout: 5000 }
                );

                // 🔥 FIX: make button clickable
                await btn.evaluate(el => el.scrollIntoView());
                await page.waitForTimeout(500);

                await Promise.all([
                    btn.click({ delay: 50 }),
                    page.waitForNavigation({ timeout: 10000 }).catch(() => {})
                ]);

                const success = page.url() !== url;

                results.push({
                    test: "Login Test",
                    status: success ? "Passed" : "Failed"
                });

            } catch (err) {
                results.push({
                    test: "Login Test",
                    status: "Failed",
                    error: err.message
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
        // 🔗 BROKEN LINKS
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
            brokenCount: brokenLinks.length
        });

        await browser.close();

        res.json({
            results,
            screenshot: `data:image/png;base64,${screenshot}`
        });

    } catch (err) {
        if (browser) await browser.close();

        res.json({
            results: [{
                test: "Page Load",
                status: "Failed",
                error: err.message
            }]
        });
    }
});

// ROOT
app.get('/', (req, res) => {
    res.send("🚀 Website Tester API Running");
});

// SERVER START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});