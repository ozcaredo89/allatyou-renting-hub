-- Tabla principal de catálogo (Los productos que vimos en tu Excel)
CREATE TABLE public.inventory_items (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  category text NOT NULL, -- Ej: 'Aceites', 'Repuestos Spark GT', 'Eléctricos'
  name text NOT NULL,
  unit_cost numeric(14, 2) NOT NULL DEFAULT 0,
  sale_price numeric(14, 2) NOT NULL DEFAULT 0,
  current_stock integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_items_pkey PRIMARY KEY (id)
);

-- Tabla de movimientos (Historial transaccional: Entradas y Salidas)
CREATE TABLE public.inventory_movements (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  item_id bigint NOT NULL,
  movement_type text NOT NULL, -- 'IN' (Compra), 'OUT_FLOTA' (Consumo interno), 'OUT_SALE' (Vendido Taller)
  quantity integer NOT NULL,
  vehicle_plate text NULL, -- Solo aplica si es OUT_FLOTA
  total_value numeric(14, 2) NOT NULL, -- Costo o Venta total de este movimiento
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_movements_item_id_fkey FOREIGN KEY (item_id) REFERENCES inventory_items (id),
  CONSTRAINT inventory_movements_type_check CHECK (movement_type IN ('IN', 'OUT_FLOTA', 'OUT_SALE'))
);

-- Función y Trigger para auto-calcular el stock basado en los movimientos
CREATE OR REPLACE FUNCTION update_inventory_stock()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.movement_type = 'IN' THEN
    UPDATE inventory_items SET current_stock = current_stock + NEW.quantity WHERE id = NEW.item_id;
  ELSE
    UPDATE inventory_items SET current_stock = current_stock - NEW.quantity WHERE id = NEW.item_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stock
AFTER INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION update_inventory_stock();