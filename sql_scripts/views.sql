
USE sor_sim;

/*********/
/* Views */
/*********/
/*
  Read-only, frontend-friendly projections. Views shape, join, and aggregate
  base tables into exactly the columns the UI needs, keeping the client simple
  while centralizing logic in the database. Views are not materialized in MySQL.
*/

/************/
/* Aircraft */
/************/
CREATE OR REPLACE VIEW `v_aircraft` AS
SELECT
  a.serial_number   AS "BUNO",
  a.type            AS "Type",
  s.status          AS "Status",
  c.name            AS "Config",
  (
    SELECT GROUP_CONCAT(DISTINCT CONCAT(p.type, ' [', IFNULL(p.serial_number,'n/a'), ']') ORDER BY p.type SEPARATOR ', ')
    FROM airframe_mount afm
    LEFT JOIN payload p ON p.id = afm.payload_id
    WHERE afm.aircraft_id = a.id
  ) AS "Airframe Payloads",
  MAX(CASE WHEN am.station_number = 1 THEN CONCAT(p2.type, ' [', IFNULL(p2.serial_number,'n/a'), ']') END) AS "S1",
  MAX(CASE WHEN am.station_number = 2 THEN CONCAT(p2.type, ' [', IFNULL(p2.serial_number,'n/a'), ']') END) AS "S2",
  MAX(CASE WHEN am.station_number = 3 THEN CONCAT(p2.type, ' [', IFNULL(p2.serial_number,'n/a'), ']') END) AS "S3",
  MAX(CASE WHEN am.station_number = 4 THEN CONCAT(p2.type, ' [', IFNULL(p2.serial_number,'n/a'), ']') END) AS "S4",
  MAX(CASE WHEN am.station_number = 5 THEN CONCAT(p2.type, ' [', IFNULL(p2.serial_number,'n/a'), ']') END) AS "S5",
  MAX(CASE WHEN am.station_number = 6 THEN CONCAT(p2.type, ' [', IFNULL(p2.serial_number,'n/a'), ']') END) AS "S6",
  MAX(CASE WHEN am.station_number = 7 THEN CONCAT(p2.type, ' [', IFNULL(p2.serial_number,'n/a'), ']') END) AS "S7",
  u.name   AS "Unit",
  CONCAT('H', hb.hangar_id, '/B', hb.bay_number) AS "Position"
FROM aircraft a
LEFT JOIN status s ON s.id = a.status
LEFT JOIN aircraft_config c ON c.id = a.config
LEFT JOIN aircraft_mount am ON am.aircraft_id = a.id
LEFT JOIN payload p2 ON p2.id = am.payload_id
LEFT JOIN hangar_bay hb ON hb.aircraft_id = a.id
LEFT JOIN unit u ON u.hangar = hb.hangar_id
GROUP BY a.id, a.serial_number, a.type, s.status, c.name, hb.hangar_id, hb.bay_number, u.name;

/***********/
/* Payload */
/***********/
CREATE OR REPLACE VIEW `v_payload` AS
SELECT p.id       AS 'ID',
  p.serial_number AS 'Serial Number',
  p.type          AS 'Type',
  s.status        AS 'Status',
  COALESCE(u_all.name, u_spare.name)  AS 'Unit',
  a_all.serial_number                 AS 'Mounted On Aircraft',
  am.station_number                   AS 'Mounted Station'
FROM payload p
LEFT JOIN status s ON s.id = p.status
LEFT JOIN aircraft_mount am ON am.payload_id = p.id
LEFT JOIN aircraft a1 ON a1.id = am.aircraft_id
LEFT JOIN hangar_bay hb1 ON hb1.aircraft_id = a1.id
LEFT JOIN airframe_mount afm ON afm.payload_id = p.id
LEFT JOIN aircraft a2 ON a2.id = afm.aircraft_id
LEFT JOIN hangar_bay hb2 ON hb2.aircraft_id = a2.id
LEFT JOIN aircraft a_all ON a_all.id = COALESCE(a1.id, a2.id)
LEFT JOIN hangar_bay hb_all ON hb_all.aircraft_id = a_all.id
LEFT JOIN unit u_all ON u_all.hangar = hb_all.hangar_id
LEFT JOIN unit u_spare ON u_spare.id = p.unit;

-- Note: unit_name is derived from the aircraft's hangar when mounted.
-- If unmounted, unit_name may be NULL; leave as NULL or assign via future inventory ownership.

