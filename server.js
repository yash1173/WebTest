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
        // 🔐 UNIVERSAL LOGIN TEST
        // ======================
        if (username && password) {
            try {
                const userSelectors = [
                    'input[type="email"]',
                    'input[name="email"]',
                    'input[name="username"]',
                    'input[name="login"]',
                    'input[id*="user"]',
                    'input[id*="email"]',
                    'input[type="text"]'
                ];

                const passSelectors = [
                    'input[type="password"]',
                    'input[name="password"]',
                    'input[id*="pass"]'
                ];

                const buttonSelectors = [
                    'button[type="submit"]',
                    'button',
                    'input[type="submit"]',
                    '[role="button"]'
                ];

                let userFieldFound = false;
                let passFieldFound = false;
                let loginClicked = false;

                // Fill username/email
                for (let sel of userSelectors) {
                    const el = await page.$(sel);
                    if (el) {
                        await el.click({ clickCount: 3 });
                        await el.type(username, { delay: 50 });
                        userFieldFound = true;
                        break;
                    }
                }

                // Fill password
                for (let sel of passSelectors) {
                    const el = await page.$(sel);
                    if (el) {
                        await el.click({ clickCount: 3 });
                        await el.type(password, { delay: 50 });
                        passFieldFound = true;
                        break;
                    }
                }

                // Click login button
                for (let sel of buttonSelectors) {
                    const btn = await page.$(sel);
                    if (btn) {
                        await Promise.all([
                            btn.click(),
                            page.waitForNavigation({ timeout: 10000 }).catch(() => {})
                        ]);
                        loginClicked = true;
                        break;
                    }
                }

                // Detect success
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