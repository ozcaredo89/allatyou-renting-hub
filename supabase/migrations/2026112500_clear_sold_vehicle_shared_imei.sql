-- Issue #83: un carro vendido conservaba el IMEI del GPS que ya se instaló en otro carro
-- (HPM723 vendido con el mismo IMEI de HMO135), y el cálculo de km GPS le cargaba el
-- recorrido del otro. Se quita el IMEI a los vendidos que lo comparten con un carro no vendido.
-- El daemon de km y el sync de IMEI ya ignoran los carros vendidos.
UPDATE public.vehicles AS sold
SET gps_imei = NULL
WHERE sold.status = 'sold'
  AND sold.gps_imei IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.vehicles AS other
    WHERE other.gps_imei = sold.gps_imei
      AND other.plate <> sold.plate
      AND other.status <> 'sold'
  );
