import { auth } from '@googleapis/calendar'

import { ElementHandle, HTTPRequest, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';

const StealthPlugin = require('puppeteer-extra-plugin-stealth'); // required so Google doesn't block our web-scraping
puppeteer.use(StealthPlugin());

const oauth2Config = {
    "clientId": "<YOUR CLIENT ID>",
    "clientSecret": "<YOUR CLIENT SECRET>",
    "redirectUri": "http://localhost:3000/oauth2callback"
};

const scopes = [
    'https://www.googleapis.com/auth/calendar'
];

const credentials = {
    username: '<YOUR GOOGLE USERNAME>',
    password: '<YOUR GOOGLE PASSWORD>' // store this encrypted somewhere!
}

async function clickNext(page: Page) {
    const [nextBtn] = await page.$x("//button[contains(., 'Next')]") as ElementHandle<Element>[];
    return nextBtn.click({delay: 500});
}

async function delay(time: number) {
    return new Promise(function(resolve) { 
        setTimeout(resolve, time)
    });
 }

/** sign into google flow */
async function login(page: Page) {
    // we may need to sign in from scrach.....
    const emailInputSelector = 'input[type="email"]';
    await page.waitForSelector(emailInputSelector)
    await page.type(emailInputSelector, credentials.username);
    await clickNext(page);

    await delay(1000); // allow next screen a litte loading time, this flow is a bit funky
    const passwordSelector = 'input[aria-label="Enter your password"]';
    await page.waitForSelector(passwordSelector);
    await page.type(passwordSelector, credentials.password);
    await clickNext(page);
}

/** if already authenticated just select the correct Google account */
async function selectAccount(page: Page) {
    const accountSelector = `[data-email="${credentials.username}"]`;
    await page.waitForSelector(accountSelector);
    await page.click(accountSelector);
}
  
async function startOauth() {
    const oauth2Client  = new auth.OAuth2(oauth2Config);

    // the URL returned here is normally where we send an end-user to grant access via a UI
    // after they have authenticated with Google...because the calendar API only supports oauth2 authentication
    // we are forced to do sooo much extra
    const url = oauth2Client.generateAuthUrl({access_type: 'offline', scope: scopes});
    // TODO: Navigate to the above URL via an authenticated session and grant access, GAHHH

    const browser = await puppeteer.launch({headless: false}); // launch with {headless: false} to debug
    const page = await browser.newPage();
    await page.goto(url);

    // TODO: Add logic to determine if we should call login or selectAccount
    await login(page);

    // TODO: OTP is a manual process for now, will need some other tech to fudge this xD
    // for now we just wait wait wait until the correct screen presents itself
    // Note: This screen does not exist once the app is published so we will have to wait for something else

    await page.waitForXPath('//*[contains(., "Google hasn’t verified this app")]', { timeout: 120000 });
    await delay(1000);

    await page.waitForXPath("//button[contains(., 'Continue')]");
    const [continueBtn] = await page.$x("//button[contains(., 'Continue')]") as ElementHandle<Element>[];
    await continueBtn.click(); //TODO: We aren't clicking the button here but highlighting it....this is where we die
    

    // Grant access for calendar to access your account
    await page.waitForXPath('//*[contains(., "Google hasn’t verified this app")]');
    const [continueBtn2] = await page.$x("//button[contains(., 'Continue')]") as ElementHandle<Element>[];
    await page.setRequestInterception(true); // now we have to intercept the next request to get the code
    page.on('requestfinished', finishLoginAndDoSync); // so we setup the callback to go to the next thread once we are done

    await continueBtn2.click();
}

async function finishLoginAndDoSync(req: HTTPRequest) {
    console.log('finished:', req.headers());
    console.log('finished:', req.url());
}

startOauth().catch((error) => console.error(error));