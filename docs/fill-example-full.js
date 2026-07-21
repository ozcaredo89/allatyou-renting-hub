const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");

function calcularAmortizacionFrances(capital, tasaDiaria, cuotaFija, dias) {
  const filas = [];
  let saldo = capital;
  for (let i = 1; i <= dias; i++) {
    const interes = Math.round(saldo * tasaDiaria);
    const abonoCapital = cuotaFija - interes;
    saldo = Math.max(0, saldo - abonoCapital);
    filas.push({
      dia: i,
      interes: interes.toLocaleString("es-CO"),
      capital: abonoCapital.toLocaleString("es-CO"),
      saldo: saldo.toLocaleString("es-CO"),
    });
  }
  return filas;
}

const capitalFinanciado = 18000000;
const tasaDiariaEquivalente = 0.00075; // validar siempre contra el tope legal antes de usar
const cuotaCapitalInteres = 55000;

const data = {
  numero_contrato: "AY-2026-0143",
  fecha_generacion: new Date().toLocaleDateString("es-CO"),

  comprador_nombre: "YURY LIZEHT RODRIGUEZ PEDROZA",
  comprador_cedula: "1012465655",
  comprador_ciudad: "Cali",
  comprador_email: "yury.rodriguez@example.com",
  comprador_telefono: "300 000 0000",

  vehiculo_placa: "ABC123",
  vehiculo_marca: "CHEVROLET",
  vehiculo_linea: "SPARK",
  vehiculo_modelo: "2016",
  vehiculo_cilindraje: "995",
  vehiculo_combustible: "GASOLINA",
  vehiculo_color: "Blanco",
  vehiculo_carroceria: "Hatchback",

  precio_total: (22000000).toLocaleString("es-CO"),
  precio_total_letras: "VEINTIDÓS MILLONES",
  cuota_capital_interes: cuotaCapitalInteres.toLocaleString("es-CO"),
  cuota_ahorro: (5000).toLocaleString("es-CO"),
  cuota_administracion: (6000).toLocaleString("es-CO"),
  cuota_diaria_total: (cuotaCapitalInteres + 5000 + 6000).toLocaleString("es-CO"),
  medio_pago: "transferencia electrónica o consignación en la cuenta designada por EL VENDEDOR",

  amortizacion: calcularAmortizacionFrances(capitalFinanciado, tasaDiariaEquivalente, cuotaCapitalInteres, 10),

  tasa_remuneratoria: "2.2",
  tasa_mora: "2.9",
  ibc_vigente: "referencial — validar dato real de Superfinanciera al firmar",

  taller_autorizado: "Taller AllAtYou, Calle 00 # 00-00, Cali",
  geocerca_descripcion: "área metropolitana de Cali y municipios aledaños autorizados",
  limite_velocidad_kmh: "100",

  valor_garantia: (300000).toLocaleString("es-CO"),
  valor_clausula_penal: (1000000).toLocaleString("es-CO"),
  numero_pagare: "0143",

  vendedor_email: "contratos@allatyou.com",

  dia_firma: "20",
  mes_firma: "julio",
  anio_firma: "2026",
};

const content = fs.readFileSync(path.resolve(__dirname, "plantilla_contrato_completa.docx"), "binary");
const zip = new PizZip(content);
const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

doc.render(data);

const buf = doc.getZip().generate({ type: "nodebuffer" });
fs.writeFileSync(path.resolve(__dirname, `Contrato_Completo_${data.numero_contrato}.docx`), buf);
console.log(`Generado: Contrato_Completo_${data.numero_contrato}.docx`);
