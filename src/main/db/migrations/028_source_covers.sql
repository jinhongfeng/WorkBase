-- 缓存 RSS/Atom 订阅内容中声明的文章配图。
ALTER TABLE source_entries ADD COLUMN cover TEXT;
