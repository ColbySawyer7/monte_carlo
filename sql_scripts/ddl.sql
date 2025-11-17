CREATE DATABASE IF NOT EXISTS sor_sim;
USE sor_sim;

/*
  This script defines the database structure (tables), performance helpers (indexes),
  relational integrity (foreign keys), and business rules (triggers).
*/

/**********/
/* Tables */
/**********/
/*
  Physical tables that persist the application's data model. These are the base
  storage objects the backend reads and writes. Each table models a domain entity
  (e.g., aircraft, payload, unit) and its attributes.
*/
CREATE TABLE IF NOT EXISTS `status` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `status` VARCHAR(255),
  UNIQUE KEY `uq_status_status` (`status`)
);

CREATE TABLE IF NOT EXISTS `airspace` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS `spectrum` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS `connectivity` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `connected` VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS `air_superiority` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS `visibility` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255),
  `min` INT,
  `max` INT
);

CREATE TABLE IF NOT EXISTS `unit_authorization` (
  `unit` INT PRIMARY KEY,
  `personnel_total` INT,
  `critical_mos_total` INT,
  `aircraft_total` INT,
  `daily_sortie_total` INT,
  `training_required_total` INT
);

CREATE TABLE IF NOT EXISTS `unit_mos_authorization` (
  `unit` INT NOT NULL,
  `mos` INT NOT NULL,
  `mos_total` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`unit`, `mos`)
);

CREATE TABLE IF NOT EXISTS `unit_payload_authorization` (
  `unit` INT NOT NULL,
  `payload` INT NOT NULL,
  `payload_total` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`unit`, `payload`)
);

CREATE TABLE IF NOT EXISTS `ceiling` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255),
  `min` INT,
  `max` INT
);

CREATE TABLE IF NOT EXISTS `skill` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255),
  `type` VARCHAR(255),
  `time_to_train_pilot` FLOAT,
  `time_to_train_so` FLOAT
);

CREATE TABLE IF NOT EXISTS `skill_prerequisite` (
  `skill_id` INT NOT NULL,
  `prereq_skill_id` INT NOT NULL,
  PRIMARY KEY (`skill_id`, `prereq_skill_id`),
  CHECK (`skill_id` <> `prereq_skill_id`)
);

CREATE TABLE IF NOT EXISTS `mos` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `number` VARCHAR(5) NOT NULL,
  `name` VARCHAR(255),
  `critical` BOOL,
  `aircrew_mos` BOOL,
  UNIQUE KEY `uq_mos_number` (`number`)
);

CREATE TABLE IF NOT EXISTS `strength_staffing` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `status_id` INT NOT NULL,
  `personnel_threshold` FLOAT,
  `critical_mos_threshold` FLOAT
);

CREATE TABLE IF NOT EXISTS `strength_equipment` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `status_id` INT NOT NULL,
  `aircraft_threshold` FLOAT,
  `payload_threshold` FLOAT
);

CREATE TABLE IF NOT EXISTS `strength_training` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `status_id` INT NOT NULL,
  `count_threshold` FLOAT
);

CREATE TABLE IF NOT EXISTS `payload` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `serial_number` VARCHAR(64) NOT NULL,
  `type` VARCHAR(255) NOT NULL,
  `status` INT,
  `unit` INT NULL,
  UNIQUE KEY `uq_payload_serial` (`serial_number`)
);

CREATE TABLE IF NOT EXISTS `aircraft_config` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255),
  UNIQUE KEY `uq_aircraft_config_name` (`name`)
);

CREATE TABLE IF NOT EXISTS `aircraft` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `serial_number` VARCHAR(255) NOT NULL,
  `type` VARCHAR(255),
  `status` INT,
  `config` INT,
  UNIQUE KEY `uq_aircraft_serial` (`serial_number`)
);

CREATE TABLE IF NOT EXISTS `aircraft_mount` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `aircraft_id` INT NOT NULL,
  `station_number` TINYINT NOT NULL,
  `payload_id` INT NOT NULL,
  CHECK (`station_number` BETWEEN 1 AND 7),
  UNIQUE KEY `uq_aircraft_station` (`aircraft_id`, `station_number`),
  UNIQUE KEY `uq_payload_single_mount` (`payload_id`)
);

CREATE TABLE IF NOT EXISTS `airframe_mount` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `aircraft_id` INT NOT NULL,
  `payload_id` INT NOT NULL,
  UNIQUE KEY `uq_airframe_payload_single` (`payload_id`)
);

