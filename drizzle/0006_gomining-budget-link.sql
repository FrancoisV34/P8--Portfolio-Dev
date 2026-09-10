ALTER TABLE `finance_gomining_scenarios` ADD `budget_category_id` text REFERENCES finance_categories(id);--> statement-breakpoint
CREATE INDEX `finance_gomining_scenarios_budget_category_idx` ON `finance_gomining_scenarios` (`budget_category_id`);--> statement-breakpoint
CREATE TRIGGER `finance_gomining_scenarios_category_owner_insert`
BEFORE INSERT ON `finance_gomining_scenarios`
FOR EACH ROW WHEN NEW.budget_category_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_categories` category
    WHERE category.id = NEW.budget_category_id
      AND category.owner_id = NEW.owner_id
      AND category.kind = 'expense'
  ) THEN RAISE(ABORT, 'invalid GoMining budget category') END;
END;
--> statement-breakpoint
CREATE TRIGGER `finance_gomining_scenarios_category_owner_update`
BEFORE UPDATE OF `owner_id`, `budget_category_id` ON `finance_gomining_scenarios`
FOR EACH ROW WHEN NEW.budget_category_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_categories` category
    WHERE category.id = NEW.budget_category_id
      AND category.owner_id = NEW.owner_id
      AND category.kind = 'expense'
  ) THEN RAISE(ABORT, 'invalid GoMining budget category') END;
END;
