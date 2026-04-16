const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.post('/test', async (req, res) => {
    const { url, username, password, userSelector, passSelector, btnSelector } = req.body;

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
        // 🔐 LOGIN TEST (SMART + WAIT)
        // ======================
        if (username && password) {
            try {
                let userFieldFound = false;
                let passFieldFound = false;
                let loginClicked = false;

                // ✅ CUSTOM SELECTORS
                if (userSelector) {
                    await page.waitForSelector(userSelector, { visible: true, timeout: 5000 });
                    await page.type(userSelector, username, { delay: 50 });
                    userFieldFound = true;
                }

                if (passSelector) {
                    await page.waitForSelector(passSelector, { visible: true, timeout: 5000 });
                    await page.type(passSelector, password, { delay: 50 });
                    passFieldFound = true;
                }

                if (btnSelector) {
                    await page.waitForSelector(btnSelector, { visible: true, timeout: 5000 });

                    await Promise.all([
                        page.click(btnSelector),
                        page.waitForNavigation({ timeout: 10000 }).catch(() => {})
                    ]);

                    loginClicked = true;
                }

                // 🔁 FALLBACK AUTO MODE
                if (!userFieldFound) {
                    const el = await page.waitForSelector(
                        'input[type="email"], input[type="text"]',
                        { timeout: 5000 }
                    );
                    await el.type(username);
                    userFieldFound = true;
                }

                if (!passFieldFound) {
                    const el = await page.waitForSelector('input[type="password"]', { timeout: 5000 });
                    await el.type(password);
                    passFieldFound = true;
                }

                if (!loginClicked) {
                    const btn = await page.waitForSelector('button, input[type="submit"]', { timeout: 5000 });

                    await Promise.all([
                        btn.click(),
                        page.waitForNavigation({ timeout: 10000 }).catch(() => {})
                    ]);

                    loginClicked = true;
                }

                // ✅ SUCCESS CHECK
                const currentUrl = page.url();

                let success = false;

                if (currentUrl !== url) {
                    success = true;
                } else {
                    const stillHasPassword = await page.$('input[type="password"]');
                    if (!stillHasPassword) success = true;
                }

                results.push({
                    test: "Login Test",
                    status: success ? "Passed" : "Failed",
                    details: {
                        userFieldFound,
                        passFieldFound,
                        loginClicked
                    }
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
        // 📄 PAGE LOAD TEST
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
        // 🔗 BROKEN LINKS TEST
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

// SERVER START
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});