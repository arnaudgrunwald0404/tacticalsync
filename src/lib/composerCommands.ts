// ── Composer slash commands ───────────────────────────────────────────────────
//
// Typing "/" in the item composer (AgentBar) opens a Slack-style command
// picker. Selecting a command consumes the token from the text and attaches
// the command to the pending item; its effect is applied to the item's create
// options on submit. Add new commands by appending to COMPOSER_COMMANDS —
// detection, the dropdown, pills, and option merging all key off this list.

/** Options a slash command can set on the item being composed. Threaded from
 *  the composer through onAddItem into useInboxItems.addItem. */
export interface ComposerItemOptions {
  pinned?: boolean;
}

export interface ComposerCommand {
  /** Token typed after the slash, e.g. 'pin' for /pin. Lowercase, no spaces. */
  token: string;
  /** Short explanation shown under the command in the picker. */
  description: string;
  /** Merge this command's effect into the pending item options. */
  apply: (options: ComposerItemOptions) => ComposerItemOptions;
}

export const COMPOSER_COMMANDS: ComposerCommand[] = [
  {
    token: 'pin',
    description: 'Pin the item to the top of your list',
    apply: options => ({ ...options, pinned: true }),
  },
];

export function filterCommands(query: string, commands: ComposerCommand[] = COMPOSER_COMMANDS): ComposerCommand[] {
  const q = query.toLowerCase();
  return commands.filter(c => c.token.startsWith(q));
}

/** Fold a set of selected commands into the final create options. */
export function applyCommands(commands: ComposerCommand[]): ComposerItemOptions {
  return commands.reduce((options, cmd) => cmd.apply(options), {} as ComposerItemOptions);
}