/************/
/* Staffing */
/************/
CREATE OR REPLACE VIEW `v_staffing` AS
SELECT 
  p.edipi      AS 'EDIPI',
  p.unit       AS 'Unit',
  u.name       AS 'Unit Name',
  m.number     AS 'MOS Number',
  m.name       AS 'MOS Title',
  CASE WHEN m.critical THEN 'Yes' ELSE 'No' END AS 'Critical',
  CASE WHEN m.aircrew_mos THEN 'Aircrew' ELSE 'Non-Aircrew' END AS 'Type',
  (
    SELECT GROUP_CONCAT(s.name ORDER BY s.name SEPARATOR ', ')
    FROM person_skill ps
    JOIN skill s ON s.id = ps.skill_id
    WHERE ps.person_id = p.id
  ) AS 'Skills'
FROM person p
LEFT JOIN unit u ON u.id = p.unit
LEFT JOIN mos  m ON m.id = p.mos;

/************************/
/* Unit Payload Details */
/************************/
CREATE OR REPLACE VIEW `v_unit_payload_readiness` AS
SELECT
  u.name            AS 'Unit',
  p.type            AS 'Payload Type',
  upa.payload_total AS 'Auth Total',
  COUNT(CASE WHEN s.status = 'FMC' THEN 1 END) AS 'FMC Count',
  ROUND(
    COUNT(CASE WHEN s.status = 'FMC' THEN 1 END) / NULLIF(upa.payload_total, 0),
    3
  ) AS 'Ratio',
  (
    SELECT st.status
    FROM strength_equipment se
    JOIN status st ON st.id = se.status_id
    WHERE se.payload_threshold <= COALESCE(
      COUNT(CASE WHEN s.status = 'FMC' THEN 1 END) / NULLIF(upa.payload_total, 0),
      0
    )
    ORDER BY se.payload_threshold DESC
    LIMIT 1
  ) AS 'Equipment Status'
FROM unit u
JOIN unit_payload_authorization upa ON upa.unit = u.id
JOIN payload p ON p.id = upa.payload
JOIN payload p2 ON p2.type = p.type AND p2.unit = u.id
JOIN status s ON s.id = p2.status
GROUP BY u.id, u.name, p.id, p.type, upa.payload_total
HAVING upa.payload_total > 0;

/*********************/
/* Unit MOS Details  */
/*********************/
CREATE OR REPLACE VIEW `v_unit_mos_readiness` AS
SELECT
  u.name        AS 'Unit',
  m.number      AS 'MOS Number',
  m.name        AS 'MOS Name',
  m.critical    AS 'MOS Critical',
  uma.mos_total AS 'Auth Total',
  (
    SELECT COUNT(*)
    FROM person p
    WHERE p.unit = u.id AND p.mos = m.id
  ) AS 'Filled Count',
  ROUND(
    COALESCE(
      (
        SELECT COUNT(*) / NULLIF(uma.mos_total, 0)
        FROM person p
        WHERE p.unit = u.id AND p.mos = m.id
      ), 0
    ), 3
  ) AS 'Ratio',
  (
    SELECT st.status
    FROM strength_staffing ss
    JOIN status st ON st.id = ss.status_id
    WHERE (CASE WHEN m.critical = 1 THEN ss.critical_mos_threshold ELSE ss.personnel_threshold END) <=
          COALESCE(
            (
              SELECT COUNT(*) / NULLIF(uma.mos_total, 0)
              FROM person p
              WHERE p.unit = u.id AND p.mos = m.id
            ), 0
          )
    ORDER BY (CASE WHEN m.critical = 1 THEN ss.critical_mos_threshold ELSE ss.personnel_threshold END) DESC
    LIMIT 1
  ) AS 'Staffing Status'
FROM unit u
JOIN unit_mos_authorization uma ON uma.unit = u.id
JOIN mos m ON m.id = uma.mos
WHERE uma.mos_total > 0;

