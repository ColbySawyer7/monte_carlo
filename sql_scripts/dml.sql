
USE sor_sim;

-- --------------------------------------
-- Session constants
-- Update here to change everywhere below
-- --------------------------------------

-- Payload inventory (to be generated across the db / fleet)
SET @COUNT_STII := 20;  -- SkyTower II
SET @COUNT_EWPD := 10;  -- EW Pod
SET @COUNT_SMSR := 10;  -- SmartSensor
SET @COUNT_ERGT := 20;  -- Extended Range Tank

-- Payload authorizations (each unit gets the same authorization)
SET @AUTH_STII := 10;  -- SkyTower II
SET @AUTH_EWPD := 05;  -- EW Pod
SET @AUTH_SMSR := 05;  -- SmartSensor
SET @AUTH_ERGT := 10;  -- Extended Range Tank

SET @STATUS_FMC := 'FMC';
SET @STATUS_PMC := 'PMC';
SET @STATUS_NMC := 'NMC';

SET @STATUS_P1 := 'P1';
SET @STATUS_P2 := 'P2';
SET @STATUS_P3 := 'P3';
SET @STATUS_P4 := 'P4';

SET @STATUS_E1 := 'E1';
SET @STATUS_E2 := 'E2';
SET @STATUS_E3 := 'E3';

SET @STATUS_T1 := 'T1';
SET @STATUS_T2 := 'T2';
SET @STATUS_T3 := 'T3';

INSERT INTO air_superiority (name)      VALUES ('local'),      ('general'),     ('full');
INSERT INTO connectivity    (connected) VALUES ('continuous'), ('degraded'),    ('denied');
INSERT INTO airspace        (name)      VALUES ('moderate'),   ('unrestricted');
INSERT INTO spectrum        (name)      VALUES ('moderate'),   ('unrestricted');
INSERT INTO aircraft_config (name)      VALUES ('INCII'),      ('Slick');

INSERT INTO ceiling (name, min, max) VALUES
  ('low',      0,  2999),
  ('med',   3000, 10000),
  ('high', 10001, 99999);

INSERT INTO visibility (name, min, max) VALUES
  ('mod',        1,  3),
  ('good',       4, 10),
  ('high',      11, 20),
  ('unlimited', 20, 99);

INSERT IGNORE INTO status (status) VALUES 
  (@STATUS_FMC), (@STATUS_PMC), (@STATUS_NMC), 
  (@STATUS_P1),  (@STATUS_P2),  (@STATUS_P3), (@STATUS_P4),
  (@STATUS_E1),  (@STATUS_E2),  (@STATUS_E3),
  (@STATUS_T1),  (@STATUS_T2),  (@STATUS_T3);

INSERT INTO strength_staffing (status_id, personnel_threshold, critical_mos_threshold) VALUES
  ((SELECT id FROM status WHERE status=@STATUS_P1 LIMIT 1), 0.90, 0.85),
  ((SELECT id FROM status WHERE status=@STATUS_P2 LIMIT 1), 0.80, 0.75),
  ((SELECT id FROM status WHERE status=@STATUS_P3 LIMIT 1), 0.70, 0.65),
  ((SELECT id FROM status WHERE status=@STATUS_P4 LIMIT 1), 0.00, 0.00);

INSERT INTO strength_equipment (status_id, aircraft_threshold, payload_threshold) VALUES
  ((SELECT id FROM status WHERE status=@STATUS_E1 LIMIT 1), 0.70, 0.70),
  ((SELECT id FROM status WHERE status=@STATUS_E2 LIMIT 1), 0.50, 0.50),
  ((SELECT id FROM status WHERE status=@STATUS_E3 LIMIT 1), 0.00, 0.00);

INSERT INTO strength_training (status_id, count_threshold) VALUES
  ((SELECT id FROM status WHERE status=@STATUS_T1 LIMIT 1), 0.70),
  ((SELECT id FROM status WHERE status=@STATUS_T2 LIMIT 1), 0.50),
  ((SELECT id FROM status WHERE status=@STATUS_T3 LIMIT 1), 0.00);

