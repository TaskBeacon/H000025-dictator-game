# H000025 Dictator Game

HTML/browser preview of the Dictator Game built with `psyflow-web`.
Three-way allocation decisions (`generous`, `equal`, `selfish`) under low/medium/high stakes are aligned to local `T000025-dictator-game`, with fewer blocks for preview.

## Layout

- `main.ts`: task orchestration
- `config/config.yaml`: declarative config
- `src/controller.ts`: stake scheduler and allocation tracker
- `src/run_trial.ts`: trial logic
- `src/utils.ts`: condition parsing and summary helpers

## Run

From `e:\xhmhc\TaskBeacon\psyflow-web`:

```powershell
npm install
npm run dev
```

Open:

```text
http://127.0.0.1:4173/?task=H000025-dictator-game
```