CREATE TABLE IF NOT EXISTS `hangar` (
  `id` INT PRIMARY KEY AUTO_INCREMENT
);

CREATE TABLE IF NOT EXISTS `hangar_bay` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `hangar_id` INT NOT NULL,
  `bay_number` TINYINT NOT NULL,
  `aircraft_id` INT NULL,
  UNIQUE KEY `uq_hangar_bay` (`hangar_id`, `bay_number`)
);

CREATE TABLE IF NOT EXISTS `unit` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `name` VARCHAR(255),
  `type` VARCHAR(255),
  `class` VARCHAR(255),
  `hangar` INT
);

CREATE TABLE IF NOT EXISTS `person` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,
  `edipi` VARCHAR(10) NOT NULL,
  `unit` INT,
  `mos` INT,
  `bmos` INT,
  UNIQUE KEY `uq_person_edipi` (`edipi`)
);

CREATE TABLE IF NOT EXISTS `person_skill` (
  `person_id` INT NOT NULL,
  `skill_id` INT NOT NULL,
  PRIMARY KEY (`person_id`, `skill_id`)
);

/***********/
/* Indexes */
/***********/
/*
  Performance indexes to speed up common WHERE and JOIN patterns used by the app.
  Indexes do not change data; they help the optimizer find rows faster.
*/
CREATE INDEX `idx_aircraft_status`     ON `aircraft`(`status`);
CREATE INDEX `idx_aircraft_config`     ON `aircraft`(`config`);
CREATE INDEX `idx_person_unit`         ON `person`(`unit`);
CREATE INDEX `idx_person_mos`          ON `person`(`mos`);
CREATE INDEX `idx_person_bmos`         ON `person`(`bmos`);
CREATE INDEX `idx_hangar_bay_hangar`   ON `hangar_bay`(`hangar_id`);
CREATE INDEX `idx_hangar_bay_aircraft` ON `hangar_bay`(`aircraft_id`);
CREATE INDEX `idx_am_aircraft`         ON `aircraft_mount`(`aircraft_id`);
CREATE INDEX `idx_am_payload`          ON `aircraft_mount`(`payload_id`);
CREATE INDEX `idx_airframe_payload`    ON `airframe_mount`(`payload_id`);
CREATE INDEX `idx_airframe_aircraft`   ON `airframe_mount`(`aircraft_id`);
CREATE INDEX `idx_skill_prereq_skill`  ON `skill_prerequisite`(`skill_id`);
CREATE INDEX `idx_skill_prereq_prereq` ON `skill_prerequisite`(`prereq_skill_id`);

/****************/
/* Foreign keys */
/****************/
/*
  Referential integrity constraints linking tables together. These ensure that
  foreign key IDs always reference valid rows and maintain relational consistency
  when inserting, updating, or deleting data.
*/
ALTER TABLE `payload` ADD FOREIGN KEY (`status`) REFERENCES `status`(`id`);
ALTER TABLE `payload` ADD FOREIGN KEY (`unit`)   REFERENCES `unit`(`id`);

ALTER TABLE `aircraft` ADD FOREIGN KEY (`status`) REFERENCES `status`(`id`);
ALTER TABLE `aircraft` ADD FOREIGN KEY (`config`) REFERENCES `aircraft_config`(`id`);

ALTER TABLE `aircraft_mount` ADD FOREIGN KEY (`aircraft_id`) REFERENCES `aircraft`(`id`);
ALTER TABLE `aircraft_mount` ADD FOREIGN KEY (`payload_id`)  REFERENCES `payload`(`id`);

ALTER TABLE `airframe_mount` ADD FOREIGN KEY (`payload_id`)  REFERENCES `payload`(`id`);
ALTER TABLE `airframe_mount` ADD FOREIGN KEY (`aircraft_id`) REFERENCES `aircraft`(`id`);

ALTER TABLE `hangar_bay` ADD FOREIGN KEY (`hangar_id`)   REFERENCES `hangar`(`id`);
ALTER TABLE `hangar_bay` ADD FOREIGN KEY (`aircraft_id`) REFERENCES `aircraft`(`id`);

ALTER TABLE `unit` ADD FOREIGN KEY (`hangar`) REFERENCES `hangar`(`id`);

ALTER TABLE `unit_authorization` ADD FOREIGN KEY (`unit`) REFERENCES `unit`(`id`) ON DELETE CASCADE;