INSERT INTO skill (name, `type`, `time_to_train_pilot`, `time_to_train_so`) VALUES
  ('FAM',   'CORE',        1.00, 1.00),
  ('REC',   'CORE',        1.00, 1.00),
  ('DAS',   'CORE',        1.00, 1.00),
  ('EW',    'CORE',        1.00, 1.00),
  ('AN',    'CORE',        1.00, 1.00),
  ('MIR',   'MISSION',     1.00, 1.14),
  ('ES',    'MISSION',     0.28, 0.57),
  ('ANE',   'MISSION',     0.85, 0.85),
  ('SCAR',  'MISSION',     1.14, 1.71),
  ('IDF',   'MISSIONPLUS', 1.14, 1.42),
  ('TAC(A)','MISSIONPLUS', 0.85, 0.85),
  ('TRAP',  'MISSIONPLUS', 0.85, 1.14),
  ('FCAS',  'MISSIONPLUS', 1.71, 1.71),
  ('UESC',  'MISSIONPLUS', 1.14, 1.17);

INSERT INTO mos (`number`, name, critical, aircrew_mos) VALUES
  ('0231', 'Imagery Specialist',             1, 0),
  ('0241', 'Imagery Analyse Specialist',     1, 0),
  ('0631', 'Network Admin',                  1, 0),
  ('0639', 'Network Chief',                  1, 0),
  ('0648', 'Spectrum Manager',               1, 0),
  ('0671', 'Data Systems Admin',             1, 0),
  ('0679', 'Data Systems Chief',             1, 0),
  ('2621', 'EW Operator',                    1, 0),
  ('2631', 'EW Analyst',                     1, 0),
  ('2651', 'ISR Systems Engineer',           1, 0),
  ('7314', 'Sensor Operator',                1, 1),
  ('7318', 'Pilot',                          1, 1),
  ('7377', 'Weapons and Tactics Instructor', 1, 1);

-- Generate payload inventory using stored procedure for dynamic insertion
DELIMITER $$

DROP PROCEDURE IF EXISTS generate_payload_inventory$$
CREATE PROCEDURE generate_payload_inventory()
BEGIN
  DECLARE i INT DEFAULT 1;
  DECLARE fmc_status_id INT;
  
  -- Get FMC status ID once
  SELECT id INTO fmc_status_id FROM status WHERE status = @STATUS_FMC LIMIT 1;
  
  -- SkyTower II
  WHILE i <= @COUNT_STII DO
    INSERT IGNORE INTO payload (serial_number, `type`, status) 
    VALUES (CONCAT('STII-', i), 'SkyTower II', fmc_status_id);
    SET i = i + 1;
  END WHILE;
  
  -- EW Pod
  SET i = 1;
  WHILE i <= @COUNT_EWPD DO
    INSERT IGNORE INTO payload (serial_number, `type`, status) 
    VALUES (CONCAT('EWPD-', i), 'EW Pod', fmc_status_id);
    SET i = i + 1;
  END WHILE;
  
  -- SmartSensor
  SET i = 1;
  WHILE i <= @COUNT_SMSR DO
    INSERT IGNORE INTO payload (serial_number, `type`, status) 
    VALUES (CONCAT('SMSR-', i), 'SmartSensor', fmc_status_id);
    SET i = i + 1;
  END WHILE;
  
  -- Extended Range Tank
  SET i = 1;
  WHILE i <= @COUNT_ERGT DO
    INSERT IGNORE INTO payload (serial_number, `type`, status) 
    VALUES (CONCAT('ERGT-', i), 'Extended Range Tank', fmc_status_id);
    SET i = i + 1;
  END WHILE;
END$$

DELIMITER ;

-- Execute the procedure
CALL generate_payload_inventory();

/* Sample aircraft: mix of INCII and Slick */
INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT 'AAAAAA','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='INCII' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT 'BBBBBB','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='Slick' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT 'CCCCCC','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='INCII' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT 'DDDDDD','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='Slick' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT 'EEEEEE','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='INCII' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT 'FFFFFF','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='Slick' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT '111111','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='INCII' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT '222222','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='INCII' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT '333333','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='Slick' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT '444444','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='Slick' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT '555555','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='INCII' LIMIT 1;

INSERT INTO aircraft (serial_number, `type`, status, config)
SELECT '666666','MQ-9A', s.id, c.id
FROM status s, aircraft_config c
WHERE s.status=@STATUS_FMC AND c.name='Slick' LIMIT 1;

