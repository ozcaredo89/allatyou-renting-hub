const TOKEN = "C01177207720717720772070694c944fa71e3b898e1bc027d88c6891342693";
const CID = "1342693";
const MAP_URL = `https://real.gpscenter.xyz/LocationService?method=customerDeviceAndGpsone&maptype=google&customerid=${CID}&token=${TOKEN}&version=2&lang=es-es&fromweb=1&timezone=-18000&callback=jsonp948944`;

async function testMap() {
    console.log(`\nProbando endpoint de MAPA: ${MAP_URL.split("?")[0]}`);
    try {
        const res = await fetch(MAP_URL, {
            headers: {
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
                "Connection": "keep-alive",
                "Referer": `https://real.gpscenter.xyz/V2/dist/index.html?id=1342693&lang=es-es&token=${TOKEN}`,
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
                "sec-ch-ua": `"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"`,
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": `"Windows"`
            }
        });

        let txt = await res.text();
        console.log(`✅ Status: ${res.status}`);

        // El servidor puede responder con JSONP o con JSON puro:
        if (txt.includes("jsonp948944(")) {
            txt = txt.replace("jsonp948944(", "");
            txt = txt.substring(0, txt.length - 1);
        }

        try {
            const json = JSON.parse(txt);
            if (json.data && Array.isArray(json.data)) {
                console.log(`\n🎉 ¡BINGO! El servidor devolvió un array masivo con ${json.data.length} vehículos!`);
                console.log(`\n--- Muestra del primer vehículo ---`);
                const carro = json.data[0];
                console.log(`Placa/Nombre:`, carro.n);
                console.log(`IMEI:`, carro.i);
                console.log(`Latitud:`, carro.la);
                console.log(`Longitud:`, carro.lo);
                console.log(`Velocidad (km/h):`, carro.s);
                console.log(`Motor Encendido (ACC):`, carro.ac === 1 ? "SÍ" : "NO");
            } else {
                console.log("No recibimos array. JSON crudo:");
                console.log(json);
            }
        } catch (e) {
            console.log("No pudimos parsear el JSON extraído.");
            console.log(txt.substring(0, 500));
        }
    }
    catch (err: any) {
        console.log(`🚨 Error: ${err.message}`);
    }
}

testMap();
