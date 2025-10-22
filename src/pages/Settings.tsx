import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Edit2, Trash2, GripVertical, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import GridBackground from "@/components/ui/grid-background";
import SettingsNavbar from "@/components/ui/settings-navbar";
import Logo from "@/components/Logo";

interface TemplateItem {
  id: string;
  title: string;
  duration_minutes: number;
  order_index: number;
  isEditing?: boolean;
  editTitle?: string;
  editDuration?: number;
}

interface Template {
  id: string;
  name: string;
  description?: string;
  is_system?: boolean;
  items?: TemplateItem[];
}

const Settings = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [activeSection, setActiveSection] = useState("agenda-templates");
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDuration, setNewItemDuration] = useState(5);
  const [saving, setSaving] = useState(false);
  
  // Testing mode state
  const [userEmail, setUserEmail] = useState("");
  const [testingMode, setTestingMode] = useState<"admin" | "member">("admin");
  const [switchingRole, setSwitchingRole] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      
      // Get user email for testing mode check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      setUserEmail(user.email || "");

      // Check if user is superadmin first
      const isSuperAdmin = user.email === "agrunwald@clearcompany.com";
      
      if (!isSuperAdmin) {
        // Check if user is an admin on any team
        const { data: teamMemberships, error: membershipError } = await supabase
          .from("team_members")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin");

        if (membershipError) throw membershipError;

        // If user is not an admin on any team, redirect to dashboard
        if (!teamMemberships || teamMemberships.length === 0) {
          toast({
            title: "Access Denied",
            description: "You need admin privileges to access settings",
            variant: "destructive",
          });
          navigate("/dashboard");
          return;
        }
      }
      
      await fetchTemplates();
      setLoading(false);
    } catch (error: unknown) {
      console.error("Error checking auth:", error);
      toast({
        title: "Error",
        description: "Failed to verify access permissions",
        variant: "destructive",
      });
      navigate("/dashboard");
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch user's own templates AND system templates
      const { data: templatesData, error } = await supabase
        .from("agenda_templates")
        .select(`
          *,
          items:agenda_template_items(*)
        `)
        .or(`user_id.eq.${user.id},is_system.eq.true`)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching templates:", error);
        toast({
          title: "Error loading templates",
          description: error instanceof Error ? error.message : "An error occurred",
          variant: "destructive",
        });
        return;
      }

      // Sort items by order_index and sort templates (user templates first, then system)
      const templatesWithSortedItems = (templatesData || [])
        .map(template => ({
          ...template,
          items: (template.items || []).sort((a: TemplateItem, b: TemplateItem) => a.order_index - b.order_index),
        }))
        .sort((a: Template, b: Template) => {
          // User templates first (is_system = false), then system templates
          if (a.is_system === b.is_system) return 0;
          return a.is_system ? 1 : -1;
        });

      setTemplates(templatesWithSortedItems);
    } catch (error: unknown) {
      console.error("Error in fetchTemplates:", error);
    }
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateItems([]);
    setShowTemplateDialog(true);
  };

  const handleEditTemplate = (template: Template) => {
    // Check if user is trying to edit a system template without superadmin privileges
    if ((template as any).is_system && !isSuperAdmin) {
      toast({
        title: "Access Denied",
        description: "Only superadmin can edit system templates",
        variant: "destructive",
      });
      return;
    }
    
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateItems(template.items || []);
    setShowTemplateDialog(true);
  };

  const handleAddItem = () => {
    if (!newItemTitle.trim()) {
      toast({
        title: "Item title required",
        description: "Please enter a title for the agenda item",
        variant: "destructive",
      });
      return;
    }

    const newItem: TemplateItem = {
      id: crypto.randomUUID(),
      title: newItemTitle,
      duration_minutes: newItemDuration,
      order_index: templateItems.length,
    };

    setTemplateItems([...templateItems, newItem]);
    setNewItemTitle("");
    setNewItemDuration(5);
  };

  const handleRemoveItem = (itemId: string) => {
    const updatedItems = templateItems
      .filter(item => item.id !== itemId)
      .map((item, index) => ({ ...item, order_index: index }));
    setTemplateItems(updatedItems);
  };

  const handleMoveItem = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === templateItems.length - 1)
    ) {
      return;
    }

    const newItems = [...templateItems];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    [newItems[index], newItems[swapIndex]] = [newItems[swapIndex], newItems[index]];
    
    const reorderedItems = newItems.map((item, idx) => ({
      ...item,
      order_index: idx,
    }));
    
    setTemplateItems(reorderedItems);
  };

  const handleEditItem = (itemId: string) => {
    const updatedItems = templateItems.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            isEditing: true, 
            editTitle: item.title, 
            editDuration: item.duration_minutes 
          }
        : { ...item, isEditing: false }
    );
    setTemplateItems(updatedItems);
  };

  const handleSaveItemEdit = (itemId: string) => {
    const updatedItems = templateItems.map(item => {
      if (item.id === itemId && item.isEditing) {
        const title = item.editTitle?.trim();
        const duration = item.editDuration;
        
        if (!title || !duration || duration < 1) {
          toast({
            title: "Invalid input",
            description: "Please enter a valid title and duration",
            variant: "destructive",
          });
          return item;
        }
        
        return {
          ...item,
          title,
          duration_minutes: duration,
          isEditing: false,
          editTitle: undefined,
          editDuration: undefined,
        };
      }
      return item;
    });
    setTemplateItems(updatedItems);
  };

  const handleCancelItemEdit = (itemId: string) => {
    const updatedItems = templateItems.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            isEditing: false, 
            editTitle: undefined, 
            editDuration: undefined 
          }
        : item
    );
    setTemplateItems(updatedItems);
  };

  const handleUpdateEditField = (itemId: string, field: 'title' | 'duration', value: string | number) => {
    const updatedItems = templateItems.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            [field === 'title' ? 'editTitle' : 'editDuration']: value 
          }
        : item
    );
    setTemplateItems(updatedItems);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: "Template name required",
        description: "Please enter a name for the template",
        variant: "destructive",
      });
      return;
    }

    if (templateItems.length === 0) {
      toast({
        title: "Add at least one item",
        description: "Please add at least one agenda item to the template",
        variant: "destructive",
      });
      return;
    }

    // Check if any items are currently being edited
    const hasEditingItems = templateItems.some(item => item.isEditing);
    if (hasEditingItems) {
      toast({
        title: "Finish editing items",
        description: "Please finish editing all items before saving the template",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (editingTemplate) {
        // Update existing template
        const { error: templateError } = await supabase
          .from("agenda_templates")
          .update({
            name: templateName,
          })
          .eq("id", editingTemplate.id);

        if (templateError) throw templateError;

        // Delete existing items
        const { error: deleteError } = await supabase
          .from("agenda_template_items")
          .delete()
          .eq("template_id", editingTemplate.id);

        if (deleteError) throw deleteError;

        // Insert new items
        const itemsToInsert = templateItems.map(item => ({
          template_id: editingTemplate.id,
          title: item.title,
          duration_minutes: item.duration_minutes,
          order_index: item.order_index,
        }));

        const { error: itemsError } = await supabase
          .from("agenda_template_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Template updated",
          description: `${templateName} has been updated successfully`,
        });
      } else {
        // Create new template
        const { data: newTemplate, error: templateError } = await supabase
          .from("agenda_templates")
          .insert({
            user_id: user.id,
            name: templateName,
          })
          .select()
          .single();

        if (templateError) throw templateError;

        // Insert items
        const itemsToInsert = templateItems.map(item => ({
          template_id: newTemplate.id,
          title: item.title,
          duration_minutes: item.duration_minutes,
          order_index: item.order_index,
        }));

        const { error: itemsError } = await supabase
          .from("agenda_template_items")
          .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        toast({
          title: "Template created",
          description: `${templateName} has been created successfully`,
        });
      }

      setShowTemplateDialog(false);
      await fetchTemplates();
    } catch (error: unknown) {
      toast({
        title: "Error saving template",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(null);

  const handleDeleteTemplate = async (template: Template) => {
    // Check if user is trying to delete a system template without superadmin privileges
    if ((template as any).is_system && !isSuperAdmin) {
      toast({
        title: "Access Denied",
        description: "Only superadmin can delete system templates",
        variant: "destructive",
      });
      return;
    }
    
    setTemplateToDelete(template);
  };

  const confirmDeleteTemplate = async () => {
    if (!templateToDelete) return;

    try {
      const { error } = await supabase
        .from("agenda_templates")
        .delete()
        .eq("id", templateToDelete.id);

      if (error) throw error;

      toast({
        title: "Template deleted",
        description: `${templateToDelete.name} has been deleted`,
      });

      await fetchTemplates();
    } catch (error: unknown) {
      toast({
        title: "Error deleting template",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setTemplateToDelete(null);
    }
  };

  const getTotalDuration = (items: TemplateItem[]) => {
    return items.reduce((total, item) => total + item.duration_minutes, 0);
  };

  const handleSwitchRole = async () => {
    setSwitchingRole(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newRole = testingMode === "admin" ? "member" : "admin";

      // Get all teams where user is a member
      const { data: memberships, error: fetchError } = await supabase
        .from("team_members")
        .select("id, team_id, role")
        .eq("user_id", user.id);

      if (fetchError) throw fetchError;

      if (!memberships || memberships.length === 0) {
        toast({
          title: "No teams found",
          description: "You are not a member of any teams",
          variant: "destructive",
        });
        return;
      }

      // Update all memberships to new role
      const { error: updateError } = await supabase
        .from("team_members")
        .update({ role: newRole })
        .eq("user_id", user.id);

      if (updateError) throw updateError;

      setTestingMode(newRole);
      toast({
        title: "Role switched successfully",
        description: `You are now a ${newRole} on all ${memberships.length} team(s)`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error switching role",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setSwitchingRole(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const isTestUser = userEmail === "agrunwald@clearcompany.com";
  const isSuperAdmin = userEmail === "agrunwald@clearcompany.com";

  return (
    <GridBackground inverted className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Logo variant="minimal" size="lg" />
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>

          </div>
        </div>
      </header>
      
      <SettingsNavbar 
        activeSection={activeSection} 
        onSectionChange={setActiveSection}
        userEmail={userEmail}
      />

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {activeSection === "testing-mode" && isTestUser ? (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold mb-2">🧪 Testing Mode</h2>
                <p className="text-muted-foreground">
                  Switch between admin and member roles on all teams for testing purposes
                </p>
              </div>
            </div>

            <Card className="border-orange-200 bg-orange-50/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span className="text-2xl">⚠️</span>
                  Role Switcher
                </CardTitle>
                <CardDescription>
                  This feature is only available for testing purposes and will change your role on ALL teams you're a member of.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
                  <div>
                    <div className="font-semibold">Current Role</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      You are currently set as: <span className="font-bold text-primary">{testingMode}</span>
                    </div>
                  </div>
                  <Button
                    onClick={handleSwitchRole}
                    disabled={switchingRole}
                    variant="outline"
                    size="lg"
                  >
                    {switchingRole ? "Switching..." : `Switch to ${testingMode === "admin" ? "Member" : "Admin"}`}
                  </Button>
                </div>
                
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-900">
                    <strong>Note:</strong> Switching roles will immediately change your permissions on all teams. 
                    You may need to refresh pages to see the updated UI based on your new role.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold mb-2">Agenda Templates</h2>
                <p className="text-muted-foreground">
                  Create reusable agenda templates for your meetings
                </p>
              </div>
              <Button onClick={handleCreateTemplate}>
                <Plus className="h-4 w-4 mr-2" />
                Create Template
              </Button>
            </div>

          <div className="grid gap-4 md:grid-cols-2">
            {templates.length === 0 ? (
              <Card className="col-span-2 border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-muted-foreground mb-4">No templates yet</p>
                  <Button onClick={handleCreateTemplate} variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              templates.map((template) => (
                <Card key={template.id} className={`hover:shadow-lg transition-all ${(template as any).is_system ? 'border-primary/30 bg-primary/5' : ''}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {template.name}
                          {(template as any).is_system && (
                            <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-1 rounded-full">
                              System
                            </span>
                          )}
                        </CardTitle>
                        {(template as any).description && (
                          <p className="text-sm text-muted-foreground mt-1">{(template as any).description}</p>
                        )}
                      </div>
                      {(!(template as any).is_system || isSuperAdmin) && (
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditTemplate(template)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTemplate(template)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        {template.items?.length || 0} item{template.items?.length !== 1 ? 's' : ''} · {getTotalDuration(template.items || [])} minutes total
                      </div>
                      {template.items && template.items.length > 0 && (
                        <div className="space-y-1 text-sm">
                          {template.items.map((item) => (
                            <div key={item.id} className="flex justify-between text-muted-foreground">
                              <span className="truncate flex-1">{item.title}</span>
                              <span className="ml-2">{item.duration_minutes}m</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!templateToDelete} onOpenChange={(open) => !open && setTemplateToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{templateToDelete?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTemplateToDelete(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteTemplate}
            >
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Edit Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription>
              Create a reusable agenda template for your meetings
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="templateName">Template Name</Label>
              <Input
                id="templateName"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Weekly Tactical, Monthly Review"
              />
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-3">Agenda Items</h4>
              
              {templateItems.length > 0 && (
                <div className="space-y-2 mb-4">
                  {templateItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 p-0 hover:bg-transparent"
                          onClick={() => handleMoveItem(index, "up")}
                          disabled={index === 0 || item.isEditing}
                        >
                          ▲
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 p-0 hover:bg-transparent"
                          onClick={() => handleMoveItem(index, "down")}
                          disabled={index === templateItems.length - 1 || item.isEditing}
                        >
                          ▼
                        </Button>
                      </div>
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      
                      {item.isEditing ? (
                        <div className="flex-1 space-y-2">
                          <Input
                            value={item.editTitle || ''}
                            onChange={(e) => handleUpdateEditField(item.id, 'title', e.target.value)}
                            placeholder="Item title"
                            className="text-sm"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveItemEdit(item.id);
                              } else if (e.key === 'Escape') {
                                handleCancelItemEdit(item.id);
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min="1"
                              max="180"
                              value={item.editDuration || 5}
                              onChange={(e) => handleUpdateEditField(item.id, 'duration', parseInt(e.target.value) || 5)}
                              className="text-sm w-20"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveItemEdit(item.id);
                                } else if (e.key === 'Escape') {
                                  handleCancelItemEdit(item.id);
                                }
                              }}
                            />
                            <span className="text-sm text-muted-foreground">minutes</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1">
                          <div className="font-medium">{item.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {item.duration_minutes} minute{item.duration_minutes !== 1 ? 's' : ''}
                          </div>
                        </div>
                      )}
                      
                      <div className="flex gap-1">
                        {item.isEditing ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSaveItemEdit(item.id)}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelItemEdit(item.id)}
                            >
                              <X className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditItem(item.id)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="text-sm text-muted-foreground text-right">
                    Total duration: {getTotalDuration(templateItems)} minutes
                  </div>
                </div>
              )}

              <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
                <h5 className="text-sm font-medium">Add New Item</h5>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <Label htmlFor="newItemTitle" className="text-xs">Item Title</Label>
                    <Input
                      id="newItemTitle"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="e.g., Team Updates"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
                    />
                  </div>
                  <div>
                    <Label htmlFor="newItemDuration" className="text-xs">Duration (minutes)</Label>
                    <Input
                      id="newItemDuration"
                      type="number"
                      min="1"
                      max="180"
                      value={newItemDuration}
                      onChange={(e) => setNewItemDuration(parseInt(e.target.value) || 5)}
                    />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddItem}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTemplateDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveTemplate}
              disabled={saving || !templateName.trim() || templateItems.length === 0}
            >
              {saving ? "Saving..." : editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </GridBackground>
  );
};

export default Settings;

