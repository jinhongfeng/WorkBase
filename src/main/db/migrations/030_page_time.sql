-- 页面停留时长：页面 × 本地自然日累计秒数；渲染进程在切页/失焦/隐藏时结算上报，主进程 upsert 累加。
CREATE TABLE page_time (
  page TEXT NOT NULL,
  day TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  PRIMARY KEY (page, day)
);
CREATE INDEX idx_page_time_day ON page_time(day);
