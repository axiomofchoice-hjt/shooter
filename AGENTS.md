# 项目约定

## 自动提交

- 完成用户要求的代码或文档改动后，**直接提交或 squash 到上一个提交**，不需要等用户说「提交」。一次逻辑改动一个提交。
- 提交信息沿用现有风格（Conventional Commits）：`feat:`、`fix:`、`chore:`、`docs:`、`tune:`，用英文描述。
- 只提交与本次改动相关的文件；`dist/`、`node_modules/` 等已在 `.gitignore` 中，不要强制加入。
- 提交前确保 `npm run build` 通过（类型检查 + 构建）。
- **推送不自动执行**，仍需用户明确说「推送」后再 `git push`。

### 版本号与 CHANGELOG

- 平时改动只往 `CHANGELOG.md` 的 `## [Unreleased]` 小节里追加条目，**不动 `package.json` 的 `version`**。
- 不要为单次改动新建版本小节，也不要单独提交 `chore(release)`；改动和它的 CHANGELOG 条目写在同一个提交里。
- 只有用户说「发版」时才执行发版，一次做完：把 `## [Unreleased]` 改名为 `## [x.y.z] - YYYY-MM-DD`、bump `package.json`（`npm install --package-lock-only` 同步 lockfile）、新建空的 `## [Unreleased]`、单独提交 `chore(release): x.y.z <一句话主题>`、`git tag vX.Y.Z`（tag 同样不自动推送）。
- 版本号选择：`feat` 提 minor，`fix` / `tune` / `perf` 提 patch，破坏性改动提 major；`docs` / `chore` 不改版本号。

## 代码

- 游戏数值和敌人配置集中在 `src/game/Game.ts` 顶部；武器数值在 `src/game/weapons.ts`。
- 地牢带哪几把枪由 `src/game/weapons.ts` 的 `DUNGEON_LOADOUT` 决定，默认为 `['pulse']`（只带第一把）。新武器做完先加进这个列表，方便进地牢实测；用户说「除了第一把都不带」时，把列表收回只剩 `pulse`。测试房不受这个列表限制。
- 改动玩法后同步更新 `README.md` 与 `CHANGELOG.md`。

## 设计偏好

- 不要回旋镖 / 回旋刃类武器：用户明确不喜欢「飞出去再回到玩家」的弹道，后续不要再提议或实现这类武器。
- 不要引力 / 黑洞 / 奇点类武器：用户明确不喜欢靠拉扯敌人位置的控场设计，后续不要再提议或实现。
- 不要反弹 / 反射子弹类武器：用户明确不喜欢把敌方子弹弹回去的防御玩法，后续不要再提议或实现。
