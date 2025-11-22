import 'dotenv/config';
import bolt from '@slack/bolt';
const { App, LogLevel } = bolt;
import cron from 'node-cron';
import { createClient } from '@supabase/supabase-js';

// Validate required env vars
const requiredEnv = ['SLACK_APP_TOKEN', 'SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'];
const missing = requiredEnv.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
if (missing.length) {
  console.error(`Missing required env vars: ${missing.join(', ')}`);
  console.error('Create a .env (or set env) based on slack-bot/.env.example');
  process.exit(1);
}

// Supabase client (service role for server-side inserts)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const app = new App({
  appToken: process.env.SLACK_APP_TOKEN, // xapp-...
  token: process.env.SLACK_BOT_TOKEN,    // xoxb-...
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  logLevel: LogLevel.INFO
});

// Helper: choose a channel to post to (prefers DEFAULT, falls back to TEST)
function resolveDefaultChannel() {
  return process.env.SLACK_DEFAULT_CHANNEL_ID || process.env.SLACK_TEST_CHANNEL_ID;
}

async function getSlackUserEmail(client, userId) {
  try {
    const info = await client.users.info({ user: userId });
    return info?.user?.profile?.email || null;
  } catch {
    return null;
  }
}

async function resolveProfileByEmail(email) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', email)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function fetchTargetsForUser(userId) {
  if (!supabase) return { dos: [], sis: [], tasks: [] };
  const [dosRes, ownerSisRes, participantSisRes, tasksRes] = await Promise.all([
    supabase.from('rc_defining_objectives').select('id, title').eq('owner_user_id', userId).order('title', { ascending: true }),
    supabase.from('rc_strategic_initiatives').select('id, title').eq('owner_user_id', userId).order('title', { ascending: true }),
    supabase.from('rc_strategic_initiatives').select('id, title, participant_user_ids').contains('participant_user_ids', [userId]).order('title', { ascending: true }),
    supabase.from('rc_tasks').select('id, title, strategic_initiative_id').eq('owner_user_id', userId).order('title', { ascending: true })
  ]);
  const dos = dosRes.data || [];
  const ownerSis = ownerSisRes.data || [];
  const participantSis = (participantSisRes.data || []).filter(Boolean);
  // de-dup SIs by id
  const siMap = new Map();
  [...ownerSis, ...participantSis].forEach((s) => { if (!siMap.has(s.id)) siMap.set(s.id, { id: s.id, title: s.title }); });
  
  // Fetch SI titles for tasks
  const taskSiIds = Array.from(new Set((tasksRes.data || []).map(t => t.strategic_initiative_id)));
  const siTitlesMap = new Map();
  if (taskSiIds.length) {
    const { data: siData } = await supabase
      .from('rc_strategic_initiatives')
      .select('id, title')
      .in('id', taskSiIds);
    (siData || []).forEach((si) => {
      siTitlesMap.set(si.id, si.title);
    });
  }
  
  // Format tasks with SI context
  const tasks = (tasksRes.data || []).map((t) => {
    const siTitle = siTitlesMap.get(t.strategic_initiative_id) || 'Unknown SI';
    return {
      id: t.id,
      title: t.title,
      siTitle: siTitle,
      displayText: `${t.title} (SI: ${siTitle})`
    };
  });
  
  return { dos, sis: Array.from(siMap.values()), tasks };
}

