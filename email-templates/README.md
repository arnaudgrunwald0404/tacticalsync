# TacticalSync Email Templates

Beautiful, branded email templates for all Supabase authentication emails.

## 🎨 Features

- **Pink & Blue Gradient** branding matching your app
- **Responsive design** that works on all email clients
- **Professional layout** with clear CTAs
- **Security notices** for user safety
- **Fallback links** for compatibility

## 📧 Available Templates

1. **confirm-signup.html** - Email verification for new users
2. **magic-link.html** - Passwordless sign-in link
3. **reset-password.html** - Password reset email

## 🚀 How to Apply

### Step 1: Access Supabase Email Templates

Go to: https://supabase.com/dashboard/project/pxirfndomjlqpkwfpqxq/auth/templates

### Step 2: Update Each Template

For each template type:

1. Click on the template name (e.g., "Confirm signup")
2. Copy the HTML content from the corresponding file in this folder
3. Paste it into the "Email template (HTML)" field
4. Click "Save"

### Step 3: Test Your Emails

- **Confirm Signup**: Create a new account with a test email
- **Magic Link**: Try the "Sign in with email" flow
- **Reset Password**: Use the "Forgot password" link

## 📝 Template Variables

Supabase provides these variables that are used in the templates:

- `{{ .ConfirmationURL }}` - The action link (confirm email, sign in, reset password)
- `{{ .Token }}` - One-time token (if you want to show it)
- `{{ .TokenHash }}` - Hashed token
- `{{ .SiteURL }}` - Your application URL

## 🎨 Customization

To customize the templates:

1. **Colors**: Change the gradient colors in the header:
   ```css
   background: linear-gradient(135deg, #ec4899 0%, #3b82f6 100%);
   ```

2. **Logo**: Replace "TacticalSync" text with an `<img>` tag if you have a logo URL

3. **Footer**: Update copyright year and company name

4. **Content**: Modify any text to match your brand voice

## ✅ Benefits

- **Brand Consistency**: All emails match your app's design
- **User Trust**: Professional emails increase confidence
- **Accessibility**: Clear text and good contrast ratios
- **Mobile-Friendly**: Responsive design for all devices

## 🔧 Troubleshooting

If emails aren't sending:
1. Check your SMTP settings in Supabase
2. Verify email templates are saved
3. Check spam folder for test emails
4. Review Supabase logs for errors

## 📱 Preview

The emails will look similar to your invitation emails with:
- Beautiful gradient header
- Clear call-to-action buttons
- Helpful information boxes
- Professional footer

