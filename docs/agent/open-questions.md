# Open questions

- Physical iPhone/Safari keyboard behavior has not been checked. Verify typing and pasting `tembi’u`, `a’e` and `e’õ’ar`, including insertion in the middle of existing text.
- `/healthz` returns 503 in the local test environment, including untouched HEAD `95bb616`. `app/main.py` retains an imported `AsyncSessionLocal` while fixtures replace `app.db.AsyncSessionLocal`; investigate that binding and the initial database configuration separately.
- PostgreSQL search execution and performance were not exercised locally. SQLite API tests cover the comparison logic; production uses the same SQL `replace` expressions.
- This work has not been deployed. Follow the existing deployment workflow when publication is requested.
