const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null, // 设置为 null 窗口会最大化
        args: ['--start-maximized'], // 启动时最大化窗口
    });
    const page = await browser.newPage();
    await page.goto('https://www.mangacopy.com/comic/yishijieshushu/chapter/0f8248cc-c20c-11e8-b8b2-00163e0ca5bd');
    const js = `
    (async function() {
      const sleep = (duration) => {
        return new Promise(resolve => {
          setTimeout(resolve, duration);
        })
      }
      for (let index = 0; index < 300; index++) {
        document.querySelector("html").scrollTop = document.querySelector("html").scrollTop + 30;
        await sleep(10)
      }
      const nodes = document.querySelectorAll(".comicContent-list li img");
      let arr=[];
      for (let index = 0; index < nodes.length; index++) {
        arr.push(nodes[index].getAttribute('data-src'))
      }
      return arr
    })()
            `
    const html = await page.evaluate(async (js) => {
        const data = await eval(js)
        return data
    }, js);
    return html
})();