/* Per-aircraft airframe payload inventory (one instance of each type per aircraft) */
INSERT INTO payload (serial_number, `type`, status)
SELECT CONCAT('DAAS-', a.id), 'DAAS', (SELECT id FROM status WHERE status=@STATUS_FMC LIMIT 1)
FROM aircraft a;
INSERT INTO payload (serial_number, `type`, status)
SELECT CONCAT('PLEO-', a.id), 'PLEO', (SELECT id FROM status WHERE status=@STATUS_FMC LIMIT 1)
FROM aircraft a;
INSERT INTO payload (serial_number, `type`, status)
SELECT CONCAT('LSAR-', a.id), 'LynxSAR', (SELECT id FROM status WHERE status=@STATUS_FMC LIMIT 1)
FROM aircraft a;
INSERT INTO payload (serial_number, `type`, status)
SELECT CONCAT('MTSB-', a.id), 'MTS-B', (SELECT id FROM status WHERE status=@STATUS_FMC LIMIT 1)
FROM aircraft a;

/* Mount each airframe payload instance onto its corresponding aircraft */
INSERT INTO airframe_mount (aircraft_id, payload_id)
SELECT a.id, p.id
FROM aircraft a
JOIN payload p ON p.`type`='DAAS' AND p.serial_number = CONCAT('DAAS-', a.id);
INSERT INTO airframe_mount (aircraft_id, payload_id)
SELECT a.id, p.id
FROM aircraft a
JOIN payload p ON p.`type`='PLEO' AND p.serial_number = CONCAT('PLEO-', a.id);
INSERT INTO airframe_mount (aircraft_id, payload_id)
SELECT a.id, p.id
FROM aircraft a
JOIN payload p ON p.`type`='LynxSAR' AND p.serial_number = CONCAT('LSAR-', a.id);
INSERT INTO airframe_mount (aircraft_id, payload_id)
SELECT a.id, p.id
FROM aircraft a
JOIN payload p ON p.`type`='MTS-B' AND p.serial_number = CONCAT('MTSB-', a.id);

/* Per-aircraft optional mounts (INCII only, >=1 each; Slick gets none)
  Required station positions:
  - SkyTower II         -> station 2
  - EW Pod              -> station 6
  - Extended Range Tank -> station 3
  - SmartSensor         -> any available
*/
INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 2, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='SkyTower II' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='111111' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 4, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='SmartSensor' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='111111' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 6, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='EW Pod' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='222222' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 3, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='Extended Range Tank' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='222222' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 2, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='SkyTower II' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='555555' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 2, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='SkyTower II' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='AAAAAA' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 3, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='Extended Range Tank' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='AAAAAA' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 6, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='EW Pod' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='CCCCCC' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 3, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='Extended Range Tank' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='CCCCCC' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 1, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='SmartSensor' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='CCCCCC' LIMIT 1;

INSERT INTO aircraft_mount (aircraft_id, station_number, payload_id)
SELECT a.id, 2, p.id
FROM aircraft a
JOIN (
  SELECT p1.id FROM payload p1
  LEFT JOIN aircraft_mount amx ON amx.payload_id = p1.id
  WHERE p1.type='SkyTower II' AND amx.id IS NULL
  ORDER BY p1.id
  LIMIT 1
) p ON 1=1
WHERE a.serial_number='EEEEEE' LIMIT 1;

/* Hangars and bays (explicit IDs via variables for scalability) */
INSERT INTO hangar () VALUES ();
SET @hangar1 := LAST_INSERT_ID();
INSERT INTO hangar () VALUES ();
SET @hangar2 := LAST_INSERT_ID();

-- Assign aircraft to hangar 1 (@hangar1)
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar1, 1, a.id FROM aircraft a WHERE a.serial_number='111111' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar1, 2, a.id FROM aircraft a WHERE a.serial_number='222222' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar1, 3, a.id FROM aircraft a WHERE a.serial_number='333333' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar1, 4, a.id FROM aircraft a WHERE a.serial_number='444444' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar1, 5, a.id FROM aircraft a WHERE a.serial_number='555555' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar1, 6, a.id FROM aircraft a WHERE a.serial_number='666666' LIMIT 1;

