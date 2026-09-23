# AIOT-HW1 Agent Working Rules

## Scope

Agent 可直接在 AIOT-HW1 repository 內工作。
除非操作符合「Must Ask」條件，否則不需要逐項詢問使用者。

## Allowed Without Asking

以下操作直接執行，不需要等待批准：

- pwd、ls、find、tree
- rg、grep、sed 的唯讀使用
- 閱讀 repository 內任何非機密檔案
- git status
- git status --short
- git diff
- git diff --check
- git log
- git show
- git grep
- git ls-files
- git check-ignore
- 檢查 branch、remote 與追蹤狀態
- source .venv/bin/activate
- 使用 repository 的 .venv
- 執行 python、pytest、coverage、lint、format、type check
- 使用 repository 的 Node/npm 工具
- npm install（僅限 package.json 已聲明依賴）
- npm test
- npm run lint
- npm run typecheck
- npm run build
- 檢查 Next.js build output
- 修改 web/ 內目前 Milestone 範圍的檔案
- 執行唯讀 SQLite 查詢（限 Legacy V1 驗證）
- 建立 pytest tmp_path 測試資料庫
- 新增正常的 Python import
- 新增或修改目前 Milestone 範圍內的程式碼
- 新增或修改單元測試、Fixture、Mock
- 修改 README.md、workflow.md、myplan/ 文件
- 建立新的 Milestone 文件
- 修改 requirements.txt 或 requirements-dev.txt，但只能加入目前 Milestone 明確需要的套件
- 在專案 .venv 內安裝 requirements 已聲明的套件
- 修正 formatting、typing、lint、warning 和小型相容性問題
- 重跑測試直到目前 Milestone 通過
- 使用 apply_patch 或其他安全方式修改 repo 內檔案
- 建立非機密的本機暫存測試檔案

Agent 不得只因需要新增 import、執行 grep、查看 diff、啟動 venv、執行 pytest 或修正測試而停止詢問。

若遇到一般低風險技術問題，應自行選擇合理、可測試的解法，完成後在報告中說明。

## Must Ask Before Proceeding

只有以下操作必須停止並取得使用者批准：

- git commit
- git push
- merge、rebase、force push、改寫 Git history
- 刪除或覆寫使用者資料
- git reset --hard、git clean、checkout 丟棄修改等破壞性 Git 操作
- 讀取、顯示、複製、修改或搬移真實 Secrets
- 將 API Key、密碼或連線字串寫入任何追蹤檔案
- 建立或連接 Vercel Project
- 修改 Vercel Environment Variables
- 執行 production deployment
- 修改 production domain
- 未來若要評估引入永久資料庫（如 M17 PostgreSQL/Supabase/Neon）
- 停止或刪除現有 Streamlit App
- 建立付費資源
- 發送 Email、通知或對外訊息
- 操作 AIOT-HW1 repository 以外的檔案
- 大幅推翻 DECISIONS.md 中 Accepted 的架構決策
- 刪除大量檔案或進行不可逆操作

## Secrets

- 真實 Secrets 只能由使用者自行放入本機 secrets.toml、環境變數、Vercel Environment Variables 或 Streamlit Cloud Secrets。
- 不得輸出、記錄或重複使用聊天中曾出現的 API Key。
- 文件、測試、Fixture 與範例只能使用假值。
- `.streamlit/secrets.toml`、`.env`、`.env.local`、DATABASE_URL 和密碼不得被 Git 追蹤。
- 錯誤訊息不得包含完整 URL、Authorization header、API Key 或密碼。

## Milestone Workflow

每個 Milestone：

1. 閱讀 myplan
2. 更新狀態為 In Progress
3. 在已批准範圍內直接設計、實作與測試
4. 自行執行所有必要的低風險檢查
5. 更新 myplan 與測試結果
6. 提交完整驗收報告
7. 停在 Commit/Push 前等待使用者批准
8. 使用者批准後才 Commit/Push
9. 雲端或外部服務操作仍需使用者確認