function buildCheckinModalBlocks(targetOptions, reporterName) {
  const today = new Date().toISOString().slice(0, 10);
  const doOptions = targetOptions.dos.map((d) => ({ text: { type: 'plain_text', text: d.title.slice(0, 75) }, value: `do:${d.id}` }));
  const siOptions = targetOptions.sis.map((s) => ({ text: { type: 'plain_text', text: s.title.slice(0, 75) }, value: `initiative:${s.id}` }));
  const taskOptions = targetOptions.tasks.map((t) => ({ text: { type: 'plain_text', text: t.displayText.slice(0, 75) }, value: `task:${t.id}` }));
  const option_groups = [];
  if (doOptions.length) option_groups.push({ label: { type: 'plain_text', text: 'Defining Objectives' }, options: doOptions });
  if (siOptions.length) option_groups.push({ label: { type: 'plain_text', text: 'Strategic Initiatives' }, options: siOptions });
  if (taskOptions.length) option_groups.push({ label: { type: 'plain_text', text: 'Tasks' }, options: taskOptions });

  return [
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Reporter: *${reporterName || 'Unknown'}*` }] },
    {
      type: 'input', block_id: 'target', label: { type: 'plain_text', text: 'Target (DO, SI, or Task)' },
      element: option_groups.length ? { type: 'static_select', action_id: 'val', option_groups } : { type: 'static_select', action_id: 'val', options: [] }
    },
    {
      type: 'input', block_id: 'date', label: { type: 'plain_text', text: 'Check-in Date' },
      element: { type: 'datepicker', action_id: 'val', initial_date: today }
    },
    {
      type: 'input', block_id: 'comment', optional: true, label: { type: 'plain_text', text: 'Comment Update' },
      element: { type: 'plain_text_input', action_id: 'val', multiline: true }
    },
    {
      type: 'input', block_id: 'results', optional: true, label: { type: 'plain_text', text: 'Results Update' },
      element: { type: 'plain_text_input', action_id: 'val', multiline: true }
    },
    {
      type: 'input', block_id: 'percent', optional: true, label: { type: 'plain_text', text: '% to Goal (0-100)' },
      element: { type: 'plain_text_input', action_id: 'val' }
    },
    {
      type: 'input', block_id: 'sentiment', label: { type: 'plain_text', text: 'Color Code' },
      element: {
        type: 'static_select', action_id: 'val',
        options: [
          { text: { type: 'plain_text', text: 'Very Happy' }, value: '2' },
          { text: { type: 'plain_text', text: 'Happy' }, value: '1' },
          { text: { type: 'plain_text', text: 'Neutral' }, value: '0' },
          { text: { type: 'plain_text', text: 'Unhappy' }, value: '-1' },
          { text: { type: 'plain_text', text: 'Very Unhappy' }, value: '-2' },
        ]
      }
    },
    {
      type: 'input',
      block_id: 'share',
      optional: true,
      label: { type: 'plain_text', text: 'Share to Slack channel' },
      element: {
        type: 'checkboxes',
        action_id: 'val',
        options: [
          { text: { type: 'plain_text', text: 'Post full check-in to the default channel after saving' }, value: 'post' }
        ]
      }
    }
  ];
}

// /checkin -> open modal mirroring the web form and persisting to Supabase
app.command('/checkin', async ({ ack, client, body, command }) => {
  await ack();

  // Resolve Slack user -> email -> Supabase profile
  let email = await getSlackUserEmail(client, body.user_id);
  let profile = email ? await resolveProfileByEmail(email) : null;

  if (!email || !profile) {
    await client.respond({
      response_type: 'ephemeral',
      text: 'I could not map your Slack user to a Tactical Sync profile. Make sure your Slack email matches your Tactical Sync email, then try again.',
    });
    return;
  }

  const { dos, sis, tasks } = await fetchTargetsForUser(profile.id);
  const blocks = buildCheckinModalBlocks({ dos, sis, tasks }, profile.full_name || email);

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'checkin_modal_v2',
      title: { type: 'plain_text', text: 'Check-in' },
      submit: { type: 'plain_text', text: 'Submit' },
      private_metadata: JSON.stringify({ reporter_id: profile.id }),
      blocks
    }
  });
});

// Handle modal submission -> insert into Supabase and optionally post full content
app.view('checkin_modal_v2', async ({ ack, body, view, client }) => {
  await ack();
  if (!supabase) return;

  const vals = view.state.values;
  const meta = JSON.parse(view.private_metadata || '{}');
  const reporterId = meta.reporter_id;

  // Extract values
  const targetSel = vals?.target?.val?.selected_option;
  const targetVal = targetSel?.value || '';
  const targetText = targetSel?.text?.text || '';
  const [parent_type, parent_id] = targetVal.split(':');
  const date = vals?.date?.val?.selected_date || new Date().toISOString().slice(0, 10);
  const comment = vals?.comment?.val?.value || '';
  const results = vals?.results?.val?.value || '';
  const percentStr = vals?.percent?.val?.value || '';
  const percent_to_goal = percentStr.trim() ? Math.min(100, Math.max(0, parseInt(percentStr.trim(), 10))) : null;
  const sentimentVal = vals?.sentiment?.val?.selected_option?.value || '0';
  const sentiment = parseInt(sentimentVal, 10);
  const shareSelected = Array.isArray(vals?.share?.val?.selected_options) && vals.share.val.selected_options.some(o => o.value === 'post');

  if (!parent_type || !parent_id) {
    await client.respond({ response_type: 'ephemeral', text: 'Please select a target DO, SI, or Task.' });
    return;
  }

  // Validate parent_type
  if (!['do', 'initiative', 'task'].includes(parent_type)) {
    await client.respond({ response_type: 'ephemeral', text: 'Invalid target type. Please select a DO, SI, or Task.' });
    return;
  }

  // Insert check-in
  const { error } = await supabase.from('rc_checkins').insert({
    parent_type,
    parent_id,
    date,
    summary: comment.trim() || null,
    next_steps: results.trim() || null,
    sentiment,
    percent_to_goal,
    created_by: reporterId,
  });

  if (error) {
    await client.respond({ response_type: 'ephemeral', text: `Failed to save check-in: ${error.message}` });
    return;
  }

  // Optionally post full content to channel
  if (shareSelected) {
    const channel = resolveDefaultChannel();
    if (channel) {
      const moodLabel = ({ '2': 'Very Happy', '1': 'Happy', '0': 'Neutral', '-1': 'Unhappy', '-2': 'Very Unhappy' })[sentimentVal] || 'Neutral';
      const contentBlocks = [
        { type: 'section', text: { type: 'mrkdwn', text: `*Check-in from <@${body.user.id}>*` } },
        { type: 'section', text: { type: 'mrkdwn', text: `*Target:* ${targetText || '` + "`" + `' + parent_type + ':' + parent_id + '` + "`" + `'} • *Date:* ${date}` } },
        ...(comment.trim() ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Comment*\n${comment.trim()}` } }] : []),
        ...(results.trim() ? [{ type: 'section', text: { type: 'mrkdwn', text: `*Results*\n${results.trim()}` } }] : []),
        {
          type: 'context', elements: [
            { type: 'mrkdwn', text: `*% to Goal:* ${typeof percent_to_goal === 'number' ? percent_to_goal + '%' : '—'}` },
            { type: 'mrkdwn', text: `*Mood:* ${moodLabel}` }
          ]
        }
      ];
      await client.chat.postMessage({ channel, text: `New check-in from <@${body.user.id}>`, blocks: contentBlocks });
    }
  }

  await client.respond({ response_type: 'ephemeral', text: '✅ Check-in saved. It will appear in Tactical Sync.' });
});

