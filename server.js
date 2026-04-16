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
        // 🔐 LOGIN TEST (FIXED)
        // ======================
        if (username && password) {
            try {
                // USERNAME
                const userField = await page.waitForSelector(
                    'input[type="text"], input[type="email"]',
                    { visible: true, timeout: 5000 }
                );

                await userField.click({ clickCount: 3 });
                await userField.type(username, { delay: 50 });

                // PASSWORD
                const passField = await page.waitForSelector(
                    'input[type="password"]',
                    { visible: true, timeout: 5000 }
                );

                await passField.click({ clickCount: 3 });
                await passField.type(password, { delay: 50 });

                // ======================
                // 🔥 SMART BUTTON FIND
                // ======================
                let btn;

                const buttonSelectors = [
                    '#submit',
                    'button[type="submit"]',
                    'input[type="submit"]',
                    'button'
                ];

                for (let sel of buttonSelectors) {
                    try {
                        btn = await page.waitForSelector(sel, { visible: true, timeout: 2000 });
                        if (btn) break;
                    } catch {}
                }

                if (!btn) throw new Error("Login button not found");

                // Fix click issue
                await btn.evaluate(el => el.scrollIntoView());
                await page.waitForTimeout(500);

                await Promise.all([
                    btn.click({ delay: 50 }),
                    page.waitForNavigation({ timeout: 10000 }).catch(() => {})
                ]);

                // RESULT
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
        // 📸 SCREENSHOT
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

// START SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});