-- Assign aircraft to hangar 2 (@hangar2)
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar2, 1, a.id FROM aircraft a WHERE a.serial_number='AAAAAA' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar2, 2, a.id FROM aircraft a WHERE a.serial_number='BBBBBB' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar2, 3, a.id FROM aircraft a WHERE a.serial_number='CCCCCC' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar2, 4, a.id FROM aircraft a WHERE a.serial_number='DDDDDD' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar2, 5, a.id FROM aircraft a WHERE a.serial_number='EEEEEE' LIMIT 1;
INSERT INTO hangar_bay (hangar_id, bay_number, aircraft_id)
SELECT @hangar2, 6, a.id FROM aircraft a WHERE a.serial_number='FFFFFF' LIMIT 1;

/* Units */
INSERT INTO unit (name, `type`, class, hangar)
VALUES
('VMU-1','Squadron','Fleet', @hangar1),
('VMU-3','Squadron','Fleet', @hangar2);

/* Unit authorization denominators; adjust as needed) */
INSERT INTO unit_authorization (
  unit, personnel_total, critical_mos_total, aircraft_total, daily_sortie_total, training_required_total)
SELECT u.id, 500, 30, 6, 8, 12 FROM unit u WHERE u.name='VMU-1' LIMIT 1;
INSERT INTO unit_authorization (
  unit, personnel_total, critical_mos_total, aircraft_total, daily_sortie_total, training_required_total)
SELECT u.id, 500, 30, 6, 8, 12 FROM unit u WHERE u.name='VMU-3' LIMIT 1;

/* Unit payload authorizations (shared) */
INSERT INTO unit_payload_authorization (unit, payload, payload_total)
SELECT src.unit, src.payload, src.payload_total
FROM (
  SELECT u.id AS unit,
         p.id AS payload,
         a.payload_total AS payload_total
  FROM unit u
  JOIN (
    SELECT 'SkyTower II' AS payload_type, @AUTH_STII AS payload_total UNION ALL
    SELECT 'EW Pod',                      @AUTH_EWPD                  UNION ALL
    SELECT 'Extended Range Tank',         @AUTH_ERGT                  UNION ALL
    SELECT 'SmartSensor',                 @AUTH_SMSR
  ) a
  JOIN (
    -- Get one representative payload ID per type for authorization reference
    SELECT type, MIN(id) as id
    FROM payload 
    WHERE type IN ('SkyTower II', 'EW Pod', 'Extended Range Tank', 'SmartSensor')
    GROUP BY type
  ) p ON p.type = a.payload_type
  WHERE u.name IN ('VMU-1', 'VMU-3')
) AS src
ON DUPLICATE KEY UPDATE payload_total = src.payload_total;

/* Unit MOS authorizations (shared) */
INSERT INTO unit_mos_authorization (unit, mos, mos_total)
SELECT src.unit, src.mos, src.mos_total
FROM (
  SELECT u.id AS unit,
         m.id AS mos,
         a.mos_total AS mos_total
  FROM unit u
  JOIN (
    SELECT '0231' AS mos_number, 18 AS mos_total UNION ALL
    SELECT '0241',               01              UNION ALL
    SELECT '0631',               08              UNION ALL
    SELECT '0639',               02              UNION ALL
    SELECT '0648',               02              UNION ALL
    SELECT '0671',               08              UNION ALL
    SELECT '0679',               02              UNION ALL
    SELECT '2621',               18              UNION ALL
    SELECT '2631',               02              UNION ALL
    SELECT '2651',               02              UNION ALL
    SELECT '7314',               38              UNION ALL
    SELECT '7318',               48              UNION ALL
    SELECT '7377',               00                
  ) a
  JOIN mos m ON m.number = a.mos_number
  WHERE u.name IN ('VMU-1', 'VMU-3')
) AS src
ON DUPLICATE KEY UPDATE mos_total = src.mos_total;

/* Auto-fill people to meet unit_mos_authorization
   - Computes deficits per (unit, mos) and inserts synthetic names
   - Safe to re-run: once filled, needed becomes 0 and no new rows are added
   - MySQL note: WITH/CTE is not allowed before INSERT in some MySQL 8 versions,
     so we generate a numbers table inline without CTEs.
*/
INSERT INTO person(edipi, unit, mos)
SELECT
  CONCAT(LPAD(MOD(d.unit_id, 100), 2, '0'), LPAD(MOD(d.mos_id, 1000), 3, '0'), LPAD(n.n, 5, '0')) AS edipi,
  d.unit_id,
  d.mos_id
