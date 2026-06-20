I am developing a VS Code extension using TypeScript on macOS/Linux. I need to set up a seamless, automated development workflow with hot reloading/instant feedback so I don't have to manually stop and restart the Extension Development Host window every time I make a change.

Please provide the necessary configuration files and structural adjustments based on these strict requirements:

1. **Continuous Watch & Fast Refresh:**
   - Configure `.vscode/tasks.json` to run the continuous TypeScript compiler (`npm run watch`) in the background with a proper `problemMatcher`.
   - Configure `.vscode/launch.json` to depend on this background watch task before launching the Extension Development Host.
   - Explain the quick shortcut (`Cmd+R` on macOS / `Ctrl+R` on Windows/Linux) to refresh the host window instantly.

2. **Webview HMR (If Applicable):**
   - Provide a code pattern for `extension.ts` that detects if the extension is running in development mode (`context.extensionMode === vscode.ExtensionMode.Development`).
   - If in development, configure the Webview to load assets from a local dev server (e.g., `http://localhost:5173` via Vite) to enable native Hot Module Replacement (HMR). If in production, fall back to loading from the local disk.

3. **Architectural & Output Constraints:**
   - Follow Ports and Adapters (Hexagonal) architecture: isolate the VS Code API interactions (Infrastructure Layer) from the core extension logic (Core Domain) to maintain a unit-test-friendly design.
   - Provide code DIFFS only for existing configuration files instead of full-file rewrites to keep token consumption minimal.
   - Provide a brief summary of adjustments for readability, performance, best practices, and edge case handling (e.g., resource disposal during reloads).

Return ONLY the executable code block or raw diff. 
No explanations, no greetings, no Markdown prose outside the code block. 
If modifying, provide only the code diff.