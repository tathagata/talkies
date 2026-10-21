# Talkies

A local talk authoring workspace: Markdown slides, live Marp preview, preparation notes, spoken narrative, research, issues, and agent proposals together.

## Run

```sh
git clone https://github.com/tathagata/talkies.git
cd talkies
docker compose up --build
```

Open http://localhost:4318. The performance feedback-loop talk is created automatically on first launch. Content persists in `./workspace/talk.json`. Slides have stable IDs; reordering carries notes, research, and issues. Images under 1.5 MB are embedded in Markdown for portable export.

Alternatively, with Node 24 and Git installed: `npm ci && npm start`.

## Connect a talk repository

Mount an existing clone (GitHub or internal GitLab) by setting `TALKIES_WORKSPACE=/absolute/path/to/talk-repository` before starting Docker. A new workspace can also be initialized in **Review & commit**, then given an SSH or HTTPS origin. Each instance opens one talk repository. Start separate instances/ports for simultaneous workspaces.

The UI saves automatically, shows Git changes, commits `talk.json` and generated `slides.md`, and pushes the current branch on explicit request. Git identity and authentication must be available **inside the container**. Configure repository-local `user.name` / `user.email`; use your organization-approved SSH agent/credential-helper setup. Credentials are not stored by Talkies. For a simpler initial Git setup, run the Node app directly with your existing host credentials. Mounting a clone does not automatically share host credential helpers.

`talk.json` includes preparation notes and narrative: anyone with repository access can read them. Exported slideshow HTML contains only slide content.

## Publishing

Choose a destination in Settings. **Export** downloads a standalone keyboard-navigable HTML slideshow (arrow keys / Page Up / Page Down / space). Inline HTML/CSS and embedded images work; remote images require network access.

**GitHub:** enable Pages deployment from branch `talkies-pages`, root directory, in the talk repository settings. Publish pushes only `index.html` and `.nojekyll` to that branch. Private talks are blocked from this destination. The application does not change repository visibility or Pages settings.

**Internal GitLab:** Publish pushes the slideshow and a `.gitlab-ci.yml` Pages job to `talkies-pages`. Your GitLab installation must support Pages and CI runners, and permit this branch's pipeline. Confirm Pages access controls with your administrator; a private repository alone is not a guarantee of private Pages. Use export for an internal web server when Pages is unavailable.

Publishing requires committed changes. Set the published URL in Settings to expose the link after pushing. The UI reports a branch push, not verified deployment success. No force push is used; simultaneous publisher conflicts fail safely. Publishing runs only on explicit click.

## Copilot CLI (optional)

Install and authenticate Copilot CLI on the host using your approved account. The bridge invokes `copilot -p PROMPT` without blanket tool permissions. It uses the CLI's normal policy and returns JSON proposals for review. Preparation notes and narrative are included in the agent prompt. Disable AI in Settings for restricted talks.

```sh
export TALKIES_BRIDGE_TOKEN="$(openssl rand -hex 32)"
npm run bridge
```

For Docker, run the bridge with a host bind reachable by Docker, e.g. `TALKIES_BRIDGE_BIND=0.0.0.0 npm run bridge`, and start Compose in a terminal with the **same** token. Limit port 4319 to your local Docker network using your host firewall. The default bridge bind is loopback. When running the app directly, set `TALKIES_BRIDGE_URL=http://127.0.0.1:4319/run` and the same token. Set `TALKIES_AGENT_CWD` to an empty directory to avoid unrelated repository context.

AI results never apply automatically. Preview the slide/narrative proposal, apply explicitly, track findings, or attach research leads. Sources remain unverified until you mark them verified. If the bridge is unavailable, **Prepare external agent task** produces a copyable context package for an approved agent. Tool-dependent research may need manual CLI interaction/permissions; the app does not invent fallback findings.

## Current boundaries

- Issues are stored in the talk repository; native GitHub/GitLab issue synchronization is not yet implemented.
- External agent handoff is a copyable task; automated worker queues and isolated worktrees are not implemented.
- Existing Marp deck import, multi-project picker, speaker recording, narrative export, deployment polling, and conflict resolution UI are follow-up work.
- Live preview and export use the same Marp renderer; scripts are disabled in preview. Use CSS animations for slide effects.
- This is a localhost single-author app, not a multi-user network service.

## Development

`npm test` covers export privacy, stable identity validation, persistence, request-origin protection, disabled AI, Git commits, and repeat publishing against a temporary bare Git remote. Tests do not publish externally. `npm run bridge` starts the host bridge; `npm start` starts the UI/API.

## Distraction-free writing and shortcuts

Use the expand icon in the top-right corner of Slide Markdown, Thought Process, Narrative, Live Preview, or the AI workspace to fill the window with that component. Click the icon again or press Escape to restore the workspace. Existing text, cursor selection, and autosave stay intact. Preview focus includes previous/next controls and arrow-key navigation. This is a window-filling layout, so it works without browser fullscreen permissions.

Use **⌘ on Mac** or **Ctrl on Windows/Linux**, plus **Alt / Option**:

| Shortcut | Action |
| --- | --- |
| ⌘/Ctrl Alt 1 | Focus Slide Markdown |
| ⌘/Ctrl Alt 2 | Focus Thought Process |
| ⌘/Ctrl Alt 3 | Focus Narrative |
| ⌘/Ctrl Alt 4 | Focus Live Preview |
| ⌘/Ctrl Alt 5 or A | Focus the AI prompt |
| ⌘/Ctrl Alt 6 | Slide + narrative rehearsal |
| ⌘/Ctrl Alt ← / → | Previous / next slide from any editor |
| ⌘/Ctrl Alt 0 or Escape | Exit component focus |
| ⌘/Ctrl Alt / | Shortcut reference |
| ⌘/Ctrl Enter | Run the selected AI task while in the AI workspace |
| ⌘/Ctrl S | Save |

In preview focus, bare arrow keys, Page Up / Down, and space navigate slides. Normal text-editing keys are left intact in writing fields. A **Shortcuts** button opens the reference.

The **Your prompt** field in AI workspace is saved per slide and passed to review, research, draft, rewrite, and the external-agent task package. Pending edits are saved before making the request. Prompts are excluded from HTML exports; like other preparation content, they are visible to people with access to the talk's Git repository.