FROM (
  SELECT
    uma.unit AS unit_id,
    uma.mos  AS mos_id,
    GREATEST(uma.mos_total - COUNT(p.id), 0) AS needed
  FROM unit_mos_authorization uma
  LEFT JOIN person p
    ON p.unit = uma.unit AND p.mos = uma.mos
  GROUP BY uma.unit, uma.mos, uma.mos_total
  HAVING needed > 0
) AS d
JOIN unit u ON u.id = d.unit_id
JOIN mos  m ON m.id = d.mos_id
JOIN (
  /* numbers 1..10000 via Cartesian product of digits */
  SELECT d0.n + d1.n*10 + d2.n*100 + d3.n*1000 + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d0
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d1
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d2
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) d3
) AS n ON n.n <= d.needed;

/* Assign randomized skills (0–4) to aircrew with no skills yet.
   Deterministic per person (idempotent):
   - k in [0..4] derived from hash of person.id
   - Skills ordered by hash of (person.id, skill.id)
   - Inserts only when person currently has zero skills
*/
INSERT INTO person_skill (person_id, skill_id)
SELECT person_id, skill_id
FROM (
  SELECT
    p.id AS person_id,
    s.id AS skill_id,
    ROW_NUMBER() OVER (
      PARTITION BY p.id
      ORDER BY SHA2(CONCAT(p.id, '-', s.id), 256)
    ) AS rn,
    MOD(CONV(SUBSTRING(SHA2(CONCAT('k-', p.id), 256), 1, 2), 16, 10), 5) AS k
  FROM person p
  JOIN mos m ON m.id = p.mos AND m.aircrew_mos = 1
  LEFT JOIN (
    SELECT DISTINCT person_id FROM person_skill
  ) ps_any ON ps_any.person_id = p.id
  JOIN skill s ON 1=1
  LEFT JOIN person_skill ps ON ps.person_id = p.id AND ps.skill_id = s.id
  WHERE ps_any.person_id IS NULL
    AND ps.person_id IS NULL
) ranked
WHERE rn <= k;

/* Skill prerequisites */
INSERT IGNORE INTO skill_prerequisite (skill_id, prereq_skill_id)
SELECT s.id, p.id
FROM (
  -- MISSION
  SELECT 'MIR' AS skill_name, 'MISSION' AS skill_type, 'FAM' AS prereq_name, 'CORE' AS prereq_type UNION ALL
  SELECT 'MIR',   'MISSION',      'REC',    'CORE'        UNION ALL
  SELECT 'MIR',   'MISSION',      'DAS',    'CORE'        UNION ALL
  SELECT 'MIR',   'MISSION',      'EW',     'CORE'        UNION ALL
  SELECT 'MIR',   'MISSION',      'AN',     'CORE'        UNION ALL
  SELECT 'SCAR',  'MISSION',      'MIR',    'MISSION'     UNION ALL
  SELECT 'ES',    'MISSION',      'MIR',    'MISSION'     UNION ALL
  SELECT 'ANE',   'MISSION',      'FAM',    'CORE'        UNION ALL
  SELECT 'ANE',   'MISSION',      'REC',    'CORE'        UNION ALL
  SELECT 'ANE',   'MISSION',      'DAS',    'CORE'        UNION ALL
  SELECT 'ANE',   'MISSION',      'EW',     'CORE'        UNION ALL
  SELECT 'ANE',   'MISSION',      'AN',     'CORE'        UNION ALL
  -- MISSIONPLUS
  SELECT 'FCAS',  'MISSIONPLUS',  'MIR',    'MISSION'     UNION ALL
  SELECT 'FCAS',  'MISSIONPLUS',  'SCAR',   'MISSION'     UNION ALL
  SELECT 'FCAS',  'MISSIONPLUS',  'ES',     'MISSION'     UNION ALL
  SELECT 'FCAS',  'MISSIONPLUS',  'ANE',    'MISSION'     UNION ALL
  SELECT 'IDF',   'MISSIONPLUS',  'MIR',    'MISSION'     UNION ALL
  SELECT 'IDF',   'MISSIONPLUS',  'SCAR',   'MISSION'     UNION ALL
  SELECT 'IDF',   'MISSIONPLUS',  'ES',     'MISSION'     UNION ALL
  SELECT 'IDF',   'MISSIONPLUS',  'ANE',    'MISSION'     UNION ALL
  SELECT 'TAC(A)','MISSIONPLUS',  'UESC',   'MISSIONPLUS' UNION ALL
  SELECT 'UESC',  'MISSIONPLUS',  'IDF',    'MISSIONPLUS' UNION ALL
  SELECT 'TRAP',  'MISSIONPLUS',  'MIR',    'MISSION'     UNION ALL
  SELECT 'TRAP',  'MISSIONPLUS',  'SCAR',   'MISSION'     UNION ALL
  SELECT 'TRAP',  'MISSIONPLUS',  'ES',     'MISSION'     UNION ALL
  SELECT 'TRAP',  'MISSIONPLUS',  'ANE',    'MISSION'
) x
JOIN skill s ON s.name = x.skill_name  AND s.type = x.skill_type
JOIN skill p ON p.name = x.prereq_name AND p.type = x.prereq_type
WHERE s.id <> p.id;

