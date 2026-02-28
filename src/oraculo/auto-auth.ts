import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as dotenv from 'dotenv';
import path from 'path';

// Cargar variables de entorno
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const ACCOUNT = process.env.PROTRACK_ACCOUNT;
const PASSWORD = process.env.PROTRACK_PASSWORD;
const LOGIN_URL = "https://www.protrack365.com/";

// Añadir capa de sigilo para evitar ser detectados como bot
puppeteer.use(StealthPlugin());

let cachedToken: string | null = null;
let tokenExpiresAt: number = 0; // Epoch in seconds

/**
 * Automator: Abre un navegador invisible, inicia sesión en Protrack, 
 * y roba el "Token" secreto interceptando la red.
 * [ACTUALIZACIÓN]: Ahora guarda el token en memoria por 90 minutos para evitar ban de IP y quemar RAM.
 */
export async function extractPrivateToken(): Promise<string> {
    if (!ACCOUNT || !PASSWORD) {
        throw new Error("PROTRACK_ACCOUNT o PROTRACK_PASSWORD no definidos en .env");
    }

    // 1. Verificar si tenemos un token en caché y si aún es válido (margen de 90 minutos)
    const nowSecs = Math.floor(Date.now() / 1000);
    if (cachedToken && nowSecs < tokenExpiresAt) {
        console.log(`[AUTH-PUPPETEER] ✓ Usando Token en Caché. Expira en ${Math.floor((tokenExpiresAt - nowSecs) / 60)} min.`);
        return cachedToken;
    }

    console.log("[AUTH-PUPPETEER] ⚠️ Token expirado o nulo. Iniciando navegador fantasma...");

    const browser = await puppeteer.launch({
        headless: true, // true para que no se vea la ventana (Invisible)
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process'
        ]
    });

    const page = await browser.newPage();

    // Fingir ser un usuario 100% real
    await page.setViewport({ width: 1366, height: 768 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36");

    let extractedToken: string = "";
    let customerId: string = "";

    // Escuchar todas las peticiones de red silenciosamente
    page.on('request', request => {
        const url = request.url();
        // Si la URL es la de la API privada y tiene el token, lo robamos
        if (url.includes('gpscenter.xyz') && url.includes('token=C011')) {
            try {
                const urlObj = new URL(url);
                const t = urlObj.searchParams.get('token');
                const cid = urlObj.searchParams.get('customerid');

                if (t && t.length > 50) extractedToken = t;
                if (cid) customerId = cid;
            } catch (e) { }
        }
    });

    try {
        console.log(`[AUTH-PUPPETEER] Navegando a ${LOGIN_URL}`);
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle2' });

        // Identificadores de los inputs del login en Protrack365 
        // (Asumimos que la página tiene un form básico)
        const userSelector = 'input[type="text"]';
        const passSelector = 'input[type="password"]';

        await page.waitForSelector(userSelector, { timeout: 10000 });

        console.log(`[AUTH-PUPPETEER] Llenando credenciales para: ${ACCOUNT}`);
        // Limpiar el campo usuario (por si acaso) y escribir
        await page.click(userSelector, { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type(userSelector, ACCOUNT, { delay: 50 });

        await page.type(passSelector, PASSWORD, { delay: 50 });

        console.log(`[AUTH-PUPPETEER] Buscando Botón de Login y Presionando...`);
        // En lugar de un selector estricto, buscamos cualquier botón y probamos con Enter también
        await page.keyboard.press('Enter');

        // Pero además intentamos darle click al botón que diga Login o Iniciar Sesión por si a caso
        await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a.login-btn, .btn-login, .login-button'));
            const loginBtn = buttons.find((b: any) => b.innerText?.toLowerCase().includes('login') || b.innerText?.toLowerCase().includes('sesi') || b.className?.toLowerCase().includes('login'));
            if (loginBtn) (loginBtn as HTMLElement).click();
        });

        const navPromise = page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(() => { });
        await navPromise;

        console.log("[AUTH-PUPPETEER] Esperando 10 segundos a que Protrack despierte al servidor de mapas...");
        await new Promise(r => setTimeout(r, 10000));

        if (extractedToken && extractedToken.length > 0) {
            console.log(`✅ [EXITO] Token privado robado: ${extractedToken.substring(0, 15)}...`);
            console.log(`✅ [EXITO] Customer ID detectado: ${customerId}`);
        } else {
            console.log("❌ [ERROR] No se pudo interceptar el token durante el login.");
            // Sacar pantallazo para debuggear si falla
            await page.screenshot({ path: path.resolve(__dirname, 'debug-login.png') });
            throw new Error("Token no interceptado");
        }

    } catch (err) {
        console.error("Fallo durante el Scraping:", err);
        throw err;
    } finally {
        await browser.close();
    }

    // Guardar en caché y establecer expiración a 90 minutos (5400 segundos)
    if (extractedToken) {
        cachedToken = extractedToken;
        tokenExpiresAt = Math.floor(Date.now() / 1000) + 5400;
    }

    return extractedToken;
}

// Descomentar para probar unitariamente
// extractPrivateToken();