/**************************/
/* Unit Aircraft Details  */
/**************************/
CREATE OR REPLACE VIEW `v_unit_aircraft_readiness` AS
SELECT
  u.id                AS unit_id,
  u.name              AS 'Unit',
  ua.aircraft_total   AS 'Auth Total',
  (
    SELECT COUNT(DISTINCT hb.aircraft_id)
    FROM hangar_bay hb
    JOIN aircraft a ON a.id = hb.aircraft_id
    JOIN status s2 ON s2.id = a.status
    WHERE hb.hangar_id = u.hangar
      AND hb.aircraft_id IS NOT NULL
      AND s2.status = 'FMC'
  ) AS 'FMC Count',
  ROUND(
    COALESCE(
      (
        SELECT COUNT(DISTINCT hb.aircraft_id) / NULLIF(ua.aircraft_total, 0)
        FROM hangar_bay hb
        JOIN aircraft a ON a.id = hb.aircraft_id
        JOIN status s2 ON s2.id = a.status
        WHERE hb.hangar_id = u.hangar
          AND hb.aircraft_id IS NOT NULL
          AND s2.status = 'FMC'
      ), 0
    ), 3
  ) AS 'Ratio',
  (
    SELECT st.status
    FROM strength_equipment se
    JOIN status st ON st.id = se.status_id
    WHERE se.aircraft_threshold <= COALESCE(
      (
        SELECT COUNT(DISTINCT hb.aircraft_id) / NULLIF(ua.aircraft_total, 0)
        FROM hangar_bay hb
        JOIN aircraft a ON a.id = hb.aircraft_id
        JOIN status s2 ON s2.id = a.status
        WHERE hb.hangar_id = u.hangar
          AND hb.aircraft_id IS NOT NULL
          AND s2.status = 'FMC'
      ), 0
    )
    ORDER BY se.aircraft_threshold DESC
    LIMIT 1
  ) AS 'Equipment Status'
FROM unit u
JOIN unit_authorization ua ON ua.unit = u.id
WHERE ua.aircraft_total > 0;

/********/
/* Unit */
/********/
CREATE OR REPLACE VIEW `v_unit` AS
SELECT
  u.name                     AS 'Unit',
  ua.personnel_total         AS 'Auth Personnel Total',
  ua.critical_mos_total      AS 'Auth Critical MOS Total',
  ua.training_required_total AS 'Auth Training Required Total',
  ua.daily_sortie_total      AS 'Auth Daily Sortie Total',
  ua.aircraft_total          AS 'Auth Aircraft Total',
  (
    SELECT st.status
    FROM strength_equipment se
    JOIN status st ON st.id = se.status_id
    WHERE se.aircraft_threshold <= COALESCE(
      (
        SELECT COUNT(DISTINCT hb.aircraft_id) / NULLIF(ua.aircraft_total, 0)
        FROM hangar_bay hb
        LEFT JOIN aircraft a ON a.id = hb.aircraft_id
        LEFT JOIN status s2 ON s2.id = a.status
        WHERE hb.hangar_id = u.hangar AND hb.aircraft_id IS NOT NULL AND s2.status = 'FMC'
      ), 0
    )
    ORDER BY se.aircraft_threshold DESC
    LIMIT 1
  ) AS 'Aircraft Status',
  (
    SELECT st.status
    FROM strength_equipment se
    JOIN status st ON st.id = se.status_id
    WHERE se.payload_threshold <= (
        -- Find the average readiness ratio for this unit from the readiness view
        SELECT COALESCE(AVG(`Ratio`), 0)
        FROM v_unit_payload_readiness upr
        WHERE upr.unit = u.name
    )
    ORDER BY se.payload_threshold DESC
    LIMIT 1
  ) AS 'Payload Status',
  (
    SELECT st.status
    FROM strength_staffing ss
    JOIN status st ON st.id = ss.status_id
    WHERE ss.critical_mos_threshold <= (
        -- Find the average readiness ratio for this unit from the readiness view
        SELECT COALESCE(AVG(`Ratio`), 0)
        FROM v_unit_mos_readiness umr
        WHERE umr.unit = u.name
    )
    ORDER BY ss.critical_mos_threshold DESC
    LIMIT 1
  ) AS 'MOS Status'
FROM unit u
LEFT JOIN unit_authorization ua ON ua.unit = u.id;

