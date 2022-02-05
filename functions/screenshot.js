const { builder } = require("@netlify/functions");
const chromium = require("chrome-aws-lambda");

function isFullUrl(url) {
  try {
    new URL(url);
    return true;
  } catch(e) {
    // invalid url OR local path
    return false;
  }
}

async function screenshot(url, format, viewportSize, dpr = 1, withJs = true) {
  const browser = await chromium.puppeteer.launch({
    executablePath: await chromium.executablePath,
    args: chromium.args,
    defaultViewport: {
      width: viewportSize[0],
      height: viewportSize[1],
      deviceScaleFactor: parseFloat(dpr),
    },
    headless: chromium.headless,
  });

  const page = await browser.newPage();

  if(!withJs) {
    page.setJavaScriptEnabled(false);
  }

  // TODO is there a way to bail at timeout and still show what’s rendered on the page?
  let response = await page.goto(url, {
    waitUntil: ["load", "networkidle0"],
    timeout: 8500
  });
  // let statusCode = response.status();
  // TODO handle 404/500 status codes better

  let options = {
    type: format,
    encoding: "base64"
  };

  if(format === "jpeg") {
    options.quality = 80;
  }

  let output = await page.screenshot(options);

  await browser.close();

  return output;
}

// Based on https://github.com/DavidWells/netlify-functions-workshop/blob/master/lessons-code-complete/use-cases/13-returning-dynamic-images/functions/return-image.js
async function handler(event, context) {
  // e.g. /https%3A%2F%2Fwww.11ty.dev%2F/small/1:1/smaller/
  let pathSplit = event.path.split("/").filter(entry => !!entry);
  let [url, size, aspectratio, zoom] = pathSplit;
  let format = "jpeg"; // hardcoded for now
  let viewport = [];

  // Manage your own frequency by using a _ prefix and then a hash buster string after your URL
  // e.g. /https%3A%2F%2Fwww.11ty.dev%2F/_20210802/ and set this to today’s date when you deploy
  if(size && size.startsWith("_")) {
    size = undefined;
  }
  if(aspectratio && aspectratio.startsWith("_")) {
    aspectratio = undefined;
  }
  if(zoom && zoom.startsWith("_")) {
    zoom = undefined;
  }

  // Set Defaults
  format = format || "jpeg";
  aspectratio = aspectratio || "1:1";
  size = size || "small";
  zoom = zoom || "standard";

  let dpr;
  if(zoom === "bigger") {
    dpr = 1.4;
  } else if(zoom === "smaller") {
    dpr = 0.71428571;
  } else if(zoom === "standard") {
    dpr = 1;
  }

  if(size === "small") {
    if(aspectratio === "1:1") {
      viewport = [375, 375];
    } else if(aspectratio === "9:16") {
      viewport = [375, 667];
    }
  } else if(size === "medium") {
    if(aspectratio === "1:1") {
      viewport = [650, 650];
    } else if(aspectratio === "9:16") {
      viewport = [650, 1156];
    }
  } else if(size === "large") {
    // 0.5625 aspect ratio not supported on large
    if(aspectratio === "1:1") {
      viewport = [1024, 1024];
    }
  } else if(size === "opengraph") {
    // ignores aspectratio
    // always maintain a 1200×630 output image
    if(zoom === "bigger") { // dpr = 1.4
      viewport = [857, 450];
    } else if(zoom === "smaller") { // dpr = 0.714
      viewport = [1680, 882];
    } else {
      viewport = [1200, 630];
    }
  }

  url = decodeURIComponent(url);

  try {
    if(!isFullUrl(url)) {
      throw new Error(`Invalid \`url\`: ${url}`);
    }

    if(!viewport || viewport.length !== 2) {
      throw new Error("Incorrect API usage. Expects one of: /:url/ or /:url/:size/ or /:url/:size/:aspectratio/")
    }

    let output = await screenshot(url, format, viewport, dpr);

    // output to Function logs
    console.log(url, format, { viewport }, { size }, { dpr }, { aspectratio });

    return {
      statusCode: 200,
      headers: {
        "content-type": `image/${format}`
      },
      body: output,
      isBase64Encoded: true
    };
  } catch (error) {
    console.log("Error", error);

    return {
      // We need to return 200 here or Firefox won’t display the image
      // HOWEVER a 200 means that if it times out on the first attempt it will stay the default image until the next build.
      statusCode: 200,
      headers: {
        "content-type": "image/svg+xml",
        "x-error-message": error.message
      },
      body: `<svg width="${viewport[0]}" height="${viewport[1]}" viewBox="0 0 1570 2186" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M670.101 1169.76H641.474C615.751 1169.76 593.347 1166.44 574.262 1159.8C556.007 1152.34 542.316 1140.3 533.188 1123.71C528.21 1114.58 524.476 1102.96 521.987 1088.86C519.497 1074.75 518.253 1057.74 518.253 1037.83C519.082 1017.91 521.157 994.679 524.476 968.126C528.625 940.743 534.018 909.627 540.656 874.776L551.858 820.011C558.497 788.48 561.816 759.853 561.816 734.13C561.816 707.577 558.911 679.365 553.103 649.493C565.55 646.174 579.241 643.684 594.177 642.025C609.113 639.535 627.783 638.291 650.187 638.291C682.548 638.291 709.101 644.929 729.845 658.205C751.419 670.652 765.525 689.322 772.163 714.215C779.631 738.279 777.557 767.735 765.94 802.586L742.292 874.776C730.675 911.286 719.888 946.552 709.93 980.572C699.973 1013.76 691.26 1046.12 683.792 1077.66C677.154 1109.19 672.59 1139.89 670.101 1169.76ZM589.198 1520.76C580.9 1523.24 572.188 1525.32 563.06 1526.98C553.933 1529.47 544.39 1531.13 534.433 1531.96C524.476 1533.62 513.274 1534.45 500.827 1534.45C473.445 1534.45 451.456 1529.47 434.86 1519.51C418.265 1508.72 407.893 1491.71 403.744 1468.48C399.595 1445.25 402.084 1413.71 411.212 1373.89L431.126 1292.98C441.084 1291.32 450.626 1289.66 459.753 1288C468.881 1286.34 478.838 1285.1 489.625 1284.27C500.412 1283.44 512.029 1283.03 524.476 1283.03C551.858 1283.03 573.432 1288.42 589.198 1299.21C604.964 1309.16 614.921 1325.76 619.07 1348.99C623.219 1371.4 620.315 1401.27 610.357 1438.61L589.198 1520.76ZM1105.25 1169.76H1076.62C1050.9 1169.76 1028.49 1166.44 1009.41 1159.8C991.152 1152.34 977.461 1140.3 968.334 1123.71C963.355 1114.58 959.621 1102.96 957.132 1088.86C954.642 1074.75 953.398 1057.74 953.398 1037.83C954.227 1017.91 956.302 994.679 959.621 968.126C963.77 940.743 969.163 909.627 975.802 874.776L987.003 820.011C993.642 788.48 996.961 759.853 996.961 734.13C996.961 707.577 994.057 679.365 988.248 649.493C1000.69 646.174 1014.39 643.684 1029.32 642.025C1044.26 639.535 1062.93 638.291 1085.33 638.291C1117.69 638.291 1144.25 644.929 1164.99 658.205C1186.56 670.652 1200.67 689.322 1207.31 714.215C1214.78 738.279 1212.7 767.735 1201.09 802.586L1177.44 874.776C1165.82 911.286 1155.03 946.552 1145.08 980.572C1135.12 1013.76 1126.41 1046.12 1118.94 1077.66C1112.3 1109.19 1107.74 1139.89 1105.25 1169.76ZM1024.34 1520.76C1016.05 1523.24 1007.33 1525.32 998.205 1526.98C989.078 1529.47 979.536 1531.13 969.578 1531.96C959.621 1533.62 948.419 1534.45 935.972 1534.45C908.59 1534.45 886.601 1529.47 870.005 1519.51C853.41 1508.72 843.038 1491.71 838.889 1468.48C834.74 1445.25 837.229 1413.71 846.357 1373.89L866.271 1292.98C876.229 1291.32 885.771 1289.66 894.899 1288C904.026 1286.34 913.983 1285.1 924.77 1284.27C935.558 1283.44 947.174 1283.03 959.621 1283.03C987.003 1283.03 1008.58 1288.42 1024.34 1299.21C1040.11 1309.16 1050.07 1325.76 1054.22 1348.99C1058.36 1371.4 1055.46 1401.27 1045.5 1438.61L1024.34 1520.76Z" fill="#BBBBBB"/>
</svg>`,
      isBase64Encoded: false,
    };
  }
}

exports.handler = builder(handler);
