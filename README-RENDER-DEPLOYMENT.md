# Render.com Deployment Guide

This is a complete deployment package for the Parts Catalogue System on Render.com.

## Quick Deployment Steps

1. **Upload this entire folder** to your Git repository (GitHub, GitLab, or Bitbucket)

2. **Connect to Render.com:**
   - Go to https://render.com
   - Sign up/Sign in
   - Click "New +" → "Web Service"
   - Connect your repository

3. **Configure the service:**
   - **Build Command:** `npm install -g pnpm@8.15.6 && pnpm install --no-frozen-lockfile && pnpm run build`
   - **Publish Directory:** `dist`
   - **Node Version:** 20

4. **Deploy:** Click "Create Web Service"

## Alternative: Using render.yaml (Recommended)

If your repository has the `render.yaml` file (included in this package), Render will automatically use the configuration:

- Build Command: `npm install -g pnpm@8.15.6 && pnpm install --no-frozen-lockfile && pnpm run build`
- Static Publish Path: `dist`
- Node Version: 20
- PNPM Version: 8.15.6

## Features Included

- ✅ Parts Catalogue with search and filtering
- ✅ BoM Reference system
- ✅ Part Application management
- ✅ Admin panel with image upload
- ✅ Parts Summary analytics
- ✅ Take Photo functionality
- ✅ PDF generation for applications
- ✅ Custom favicon /images/favicon.jpg)
- ✅ Firebase integration for real-time data
- ✅ Responsive design with Tailwind CSS

## Important Notes

- The favicon has been updated to use the /images/favicon.jpg
- All dependencies are properly configured for production
- The build process is optimized for Render.com's environment
- Firebase configuration should be set up separately if needed

## Support

If you encounter any issues during deployment, check:
1. Repository is properly connected
2. Node version is set to 20
3. Build command matches exactly as specified
4. Publish directory is set to `dist`

Deploy with confidence! 🚀