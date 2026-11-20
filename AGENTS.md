# 项目约定

## 自动提交

- 完成用户要求的代码或文档改动后，**直接提交**，不需要等用户说「提交」。一次逻辑改动一个提交。
- 提交信息沿用现有风格（Conventional Commits）：`feat:`、`fix:`、`chore:`、`docs:`、`tune:`，用英文描述。
- 只提交与本次改动相关的文件；`dist/`、`node_modules/` 等已在 `.gitignore` 中，不要强制加入。
- 提交前确保 `npm run build` 通过（类型检查 + 构建）。
- **推送不自动执行**，仍需用户明确说「推送」后再 `git push`。

## 代码

- 游戏数值和敌人配置集中在 `src/game/Game.ts` 顶部；武器数值在 `src/game/weapons.ts`。
- 改动玩法后同步更新 `README.md` 与 `CHANGELOG.md`。