// /ask -> ephemeral stub (wire to your agent later)
app.command('/ask', async ({ ack, respond, command }) => {
  await ack();
  await respond({
    response_type: 'ephemeral',
    text: `Got it: "${command.text}". I’ll ask the agent and reply here.`,
  });
  // TODO: call your agent, then respond in thread or ephemeral
});

// app mentions -> reply in thread
app.event('app_mention', async ({ event, client }) => {
  await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.ts,
    text: `Hi <@${event.user}>! Try /checkin or /ask.`
  });
});

// DMs -> treat as /ask for now
app.message(async ({ message, client }) => {
  if (message.channel_type !== 'im' || message.subtype) return;
  await client.chat.postMessage({
    channel: message.channel,
    text: `You said: "${message.text}". Try /ask for agent Q&A.`
  });
});

// Optional: simple scheduler using cron (server-local). For production, consider external scheduler or queue.
const cronExpr = process.env.SLACK_SCHEDULE_CRON; // e.g., "0 9 * * 1-5" for 09:00 Mon-Fri
if (cronExpr) {
  const tz = process.env.TZ || 'UTC';
  console.log(`Scheduling posts with CRON="${cronExpr}" TZ="${tz}"`);
  cron.schedule(cronExpr, async () => {
    try {
      const channel = resolveDefaultChannel();
      if (!channel) return;
      const text = process.env.SLACK_SCHEDULE_TEXT || 'Reminder: Daily check-in. Use /checkin to submit.';
      await app.client.chat.postMessage({ channel, text });

      // Optional: DM a specific user if provided (must be a Slack user ID like U123...)
      const userId = process.env.SLACK_SCHEDULE_DM_USER_ID;
      if (userId) {
        const im = await app.client.conversations.open({ users: userId });
        await app.client.chat.postMessage({ channel: im.channel.id, text });
      }
    } catch (err) {
      console.error('Scheduled post failed:', err);
    }
  }, { timezone: tz });
}

(async () => {
  await app.start();
  console.log('⚡️ Slack Socket Mode app is running');
})();
