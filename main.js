const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const express = require('express')
const { execSync } = require('child_process')
const { HttpsProxyAgent } = require('https-proxy-agent');
const puppeteer = require('puppeteer');
browser = false;
async function init() {
    browser = await puppeteer.launch({
        defaultViewport: null, // 设置为 null 窗口会最大化
        args: ['--start-maximized'], // 启动时最大化窗口
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    });
}
init()
async function getHtml(url) {
    const page = await browser.newPage();
    await page.goto(url);
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    return html
}
async function executeEval(url, js) {
    const page = await browser.newPage();
    await page.goto(url);
    const res = await page.evaluate(async (js) => {
        const data = await eval(js)
        return data
    }, js);
    return res
}
function getMacWebProxy() {
    // 这种方法需要考虑到用户使用不同网卡的情况，Wi-Fi 是网络设备名称，对于使用有线网卡的用户，可能需要替换成 Ethernet 等适当的名称
    const cmd = 'networksetup -getwebproxy "Wi-Fi"'
    const output = execSync(cmd).toString()
    const result = output.match(/(?:Enabled:\s)(\w+)\n(?:Server:\s)([^\n]+)\n(?:Port:\s)(\d+)/)

    if (result) {
        const [_, enabled, server, port] = result
        if (enabled === 'Yes') {
            return `http://${server}:${port}`
        }
    }

    return null
}
// 创建一个 Express 应用
const serverApp = express();
serverApp.use(express.static(path.join(__dirname, 'dist/browser')));
const PORT = process.env.PORT || 3000;
serverApp.listen(PORT, () => {
    console.log(`Express server running at http://localhost:${PORT}`);
});

async function fetchc(url, options = {}) {
    const fetch = (await import('node-fetch')).default;
    const f = getMacWebProxy();
    console.log(f);
    let obj = {}
    if (f) obj["agent"] = new HttpsProxyAgent(f)
    const res = await fetch(url, obj)
    return res
}

async function fetchWithTimeoutAndRace(url, options = {}) {
    try {
        try {
            const requestPromise = await fetchc(url, options);
            return requestPromise;
        } catch (error) {
            const requestPromise = await fetchc(url, options);
            return requestPromise
        }
    } catch (error) {
        try {
            const requestPromise = await fetchc(url, options);
            return requestPromise;
        } catch (error) {
            return null
        }
    }
}
async function stringToReadStream(string) {
    const readableStream = new ReadableStream({
        start(controller) {
            for (const data of string) {
                controller.enqueue(Uint8Array.from(data));
            }
            controller.close();
        },
    });
    const response = new Response(readableStream)
    const json = await response.json();
    return JSON.stringify(json);
}
async function readStreamToString(response) {
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    return uint8Array;
}

// 创建 Electron 窗口
function createWindow() {
    const win = new BrowserWindow({
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,  // 开启 Node.js 集成
        }
    });
    win.webContents.openDevTools();
    ipcMain.on('message-from-renderer', async (event, arg) => {
        if (arg.type == "pulg_proxy_request") {
            let request = arg;
            if (request.http.option.body) request.http.option.body = await stringToReadStream(request.http.option.body);
            const rsponse = await fetchWithTimeoutAndRace(request.http.url, request.http.option)
            if (rsponse) {
                const data = await readStreamToString(rsponse)
                let headers = [];
                rsponse.headers.forEach(function (value, name) { headers.push({ value, name }) });
                let res = { id: request.id, proxy_response_website_url: request.proxy_response_website_url, type: "proxy_response", data: { body: data, bodyUsed: rsponse.bodyUsed, headers: headers, ok: rsponse.ok, redirected: rsponse.redirected, status: rsponse.status, statusText: rsponse.statusText, type: rsponse.type, url: rsponse.url } }
                event.reply('message-from-main', res);
            }
        } else if (arg.type == "website_proxy_request_html") {
            const src = await getHtml(arg.proxy_request_website_url);
            var myBlob = new Blob([src], {
                type: "application/text"
            });
            var init = { status: 200, statusText: "OK" };
            var rsponse = new Response(myBlob, init);
            const data = await readStreamToString(rsponse)
            let headers = [];
            rsponse.headers.forEach(function (value, name) { headers.push({ value, name }) });
            let res = { id: arg.id, proxy_response_website_url: arg.proxy_response_website_url, type: "proxy_response", data: { body: data, bodyUsed: rsponse.bodyUsed, headers: headers, ok: rsponse.ok, redirected: rsponse.redirected, status: rsponse.status, statusText: rsponse.statusText, type: rsponse.type, url: rsponse.url } };
            event.reply('message-from-main', res);
        } else if (arg.type == "website_request_execute_script") {
            const data = await executeEval(arg.proxy_request_website_url, arg.javascript);
            let res = { data: data, type: 'execute_script_data', id: arg.id }
            event.reply('message-from-main', res);
        }
    });
    win.loadURL(`http://localhost:${PORT}`);
}

// 等待 Electron 启动完成后再创建窗口
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        // 在 macOS 上，点击 dock 图标时如果没有窗口，则创建一个新窗口
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 在所有窗口关闭时退出应用
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});


