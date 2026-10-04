require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function dryRun() {
  console.log('====================================================');
  console.log('   CORRIDA DE PRUEBA (DRY RUN) - CONCILIACION LEASING');
  console.log('====================================================\n');

  // Contratos a evaluar (excluyendo DBC859 que tiene start_date_pending_confirmation = true)
  const contractsToTest = [
    { id: 26, plate: 'HMO135' },
    { id: 23, plate: 'UGN228' },
    { id: 24, plate: 'FRM099' },
    { id: 13, plate: 'JHW889' }
  ];

  for (const item of contractsToTest) {
    const { data: contract } = await supabase
      .from('leasing_contracts')
      .select('*')
      .eq('id', item.id)
      .single();

    // Obtener cuotas regeneradas
    const { data: schedule } = await supabase
      .from('leasing_schedule')
      .select('*')
      .eq('contract_id', contract.id)
      .order('installment_no', { ascending: true });

    // Indexar cuotas por due_date
    const scheduleByDate = new Map();
    for (const r of schedule || []) {
      scheduleByDate.set(r.due_date, { ...r });
    }

    // Obtener pagos de esta placa desde start_date
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('plate', contract.plate)
      .gte('payment_date', contract.start_date)
      .order('payment_date', { ascending: true })
      .order('id', { ascending: true });

    console.log(`\n----------------------------------------------------`);
    console.log(`Evaluando Contrato #${contract.id} (${contract.plate})`);
    console.log(`  Inicio: ${contract.start_date} | Cuotas en cronograma: ${schedule?.length}`);
    console.log(`  Pagos encontrados desde ${contract.start_date}: ${payments?.length}`);
    console.log(`----------------------------------------------------`);

    let exactApplied = 0;
    let excessApplied = 0;
    let maintenanceDaysIgnored = 0;
    let dateMismatchAlerts = 0;
    let amountMismatchAlerts = 0;
    let duplicateAlerts = 0;

    const seenDates = new Set();
    const alertDetails = [];
    const excessDetails = [];

    for (const p of payments || []) {
      // 1. Calcular monto neto
      const insurance = Number(p.insurance_amount || 0);
      const credit = Number(p.credit_installment_amount || 0);
      const delivery = Number(p.delivery_amount || 0);
      const netAmount = Number(p.amount) - insurance - credit - delivery;

      // 2. Si neto <= 1 -> día de mantenimiento
      if (netAmount <= 1) {
        maintenanceDaysIgnored++;
        continue;
      }

      // 3. Chequeo de duplicados
      if (seenDates.has(p.payment_date)) {
        duplicateAlerts++;
        alertDetails.push({ payment_id: p.id, date: p.payment_date, issue: 'LEASING_DUPLICATE_PAYMENT', net: netAmount });
        continue;
      }
      seenDates.add(p.payment_date);

      // 4. Buscar cuota con due_date = payment_date
      const cuota = scheduleByDate.get(p.payment_date);
      if (!cuota) {
        dateMismatchAlerts++;
        alertDetails.push({ payment_id: p.id, date: p.payment_date, issue: 'LEASING_DATE_MISMATCH', net: netAmount, motivo: 'Sin cuota en cronograma para esta fecha' });
        continue;
      }

      // 5. Comparar montos
      const faltaCuota = Number(cuota.maintenance_expected) + Number(cuota.admin_expected) + Number(cuota.interest_expected) + Number(cuota.principal_expected);

      if (netAmount >= faltaCuota - 0.5) {
        // Cuota pagada
        cuota.status = 'paid';
        if (netAmount > faltaCuota + 1) {
          excessApplied++;
          const excess = netAmount - faltaCuota;
          excessDetails.push({ payment_id: p.id, date: p.payment_date, installment_no: cuota.installment_no, excess, net: netAmount, cuota: faltaCuota });
        } else {
          exactApplied++;
        }
      } else {
        // Faltante de dinero
        amountMismatchAlerts++;
        alertDetails.push({ payment_id: p.id, date: p.payment_date, installment_no: cuota.installment_no, issue: 'LEASING_AMOUNT_MISMATCH', net: netAmount, esperado: faltaCuota });
      }
    }

    console.log(`  RESUMEN RESULTADOS:`);
    console.log(`    ✅ Cuotas pagadas exactas:          ${exactApplied}`);
    console.log(`    🏷️ Cuotas pagadas con excedente:     ${excessApplied}`);
    console.log(`    🛠️ Días de mtto ignorados (<= $1):  ${maintenanceDaysIgnored}`);
    console.log(`    ⚠️ Fecha no coincide (Por Conciliar): ${dateMismatchAlerts}`);
    console.log(`    ⚠️ Monto insuficiente (Por Conciliar): ${amountMismatchAlerts}`);
    console.log(`    ⚠️ Duplicados en misma fecha:         ${duplicateAlerts}`);

    if (excessDetails.length > 0) {
      console.log(`    Detalle Excedentes (primeros 3):`, excessDetails.slice(0, 3));
    }
    if (alertDetails.length > 0) {
      console.log(`    Detalle Alertas (Por Conciliar):`, alertDetails);
    }
  }

  console.log('\n====================================================');
  console.log('   FIN DE LA CORRIDA DE PRUEBA');
  console.log('====================================================');
}

dryRun();