/*
  Ensure all payload.unit is populated based on mounting or explicit assignment,
  then enforce NOT NULL. Ownership is unit-level and independent of mounting state.
*/
-- 1) Mounted via aircraft_mount -> owner is the unit for the aircraft's hangar
UPDATE payload p
JOIN aircraft_mount am ON am.payload_id = p.id
JOIN hangar_bay hb ON hb.aircraft_id = am.aircraft_id
JOIN unit u ON u.hangar = hb.hangar_id
SET p.unit = u.id
WHERE p.unit IS NULL;

-- 2) Mounted via airframe_mount -> owner is the unit for the aircraft's hangar
UPDATE payload p
JOIN airframe_mount afm ON afm.payload_id = p.id
JOIN hangar_bay hb ON hb.aircraft_id = afm.aircraft_id
JOIN unit u ON u.hangar = hb.hangar_id
SET p.unit = u.id
WHERE p.unit IS NULL;

-- 3) Any remaining NULLs (unmounted/unassigned) -> split evenly between units
-- Get unit IDs for distribution
SET @unitA := (SELECT id FROM unit WHERE name='VMU-1' LIMIT 1);
SET @unitB := (SELECT id FROM unit WHERE name='VMU-3' LIMIT 1);

-- Split SkyTower II payloads evenly between units
UPDATE payload p
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) as rn
  FROM payload 
  WHERE type = 'SkyTower II' AND unit IS NULL
) ranked ON p.id = ranked.id
SET p.unit = CASE 
  WHEN ranked.rn % 2 = 1 THEN @unitA 
  ELSE @unitB 
END
WHERE p.type = 'SkyTower II' AND p.unit IS NULL;

-- Split EW Pod payloads evenly between units
UPDATE payload p
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) as rn
  FROM payload 
  WHERE type = 'EW Pod' AND unit IS NULL
) ranked ON p.id = ranked.id
SET p.unit = CASE 
  WHEN ranked.rn % 2 = 1 THEN @unitA 
  ELSE @unitB 
END
WHERE p.type = 'EW Pod' AND p.unit IS NULL;

-- Split SmartSensor payloads evenly between units
UPDATE payload p
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) as rn
  FROM payload 
  WHERE type = 'SmartSensor' AND unit IS NULL
) ranked ON p.id = ranked.id
SET p.unit = CASE 
  WHEN ranked.rn % 2 = 1 THEN @unitA 
  ELSE @unitB 
END
WHERE p.type = 'SmartSensor' AND p.unit IS NULL;

-- Split Extended Range Tank payloads evenly between units
UPDATE payload p
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) as rn
  FROM payload 
  WHERE type = 'Extended Range Tank' AND unit IS NULL
) ranked ON p.id = ranked.id
SET p.unit = CASE 
  WHEN ranked.rn % 2 = 1 THEN @unitA 
  ELSE @unitB 
END
WHERE p.type = 'Extended Range Tank' AND p.unit IS NULL;

-- Assign any remaining payloads (airframe types, etc.) to first unit as fallback
UPDATE payload p
SET p.unit = @unitA
WHERE p.unit IS NULL;

-- 4) Enforce NOT NULL now that all rows have unit
ALTER TABLE payload MODIFY COLUMN unit INT NOT NULL;
