-- 缓存 RSS/Atom 自带正文及用户主动加载的文章正文。
ALTER TABLE source_entries ADD COLUMN body TEXT;
