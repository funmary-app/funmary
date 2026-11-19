-- 授業の詳細の URL を、DB の ID の形 (/app/subjects/12、/subjects/12) から、年度とシラバスの番号の形
-- (/app/subjects/2026/100201) に書き換える。通知の表の link が対象。科目がなければ、そのままにする。
UPDATE `notifications`
SET `link` = (
	SELECT '/app/subjects/' || `s`.`academic_year` || '/' || `s`.`syllabus_id`
	FROM `subjects` AS `s`
	WHERE `s`.`id` = CAST(substr(`notifications`.`link`, length(rtrim(`notifications`.`link`, '0123456789')) + 1) AS integer)
)
WHERE `link` IS NOT NULL
	AND (`link` GLOB '/app/subjects/[0-9]*' OR `link` GLOB '/subjects/[0-9]*')
	AND rtrim(`link`, '0123456789') IN ('/app/subjects/', '/subjects/')
	AND EXISTS (
		SELECT 1 FROM `subjects` AS `s`
		WHERE `s`.`id` = CAST(substr(`notifications`.`link`, length(rtrim(`notifications`.`link`, '0123456789')) + 1) AS integer)
	);
