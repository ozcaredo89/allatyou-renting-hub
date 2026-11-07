-- ==============================================================================
-- SEMILLA: RED COMERCIAL RETAIL CALI
-- Inyecta los 9 Centros Comerciales Premium en la base de datos del Oráculo.
-- Radio estricto: 200 metros. Gracia: 10 minutos para contabilizar logística.
-- ==============================================================================

INSERT INTO oracle_nodes (name, category, latitude, longitude, radius_meters, suggested_dwell_time_mins, is_active)
VALUES
  ('Palmetto Plaza', 'Retail Mall', 3.403, -76.545, 200, 10, true),
  ('Cosmocentro', 'Retail Mall', 3.409, -76.545, 200, 10, true),
  ('Mallplaza Cali', 'Retail Mall', 3.411, -76.546, 200, 10, true),
  ('Jardín Plaza', 'Retail Mall', 3.370, -76.529, 200, 10, true),
  ('Unicentro Cali', 'Retail Mall', 3.375, -76.539, 200, 10, true),
  ('Chipichape', 'Retail Mall', 3.475, -76.526, 200, 10, true),
  ('Único Outlet', 'Retail Mall', 3.468, -76.495, 200, 10, true),
  ('Campanela Plaza', 'Retail Mall', 3.428, -76.535, 200, 10, true),
  ('Lago Verde / Palmas Mall', 'Retail Mall', 3.355, -76.525, 200, 10, true)
ON CONFLICT DO NOTHING;