/*************/
/* Training */
/*************/
CREATE OR REPLACE VIEW `v_training` AS
WITH RECURSIVE prereq_chain AS (
  -- Start at each skill and include itself
  SELECT s.id AS root_skill_id, s.id AS skill_id
  FROM skill s
  UNION ALL
  -- Walk prerequisites recursively
  SELECT pc.root_skill_id, sp.prereq_skill_id AS skill_id
  FROM prereq_chain pc
  JOIN skill_prerequisite sp ON sp.skill_id = pc.skill_id
), summed AS (
  -- Deduplicate any repeated paths before summing
  SELECT pc.root_skill_id,
         ROUND(SUM(COALESCE(sk.time_to_train_pilot, 0)), 2) AS total_time_to_train_pilot,
         ROUND(SUM(COALESCE(sk.time_to_train_so, 0)), 2)    AS total_time_to_train_so
  FROM (
    SELECT DISTINCT root_skill_id, skill_id FROM prereq_chain
  ) pc
  JOIN skill sk ON sk.id = pc.skill_id
  GROUP BY pc.root_skill_id
)
SELECT s.id   AS "Skill ID",
       s.name AS "Name",
       s.type AS "Type",
   CONCAT(ROUND(COALESCE(s.time_to_train_pilot, 0), 2), 'wk / ', ROUND(COALESCE(s.time_to_train_pilot, 0) * 7, 0), 'd') AS "Time to Train Pilot",
   CONCAT(ROUND(COALESCE(s.time_to_train_so, 0), 2),    'wk / ', ROUND(COALESCE(s.time_to_train_so, 0) * 7, 0),    'd') AS "Time to Train SO",
       (
         SELECT GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ', ')
         FROM skill_prerequisite sp
         JOIN skill p ON p.id = sp.prereq_skill_id
         WHERE sp.skill_id = s.id
       ) AS "Prerequisites",
       CONCAT(ROUND(sm.total_time_to_train_pilot, 2), 'wk / ', ROUND(sm.total_time_to_train_pilot * 7, 0), 'd') AS "Total Time to Train Pilot",
       CONCAT(ROUND(sm.total_time_to_train_so, 2),    'wk / ', ROUND(sm.total_time_to_train_so * 7, 0),    'd') AS "Total Time to Train SO"
FROM skill s
LEFT JOIN summed sm ON sm.root_skill_id = s.id;

/*************/
/* Readiness */
/*************/
CREATE OR REPLACE VIEW `v_strength_equipment` AS
SELECT
  se.id                        AS "ID",
  st.status                    AS "Status",
  se.aircraft_threshold        AS "Aircraft Threshold",
  se.payload_threshold         AS "Payload Threshold"
FROM strength_equipment se
LEFT JOIN status st ON st.id = se.status_id;

CREATE OR REPLACE VIEW `v_strength_staffing` AS
SELECT
  ss.id                        AS "ID",
  st.status                    AS "Status",
  ss.personnel_threshold       AS "Personnel Threshold",
  ss.critical_mos_threshold    AS "Critical MOS Threshold"
FROM strength_staffing ss
LEFT JOIN status st ON st.id = ss.status_id;

CREATE OR REPLACE VIEW `v_strength_training` AS
SELECT
  tr.id                        AS "ID",
  st.status                    AS "Status",
  tr.count_threshold           AS "Training Count Threshold"
FROM strength_training tr
LEFT JOIN status st ON st.id = tr.status_id;

/**************/
/* Conditions */
/**************/
CREATE OR REPLACE VIEW `v_visibility` AS
SELECT
  v.id    AS "ID",
  v.name  AS "Name",
  v.min   AS "Min",
  v.max   AS "Max"
FROM visibility v;

CREATE OR REPLACE VIEW `v_airspace` AS
SELECT
  a.id    AS "ID",
  a.name  AS "Name"
FROM airspace a;

CREATE OR REPLACE VIEW `v_ceiling` AS
SELECT
  c.id    AS "ID",
  c.name  AS "Name",
  c.min   AS "Min",
  c.max   AS "Max"
FROM ceiling c;

CREATE OR REPLACE VIEW `v_spectrum` AS
SELECT
  s.id    AS "ID",
  s.name  AS "Name"
FROM spectrum s;

CREATE OR REPLACE VIEW `v_connectivity` AS
SELECT
  c.id       AS "ID",
  c.connected AS "Connected"
FROM connectivity c;

CREATE OR REPLACE VIEW `v_air_superiority` AS
SELECT
  a.id    AS "ID",
  a.name  AS "Name"
FROM air_superiority a;

/*************/
/* Missions */
/*************/
CREATE OR REPLACE VIEW `v_missions` AS
SELECT
  s.id   AS "Skill ID",
  s.name AS "Name",
  s.type AS "Type"
FROM skill s
WHERE s.type IN ('MISSION', 'MISSIONPLUS');
