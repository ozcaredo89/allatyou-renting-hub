require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

async function executeHistorical() {
  console.log('====================================================');
  console.log('   EJECUCION EN FIRME - CONCILIACION LEASING HISTORICA');
  console.log('====================================================\n');

  // Contratos a conciliar (omitiendo DBC859 marcado con start_date_pending_confirmation = true)
  const contracts = [
    { id: 26, plate: 'HMO135' },
    { id: 23, plate: 'UGN228' },
    { id: 24, plate: 'FRM099' },
    { id: 13, plate: 'JHW889' }
  ];

  let totalAppliedCuotas = 0;
  let totalExcessLogged = 0;
  let totalAlertsLogged = 0;
  let totalMttoDaysIgnored = 0;
  let totalSkippedAlreadyProcessed = 0;

  for (const item of contracts) {
    const { data: contract } = await supabase
      .from('leasing_contracts')
      .select('*')
      .eq('id', item.id)
      .single();

    // Obtener cuotas
    const { data: schedule } = await supabase
      .from('leasing_schedule')
      .select('*')
      .eq('contract_id', contract.id)
      .order('installment_no', { ascending: true });

    const scheduleByDate = new Map();
    for (const r of schedule || []) {
      scheduleByDate.set(r.due_date, r);
    }

    // Obtener pagos ÚNICAMENTE confirmados
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .eq('plate', contract.plate)
      .eq('status', 'confirmed')
      .gte('payment_date', contract.start_date)
      .order('payment_date', { ascending: true })
      .order('id', { ascending: true });

    console.log(`\nProcesando Contrato #${contract.id} (${contract.plate})...`);
    console.log(`  Pagos confirmados encontrados: ${payments?.length || 0}`);

    // Pre-cargar distribuciones existentes para idempotencia
    const paymentIds = (payments || []).map(p => p.id);
    const { data: existingDists } = await supabase
      .from('payment_distributions')
      .select('payment_id')
      .in('payment_id', paymentIds);
    const distributedPaymentIds = new Set((existingDists || []).map(d => d.payment_id));

    // Pre-cargar inconsistencias existentes para no duplicar
    const { data: existingIncs } = await supabase
      .from('payment_inconsistencies')
      .select('payment_id, issue_code')
      .in('payment_id', paymentIds);
    const existingIncKeys = new Set((existingIncs || []).map(i => `${i.payment_id}_${i.issue_code}`));

    const seenDates = new Set();
    let contractCuotasPaid = 0;

    for (const p of payments || []) {
      const amt = Number(p.amount);

      // Si monto <= 1 -> día de taller / mtto
      if (amt <= 1) {
        totalMttoDaysIgnored++;
        continue;
      }

      // Si el pago ya fue distribuido previamente, saltar
      if (distributedPaymentIds.has(p.id)) {
        totalSkippedAlreadyProcessed++;
        continue;
      }

      // Duplicados en misma fecha
      if (seenDates.has(p.payment_date)) {
        totalAlertsLogged++;
        const incKey = `${p.id}_LEASING_DUPLICATE_PAYMENT`;
        if (!existingIncKeys.has(incKey)) {
          await supabase.from('payment_inconsistencies').insert([{
            payment_id: p.id,
            plate: contract.plate,
            payment_date: p.payment_date,
            issue_code: 'LEASING_DUPLICATE_PAYMENT',
            message: 'Pago duplicado en misma fecha',
            metadata: { amount: amt }
          }]);
          existingIncKeys.add(incKey);
        }
        continue;
      }
      seenDates.add(p.payment_date);

      // Buscar cuota con due_date = payment_date
      const cuota = scheduleByDate.get(p.payment_date);
      if (!cuota) {
        totalAlertsLogged++;
        const incKey = `${p.id}_LEASING_DATE_MISMATCH`;
        if (!existingIncKeys.has(incKey)) {
          await supabase.from('payment_inconsistencies').insert([{
            payment_id: p.id,
            plate: contract.plate,
            payment_date: p.payment_date,
            issue_code: 'LEASING_DATE_MISMATCH',
            message: 'No existe cuota en el cronograma para esta fecha (festivo o día no hábil)',
            metadata: { amount: amt }
          }]);
          existingIncKeys.add(incKey);
        }
        continue;
      }

      // Si la cuota ya está marcada como 'paid', saltar
      if (cuota.status === 'paid') {
        totalSkippedAlreadyProcessed++;
        continue;
      }

      const faltaCuota = Number(cuota.total_expected);

      if (amt >= faltaCuota - 0.5) {
        // Ejecutar match atómico vía RPC
        const { error: rpcErr } = await supabase.rpc('match_leasing_payment', {
          p_schedule_id: cuota.id,
          p_payment_id: p.id,
          p_maint_applied: Number(cuota.maintenance_expected),
          p_admin_applied: Number(cuota.admin_expected),
          p_int_applied: Number(cuota.interest_expected),
          p_prin_applied: Number(cuota.principal_expected),
          p_notes: 'Conciliación histórica inicial'
        });

        if (rpcErr) {
          console.error(`  Error en RPC match_leasing_payment pago #${p.id} cuota #${cuota.installment_no}:`, rpcErr.message);
          continue;
        }

        // Marcar en memoria como pagada para siguientes iteraciones
        cuota.status = 'paid';
        distributedPaymentIds.add(p.id);

        contractCuotasPaid++;
        totalAppliedCuotas++;

        // Si hubo excedente, registrar alerta informativa LEASING_EXCESS_PAYMENT
        if (amt > faltaCuota + 1) {
          const excess = amt - faltaCuota;
          totalExcessLogged++;
          const incKey = `${p.id}_LEASING_EXCESS_PAYMENT`;
          if (!existingIncKeys.has(incKey)) {
            await supabase.from('payment_inconsistencies').insert([{
              payment_id: p.id,
              plate: contract.plate,
              payment_date: p.payment_date,
              issue_code: 'LEASING_EXCESS_PAYMENT',
              message: `Pago excedente de $${Math.round(excess).toLocaleString('es-CO')} COP`,
              metadata: {
                excess_amount: Math.round(excess),
                cuota_id: cuota.id,
                installment_no: cuota.installment_no,
                amount_paid: amt,
                quota_expected: faltaCuota
              }
            }]);
            existingIncKeys.add(incKey);
          }
        }
      } else {
        // Monto menor a la cuota
        totalAlertsLogged++;
        const incKey = `${p.id}_LEASING_AMOUNT_MISMATCH`;
        if (!existingIncKeys.has(incKey)) {
          await supabase.from('payment_inconsistencies').insert([{
            payment_id: p.id,
            plate: contract.plate,
            payment_date: p.payment_date,
            issue_code: 'LEASING_AMOUNT_MISMATCH',
            message: `Monto insuficiente para cubrir la cuota`,
            metadata: { amount: amt, falta: faltaCuota, installment_no: cuota.installment_no }
          }]);
          existingIncKeys.add(incKey);
        }
      }
    }

    console.log(`  ✅ Contrato #${contract.id} (${contract.plate}): ${contractCuotasPaid} cuotas marcadas como PAGADAS.`);
  }

  console.log('\n====================================================');
  console.log('   RESULTADO FINAL DE LA CARGA HISTORICA EN FIRME');
  console.log('====================================================');
  console.log(`  Total Cuotas Pagadas y Distribuidas:   ${totalAppliedCuotas}`);
  console.log(`  Total Excedentes Etiquetados:         ${totalExcessLogged}`);
  console.log(`  Total Alertas / Inconsistencias:       ${totalAlertsLogged}`);
  console.log(`  Días de Mtto Ignorados (<= $1):       ${totalMttoDaysIgnored}`);
  console.log(`  Pagos/Cuotas Saltados (ya procesados): ${totalSkippedAlreadyProcessed}`);
  console.log('====================================================\n');
}

executeHistorical();