ALTER TABLE `unit_mos_authorization` ADD FOREIGN KEY (`unit`) REFERENCES `unit`(`id`) ON DELETE CASCADE;
ALTER TABLE `unit_mos_authorization` ADD FOREIGN KEY (`mos`)  REFERENCES `mos`(`id`)  ON DELETE RESTRICT;

ALTER TABLE `unit_payload_authorization` ADD FOREIGN KEY (`unit`)    REFERENCES `unit`(`id`)    ON DELETE CASCADE;
ALTER TABLE `unit_payload_authorization` ADD FOREIGN KEY (`payload`) REFERENCES `payload`(`id`) ON DELETE RESTRICT;

ALTER TABLE `person` ADD FOREIGN KEY (`mos`)  REFERENCES `mos`(`id`);
ALTER TABLE `person` ADD FOREIGN KEY (`bmos`) REFERENCES `mos`(`id`);
ALTER TABLE `person` ADD FOREIGN KEY (`unit`) REFERENCES `unit`(`id`);

ALTER TABLE `person_skill` ADD FOREIGN KEY (`person_id`) REFERENCES `person`(`id`);
ALTER TABLE `person_skill` ADD FOREIGN KEY (`skill_id`)  REFERENCES `skill`(`id`);

ALTER TABLE `skill_prerequisite` ADD FOREIGN KEY (`skill_id`)        REFERENCES `skill`(`id`) ON DELETE CASCADE;
ALTER TABLE `skill_prerequisite` ADD FOREIGN KEY (`prereq_skill_id`) REFERENCES `skill`(`id`) ON DELETE RESTRICT;

ALTER TABLE `strength_staffing`  ADD FOREIGN KEY (`status_id`)  REFERENCES `status`(`id`);
ALTER TABLE `strength_equipment` ADD FOREIGN KEY (`status_id`)  REFERENCES `status`(`id`);
ALTER TABLE `strength_training`  ADD FOREIGN KEY (`status_id`)  REFERENCES `status`(`id`);

/************/
/* Triggers */
/************/
/*
  Database-level business rules enforced on INSERT/UPDATE. Triggers validate
  domain constraints (e.g., station restrictions, disallowing mounts for Slick
  configs) to prevent invalid or contradictory data from being saved.
*/
DELIMITER //
CREATE TRIGGER `trg_am_no_slick_mounts_ins`
BEFORE INSERT ON `aircraft_mount` FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1
    FROM aircraft a
    JOIN aircraft_config c ON c.id = a.config
    WHERE a.id = NEW.aircraft_id AND c.name = 'Slick'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Slick aircraft cannot have optional mounts';
  END IF;
END//
CREATE TRIGGER `trg_am_no_slick_mounts_upd`
BEFORE UPDATE ON `aircraft_mount` FOR EACH ROW
BEGIN
  IF EXISTS (
    SELECT 1
    FROM aircraft a
    JOIN aircraft_config c ON c.id = a.config
    WHERE a.id = NEW.aircraft_id AND c.name = 'Slick'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Slick aircraft cannot have optional mounts';
  END IF;
END//

CREATE TRIGGER `trg_am_enforce_station_payload_ins`
BEFORE INSERT ON `aircraft_mount` FOR EACH ROW
BEGIN
  DECLARE p_type VARCHAR(255);
  SELECT `type` INTO p_type FROM payload WHERE id = NEW.payload_id LIMIT 1;
  IF p_type = 'SkyTower II' AND NEW.station_number <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SkyTower II must be mounted on station 2';
  END IF;
  IF p_type = 'EW Pod' AND NEW.station_number <> 6 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EW Pod must be mounted on station 6';
  END IF;
  IF p_type = 'Extended Range Tank' AND NEW.station_number <> 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended Range Tank must be mounted on station 3';
  END IF;
END//

CREATE TRIGGER `trg_am_enforce_station_payload_upd`
BEFORE UPDATE ON `aircraft_mount` FOR EACH ROW
BEGIN
  DECLARE p_type VARCHAR(255);
  SELECT `type` INTO p_type FROM payload WHERE id = NEW.payload_id LIMIT 1;
  IF p_type = 'SkyTower II' AND NEW.station_number <> 2 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SkyTower II must be mounted on station 2';
  END IF;
  IF p_type = 'EW Pod' AND NEW.station_number <> 6 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'EW Pod must be mounted on station 6';
  END IF;
  IF p_type = 'Extended Range Tank' AND NEW.station_number <> 3 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Extended Range Tank must be mounted on station 3';
  END IF;
END//
DELIMITER ;
