# Git Push Policy

- **Never execute `git push`**: Do not run `git push` or any commands that push commits to remote repositories.
- **Manual Push by User**: The user always handles pushing commits manually.
- **Workflow**:
  1. Stage changes (`git add <files>`).
  2. Create descriptive commit (`git commit -m "..."`).
  3. Inform the user that changes are committed and provide the exact push command (e.g. `git push origin main`) for the user to run manually in their terminal.
