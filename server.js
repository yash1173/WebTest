const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { execSync } = require('child_process');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// 🔥 FORCE INSTALL PLAYWRIGHT BROWSER (RAILWAY FIX)
try {
    console.log("Installing Playwright Chromium...");
    execSync('npx playwright install chromium', { stdio: 'inherit' });
} catch (e) {
    console.log("Playwright install skipped");
}

// ======================
// TEST API
// ======================
app.post('/test', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.json({ error: "URL is required" });
    }

    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    });

    const page = await browser.newPage();

    let results = [];

    try {
        // PAGE LOAD
        await page.goto(url, { timeout: 10000 });

        const title = await page.title();

        const screenshotPath = `screenshot-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath });

        results.push({
            test: "Page Load",
            status: "Passed",
            title
        });

        // ======================
        // FAST BROKEN LINKS CHECK
        // ======================
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

        let brokenLinks = [];

        const links = await page.$$eval('a', a => a.map(x => x.href));
        const uniqueLinks = [...new Set(links)].slice(0, 10); // 🔥 limit

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
            brokenCount: brokenLinks.length,
            sample: brokenLinks.slice(0, 5)
        });

        // ======================
        // FAST BROKEN IMAGES CHECK
        // ======================
        let brokenImages = [];

        const images = await page.$$eval('img', i => i.map(x => x.src));
        const uniqueImages = [...new Set(images)].slice(0, 10); // 🔥 limit

        await Promise.all(uniqueImages.map(async (img) => {
            if (!img || img.startsWith('data:')) return;

            try {
                const res = await fetch(img);
                if (res.status >= 400) brokenImages.push(img);
            } catch {
                brokenImages.push(img);
            }
        }));

        results.push({
            test: "Broken Images",
            status: brokenImages.length ? "Failed" : "Passed",
            brokenCount: brokenImages.length,
            sample: brokenImages.slice(0, 5)
        });

        await browser.close();

        res.json({
            results,
            screenshot: screenshotPath
        });

    } catch (err) {
        await browser.close();

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