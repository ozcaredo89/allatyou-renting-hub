require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const { generateLeasingSchedule } = require('../dist/lib/leasingCascade.js');
const { getAmortizationDates } = require('../dist/lib/noPay.js');

async function regenerate() {
  const contractIds = [13, 23, 24, 26, 27];
  console.log('--- INICIANDO REGENERACION DE CRONOGRAMAS (FASE 0) ---');

  for (const cId of contractIds) {
    const { data: contract, error: cErr } = await supabase
      .from('leasing_contracts')
      .select('*')
      .eq('id', cId)
      .single();

    if (cErr || !contract) {
      console.error('Error cargando contrato #' + cId, cErr);
      continue;
    }

    console.log('\nProcesando Contrato #' + contract.id + ' (' + contract.plate + ')');
    console.log('  Capital: ' + contract.financed_capital + ', Tasa: ' + contract.monthly_rate_pct + '%, Cuota Cap+Int: ' + contract.daily_capital_interest + ', Mtto: ' + contract.daily_maintenance + ', Admin: ' + contract.daily_admin);
    console.log('  Inicio: ' + contract.start_date);

    // 1. Obtener fechas de amortización
    const { dates } = await getAmortizationDates(contract.plate, contract.start_date, 1500, 'Cali');
    const validDatesSet = new Set(dates);

    // Si es UGN228 (#23), excluir el día de taller 2026-09-21
    if (contract.id === 23) {
      const removed = validDatesSet.delete('2026-09-21');
      console.log('  [UGN228] Excluido 2026-09-21 del calendario: ' + removed);
    }

    // 2. Generar cronograma
    const scheduleRows = generateLeasingSchedule(
      contract.id,
      Number(contract.financed_capital),
      Number(contract.monthly_rate_pct),
      Number(contract.daily_maintenance),
      Number(contract.daily_admin),
      Number(contract.daily_capital_interest),
      contract.start_date,
      validDatesSet
    );

    console.log('  Filas calculadas: ' + scheduleRows.length);
    const c1 = scheduleRows[0];
    const c2 = scheduleRows[1];
    const total1 = c1.maintenance_expected + c1.admin_expected + c1.interest_expected + c1.principal_expected;
    console.log('  Primera cuota: due_date=' + c1.due_date + ', int=' + c1.interest_expected + ', prin=' + c1.principal_expected + ', total=' + total1);
    console.log('  Segunda cuota: due_date=' + c2.due_date + ', int=' + c2.interest_expected + ', prin=' + c2.principal_expected);

    // 3. Borrar cuotas existentes e inconsistencias previas
    const { error: delErr } = await supabase
      .from('leasing_schedule')
      .delete()
      .eq('contract_id', contract.id);

    if (delErr) {
      console.error('  Error borrando cuotas anteriores: ' + delErr.message);
      continue;
    }

    await supabase
      .from('payment_inconsistencies')
      .delete()
      .eq('plate', contract.plate)
      .like('issue_code', 'LEASING%');

    // 4. Insertar en lotes de 200 filas
    const BATCH_SIZE = 200;
    let inserted = 0;
    for (let i = 0; i < scheduleRows.length; i += BATCH_SIZE) {
      const chunk = scheduleRows.slice(i, i + BATCH_SIZE).map(r => ({
        contract_id: contract.id,
        installment_no: r.installment_no,
        due_date: r.due_date,
        maintenance_expected: r.maintenance_expected,
        admin_expected: r.admin_expected,
        interest_expected: r.interest_expected,
        principal_expected: r.principal_expected,
        balance_expected: r.balance_expected,
        status: 'pending'
      }));

      const { error: insErr } = await supabase
        .from('leasing_schedule')
        .insert(chunk);

      if (insErr) {
        console.error('  Error insertando lote ' + i + '-' + (i + chunk.length) + ': ' + insErr.message);
        break;
      }
      inserted += chunk.length;
    }

    console.log('  ✅ Exito: ' + inserted + ' cuotas insertadas para contrato #' + contract.id + ' (' + contract.plate + ')');
  }
  console.log('\n--- REGENERACION COMPLETADA ---');
}

regenerate();
