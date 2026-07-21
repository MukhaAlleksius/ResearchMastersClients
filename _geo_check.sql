SELECT COUNT(*) AS countries FROM countries;
SELECT COUNT(*) AS regions FROM regions;
SELECT COUNT(*) AS towns FROM towns;
SELECT id, name_country FROM countries;
SELECT id, name_region FROM regions ORDER BY id;
SELECT id, name_town FROM towns WHERE name_town = 'Солигорск';
