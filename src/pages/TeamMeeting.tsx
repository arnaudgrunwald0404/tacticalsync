import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Settings, Plus, Edit2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import MeetingAgenda, { MeetingAgendaRef } from "@/components/meeting/MeetingAgenda";
import MeetingTopics, { MeetingTopicsRef } from "@/components/meeting/MeetingTopics";
import { format, getWeek, addDays, startOfWeek } from "date-fns";
import { getMeetingStartDate, getNextMeetingStartDate, getMeetingPeriodLabel, getISODateString, getMeetingEndDate } from "../lib/dateUtils";
import GridBackground from "@/components/ui/grid-background";
import Logo from "@/components/Logo";

// Removed hardcoded STATIC_AGENDA - meetings should use standing agenda items from team settings

const TeamMeeting = () => {
  const { teamId, meetingId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<any>(null);
  const [recurringMeeting, setRecurringMeeting] = useState<any>(null);
  const [meeting, setMeeting] = useState<any>(null);
  const [allMeetings, setAllMeetings] = useState<any[]>([]);
  const [agendaItems, setAgendaItems] = useState<any[]>([]);
  const [topicItems, setTopicItems] = useState<any[]>([]);
  const [teamAdmin, setTeamAdmin] = useState<any>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [previousMeetingId, setPreviousMeetingId] = useState<string | null>(null);
  const meetingTopicsRef = useRef<MeetingTopicsRef>(null);
  const meetingAgendaRef = useRef<MeetingAgendaRef>(null);
  const [isEditingAgenda, setIsEditingAgenda] = useState(false);

  useEffect(() => {
    if (teamId && meetingId) {
      fetchTeamAndMeeting();
    }
  }, [teamId, meetingId]);

  const fetchTeamAndMeeting = async () => {
    try {
      // Fetch team
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .eq("id", teamId)
        .single();

      if (teamError) throw teamError;
      setTeam(teamData);

      // Fetch recurring meeting
      const { data: recurringData, error: recurringError } = await supabase
        .from("recurring_meetings")
        .select("*")
        .eq("id", meetingId)
        .single();

      if (recurringError) throw recurringError;
      setRecurringMeeting(recurringData);

      // Get or create current period's meeting
      const today = new Date();
      const periodStart = getMeetingStartDate(recurringData.frequency, today);
      const periodStartStr = getISODateString(periodStart);
      
      console.log('Meeting creation debug:', {
        today: today.toISOString().split('T')[0],
        frequency: recurringData.frequency,
        calculatedPeriodStart: periodStartStr,
        periodStartDate: periodStart.toISOString().split('T')[0],
        periodStartObject: periodStart,
        recurringMeetingData: recurringData
      });

      const { data: meetingData, error: meetingError } = await supabase
        .from("weekly_meetings")
        .select("*")
        .eq("recurring_meeting_id", meetingId)
        .eq("week_start_date", periodStartStr)
        .single();

      if (meetingError && meetingError.code === "PGRST116") {
        // Create new meeting
        console.log('Creating new meeting with data:', {
          team_id: teamId,
          recurring_meeting_id: meetingId,
          week_start_date: periodStartStr
        });
        
        const { data: newMeeting, error: createError } = await supabase
          .from("weekly_meetings")
          .insert({ 
            team_id: teamId, 
            recurring_meeting_id: meetingId,
            week_start_date: periodStartStr 
          })
          .select()
          .single();

        if (createError) throw createError;
        meetingData = newMeeting;
        console.log('New meeting created:', newMeeting);

        // New meetings start with empty agenda
        // Users can adopt templates via the Meeting Agenda UI
      } else if (meetingError) {
        throw meetingError;
      }

      console.log('Final meeting data:', meetingData);
      
      // Fetch all meetings first
      await fetchAllMeetings(meetingId);
      
      // After fetching all meetings, determine which meeting to display
      const { data: allMeetingsData } = await supabase
        .from("weekly_meetings")
        .select("*")
        .eq("recurring_meeting_id", meetingId)
        .order("week_start_date", { ascending: false });
      
      let selectedMeeting = meetingData;
      
      if (allMeetingsData && allMeetingsData.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Try to find a meeting that includes today
        const currentMeeting = allMeetingsData.find(m => {
          const [year, month, day] = m.week_start_date.split('-').map(Number);
          const startDate = new Date(year, month - 1, day);
          startDate.setHours(0, 0, 0, 0);
          
          const endDate = getMeetingEndDate(recurringData.frequency, startDate);
          endDate.setHours(23, 59, 59, 999);
          
          return today >= startDate && today <= endDate;
        });
        
        if (currentMeeting) {
          selectedMeeting = currentMeeting;
          console.log('Selected current meeting (today is within its period):', currentMeeting);
        } else {
          // If no meeting includes today, select the most recent one
          selectedMeeting = allMeetingsData[0];
          console.log('Selected most recent meeting:', selectedMeeting);
        }
      }
      
      setMeeting(selectedMeeting);
      await fetchMeetingItems(selectedMeeting.id);
      await fetchTeamAdmin(teamId);
      await fetchCurrentUserRole(teamId);
      updatePreviousMeetingId(selectedMeeting);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamAdmin = async (teamId: string) => {
    try {
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          id,
          role,
          profiles:user_id (
            full_name,
            first_name,
            last_name
          )
        `)
        .eq("team_id", teamId)
        .eq("role", "admin");

      console.log("Admin query result:", { data, error });

      if (!error && data && data.length > 0) {
        setTeamAdmin(data[0]);
        console.log("Team admin set:", data[0]);
      } else {
        console.log("No admin found or error:", error);
      }
    } catch (error: any) {
      console.error("Error fetching team admin:", error);
    }
  };

  const fetchCurrentUserRole = async (teamId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from("team_members")
        .select("role")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .single();

      if (!error && data) {
        setCurrentUserRole(data.role);
      }
    } catch (error: any) {
      console.error("Error fetching current user role:", error);
    }
  };

  const fetchAllMeetings = async (recurringMeetingId: string) => {
    const { data, error } = await supabase
      .from("weekly_meetings")
      .select("*")
      .eq("recurring_meeting_id", recurringMeetingId)
      .order("week_start_date", { ascending: false });

    if (error) {
      console.error("Error fetching meetings:", error);
      return;
    }

    setAllMeetings(data || []);
  };

  const fetchMeetingItems = async (meetingId: string) => {
    const { data, error } = await supabase
      .from("meeting_items")
      .select(`
        *,
        assigned_to_profile:assigned_to(full_name, first_name, last_name, email, avatar_url, avatar_name, red_percentage, blue_percentage, green_percentage, yellow_percentage),
        created_by_profile:created_by(full_name, first_name, last_name, email, avatar_url, avatar_name, red_percentage, blue_percentage, green_percentage, yellow_percentage)
      `)
      .eq("meeting_id", meetingId)
      .order("order_index");

    if (error) {
      console.error("Error fetching items:", error);
      return;
    }

    setAgendaItems(data.filter((item) => item.type === "agenda"));
    setTopicItems(data.filter((item) => item.type === "topic"));
  };


  const formatMeetingPeriodLabel = (weekStartDate: string) => {
    // Fix timezone issue: parse date string safely to avoid UTC conversion
    const [year, month, day] = weekStartDate.split('-').map(Number);
    const startDate = new Date(year, month - 1, day); // month is 0-indexed
    const frequency = recurringMeeting?.frequency || "weekly";
    
    console.log('formatMeetingPeriodLabel debug:', {
      weekStartDate,
      startDate: startDate.toISOString().split('T')[0],
      frequency,
      startDateObject: startDate
    });
    
    const label = getMeetingPeriodLabel(startDate, frequency);
    console.log('Generated label:', label);
    
    return label;
  };

  const handleMeetingChange = async (meetingId: string) => {
    const selectedMeeting = allMeetings.find(m => m.id === meetingId);
    if (selectedMeeting) {
      setMeeting(selectedMeeting);
      await fetchMeetingItems(selectedMeeting.id);
      updatePreviousMeetingId(selectedMeeting);
    }
  };

  const updatePreviousMeetingId = (currentMeeting: any) => {
    if (!allMeetings || allMeetings.length === 0) return;
    
    // Sort meetings by date descending
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(b.week_start_date).getTime() - new Date(a.week_start_date).getTime()
    );
    
    // Find current meeting index
    const currentIndex = sortedMeetings.findIndex(m => m.id === currentMeeting.id);
    
    // If there's a meeting before this one (next in array since sorted desc)
    if (currentIndex >= 0 && currentIndex < sortedMeetings.length - 1) {
      setPreviousMeetingId(sortedMeetings[currentIndex + 1].id);
    } else {
      setPreviousMeetingId(null);
    }
  };

  // Check if current meeting is the most recent one
  const isCurrentMeeting = () => {
    if (!meeting || allMeetings.length === 0) return false;
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(b.week_start_date).getTime() - new Date(a.week_start_date).getTime()
    );
    return meeting.id === sortedMeetings[0].id;
  };

  // Check if current meeting has topics
  const currentMeetingHasTopics = () => {
    return topicItems.length > 0;
  };

  // Check if the meeting period has ended (past meetings)
  const isMeetingPeriodEnded = () => {
    if (!meeting || !recurringMeeting) return false;
    
    // Fix timezone issue: parse date string safely to avoid UTC conversion
    const [year, month, day] = meeting.week_start_date.split('-').map(Number);
    const safeDate = new Date(year, month - 1, day); // month is 0-indexed
    
    const meetingEndDate = getMeetingEndDate(recurringMeeting.frequency, safeDate);
    const today = new Date();
    
    // Set today to end of day for comparison
    today.setHours(23, 59, 59, 999);
    meetingEndDate.setHours(23, 59, 59, 999);
    
    console.log('isMeetingPeriodEnded debug:', {
      meetingStartDate: meeting.week_start_date,
      safeDate: safeDate.toISOString().split('T')[0],
      meetingEndDate: meetingEndDate.toISOString().split('T')[0],
      today: today.toISOString().split('T')[0],
      isEnded: meetingEndDate < today
    });
    
    return meetingEndDate < today;
  };

  // Check if a meeting period is current (today falls within the period)
  const isCurrentMeetingPeriod = (meetingStartDateString: string) => {
    if (!recurringMeeting) return false;
    
    // Fix timezone issue: parse date string safely to avoid UTC conversion
    const [year, month, day] = meetingStartDateString.split('-').map(Number);
    const safeDate = new Date(year, month - 1, day); // month is 0-indexed
    
    // Normalize the start date using the utility function for consistency
    const normalizedStartDate = getMeetingStartDate(recurringMeeting.frequency, safeDate);
    const endDate = getMeetingEndDate(recurringMeeting.frequency, normalizedStartDate);
    const today = new Date();
    
    // Set today to start of day for comparison
    today.setHours(0, 0, 0, 0);
    normalizedStartDate.setHours(0, 0, 0, 0); // Ensure start of day for comparison
    endDate.setHours(23, 59, 59, 999); // Ensure end of day for comparison
    
    console.log('isCurrentMeetingPeriod debug:', {
      meetingStartDateString,
      safeDate: safeDate.toISOString().split('T')[0],
      normalizedStartDate: normalizedStartDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      today: today.toISOString().split('T')[0],
      isCurrent: today >= normalizedStartDate && today <= endDate
    });
    
    return today >= normalizedStartDate && today <= endDate;
  };

  // Check if there's a previous meeting to navigate to
  const hasPreviousMeeting = () => {
    if (!meeting || allMeetings.length <= 1) return false;
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(a.week_start_date).getTime() - new Date(b.week_start_date).getTime()
    );
    const currentIndex = sortedMeetings.findIndex(m => m.id === meeting.id);
    return currentIndex > 0; // There's a meeting before this one
  };

  // Navigate to previous meeting
  const navigateToPreviousMeeting = () => {
    if (!meeting || allMeetings.length === 0) return;
    
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(b.week_start_date).getTime() - new Date(a.week_start_date).getTime()
    );
    
    const currentIndex = sortedMeetings.findIndex(m => m.id === meeting.id);
    if (currentIndex < sortedMeetings.length - 1) {
      const previousMeeting = sortedMeetings[currentIndex + 1];
      handleMeetingChange(previousMeeting.id);
    }
  };

  // Navigate to next meeting or create new one
  const navigateToNextMeeting = async () => {
    if (!meeting || allMeetings.length === 0) return;
    
    const sortedMeetings = [...allMeetings].sort((a, b) => 
      new Date(b.week_start_date).getTime() - new Date(a.week_start_date).getTime()
    );
    
    const currentIndex = sortedMeetings.findIndex(m => m.id === meeting.id);
    
    if (currentIndex > 0) {
      // Navigate to existing next meeting
      const nextMeeting = sortedMeetings[currentIndex - 1];
      handleMeetingChange(nextMeeting.id);
    } else if (currentIndex === 0) {
      // We're at the most recent meeting, create next one
      await createNextMeeting();
    }
  };

  // Create next meeting iteration
  const createNextMeeting = async () => {
    if (!meeting || !recurringMeeting) return;
    
    try {
      // Calculate next meeting start date using proper boundaries
      const currentWeekStart = new Date(meeting.week_start_date);
      const nextWeekStart = getNextMeetingStartDate(recurringMeeting.frequency, currentWeekStart);
      const nextWeekStartStr = getISODateString(nextWeekStart);
      
      // Create new meeting
      const { data: newMeeting, error } = await supabase
        .from("weekly_meetings")
        .insert({
          team_id: teamId,
          recurring_meeting_id: meetingId,
          week_start_date: nextWeekStartStr
        })
        .select()
        .single();

      if (error) throw error;

      // Copy agenda items from current meeting
      const { data: currentItems } = await supabase
        .from("meeting_items")
        .select("*")
        .eq("meeting_id", meeting.id)
        .eq("type", "agenda");

      if (currentItems && currentItems.length > 0) {
        const userId = (await supabase.auth.getUser()).data.user?.id;
        for (let i = 0; i < currentItems.length; i++) {
          const item = currentItems[i];
          await supabase.from("meeting_items").insert({
            meeting_id: newMeeting.id,
            type: "agenda",
            title: item.title,
            order_index: i,
            created_by: userId,
            assigned_to: item.assigned_to,
            time_minutes: item.time_minutes,
          });
        }
      }

      // Refresh meetings and navigate to new one
      await fetchAllMeetings(meetingId);
      await handleMeetingChange(newMeeting.id);

      toast({
        title: "Next meeting created!",
        description: `${formatMeetingPeriodLabel(nextWeekStartStr)} has been created`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to create next meeting",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <GridBackground inverted className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
              <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <div className="container mx-auto px-4 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <Logo variant="minimal" size="lg" />
                    
                    {/* Meeting Title */}
                    <div className="flex-1 text-center">
                      <h1 className="text-2xl font-bold">
                        {recurringMeeting?.name}
                      </h1>
                      {teamAdmin?.profiles && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Team admin: {(() => {
                            const firstName = teamAdmin.profiles.first_name || "";
                            const lastName = teamAdmin.profiles.last_name || "";
                            const fullName = teamAdmin.profiles.full_name || "";
                            
                            // Try first_name + last_name first, fallback to full_name
                            if (firstName && lastName) {
                              const lastInitial = lastName.charAt(0) + ".";
                              return `${firstName} ${lastInitial}`.trim();
                            } else if (fullName) {
                              // Split full_name and use same format
                              const nameParts = fullName.split(" ");
                              const first = nameParts[0] || "";
                              const last = nameParts[nameParts.length - 1] || "";
                              const lastInitial = last ? last.charAt(0) + "." : "";
                              return `${first} ${lastInitial}`.trim();
                            }
                            return "Unknown";
                          })()}
                        </p>
                      )}
                    </div>
                    
                    {currentUserRole === "admin" && (
                      <Button
                        variant="ghost"
                        onClick={() => navigate(`/team/${teamId}/meeting/${meetingId}/settings`)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  {/* Meeting Navigation */}
                  <div className="flex items-center justify-center relative">
                    {/* Back to Home & Previous Button - Left positioned */}
                    <div className="absolute left-0 flex items-center gap-2">
                      <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Home
                      </Button>
                      {meeting && hasPreviousMeeting() && (
                        <Button 
                          variant="outline" 
                          className="border-gray-300 text-gray-600 hover:text-primary hover:border-primary"
                          onClick={() => navigateToPreviousMeeting()}
                        >
                          ← Previous
                        </Button>
                      )}
                    </div>
                    
                    {/* Meeting Period Dropdown - Always centered */}
                    {meeting && allMeetings.length > 0 && (
                      <div className="flex items-center justify-center">
                        <Select value={meeting.id} onValueChange={handleMeetingChange}>
                          <SelectTrigger className={`w-[300px] h-12 font-semibold text-lg ${
                            isCurrentMeetingPeriod(meeting.week_start_date) 
                              ? 'bg-orange-100 border-orange-300 text-orange-800' 
                              : 'bg-gray-100 border-gray-300 text-gray-600'
                          }`}>
                            <SelectValue>
                              {formatMeetingPeriodLabel(meeting.week_start_date)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent className="bg-popover z-50">
                            {allMeetings.map((m) => (
                              <SelectItem 
                                key={m.id} 
                                value={m.id}
                                className={isCurrentMeetingPeriod(m.week_start_date) 
                                  ? 'bg-orange-50 text-orange-800 border-orange-200' 
                                  : 'bg-gray-50 text-gray-600 border-gray-200'
                                }
                              >
                                {formatMeetingPeriodLabel(m.week_start_date)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    
                    {/* Next/Create Next Button - Right positioned */}
                    <div className="absolute right-0">
                      {meeting && (
                        (isCurrentMeeting() && currentMeetingHasTopics()) || 
                        (!isCurrentMeeting() && allMeetings.length > 1)
                      ) && (
                        <Button 
                          variant="outline" 
                          className="border-gray-300 text-gray-600 hover:text-primary hover:border-primary"
                          onClick={() => navigateToNextMeeting()}
                        >
                          {isCurrentMeeting() ? "Create Next →" : "Next →"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Agenda</h2>
            {teamAdmin && currentUserRole === "admin" && (
              <div className="flex items-center gap-2">
                {isEditingAgenda ? (
                  <>
                    <Button 
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        meetingAgendaRef.current?.saveChanges();
                        setIsEditingAgenda(false);
                      }}
                      className="h-7 text-xs"
                    >
                      <Save className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        meetingAgendaRef.current?.cancelEditing();
                        setIsEditingAgenda(false);
                      }}
                      className="h-7 text-xs"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      meetingAgendaRef.current?.startEditing();
                      setIsEditingAgenda(true);
                    }}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Edit2 className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            )}
          </div>
          <MeetingAgenda
            ref={meetingAgendaRef}
            items={agendaItems}
            meetingId={meeting?.id}
            teamId={teamId}
            onUpdate={() => {
              if (meeting?.id) {
                fetchMeetingItems(meeting.id);
              }
            }}
            previousMeetingId={previousMeetingId || undefined}
            currentUserId={currentUserId || undefined}
            isAdmin={currentUserRole === "admin"}
          />
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">Topics</h2>
            {agendaItems.length > 0 && (
              <Button
                onClick={() => meetingTopicsRef.current?.startCreating()}
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                {topicItems.length > 0 ? "Edit Topics" : "Add Topics"}
              </Button>
            )}
          </div>
          <MeetingTopics
            ref={meetingTopicsRef}
            items={topicItems}
            meetingId={meeting?.id}
            teamId={teamId}
            onUpdate={() => fetchMeetingItems(meeting?.id)}
            hasAgendaItems={agendaItems.length > 0}
          />
        </Card>
      </main>
    </GridBackground>
  );
};

export default TeamMeeting;
