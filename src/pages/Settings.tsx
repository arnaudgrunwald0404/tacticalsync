import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Edit2, Trash2, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TemplateItem {
  id: string;
  title: string;
  duration_minutes: number;
  order_index: number;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
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
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateItems, setTemplateItems] = useState<TemplateItem[]>([]);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [newItemDuration, setNewItemDuration] = useState(5);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    await fetchTemplates();
    setLoading(false);
  };

  const fetchTemplates = async () => {
    const { data: templatesData, error } = await supabase
      .from("agenda_templates")
      .select(`
        *,
        items:agenda_template_items(*)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching templates:", error);
      toast({
        title: "Error loading templates",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // Sort items by order_index
    const templatesWithSortedItems = (templatesData || []).map(template => ({
      ...template,
      items: (template.items || []).sort((a: TemplateItem, b: TemplateItem) => a.order_index - b.order_index),
    }));

    setTemplates(templatesWithSortedItems);
  };

  const handleCreateTemplate = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateDescription("");
    setTemplateItems([]);
    setShowTemplateDialog(true);
  };

  const handleEditTemplate = (template: Template) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
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
            description: templateDescription || null,
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
            description: templateDescription || null,
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
    } catch (error: any) {
      toast({
        title: "Error saving template",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: Template) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("agenda_templates")
        .delete()
        .eq("id", template.id);

      if (error) throw error;

      toast({
        title: "Template deleted",
        description: `${template.name} has been deleted`,
      });

      await fetchTemplates();
    } catch (error: any) {
      toast({
        title: "Error deleting template",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getTotalDuration = (items: TemplateItem[]) => {
    return items.reduce((total, item) => total + item.duration_minutes, 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Settings
            </h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
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
                <Card key={template.id} className="hover:shadow-lg transition-all">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        {template.description && (
                          <CardDescription className="mt-1">
                            {template.description}
                          </CardDescription>
                        )}
                      </div>
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
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="text-sm text-muted-foreground">
                        {template.items?.length || 0} item{template.items?.length !== 1 ? 's' : ''} · {getTotalDuration(template.items || [])} minutes total
                      </div>
                      {template.items && template.items.length > 0 && (
                        <div className="space-y-1 text-sm">
                          {template.items.slice(0, 3).map((item) => (
                            <div key={item.id} className="flex justify-between text-muted-foreground">
                              <span className="truncate flex-1">{item.title}</span>
                              <span className="ml-2">{item.duration_minutes}m</span>
                            </div>
                          ))}
                          {template.items.length > 3 && (
                            <div className="text-muted-foreground text-xs">
                              +{template.items.length - 3} more item{template.items.length - 3 !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </main>

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

            <div className="space-y-2">
              <Label htmlFor="templateDescription">Description (Optional)</Label>
              <Textarea
                id="templateDescription"
                value={templateDescription}
                onChange={(e) => setTemplateDescription(e.target.value)}
                placeholder="Brief description of this template..."
                rows={2}
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
                          disabled={index === 0}
                        >
                          ▲
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-4 p-0 hover:bg-transparent"
                          onClick={() => handleMoveItem(index, "down")}
                          disabled={index === templateItems.length - 1}
                        >
                          ▼
                        </Button>
                      </div>
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">{item.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {item.duration_minutes} minute{item.duration_minutes !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
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
    </div>
  );
};

export default Settings;

