import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Link as LinkIcon,
  Unlink
} from 'lucide-react'
import { useState, useEffect } from 'react'

interface RichTextEditorProps {
  content?: string
  onChange?: (content: string) => void
  onBlur?: (content: string) => void
  placeholder?: string
  className?: string
  readOnly?: boolean
}

const RichTextEditor = ({ content = '', onChange, onBlur, placeholder, className = '', readOnly = false }: RichTextEditorProps) => {
  // Clean up empty lines when displaying existing content
  const cleanContent = content ? content.replace(/(<p><\/p>)+/g, '') : content;
  const [isFocused, setIsFocused] = useState(false)
  const [isToolbarHovered, setIsToolbarHovered] = useState(false)
  
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline cursor-pointer',
        },
      }),
    ],
    content: cleanContent,
    editable: true,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    onFocus: () => setIsFocused(true),
    onBlur: ({ editor }) => {
      // Call onBlur callback with current content
      onBlur?.(editor.getHTML())
      
      // Delay hiding toolbar to allow for toolbar interactions
      setTimeout(() => {
        if (!isToolbarHovered) {
          setIsFocused(false)
        }
      }, 150)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[32px] p-2 bg-background',
      },
    },
  })

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && cleanContent !== editor.getHTML()) {
      editor.commands.setContent(cleanContent)
    }
  }, [editor, cleanContent])

  if (!editor) {
    return null
  }

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    // cancelled
    if (url === null) {
      return
    }

    // empty
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    // update link
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className={`relative ${className}`} data-testid="rich-text-editor">
      {/* Floating Toolbar */}
      {(isFocused || isToolbarHovered) && (
        <div 
          className="absolute -top-12 left-0 bg-background border shadow-lg rounded-lg p-2 flex gap-1 z-50"
          onMouseEnter={() => setIsToolbarHovered(true)}
          onMouseLeave={() => setIsToolbarHovered(false)}
        >
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().toggleBold().run()
              // Keep focus after button click
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('bold') ? 'bg-accent' : ''}`}
          >
            <Bold className="h-3 w-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().toggleItalic().run()
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('italic') ? 'bg-accent' : ''}`}
          >
            <Italic className="h-3 w-3" />
          </Button>

          <Separator orientation="vertical" className="h-4" />

          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().toggleBulletList().run()
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('bulletList') ? 'bg-accent' : ''}`}
          >
            <List className="h-3 w-3" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              editor.chain().focus().toggleOrderedList().run()
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('orderedList') ? 'bg-accent' : ''}`}
          >
            <ListOrdered className="h-3 w-3" />
          </Button>

          <Separator orientation="vertical" className="h-4" />

          <Button
            variant="ghost"
            size="sm"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setLink()
              setTimeout(() => editor.commands.focus(), 10)
            }}
            className={`h-8 w-8 p-0 ${editor.isActive('link') ? 'bg-accent' : ''}`}
          >
            <LinkIcon className="h-3 w-3" />
          </Button>
          
          {editor.isActive('link') && (
            <Button
              variant="ghost"
              size="sm"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editor.chain().focus().unsetLink().run()
                setTimeout(() => editor.commands.focus(), 10)
              }}
              className="h-8 w-8 p-0"
            >
              <Unlink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}

      {/* Editor Content */}
      <div className="relative border rounded-md min-h-[32px] focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 bg-background">
        <EditorContent 
          editor={editor} 
          placeholder={placeholder}
        />
      </div>
    </div>
  )
}

export default RichTextEditor
