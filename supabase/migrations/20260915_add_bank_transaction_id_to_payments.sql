-- Vinculo 1:1 entre un pago y el movimiento bancario exacto con el que se
-- concilio (ver POST /reports/reconcile-bank). NULL = sin conciliar.
ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS bank_transaction_id BIGINT NULL
        REFERENCES transacciones_entrantes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_bank_transaction_id
    ON payments(bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL;

-- Un mismo movimiento bancario no puede conciliar mas de un pago.
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_bank_transaction_id_unique
    ON payments(bank_transaction_id)
    WHERE bank_transaction_id IS NOT NULL;
