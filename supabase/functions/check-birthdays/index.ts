import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting birthday check...');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's month and day
    const today = new Date();
    const todayMonth = today.getMonth() + 1; // 1-12
    const todayDay = today.getDate(); // 1-31

    console.log(`Checking for birthdays on ${todayMonth}/${todayDay}`);

    // Find all profiles with birthday matching today's month and day
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, birthday')
      .not('birthday', 'is', null);

    if (profilesError) throw profilesError;

    console.log(`Found ${profiles?.length || 0} profiles with birthdays set`);

    // Filter profiles with birthday today
    const birthdayProfiles = profiles?.filter(profile => {
      const birthday = new Date(profile.birthday);
      return birthday.getMonth() + 1 === todayMonth && birthday.getDate() === todayDay;
    }) || [];

    console.log(`Found ${birthdayProfiles.length} birthday(s) today`);

    if (birthdayProfiles.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No birthdays today', checked: profiles?.length || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // For each birthday person, find their teams and add birthday topics
    const results = [];
    
    for (const profile of birthdayProfiles) {
      console.log(`Processing birthday for ${profile.first_name} ${profile.last_name}`);

      // Find teams this person is a member of
      const { data: teamMembers, error: teamError } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', profile.id);

      if (teamError) {
        console.error('Error fetching teams:', teamError);
        continue;
      }

      console.log(`Found ${teamMembers?.length || 0} teams for ${profile.first_name}`);

      for (const member of teamMembers || []) {
        // Get or create this week's meeting instance (Monday start)
        const weekStart = new Date(today);
        const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days to subtract to get to Monday
        weekStart.setDate(today.getDate() - daysToMonday);
        const weekStartStr = weekStart.toISOString().split('T')[0];

        // Find a recurring meeting for this team
        const { data: recurringMeeting, error: recurringError } = await supabase
          .from('recurring_meetings')
          .select('id')
          .eq('team_id', member.team_id)
          .eq('frequency', 'weekly')
          .maybeSingle();

        if (recurringError || !recurringMeeting) {
          console.error('Error finding recurring meeting:', recurringError);
          continue;
        }

        // Get or create meeting instance for this week
        const { data: meetingInstance, error: instanceError } = await supabase
          .from('meeting_instances')
          .select('id')
          .eq('recurring_meeting_id', recurringMeeting.id)
          .eq('start_date', weekStartStr)
          .maybeSingle();

        let meetingId;
        if (!meetingInstance) {
          // Create meeting instance if it doesn't exist
          const { data: newInstance, error: createError } = await supabase
            .from('meeting_instances')
            .insert({ 
              recurring_meeting_id: recurringMeeting.id, 
              start_date: weekStartStr 
            })
            .select('id')
            .single();

          if (createError) {
            console.error('Error creating meeting instance:', createError);
            continue;
          }
          meetingId = newInstance.id;
        } else {
          meetingId = meetingInstance.id;
        }

        // Check if birthday topic already exists for this person this week
        const { data: existingTopic } = await supabase
          .from('meeting_instance_topics')
          .select('id')
          .eq('instance_id', meetingId)
          .ilike('title', `%${profile.first_name}%birthday%`)
          .maybeSingle();

        if (existingTopic) {
          console.log('Birthday topic already exists, skipping');
          continue;
        }

        // Get next order index
        const { data: lastItem } = await supabase
          .from('meeting_instance_topics')
          .select('order_index')
          .eq('instance_id', meetingId)
          .order('order_index', { ascending: false })
          .limit(1)
          .maybeSingle();

        const nextOrder = lastItem ? lastItem.order_index + 1 : 0;

        // Create birthday topic
        const birthdayEmojis = ['🎂', '🎉', '🎈', '🥳', '🎁'];
        const randomEmoji = birthdayEmojis[Math.floor(Math.random() * birthdayEmojis.length)];
        
        const { error: topicError } = await supabase
          .from('meeting_instance_topics')
          .insert({
            instance_id: meetingId,
            title: `${randomEmoji} ${profile.first_name}'s Birthday!`,
            notes: `Today is ${profile.first_name} ${profile.last_name}'s birthday! Let's take a moment to celebrate.`,
            time_minutes: 2,
            order_index: nextOrder,
            created_by: profile.id,
          });

        if (topicError) {
          console.error('Error creating birthday topic:', topicError);
        } else {
          console.log(`Created birthday topic for ${profile.first_name}`);
          results.push({ name: `${profile.first_name} ${profile.last_name}`, team_id: member.team_id });
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Birthday check complete',
        birthdays: results.length,
        details: results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in birthday check:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});